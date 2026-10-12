import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameServer, type GameServerHandle } from '../src/server.js';
import { WordBank } from '../src/words/wordBank.js';

let dir: string;
let server: GameServerHandle;
let url: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dg-site-'));
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Draw & Guess</title>');
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), 'console.log(1)');
  writeFileSync(join(dir, '..', 'secret.txt'), 'outside');
  server = createGameServer({ server: { port: 0, corsOrigin: '*', webDir: dir }, words: WordBank.fromFile() });
  url = `http://localhost:${await server.listen(0)}`;
});

afterAll(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(dir, '..', 'secret.txt'), { force: true });
});

describe('hosting the web app', () => {
  it('serves the page, with no caching so updates show up', async () => {
    const res = await fetch(`${url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('serves app routes like invite links as the page', async () => {
    const res = await fetch(`${url}/join/PND482`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Draw & Guess');
  });

  it('serves bundles with long caching', async () => {
    const res = await fetch(`${url}/_expo/static/js/entry-abc.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('keeps the game endpoints working and never leaves the site folder', async () => {
    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect((await fetch(`${url}/images/animals-cat.svg`)).status).toBe(200);
    expect((await fetch(`${url}/missing.js`)).status).toBe(404);
    for (const path of ['/..%2Fsecret.txt', '/%2e%2e/secret.txt', '/_expo/..%2F..%2Fsecret.txt']) {
      const res = await fetch(`${url}${path}`);
      expect(await res.text(), path).not.toBe('outside');
    }
  });
});
