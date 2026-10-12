import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import { originChecker } from '../src/config.js';
import { createGameServer, type GameServerHandle } from '../src/server.js';
import { WordBank } from '../src/words/wordBank.js';

const VERCEL = ['https://draw-guess.vercel.app', 'https://draw-guess-*.vercel.app'];

describe('originChecker', () => {
  const allowed = originChecker(VERCEL);

  it('allows the listed sites and their preview links', () => {
    expect(allowed('https://draw-guess.vercel.app')).toBe(true);
    expect(allowed('https://draw-guess-git-main-asha.vercel.app')).toBe(true);
  });

  it('allows requests without an origin (phone apps)', () => {
    expect(allowed(undefined)).toBe(true);
  });

  it('rejects other sites, including look-alikes', () => {
    expect(allowed('https://evil.example.com')).toBe(false);
    expect(allowed('https://draw-guess.vercel.app.evil.com')).toBe(false);
    expect(allowed('https://evil.com/https://draw-guess.vercel.app')).toBe(false);
    expect(allowed('http://draw-guess.vercel.app')).toBe(false);
    expect(allowed('https://a.b.draw-guess-x.vercel.app')).toBe(false);
  });

  it('"*" allows everything', () => {
    expect(originChecker('*')('https://anything.example')).toBe(true);
  });
});

describe('server with allowed origins', () => {
  let server: GameServerHandle;
  let url: string;

  beforeAll(async () => {
    server = createGameServer({ server: { port: 0, corsOrigin: VERCEL }, words: WordBank.fromFile() });
    url = `http://localhost:${await server.listen(0)}`;
  });
  afterAll(() => server.close());

  const tryConnect = (origin?: string) =>
    new Promise<boolean>((resolve) => {
      const socket = connect(url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        extraHeaders: origin ? { origin } : {},
      });
      socket.on('connect', () => {
        socket.close();
        resolve(true);
      });
      socket.on('connect_error', () => {
        socket.close();
        resolve(false);
      });
    });

  it('accepts game connections from the Vercel site and from phone apps', async () => {
    expect(await tryConnect('https://draw-guess.vercel.app')).toBe(true);
    expect(await tryConnect('https://draw-guess-git-main-asha.vercel.app')).toBe(true);
    expect(await tryConnect()).toBe(true);
  });

  it('refuses game connections from other websites', async () => {
    expect(await tryConnect('https://evil.example.com')).toBe(false);
  });

  it('only tells allowed sites they may read the API', async () => {
    const ok = await fetch(`${url}/categories`, { headers: { origin: 'https://draw-guess.vercel.app' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://draw-guess.vercel.app');
    const bad = await fetch(`${url}/categories`, { headers: { origin: 'https://evil.example.com' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
});
