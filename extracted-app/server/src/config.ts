/** Game rules. Tweak here; tests pass their own values to Room. */
export interface GameConfig {
  /** How many times the drawer may skip a word in one turn. */
  maxSkipsPerTurn: number;
  /** Restart the turn timer after a skip, so the drawer gets the full time for the new word. */
  resetTimerOnSkip: boolean;
  /** Pause between turns while the answer and scores are shown. */
  intermissionMs: number;
  /** How long a disconnected player keeps their seat before being removed. */
  reconnectGraceMs: number;
  /** Guesser points scale with time left: from max (instant) down to min. */
  guesserMaxPoints: number;
  guesserMinPoints: number;
  /** The drawer earns this for every player who guesses correctly. */
  drawerPointsPerGuess: number;
  /** Cap on stroke segments kept per turn (replayed to players who reconnect). */
  maxStoredSegments: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  maxSkipsPerTurn: 2,
  resetTimerOnSkip: true,
  intermissionMs: 5_000,
  reconnectGraceMs: 30_000,
  guesserMaxPoints: 100,
  guesserMinPoints: 10,
  drawerPointsPerGuess: 50,
  maxStoredSegments: 5_000,
};

export interface ServerConfig {
  port: number;
  /**
   * "*" or the websites allowed to use this server, e.g. ["https://draw-guess.vercel.app"].
   * A "*" inside an entry matches one subdomain part, so "https://draw-guess-*.vercel.app"
   * also allows Vercel's preview links. Phone apps send no origin and are always allowed.
   */
  corsOrigin: string | string[];
  /** Folder with the exported web app to serve next to the game (WEB_DIR). Null: game server only. */
  webDir?: string | null;
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  const rawOrigin = env.CORS_ORIGIN?.trim() || '*';
  const corsOrigin =
    rawOrigin === '*' ? '*' : rawOrigin.split(',').map((o) => o.trim()).filter(Boolean);
  return { port, corsOrigin, webDir: env.WEB_DIR?.trim() || null };
}

/** Builds a check for the allowed origins. Requests without an Origin header (phone apps, curl) pass. */
export function originChecker(allowed: string | string[]): (origin: string | undefined) => boolean {
  if (allowed === '*') return () => true;
  const patterns = (Array.isArray(allowed) ? allowed : [allowed]).map((entry) => {
    const escaped = entry.replace(/\/$/, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped.replace(/\*/g, '[a-z0-9-]+')}$`, 'i');
  });
  return (origin) => !origin || patterns.some((p) => p.test(origin));
}
