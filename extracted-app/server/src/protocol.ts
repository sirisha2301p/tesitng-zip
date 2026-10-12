/**
 * The contract between the app and the server: every Socket.IO event name,
 * its payload, and the validation rules the server applies to client input.
 *
 * The mobile app should import these types (or a copy of this file) so both
 * sides always agree on the shape of each message.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Room settings
// ---------------------------------------------------------------------------

export const TEAM_SIZE_MIN = 2;
export const TEAM_SIZE_MAX = 10;
export const TURN_TIMES = [5, 10, 15, 20, 25, 30] as const;
export const ROUNDS_MIN = 1;
export const ROUNDS_MAX = 10;
export const DEFAULT_ROUNDS = 3;
/** Category id meaning "pick from every category". */
export const MIXED_CATEGORY = 'mixed';

export const settingsSchema = z.object({
  teamSize: z.number().int().min(TEAM_SIZE_MIN).max(TEAM_SIZE_MAX),
  turnTime: z
    .number()
    .int()
    .refine((v) => (TURN_TIMES as readonly number[]).includes(v), {
      message: `turnTime must be one of ${TURN_TIMES.join(', ')}`,
    }),
  category: z.string().trim().min(1).max(32).default(MIXED_CATEGORY),
  rounds: z.number().int().min(ROUNDS_MIN).max(ROUNDS_MAX).default(DEFAULT_ROUNDS),
});
export type RoomSettings = z.infer<typeof settingsSchema>;

// ---------------------------------------------------------------------------
// Client -> server payloads
// ---------------------------------------------------------------------------

const nameSchema = z.string().trim().min(1).max(20);
const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, 'Room code must be 6 letters or digits');

export const createRoomSchema = z.object({ name: nameSchema, settings: settingsSchema });
export const joinRoomSchema = z.object({ code: codeSchema, name: nameSchema });
export const rejoinRoomSchema = z.object({
  code: codeSchema,
  playerId: z.string().min(1).max(64),
  token: z.string().min(1).max(128),
});

/**
 * A piece of a stroke. Coordinates are normalised to 0..1 of the canvas width
 * and height so phones with different screen sizes draw the same picture.
 * A long stroke is sent as several segments sharing one strokeId.
 */
export const strokeSegmentSchema = z.object({
  strokeId: z.string().min(1).max(32),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().min(1).max(40),
  points: z
    .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
    .min(1)
    .max(256),
});
export const guessSchema = z.object({ text: z.string().trim().min(1).max(40) });

export type CreateRoomPayload = z.input<typeof createRoomSchema>;
export type JoinRoomPayload = z.input<typeof joinRoomSchema>;
export type RejoinRoomPayload = z.input<typeof rejoinRoomSchema>;
export type StrokeSegment = z.infer<typeof strokeSegmentSchema>;
export type GuessPayload = z.input<typeof guessSchema>;

// ---------------------------------------------------------------------------
// Server -> client payloads
// ---------------------------------------------------------------------------

export type GameStatus = 'lobby' | 'playing' | 'intermission' | 'finished';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  isHost: boolean;
  isDrawer: boolean;
  hasGuessed: boolean;
}

/** What everyone may know about the current turn. Never contains the word. */
export interface PublicTurn {
  drawerId: string;
  /** Server epoch ms when the turn ends. Compare with `serverNow` to correct clock skew. */
  endsAt: number;
  durationMs: number;
  /** Letters per word, e.g. "ice cream" -> [3, 5]. Used to draw the blanks. */
  wordLengths: number[];
  category: string;
}

export interface RoomSnapshot {
  code: string;
  hostId: string;
  status: GameStatus;
  settings: RoomSettings;
  round: number;
  players: PublicPlayer[];
  turn: PublicTurn | null;
  serverNow: number;
}

/** Sent privately to the drawer only. */
export interface DrawerWord {
  word: string;
  imageUrl: string | null;
  category: string;
  difficulty: Difficulty;
  skipsLeft: number;
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  score: number;
  rank: number;
}

