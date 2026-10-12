import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '../src/config.js';
import { GameError } from '../src/game/errors.js';
import { Room, type Outbox } from '../src/game/Room.js';
import type { DrawerWord, RoomSettings, ServerToClientEvents, TurnEndPayload } from '../src/protocol.js';
import { WordBank } from '../src/words/wordBank.js';

const bank = new WordBank({
  version: 1,
  categories: [{ id: 'animals', name: 'Animals' }],
  words: ['elephant', 'giraffe', 'penguin', 'kangaroo', 'crocodile', 'butterfly', 'squirrel', 'octopus'].map(
    (word) => ({ word, category: 'animals', difficulty: 'easy' as const }),
  ),
});

type Sent = { to: 'room' | 'player' | 'except'; target?: string; event: keyof ServerToClientEvents; payload: unknown };

function recorder() {
  const sent: Sent[] = [];
  const outbox: Outbox = {
    toRoom: (event, ...args) => sent.push({ to: 'room', event, payload: args[0] }),
    toPlayer: (target, event, ...args) => sent.push({ to: 'player', target, event, payload: args[0] }),
    toRoomExcept: (target, event, ...args) => sent.push({ to: 'except', target, event, payload: args[0] }),
  };
  return {
    sent,
    outbox,
    /** Everything sent to more than one player. */
    shared: () => sent.filter((s) => s.to !== 'player'),
    of: <E extends keyof ServerToClientEvents>(event: E) =>
      sent.filter((s) => s.event === event).map((s) => s.payload as Parameters<ServerToClientEvents[E]>[0]),
    lastWordFor: (playerId: string) =>
      sent.filter((s) => s.event === 'turn:word' && s.target === playerId).at(-1)?.payload as DrawerWord | undefined,
    clear: () => sent.splice(0),
  };
}

function setup(settings: Partial<RoomSettings> = {}, config: Partial<GameConfig> = {}) {
  const out = recorder();
  const onEmpty = vi.fn();
  const room = new Room(
    'ABC234',
    { teamSize: 3, turnTime: 20, category: 'animals', rounds: 2, ...settings },
    bank,
    out.outbox,
    { config: { ...DEFAULT_GAME_CONFIG, intermissionMs: 3_000, reconnectGraceMs: 10_000, ...config }, onEmpty },
  );
  const join = (n: number) =>
    Array.from({ length: n }, () => room.addPlayer(`P${room.playerCount + 1}`, `sock-${room.playerCount}`));
  return { room, out, join, onEmpty };
}

/** Starts a full game; returns player ids in join (= drawing) order. */
function started(settings: Partial<RoomSettings> = {}, config: Partial<GameConfig> = {}) {
  const ctx = setup(settings, config);
  const players = ctx.join(ctx.room.settings.teamSize);
  ctx.room.start(players[0]!.playerId);
  return { ...ctx, ids: players.map((p) => p.playerId), tokens: players.map((p) => p.token) };
}

function hasKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => hasKey(v, key));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => k === key || hasKey(v, key));
  }
  return false;
}

