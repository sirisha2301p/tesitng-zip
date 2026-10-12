import { create } from 'zustand';
import type {
  AckResponse,
  DrawerWord,
  GuessOutcome,
  JoinResult,
  LeaderboardEntry,
  RoomSettings,
  RoomSnapshot,
  StrokeSegment,
  TurnEndPayload,
} from '@protocol';
import { getSocket } from '../lib/server';
import { storage, type Session } from '../lib/session';

export interface Stroke {
  id: string;
  color: string;
  width: number;
  points: [number, number][];
}

export interface FeedItem {
  id: number;
  kind: 'wrong' | 'correct' | 'close' | 'info';
  name?: string;
  text: string;
}

interface GameState {
  connected: boolean;
  /** True once we know whether a saved session could be restored. */
  ready: boolean;
  name: string;
  session: Session | null;
  room: RoomSnapshot | null;
  /** serverTime - localTime, to run countdowns on the server's clock. */
  clockOffset: number;
  drawerWord: DrawerWord | null;
  strokes: Stroke[];
  feed: FeedItem[];
  /** Set when I guessed this turn's word. */
  myGuessedWord: string | null;
  lastTurnEnd: TurnEndPayload | null;
  finalLeaderboard: LeaderboardEntry[] | null;

  setName(name: string): void;
  createRoom(settings: RoomSettings): Promise<void>;
  joinRoom(code: string): Promise<void>;
  leaveRoom(): Promise<void>;
  startGame(): Promise<void>;
  restartGame(): Promise<void>;
  skipWord(): Promise<void>;
  submitGuess(text: string): Promise<GuessOutcome>;
  drawSegment(segment: StrokeSegment): void;
  undoStroke(): void;
  clearCanvas(): void;
}