export interface TurnResult {
  playerId: string;
  name: string;
  role: 'drawer' | 'guesser';
  guessed: boolean;
  points: number;
}

export type TurnEndReason = 'time' | 'all_guessed' | 'drawer_left' | 'not_enough_players';

export interface TurnEndPayload {
  word: string;
  imageUrl: string | null;
  reason: TurnEndReason;
  results: TurnResult[];
  leaderboard: LeaderboardEntry[];
  /** null when the game is over. */
  nextDrawerId: string | null;
  nextTurnAt: number | null;
  serverNow: number;
}

export interface JoinResult {
  playerId: string;
  /** Keep this secret on the device; it lets the player rejoin after a dropped connection. */
  token: string;
  room: RoomSnapshot;
  /** Strokes already on the canvas (non-empty when rejoining mid-turn). */
  canvas: StrokeSegment[];
  /** Set only when the joining player is the current drawer. */
  drawerWord: DrawerWord | null;
}

export type GuessOutcome =
  | { result: 'correct'; points: number; word: string }
  | { result: 'close' }
  | { result: 'wrong' };

export type ErrorCode =
  | 'invalid_payload'
  | 'unknown_category'
  | 'room_not_found'
  | 'room_full'
  | 'game_in_progress'
  | 'invalid_session'
  | 'not_in_room'
  | 'not_host'
  | 'not_enough_players'
  | 'not_playing'
  | 'not_drawer'
  | 'is_drawer'
  | 'no_skips_left'
  | 'cannot_skip'
  | 'already_guessed'
  | 'rate_limited'
  | 'server_busy'
  | 'internal';

export type AckResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorCode; message: string };
export type Ack<T> = (res: AckResponse<T>) => void;

// ---------------------------------------------------------------------------
// Socket.IO event maps
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, ack: Ack<JoinResult>) => void;
  'room:join': (payload: JoinRoomPayload, ack: Ack<JoinResult>) => void;
  'room:rejoin': (payload: RejoinRoomPayload, ack: Ack<JoinResult>) => void;
  'room:leave': (ack?: Ack<null>) => void;
  /** Host only. Needs exactly `teamSize` connected players. */
  'game:start': (ack: Ack<null>) => void;
  /** Host only, after the game is over: back to the lobby with scores reset. */
  'game:restart': (ack: Ack<null>) => void;
  /** Drawer only. Replaces the word; the skipped word is never shown to anyone else. */
  'turn:skip': (ack: Ack<DrawerWord>) => void;
  'draw:stroke': (segment: StrokeSegment) => void;
  'draw:undo': () => void;
  'draw:clear': () => void;
  'guess:submit': (payload: GuessPayload, ack: Ack<GuessOutcome>) => void;
}

export interface ServerToClientEvents {
  /** Full public room state; sent whenever players, scores, or status change. */
  'room:state': (room: RoomSnapshot) => void;
  'turn:start': (p: { round: number; totalRounds: number; turn: PublicTurn; serverNow: number }) => void;
  /** Drawer only. */
  'turn:word': (p: DrawerWord) => void;
  /** The drawer skipped: the canvas is cleared and the timer restarts. No word is revealed. */
  'turn:skipped': (p: { turn: PublicTurn; serverNow: number }) => void;
  'turn:end': (p: TurnEndPayload) => void;
  'game:over': (p: { leaderboard: LeaderboardEntry[] }) => void;
  'draw:stroke': (segment: StrokeSegment) => void;
  'draw:undo': (p: { strokeId: string }) => void;
  'draw:clear': () => void;
  /** A wrong guess, shown in everyone's guess feed. */
  'guess:message': (p: { playerId: string; name: string; text: string }) => void;
  /** Someone guessed correctly. The word itself is not included. */
  'guess:correct': (p: { playerId: string; name: string; points: number }) => void;
}