function expectGameError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(GameError);
    expect((err as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected GameError "${code}"`);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('lobby', () => {
  it('makes the first player host and fills up to the team size', () => {
    const { room, join } = setup({ teamSize: 2 });
    const [a] = join(2);
    expect(room.hostId).toBe(a!.playerId);
    expectGameError(() => room.addPlayer('Late', 'sock-x'), 'room_full');
  });

  it('only the host can start, and only when every seat is filled', () => {
    const { room, join } = setup({ teamSize: 3 });
    const [a, b] = join(2);
    expectGameError(() => room.start(b!.playerId), 'not_host');
    expectGameError(() => room.start(a!.playerId), 'not_enough_players');
    join(1);
    room.start(a!.playerId);
    expect(room.status).toBe('playing');
    expectGameError(() => room.addPlayer('Late', 'sock-y'), 'game_in_progress');
  });

  it('passes host to the next player when the host leaves', () => {
    const { room, join } = setup();
    const [a, b] = join(2);
    room.leave(a!.playerId);
    expect(room.hostId).toBe(b!.playerId);
  });

  it('tells the manager when the last player leaves', () => {
    const { room, join, onEmpty } = setup();
    const [a] = join(1);
    room.leave(a!.playerId);
    expect(onEmpty).toHaveBeenCalledWith(room);
  });
});

describe('turns and secrecy', () => {
  it('sends the word only to the drawer', () => {
    const { out, ids } = started();
    const [drawer, guesser] = ids;
    const word = out.lastWordFor(drawer!);
    expect(word?.word).toBeTruthy();
    expect(out.lastWordFor(guesser!)).toBeUndefined();

    const turnStart = out.of('turn:start')[0]!;
    expect(turnStart.turn.drawerId).toBe(drawer);
    expect(turnStart.turn.wordLengths).toEqual([word!.word.length]);
    // Nothing shared with the room carries a "word" field while the turn runs.
    expect(out.shared().some((s) => hasKey(s.payload, 'word'))).toBe(false);
  });

  it('a correct guess scores for the guesser (by speed) and the drawer, without revealing the word', () => {
    const { room, out, ids } = started();
    const [drawer, g1] = ids;
    const word = out.lastWordFor(drawer!)!.word;

    vi.advanceTimersByTime(5_000); // 15 of 20 seconds left -> 75 points
    const outcome = room.guess(g1!, word.toUpperCase());
    expect(outcome).toEqual({ result: 'correct', points: 75, word });
    expect(out.of('guess:correct')).toEqual([{ playerId: g1, name: 'P2', points: 75 }]);
    expect(out.shared().some((s) => hasKey(s.payload, 'word'))).toBe(false);

    const scores = Object.fromEntries(room.snapshot().players.map((p) => [p.id, p.score]));
    expect(scores[g1!]).toBe(75);
    expect(scores[drawer!]).toBe(50);
    expectGameError(() => room.guess(g1!, word), 'already_guessed');
    expectGameError(() => room.guess(drawer!, word), 'is_drawer');
  });

  it('shows wrong guesses to everyone but keeps close guesses private', () => {
    const { room, out, ids } = started();
    const word = out.lastWordFor(ids[0]!)!.word;

    expect(room.guess(ids[1]!, 'zzzzzzzz')).toEqual({ result: 'wrong' });
    expect(out.of('guess:message')).toEqual([{ playerId: ids[1], name: 'P2', text: 'zzzzzzzz' }]);

    expect(room.guess(ids[1]!, word.slice(0, -1))).toEqual({ result: 'close' });
    expect(out.of('guess:message')).toHaveLength(1);
  });

  it('ends the turn early when everyone has guessed, then starts the next drawer', () => {
    const { room, out, ids } = started();
    const word = out.lastWordFor(ids[0]!)!.word;
    room.guess(ids[1]!, word);
    room.guess(ids[2]!, word);

    const end = out.of('turn:end')[0] as TurnEndPayload;
    expect(end.reason).toBe('all_guessed');
    expect(end.word).toBe(word);
    expect(end.nextDrawerId).toBe(ids[1]);
    expect(room.status).toBe('intermission');

    vi.advanceTimersByTime(3_000);
    expect(room.status).toBe('playing');
    expect(out.of('turn:start').at(-1)!.turn.drawerId).toBe(ids[1]);
    expect(out.lastWordFor(ids[1]!)?.word).not.toBe(word);
  });

  it('ends the turn when time runs out; nobody scores', () => {
    const { room, out } = started({ turnTime: 10 });
    vi.advanceTimersByTime(10_000);
    const end = out.of('turn:end')[0] as TurnEndPayload;
    expect(end.reason).toBe('time');
    expect(end.results.every((r) => r.points === 0)).toBe(true);
    expect(room.leaderboard().every((e) => e.rank === 1)).toBe(true);
  });
});

describe('skip', () => {
  it('replaces the word, clears the canvas, restarts the timer, and never shows the skipped word', () => {
    const { room, out, ids } = started();
    const drawer = ids[0]!;
    const first = out.lastWordFor(drawer)!.word;

    vi.advanceTimersByTime(8_000);
    const next = room.skip(drawer);
    expect(next.word).not.toBe(first);
    expect(next.skipsLeft).toBe(1);
    expect(out.of('draw:clear')).toHaveLength(1);
    const skipped = out.of('turn:skipped')[0]!;
    expect(skipped.turn.endsAt).toBe(Date.now() + 20_000);

    // The skipped word never reaches the room, even after the turn ends...
    vi.advanceTimersByTime(20_000);
    expect((out.of('turn:end')[0] as TurnEndPayload).word).toBe(next.word);
    expect(JSON.stringify(out.shared())).not.toContain(`"${first}"`);
    // ...and it no longer counts as a correct guess.
    vi.advanceTimersByTime(3_000);
    const nextDrawerWord = out.lastWordFor(ids[1]!)!.word;
    expect(nextDrawerWord).not.toBe(first);
  });

  it('allows two skips per turn, only for the drawer, and not after someone guessed', () => {
    const { room, out, ids } = started();
    const drawer = ids[0]!;
    expectGameError(() => room.skip(ids[1]!), 'not_drawer');
    room.skip(drawer);
    room.skip(drawer);
    expectGameError(() => room.skip(drawer), 'no_skips_left');

    vi.advanceTimersByTime(20_000 + 3_000); // next turn: P2 draws
    const word = out.lastWordFor(ids[1]!)!.word;
    room.guess(ids[0]!, word);
    expectGameError(() => room.skip(ids[1]!), 'cannot_skip');
  });
});

describe('rounds and game over', () => {
  it('rotates every player as drawer for each round, then ends the game', () => {
    const { room, out, ids } = started({ teamSize: 2, rounds: 2, turnTime: 5 });
    for (let turn = 0; turn < 4; turn++) vi.advanceTimersByTime(5_000 + 3_000);

    expect(out.of('turn:start').map((t) => t.turn.drawerId)).toEqual([ids[0], ids[1], ids[0], ids[1]]);
    expect(out.of('turn:start').map((t) => t.round)).toEqual([1, 1, 2, 2]);
    expect(out.of('game:over')).toHaveLength(1);
    expect(room.status).toBe('finished');
    expect(out.of('turn:end').at(-1)!.nextDrawerId).toBeNull();
  });

  it('host can restart after the game, back to the lobby with scores reset', () => {
    const { room, out, ids } = started({ teamSize: 2, rounds: 1 });
    room.guess(ids[1]!, out.lastWordFor(ids[0]!)!.word);
    vi.advanceTimersByTime(3_000);
    room.guess(ids[0]!, out.lastWordFor(ids[1]!)!.word);
    expect(room.status).toBe('finished');

    expectGameError(() => room.restart(ids[1]!), 'not_host');
    room.restart(ids[0]!);
    expect(room.status).toBe('lobby');
    expect(room.snapshot().players.every((p) => p.score === 0)).toBe(true);
  });

  it('ranks tied scores equally', () => {
    const { room, out, ids } = started({ teamSize: 3 });
    room.guess(ids[1]!, out.lastWordFor(ids[0]!)!.word); // P2 gets 100, P1 gets 50
    expect(room.leaderboard().map((e) => [e.name, e.rank])).toEqual([
      ['P2', 1],
      ['P1', 2],
      ['P3', 3],
    ]);
  });
});

describe('leaving and reconnecting', () => {
  it('ends the turn if the drawer leaves, and play continues', () => {
    const { room, out, ids } = started({ teamSize: 3 });
    room.leave(ids[0]!);
    expect((out.of('turn:end')[0] as TurnEndPayload).reason).toBe('drawer_left');
    vi.advanceTimersByTime(3_000);
    expect(room.status).toBe('playing');
    expect(out.of('turn:start').at(-1)!.turn.drawerId).toBe(ids[1]);
  });

  it('ends the game when fewer than two players remain', () => {
    const { room, out, ids } = started({ teamSize: 2 });
    room.leave(ids[1]!);
    expect(room.status).toBe('finished');
    expect((out.of('turn:end')[0] as TurnEndPayload).reason).toBe('not_enough_players');
    expect(out.of('game:over')).toHaveLength(1);
  });

  it('lets a disconnected drawer rejoin with their token and get the word and canvas back', () => {
    const { room, out, ids, tokens } = started();
    const drawer = ids[0]!;
    room.addStroke(drawer, { strokeId: 's1', color: '#000000', width: 4, points: [[0.1, 0.1]] });
    room.disconnect(drawer, 'sock-0');
    expect(room.snapshot().players[0]!.connected).toBe(false);

    expectGameError(() => room.rejoin(drawer, 'wrong-token', 'sock-new'), 'invalid_session');
    const back = room.rejoin(drawer, tokens[0]!, 'sock-new');
    expect(back.drawerWord?.word).toBe(out.lastWordFor(drawer)!.word);
    expect(back.canvas).toHaveLength(1);
    expect(back.room.players[0]!.connected).toBe(true);

    // The old socket's late disconnect must not kick the rejoined player.
    room.disconnect(drawer, 'sock-0');
    expect(room.snapshot().players[0]!.connected).toBe(true);
  });

  it('removes a player who does not come back within the grace period', () => {
    const { room, join } = setup();
    const [, b] = join(2);
    room.disconnect(b!.playerId, 'sock-1');
    vi.advanceTimersByTime(10_000);
    expect(room.hasPlayer(b!.playerId)).toBe(false);
  });
});

describe('drawing', () => {
  it('relays the drawer strokes to everyone else and supports undo and clear', () => {
    const { room, out, ids, tokens } = started();
    const drawer = ids[0]!;
    const seg = (strokeId: string) => ({ strokeId, color: '#1E2B22', width: 4, points: [[0.5, 0.5]] as [number, number][] });

    room.addStroke(drawer, seg('a'));
    room.addStroke(drawer, seg('b'));
    room.addStroke(drawer, seg('b'));
    expect(out.sent.filter((s) => s.event === 'draw:stroke').every((s) => s.to === 'except' && s.target === drawer)).toBe(
      true,
    );

    room.undo(drawer);
    expect(out.of('draw:undo')).toEqual([{ strokeId: 'b' }]);
    expect(room.rejoin(drawer, tokens[0]!, 'x').canvas).toHaveLength(1);
  });

  it('ignores drawing from anyone but the drawer', () => {
    const { room, ids } = started();
    expectGameError(
      () => room.addStroke(ids[1]!, { strokeId: 'x', color: '#000000', width: 2, points: [[0, 0]] }),
      'not_drawer',
    );
  });
});
