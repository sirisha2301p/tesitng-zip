import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { createGameServer, type GameServerHandle } from '../src/server.js';
import { DEFAULT_GAME_CONFIG } from '../src/config.js';
import type {
  AckResponse,
  ClientToServerEvents,
  DrawerWord,
  JoinResult,
  ServerToClientEvents,
} from '../src/protocol.js';
import { WordBank } from '../src/words/wordBank.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: GameServerHandle;
let url: string;
const clients: Client[] = [];

beforeEach(async () => {
  server = createGameServer({
    server: { port: 0, corsOrigin: '*' },
    words: WordBank.fromFile(),
    game: { ...DEFAULT_GAME_CONFIG, intermissionMs: 200 },
  });
  const port = await server.listen(0);
  url = `http://localhost:${port}`;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await server.close();
});

async function client(): Promise<Client> {
  const c: Client = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    c.once('connect', resolve);
    c.once('connect_error', reject);
  });
  return c;
}

function unwrap<T>(res: AckResponse<T>): T {
  if (!res.ok) throw new Error(`${res.error}: ${res.message}`);
  return res.data;
}

function next<E extends keyof ServerToClientEvents>(c: Client, event: E) {
  return new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) => {
    (c.once as (e: string, fn: (p: unknown) => void) => void)(event, resolve as (p: unknown) => void);
  });
}

describe('socket server', () => {
  it('serves health and categories over HTTP', async () => {
    const health = await fetch(`${url}/health`).then((r) => r.json());
    expect(health).toEqual({ ok: true, rooms: 0 });
    const { categories } = (await fetch(`${url}/categories`).then((r) => r.json())) as {
      categories: { id: string }[];
    };
    expect(categories[0]!.id).toBe('mixed');
    expect(categories.length).toBe(11);
  });

  it('serves word pictures and nothing else from the images folder', async () => {
    const cat = await fetch(`${url}/images/animals-cat.svg`);
    expect(cat.status).toBe(200);
    expect(cat.headers.get('content-type')).toBe('image/svg+xml');
    expect(await cat.text()).toMatch(/^<svg/);

    for (const path of ['/images/missing-word.svg', '/images/CREDITS.md', '/images/..%2Fwords.json', '/images/../package.json']) {
      expect((await fetch(`${url}${path}`)).status, path).toBe(404);
    }
  });

  it('plays a turn end to end: create, join, start, draw, guess', async () => {
    const host = await client();
    const friend = await client();

    const created: JoinResult = unwrap(
      await host.emitWithAck('room:create', { name: 'Asha', settings: { teamSize: 2, turnTime: 30, rounds: 1 } }),
    );
    expect(created.room.code).toMatch(/^[A-Z0-9]{6}$/);

    const joined: JoinResult = unwrap(
      await friend.emitWithAck('room:join', { code: created.room.code.toLowerCase(), name: 'Ravi' }),
    );
    expect(joined.room.players.map((p) => p.name)).toEqual(['Asha', 'Ravi']);

    const hostWord = next(host, 'turn:word');
    const friendTurnStart = next(friend, 'turn:start');
    let friendGotWord = false;
    friend.on('turn:word', () => (friendGotWord = true));

    unwrap(await host.emitWithAck('game:start'));
    const word: DrawerWord = await hostWord;
    const start = await friendTurnStart;
    expect(start.turn.drawerId).toBe(created.playerId);
    expect(JSON.stringify(start)).not.toContain(`"${word.word}"`);

    // Drawing reaches the guesser but is not echoed back to the drawer.
    let echoed = false;
    host.on('draw:stroke', () => (echoed = true));
    const stroke = next(friend, 'draw:stroke');
    host.emit('draw:stroke', { strokeId: 's1', color: '#1E2B22', width: 4, points: [[0.2, 0.3], [0.4, 0.5]] });
    expect(await stroke).toMatchObject({ strokeId: 's1' });

    // A guesser cannot draw.
    friend.emit('draw:stroke', { strokeId: 'x', color: '#000000', width: 4, points: [[0, 0]] });

    const wrong = unwrap(await friend.emitWithAck('guess:submit', { text: 'definitely not it' }));
    expect(wrong).toEqual({ result: 'wrong' });

    const correctSeen = next(host, 'guess:correct');
    const turnEnd = next(host, 'turn:end');
    const gameOverOrNext = Promise.race([next(host, 'turn:start'), next(host, 'game:over')]);
    const correct = unwrap(await friend.emitWithAck('guess:submit', { text: word.word }));
    expect(correct).toMatchObject({ result: 'correct', word: word.word });
    expect((await correctSeen).name).toBe('Ravi');
    const end = await turnEnd;
    expect(end).toMatchObject({ reason: 'all_guessed', word: word.word, nextDrawerId: joined.playerId });
    await gameOverOrNext;

    expect(echoed).toBe(false);
    expect(friendGotWord).toBe(false);
  });

  it('answers errors through the ack', async () => {
    const c = await client();
    expect(await c.emitWithAck('room:join', { code: 'ZZZZZZ', name: 'X' })).toMatchObject({
      ok: false,
      error: 'room_not_found',
    });
    expect(
      await c.emitWithAck('room:create', { name: 'X', settings: { teamSize: 11, turnTime: 20 } }),
    ).toMatchObject({ ok: false, error: 'invalid_payload' });
    expect(
      await c.emitWithAck('room:create', { name: 'X', settings: { teamSize: 2, turnTime: 20, category: 'nope' } }),
    ).toMatchObject({ ok: false, error: 'unknown_category' });
    expect(await c.emitWithAck('game:start')).toMatchObject({ ok: false, error: 'not_in_room' });
    expect(server.rooms.size).toBe(0);
  });

  it('slows down a client that floods the server', async () => {
    const c = await client();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => c.emitWithAck('guess:submit', { text: 'spam' })),
    );
    const errors = results.map((r) => (r.ok ? 'ok' : r.error));
    expect(errors.slice(0, 6).every((e) => e === 'not_in_room')).toBe(true);
    expect(errors).toContain('rate_limited');
  });

  it('keeps the seat when a player reconnects with their token', async () => {
    const host = await client();
    const friend = await client();
    const created = unwrap(
      await host.emitWithAck('room:create', { name: 'Asha', settings: { teamSize: 2, turnTime: 30 } }),
    );
    const joined = unwrap(await friend.emitWithAck('room:join', { code: created.room.code, name: 'Ravi' }));

    const sawOffline = new Promise<void>((resolve) =>
      host.on('room:state', (s) => {
        if (s.players.some((p) => p.id === joined.playerId && !p.connected)) resolve();
      }),
    );
    friend.disconnect();
    await sawOffline;

    const again = await client();
    const back = unwrap(
      await again.emitWithAck('room:rejoin', {
        code: created.room.code,
        playerId: joined.playerId,
        token: joined.token,
      }),
    );
    expect(back.room.players.find((p) => p.id === joined.playerId)?.connected).toBe(true);
    expect(unwrap(await host.emitWithAck('game:start'))).toBeNull();
  });
});
