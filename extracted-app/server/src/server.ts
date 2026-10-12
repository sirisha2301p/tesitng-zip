import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { originChecker, type GameConfig, type ServerConfig } from './config.js';
import { RoomManager } from './game/RoomManager.js';
import { createStaticSite } from './staticSite.js';
import { registerSocketHandlers, socketOutbox, type GameServer } from './socket/handlers.js';
import type { WordBank } from './words/wordBank.js';

const IMAGES_DIR = fileURLToPath(new URL('../public/images/', import.meta.url));
const IMAGE_TYPES: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp' };

/** Word pictures from public/images. Only plain file names are accepted, so no path can escape the folder. */
function serveImage(file: string, res: ServerResponse): void {
  const match = /^[a-z0-9-]+\.(svg|png|webp)$/.exec(file);
  if (!match) {
    res.writeHead(404).end();
    return;
  }
  readFile(join(IMAGES_DIR, file))
    .then((body) => {
      res.writeHead(200, {
        'Content-Type': IMAGE_TYPES[match[1]!]!,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(body);
    })
    .catch(() => res.writeHead(404).end());
}

export interface GameServerHandle {
  http: HttpServer;
  io: GameServer;
  rooms: RoomManager;
  /** Resolves with the actual port (useful when listening on port 0 in tests). */
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

export function createGameServer(options: {
  server: ServerConfig;
  words: WordBank;
  game?: GameConfig;
}): GameServerHandle {
  const { server: config, words } = options;
  const isAllowed = originChecker(config.corsOrigin);
  /** Pages served by this server itself (WEB_DIR) are always allowed to use it. */
  const isSameSite = (origin: string | undefined, host: string | undefined) => {
    try {
      return !!origin && !!host && new URL(origin).host === host;
    } catch {
      return false;
    }
  };

  // A small HTTP API next to the socket server. The word list itself is never exposed.
  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (config.corsOrigin === '*') res.setHeader('Access-Control-Allow-Origin', '*');
    else if (origin && isAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && pathname === '/health') return send(200, { ok: true, rooms: rooms.size });
    if (req.method === 'GET' && pathname === '/categories') return send(200, { categories: words.categories() });
    if (req.method === 'GET' && pathname.startsWith('/images/')) return serveImage(pathname.slice('/images/'.length), res);
    if (site && (req.method === 'GET' || req.method === 'HEAD')) {
      site(pathname, res).catch(() => res.writeHead(500).end());
      return;
    }
    send(404, { error: 'not_found' });
  });
  const site = config.webDir ? createStaticSite(config.webDir) : null;

  const io: GameServer = new Server(http, {
    cors: { origin: config.corsOrigin === '*' ? '*' : (origin, cb) => cb(null, isAllowed(origin)) },
    // CORS alone doesn't stop a WebSocket from another website, so check the origin on every connection.
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      const ok = isAllowed(origin) || isSameSite(origin, req.headers.host);
      cb(ok ? null : 'Origin not allowed', ok);
    },
    // Strokes are small and frequent; keep the payload cap modest.
    maxHttpBufferSize: 64 * 1024,
  });
  const rooms = new RoomManager(words, (code) => socketOutbox(io, code), options.game);
  registerSocketHandlers(io, rooms);

  return {
    http,
    io,
    rooms,
    listen: (port = config.port) =>
      new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(port, () => resolve((http.address() as AddressInfo).port));
      }),
    close: async () => {
      rooms.disposeAll();
      await io.close();
    },
  };
}
