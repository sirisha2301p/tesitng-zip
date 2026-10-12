import { randomBytes, randomUUID } from 'node:crypto';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '../config.js';
import type {
  DrawerWord,
  GameStatus,
  GuessOutcome,
  JoinResult,
  LeaderboardEntry,
  PublicTurn,
  RoomSettings,
  RoomSnapshot,
  ServerToClientEvents,
  StrokeSegment,
  TurnEndReason,
  TurnResult,
} from '../protocol.js';
import { WordBank, type Word } from '../words/wordBank.js';
import { GameError } from './errors.js';

type ServerEvent = keyof ServerToClientEvents;
type EventArgs<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>;

/** How a room talks to its players. The socket layer implements it; tests record it. */
export interface Outbox {
  toRoom<E extends ServerEvent>(event: E, ...args: EventArgs<E>): void;
  toPlayer<E extends ServerEvent>(playerId: string, event: E, ...args: EventArgs<E>): void;
  toRoomExcept<E extends ServerEvent>(playerId: string, event: E, ...args: EventArgs<E>): void;
}

interface Player {
  id: string;
  name: string;
  token: string;
  score: number;
  connected: boolean;
  /** The socket currently speaking for this player, so a stale socket's disconnect is ignored. */
  socketId: string | null;
  removeTimer: NodeJS.Timeout | null;
}

interface Turn {
  drawerId: string;
  word: Word;
  durationMs: number;
  endsAt: number;
  timer: NodeJS.Timeout;
  skipsUsed: number;
  /** playerId -> points earned this turn */
  guessed: Map<string, number>;
  drawerPoints: number;
  strokes: StrokeSegment[];
}

export interface RoomOptions {
  config?: GameConfig;
  rng?: () => number;
  /** Called once the last player has left so the manager can forget the room. */
  onEmpty?: (room: Room) => void;
}

/**
 * One game room. All game rules live here and the server is the only authority:
 * it picks the word, runs the timer and checks guesses. The word is sent only to
 * the drawer, and skipped words are never sent to anyone else.
 *
 * Players are kept in join order, which is also the drawing order.
 */
export class Room {
  hostId = '';
  status: GameStatus = 'lobby';
  round = 0;

  private readonly players = new Map<string, Player>();
  private readonly usedWordIds = new Set<string>();
  /** Players still to draw in the current round. */
  private drawQueue: string[] = [];
  private turn: Turn | null = null;
  private nextTurnTimer: NodeJS.Timeout | null = null;
  private readonly config: GameConfig;
  private readonly rng: () => number;
  private readonly onEmpty: (room: Room) => void;
  private disposed = false;

  constructor(
    readonly code: string,
    readonly settings: RoomSettings,
    private readonly words: WordBank,
    private readonly outbox: Outbox,
    options: RoomOptions = {},
  ) {
    this.config = options.config ?? DEFAULT_GAME_CONFIG;
    this.rng = options.rng ?? Math.random;
    this.onEmpty = options.onEmpty ?? (() => {});
  }

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  get playerCount(): number {
    return this.players.size;
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  addPlayer(name: string, socketId: string): JoinResult {
    if (this.status !== 'lobby') throw new GameError('game_in_progress', 'This game has already started');
    if (this.players.size >= this.settings.teamSize) throw new GameError('room_full', 'This room is full');

    const player: Player = {
      id: randomUUID(),
      name,
      token: randomBytes(24).toString('base64url'),
      score: 0,
      connected: true,
      socketId,
      removeTimer: null,
    };
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;

    this.broadcastState();
    return this.joinResult(player);
  }

  /** Reconnect with the id and token from an earlier join. Works in any game phase. */
  rejoin(playerId: string, token: string, socketId: string): JoinResult {
    const player = this.players.get(playerId);
    if (!player || player.token !== token) throw new GameError('invalid_session', 'Could not rejoin this room');
    if (player.removeTimer) clearTimeout(player.removeTimer);
    player.removeTimer = null;
    player.connected = true;
    player.socketId = socketId;
    this.broadcastState();
    return this.joinResult(player);
  }

  /** The player's connection dropped. They keep their seat for a grace period. */
  disconnect(playerId: string, socketId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.socketId !== socketId) return;
    player.connected = false;
    player.socketId = null;
    player.removeTimer = setTimeout(() => this.removePlayer(playerId), this.config.reconnectGraceMs);
    this.broadcastState();
    this.endTurnIfEveryoneGuessed();
  }