function unwrap<T>(res: AckResponse<T>): T {
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

const REQUEST_TIMEOUT_MS = 8000;
let feedSeq = 0;

/** Adds a stroke segment, joining it to the stroke with the same id. */
function appendSegment(strokes: Stroke[], seg: StrokeSegment): Stroke[] {
  const index = strokes.findIndex((s) => s.id === seg.strokeId);
  if (index === -1) {
    return [...strokes, { id: seg.strokeId, color: seg.color, width: seg.width, points: seg.points }];
  }
  const next = strokes.slice();
  next[index] = { ...strokes[index]!, points: [...strokes[index]!.points, ...seg.points] };
  return next;
}

const freshTurn = {
  drawerWord: null,
  strokes: [],
  feed: [],
  myGuessedWord: null,
} satisfies Partial<GameState>;

const noRoom = {
  session: null,
  room: null,
  lastTurnEnd: null,
  finalLeaderboard: null,
  ...freshTurn,
} satisfies Partial<GameState>;

export const useGame = create<GameState>()((set, get) => {
  const socket = getSocket();

  const request = async <T,>(send: () => Promise<AckResponse<T>>): Promise<T> => {
    if (!socket.connected) throw new Error('Not connected to the game server. Check your internet and try again.');
    try {
      return unwrap(await send());
    } catch (err) {
      if (err instanceof Error && /timed? ?out/i.test(err.message)) {
        throw new Error('The server did not answer. Please try again.');
      }
      throw err;
    }
  };
  const timed = () => socket.timeout(REQUEST_TIMEOUT_MS);

  const enterRoom = (result: JoinResult) => {
    const session = { code: result.room.code, playerId: result.playerId, token: result.token };
    void storage.saveSession(session);
    set({
      ...noRoom,
      session,
      room: result.room,
      clockOffset: result.room.serverNow - Date.now(),
      strokes: result.canvas.reduce(appendSegment, [] as Stroke[]),
      drawerWord: result.drawerWord,
    });
  };

  const forgetRoom = () => {
    void storage.clearSession();
    set(noRoom);
  };

  const addFeed = (item: Omit<FeedItem, 'id'>) => set((s) => ({ feed: [...s.feed, { ...item, id: ++feedSeq }].slice(-50) }));

  const tryRejoin = async () => {
    const session = get().session ?? (await storage.loadSession());
    if (!session) return;
    try {
      enterRoom(unwrap(await timed().emitWithAck('room:rejoin', session)));
    } catch {
      forgetRoom();
    }
  };

  // --- Server events -------------------------------------------------------

  socket.on('connect', () => {
    set({ connected: true });
    void tryRejoin().finally(() => set({ ready: true }));
  });
  socket.on('disconnect', () => set({ connected: false }));
  socket.on('connect_error', () => set({ ready: true }));

  socket.on('room:state', (room) => {
    const backInLobby = room.status === 'lobby' && get().room?.status !== 'lobby';
    set({
      room,
      clockOffset: room.serverNow - Date.now(),
      ...(backInLobby ? { lastTurnEnd: null, finalLeaderboard: null, ...freshTurn } : {}),
    });
  });
  socket.on('turn:start', ({ serverNow }) => set({ ...freshTurn, lastTurnEnd: null, clockOffset: serverNow - Date.now() }));
  socket.on('turn:word', (drawerWord) => set({ drawerWord }));
  socket.on('turn:skipped', () => {
    set({ strokes: [] });
    addFeed({ kind: 'info', text: 'The drawer skipped that word. New drawing!' });
  });
  socket.on('turn:end', (lastTurnEnd) => set({ lastTurnEnd, drawerWord: null }));
  socket.on('game:over', ({ leaderboard }) => set({ finalLeaderboard: leaderboard }));

  socket.on('draw:stroke', (seg) => set((s) => ({ strokes: appendSegment(s.strokes, seg) })));
  socket.on('draw:undo', ({ strokeId }) => set((s) => ({ strokes: s.strokes.filter((st) => st.id !== strokeId) })));
  socket.on('draw:clear', () => set({ strokes: [] }));

  socket.on('guess:message', ({ name, text }) => addFeed({ kind: 'wrong', name, text }));
  socket.on('guess:correct', ({ name, points, playerId }) =>
    addFeed({
      kind: 'correct',
      name,
      text: playerId === get().session?.playerId ? `You guessed it! +${points}` : `${name} guessed the word! +${points}`,
    }),
  );

  void storage.loadName().then((name) => name && set({ name }));
  if (socket.connected) void tryRejoin().finally(() => set({ ready: true }));

  // --- Actions ---------------------------------------------------------------

  return {
    connected: socket.connected,
    ready: false,
    name: '',
    clockOffset: 0,
    ...noRoom,

    setName(name) {
      set({ name });
      void storage.saveName(name.trim());
    },

    async createRoom(settings) {
      enterRoom(await request(() => timed().emitWithAck('room:create', { name: get().name.trim(), settings })));
    },

    async joinRoom(code) {
      enterRoom(
        await request(() => timed().emitWithAck('room:join', { code: code.trim().toUpperCase(), name: get().name.trim() })),
      );
    },

    async leaveRoom() {
      if (socket.connected && get().room) {
        await timed()
          .emitWithAck('room:leave')
          .catch(() => undefined);
      }
      forgetRoom();
    },

    async startGame() {
      await request(() => timed().emitWithAck('game:start'));
    },

    async restartGame() {
      await request(() => timed().emitWithAck('game:restart'));
    },

    async skipWord() {
      const drawerWord = await request<DrawerWord>(() => timed().emitWithAck('turn:skip'));
      set({ drawerWord, strokes: [] });
    },

    async submitGuess(text) {
      const outcome = await request<GuessOutcome>(() => timed().emitWithAck('guess:submit', { text }));
      if (outcome.result === 'correct') set({ myGuessedWord: outcome.word });
      if (outcome.result === 'close') addFeed({ kind: 'close', text: `"${text}" is close!` });
      return outcome;
    },

    drawSegment(segment) {
      set((s) => ({ strokes: appendSegment(s.strokes, segment) }));
      socket.emit('draw:stroke', segment);
    },

    undoStroke() {
      set((s) => ({ strokes: s.strokes.slice(0, -1) }));
      socket.emit('draw:undo');
    },

    clearCanvas() {
      set({ strokes: [] });
      socket.emit('draw:clear');
    },
  };
});

/** Convenience selectors used by several screens. */
export function useMe() {
  return useGame((s) => s.room?.players.find((p) => p.id === s.session?.playerId) ?? null);
}