  /** The player chose to leave. */
  leave(playerId: string): void {
    this.removePlayer(playerId);
  }

  private removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (player.removeTimer) clearTimeout(player.removeTimer);
    this.players.delete(playerId);
    this.drawQueue = this.drawQueue.filter((id) => id !== playerId);

    if (this.players.size === 0) {
      this.dispose();
      this.onEmpty(this);
      return;
    }
    if (this.hostId === playerId) {
      const next = [...this.players.values()].find((p) => p.connected) ?? this.players.values().next().value!;
      this.hostId = next.id;
    }

    const inGame = this.status === 'playing' || this.status === 'intermission';
    if (inGame && this.connectedPlayers().length < 2) {
      this.finishGame('not_enough_players');
      return;
    }
    if (this.status === 'playing' && this.turn?.drawerId === playerId) {
      this.endTurn('drawer_left');
      return;
    }
    this.broadcastState();
    this.endTurnIfEveryoneGuessed();
  }

  // -------------------------------------------------------------------------
  // Game flow
  // -------------------------------------------------------------------------

  start(playerId: string): void {
    this.requireHost(playerId);
    if (this.status !== 'lobby') throw new GameError('game_in_progress', 'The game has already started');
    const connected = this.connectedPlayers().length;
    if (this.players.size < this.settings.teamSize || connected < this.settings.teamSize) {
      throw new GameError(
        'not_enough_players',
        `Waiting for players: ${connected} of ${this.settings.teamSize} have joined`,
      );
    }
    for (const p of this.players.values()) p.score = 0;
    this.usedWordIds.clear();
    this.round = 1;
    this.drawQueue = [...this.players.keys()];
    this.startNextTurn();
  }

  /** After a game ends, the host can bring everyone back to the lobby for another game. */
  restart(playerId: string): void {
    this.requireHost(playerId);
    if (this.status !== 'finished') throw new GameError('game_in_progress', 'The game is still running');
    for (const p of this.players.values()) p.score = 0;
    this.round = 0;
    this.drawQueue = [];
    this.status = 'lobby';
    this.broadcastState();
  }

  private startNextTurn(): void {
    const drawerId = this.takeNextDrawer();
    if (!drawerId) {
      this.finishGame();
      return;
    }
    const word = this.pickWord();
    const durationMs = this.settings.turnTime * 1000;
    this.status = 'playing';
    this.turn = {
      drawerId,
      word,
      durationMs,
      endsAt: Date.now() + durationMs,
      timer: setTimeout(() => this.endTurn('time'), durationMs),
      skipsUsed: 0,
      guessed: new Map(),
      drawerPoints: 0,
      strokes: [],
    };
    this.outbox.toRoom('turn:start', {
      round: this.round,
      totalRounds: this.settings.rounds,
      turn: this.publicTurn()!,
      serverNow: Date.now(),
    });
    this.outbox.toPlayer(drawerId, 'turn:word', this.drawerWord()!);
    this.broadcastState();
  }

  /** Pops the next connected drawer, moving to the next round when this one is done. */
  private takeNextDrawer(): string | null {
    for (;;) {
      if (!this.drawQueue.length) {
        if (this.round >= this.settings.rounds) return null;
        this.round += 1;
        this.drawQueue = [...this.players.keys()];
      }
      const id = this.drawQueue.shift()!;
      if (this.players.get(id)?.connected) return id;
    }
  }

  /** Same choice as takeNextDrawer, without changing anything. */
  private peekNextDrawer(): string | null {
    const inQueue = this.drawQueue.find((id) => this.players.get(id)?.connected);
    if (inQueue) return inQueue;
    if (this.round >= this.settings.rounds) return null;
    return this.connectedPlayers()[0]?.id ?? null;
  }

  private pickWord(): Word {
    let word = this.words.pick(this.settings.category, this.usedWordIds, this.rng);
    if (!word) {
      // Every word in the category has been used: start over rather than stall.
      this.usedWordIds.clear();
      word = this.words.pick(this.settings.category, this.usedWordIds, this.rng);
    }
    if (!word) throw new GameError('internal', `No words available for category "${this.settings.category}"`);
    this.usedWordIds.add(word.id);
    return word;
  }

  private endTurn(reason: TurnEndReason): void {
    const turn = this.turn;
    if (!turn) return;
    clearTimeout(turn.timer);
    this.turn = null;

    const results: TurnResult[] = [...this.players.values()].map((p) =>
      p.id === turn.drawerId
        ? { playerId: p.id, name: p.name, role: 'drawer', guessed: false, points: turn.drawerPoints }
        : {
            playerId: p.id,
            name: p.name,
            role: 'guesser',
            guessed: turn.guessed.has(p.id),
            points: turn.guessed.get(p.id) ?? 0,
          },
    );

    const nextDrawerId = this.peekNextDrawer();
    const nextTurnAt = nextDrawerId ? Date.now() + this.config.intermissionMs : null;
    this.status = 'intermission';
    this.outbox.toRoom('turn:end', {
      word: turn.word.word,
      imageUrl: turn.word.imageUrl,
      reason,
      results,
      leaderboard: this.leaderboard(),
      nextDrawerId,
      nextTurnAt,
      serverNow: Date.now(),
    });

    if (!nextDrawerId) {
      this.finishGame();
      return;
    }
    this.nextTurnTimer = setTimeout(() => {
      this.nextTurnTimer = null;
      this.startNextTurn();
    }, this.config.intermissionMs);
    this.broadcastState();
  }

  private finishGame(reason?: TurnEndReason): void {
    if (this.turn) {
      const turn = this.turn;
      clearTimeout(turn.timer);
      this.turn = null;
      if (reason) {
        // Reveal the answer of the interrupted turn before the final scores.
        this.outbox.toRoom('turn:end', {
          word: turn.word.word,
          imageUrl: turn.word.imageUrl,
          reason,
          results: [],
          leaderboard: this.leaderboard(),
          nextDrawerId: null,
          nextTurnAt: null,
          serverNow: Date.now(),
        });
      }
    }
    if (this.nextTurnTimer) clearTimeout(this.nextTurnTimer);
    this.nextTurnTimer = null;
    this.drawQueue = [];
    this.status = 'finished';
    this.outbox.toRoom('game:over', { leaderboard: this.leaderboard() });
    this.broadcastState();
  }

  // -------------------------------------------------------------------------
  // Turn actions
  // -------------------------------------------------------------------------

  skip(playerId: string): DrawerWord {
    const turn = this.requireDrawer(playerId);
    if (turn.guessed.size > 0) throw new GameError('cannot_skip', 'Someone already guessed this word');
    if (turn.skipsUsed >= this.config.maxSkipsPerTurn) throw new GameError('no_skips_left', 'No skips left this turn');

    turn.word = this.pickWord();
    turn.skipsUsed += 1;
    turn.strokes = [];
    if (this.config.resetTimerOnSkip) {
      clearTimeout(turn.timer);
      turn.endsAt = Date.now() + turn.durationMs;
      turn.timer = setTimeout(() => this.endTurn('time'), turn.durationMs);
    }
    this.outbox.toRoom('draw:clear');
    this.outbox.toRoom('turn:skipped', { turn: this.publicTurn()!, serverNow: Date.now() });
    const drawerWord = this.drawerWord()!;
    this.outbox.toPlayer(playerId, 'turn:word', drawerWord);
    this.broadcastState();
    return drawerWord;
  }

  guess(playerId: string, text: string): GuessOutcome {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('not_in_room');
    const turn = this.turn;
    if (this.status !== 'playing' || !turn) throw new GameError('not_playing', 'No turn is running');
    if (turn.drawerId === playerId) throw new GameError('is_drawer', 'The drawer cannot guess');
    if (turn.guessed.has(playerId)) throw new GameError('already_guessed', 'You already guessed this word');

    const match = WordBank.check(turn.word, text);
    if (match === 'correct') {
      const points = this.guesserPoints(turn);
      player.score += points;
      turn.guessed.set(playerId, points);
      const drawer = this.players.get(turn.drawerId);
      if (drawer) {
        drawer.score += this.config.drawerPointsPerGuess;
        turn.drawerPoints += this.config.drawerPointsPerGuess;
      }
      this.outbox.toRoom('guess:correct', { playerId, name: player.name, points });
      this.broadcastState();
      const outcome: GuessOutcome = { result: 'correct', points, word: turn.word.word };
      this.endTurnIfEveryoneGuessed();
      return outcome;
    }
    if (match === 'wrong') {
      this.outbox.toRoom('guess:message', { playerId, name: player.name, text });
    }
    // A close guess is only told to the guesser, so it doesn't help the others.
    return { result: match };
  }

  private guesserPoints(turn: Turn): number {
    const { guesserMaxPoints: max, guesserMinPoints: min } = this.config;
    const fractionLeft = Math.max(0, turn.endsAt - Date.now()) / turn.durationMs;
    return Math.max(min, Math.round(max * fractionLeft));
  }

  private endTurnIfEveryoneGuessed(): void {
    const turn = this.turn;
    if (this.status !== 'playing' || !turn) return;
    const guessers = this.connectedPlayers().filter((p) => p.id !== turn.drawerId);
    if (guessers.length && guessers.every((p) => turn.guessed.has(p.id))) {
      this.endTurn('all_guessed');
    }
  }

  // -------------------------------------------------------------------------
  // Drawing (drawer only; relayed to everyone else)
  // -------------------------------------------------------------------------

  addStroke(playerId: string, segment: StrokeSegment): void {
    const turn = this.requireDrawer(playerId);
    if (turn.strokes.length >= this.config.maxStoredSegments) return;
    turn.strokes.push(segment);
    this.outbox.toRoomExcept(playerId, 'draw:stroke', segment);
  }

  undo(playerId: string): void {
    const turn = this.requireDrawer(playerId);
    const last = turn.strokes.at(-1);
    if (!last) return;
    turn.strokes = turn.strokes.filter((s) => s.strokeId !== last.strokeId);
    this.outbox.toRoomExcept(playerId, 'draw:undo', { strokeId: last.strokeId });
  }

  clearCanvas(playerId: string): void {
    const turn = this.requireDrawer(playerId);
    turn.strokes = [];
    this.outbox.toRoomExcept(playerId, 'draw:clear');
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  snapshot(): RoomSnapshot {
    const turn = this.turn;
    return {
      code: this.code,
      hostId: this.hostId,
      status: this.status,
      settings: this.settings,
      round: this.round,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: p.connected,
        isHost: p.id === this.hostId,
        isDrawer: turn?.drawerId === p.id,
        hasGuessed: turn?.guessed.has(p.id) ?? false,
      })),
      turn: this.publicTurn(),
      serverNow: Date.now(),
    };
  }

  leaderboard(): LeaderboardEntry[] {
    const sorted = [...this.players.values()].sort((a, b) => b.score - a.score);
    let rank = 0;
    let lastScore: number | null = null;
    return sorted.map((p, i) => {
      if (p.score !== lastScore) rank = i + 1;
      lastScore = p.score;
      return { playerId: p.id, name: p.name, score: p.score, rank };
    });
  }

  private publicTurn(): PublicTurn | null {
    const turn = this.turn;
    if (!turn) return null;
    return {
      drawerId: turn.drawerId,
      endsAt: turn.endsAt,
      durationMs: turn.durationMs,
      wordLengths: turn.word.word.split(/\s+/).map((w) => w.length),
      category: turn.word.category,
    };
  }

  private drawerWord(): DrawerWord | null {
    const turn = this.turn;
    if (!turn) return null;
    return {
      word: turn.word.word,
      imageUrl: turn.word.imageUrl,
      category: turn.word.category,
      difficulty: turn.word.difficulty,
      skipsLeft: this.config.maxSkipsPerTurn - turn.skipsUsed,
    };
  }

  private joinResult(player: Player): JoinResult {
    const isDrawer = this.turn?.drawerId === player.id;
    return {
      playerId: player.id,
      token: player.token,
      room: this.snapshot(),
      canvas: this.turn ? [...this.turn.strokes] : [],
      drawerWord: isDrawer ? this.drawerWord() : null,
    };
  }

  private broadcastState(): void {
    if (!this.disposed) this.outbox.toRoom('room:state', this.snapshot());
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private connectedPlayers(): Player[] {
    return [...this.players.values()].filter((p) => p.connected);
  }

  private requireHost(playerId: string): void {
    if (!this.players.has(playerId)) throw new GameError('not_in_room');
    if (this.hostId !== playerId) throw new GameError('not_host', 'Only the host can do that');
  }

  private requireDrawer(playerId: string): Turn {
    const turn = this.turn;
    if (this.status !== 'playing' || !turn) throw new GameError('not_playing', 'No turn is running');
    if (turn.drawerId !== playerId) throw new GameError('not_drawer', 'Only the drawer can do that');
    return turn;
  }

  /** Stops every timer. Called when the room empties or the server shuts down. */
  dispose(): void {
    this.disposed = true;
    if (this.turn) clearTimeout(this.turn.timer);
    if (this.nextTurnTimer) clearTimeout(this.nextTurnTimer);
    for (const p of this.players.values()) if (p.removeTimer) clearTimeout(p.removeTimer);
    this.turn = null;
    this.nextTurnTimer = null;
  }
}
