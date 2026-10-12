import type { Server, Socket } from 'socket.io';
import type { z } from 'zod';
import { GameError } from '../game/errors.js';
import type { Room, Outbox } from '../game/Room.js';
import type { RoomManager } from '../game/RoomManager.js';
import { createLimiters, type RateLimiter } from './rateLimit.js';
import {
  createRoomSchema,
  guessSchema,
  joinRoomSchema,
  rejoinRoomSchema,
  strokeSegmentSchema,
  type Ack,
  type ClientToServerEvents,
  type JoinResult,
  type ServerToClientEvents,
} from '../protocol.js';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const roomChannel = (code: string) => `room:${code}`;
const playerChannel = (playerId: string) => `player:${playerId}`;

/** Sends room events through Socket.IO channels: one per room, one per player. */
export function socketOutbox(io: GameServer, code: string): Outbox {
  type Emit = (event: string, ...args: unknown[]) => boolean;
  return {
    toRoom: (event, ...args) => {
      (io.to(roomChannel(code)).emit as Emit)(event, ...args);
    },
    toPlayer: (playerId, event, ...args) => {
      (io.to(playerChannel(playerId)).emit as Emit)(event, ...args);
    },
    toRoomExcept: (playerId, event, ...args) => {
      (io.to(roomChannel(code)).except(playerChannel(playerId)).emit as Emit)(event, ...args);
    },
  };
}

function parse<S extends z.ZodType>(schema: S, payload: unknown): z.infer<S> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new GameError('invalid_payload', `${where}${issue?.message ?? 'Invalid data'}`);
  }
  return result.data;
}

/** Runs a request handler and answers through the ack callback, turning errors into { ok: false }. */
function respond<T>(ack: unknown, fn: () => T): void {
  const reply = typeof ack === 'function' ? (ack as Ack<T>) : undefined;
  let data: T;
  try {
    data = fn();
  } catch (err) {
    const error = err instanceof GameError ? err : new GameError('internal', 'Something went wrong');
    if (!(err instanceof GameError)) console.error('[socket] unexpected error', err);
    reply?.({ ok: false, error: error.code, message: error.message });
    return;
  }
  reply?.({ ok: true, data });
}

/** For fire-and-forget events (drawing): invalid or out-of-turn messages are dropped silently. */
function quietly(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    if (!(err instanceof GameError)) console.error('[socket] unexpected error', err);
  }
}

export function registerSocketHandlers(io: GameServer, manager: RoomManager): void {
  io.on('connection', (socket: GameSocket) => {
    /** The room and player this connection speaks for, once joined. */
    let session: { room: Room; playerId: string } | null = null;
    const limits = createLimiters();
    const slowDown = (limiter: RateLimiter) => {
      if (!limiter.take()) throw new GameError('rate_limited', 'Slow down a little and try again');
    };

    const requireSession = () => {
      if (!session || !session.room.hasPlayer(session.playerId)) {
        session = null;
        throw new GameError('not_in_room', 'Join a room first');
      }
      return session;
    };

    const enter = (room: Room, result: JoinResult): JoinResult => {
      session = { room, playerId: result.playerId };
      void socket.join(roomChannel(room.code));
      void socket.join(playerChannel(result.playerId));
      return result;
    };

    /** Leave the current room (if any) before joining another. */
    const exitCurrent = () => {
      if (!session) return;
      const { room, playerId } = session;
      session = null;
      void socket.leave(roomChannel(room.code));
      void socket.leave(playerChannel(playerId));
      room.leave(playerId);
    };

    socket.on('room:create', (payload, ack) =>
      respond(ack, () => {
        slowDown(limits.rooms);
        const { name, settings } = parse(createRoomSchema, payload);
        exitCurrent();
        const room = manager.create(settings);
        try {
          return enter(room, room.addPlayer(name, socket.id));
        } finally {
          manager.discardIfEmpty(room);
        }
      }),
    );

    socket.on('room:join', (payload, ack) =>
      respond(ack, () => {
        slowDown(limits.rooms);
        const { code, name } = parse(joinRoomSchema, payload);
        const room = manager.get(code);
        if (session?.room === room) throw new GameError('invalid_payload', 'You are already in this room');
        const result = room.addPlayer(name, socket.id);
        exitCurrent();
        return enter(room, result);
      }),
    );

    socket.on('room:rejoin', (payload, ack) =>
      respond(ack, () => {
        slowDown(limits.rooms);
        const { code, playerId, token } = parse(rejoinRoomSchema, payload);
        const room = manager.get(code);
        const result = room.rejoin(playerId, token, socket.id);
        if (session && session.playerId !== playerId) exitCurrent();
        return enter(room, result);
      }),
    );

    socket.on('room:leave', (ack) =>
      respond(ack, () => {
        slowDown(limits.other);
        requireSession();
        exitCurrent();
        return null;
      }),
    );

    socket.on('game:start', (ack) =>
      respond(ack, () => {
        slowDown(limits.other);
        const { room, playerId } = requireSession();
        room.start(playerId);
        return null;
      }),
    );

    socket.on('game:restart', (ack) =>
      respond(ack, () => {
        slowDown(limits.other);
        const { room, playerId } = requireSession();
        room.restart(playerId);
        return null;
      }),
    );

    socket.on('turn:skip', (ack) =>
      respond(ack, () => {
        slowDown(limits.other);
        const { room, playerId } = requireSession();
        return room.skip(playerId);
      }),
    );

    socket.on('guess:submit', (payload, ack) =>
      respond(ack, () => {
        slowDown(limits.guesses);
        const { room, playerId } = requireSession();
        const { text } = parse(guessSchema, payload);
        return room.guess(playerId, text);
      }),
    );

    socket.on('draw:stroke', (segment) =>
      quietly(() => {
        slowDown(limits.strokes);
        const { room, playerId } = requireSession();
        room.addStroke(playerId, parse(strokeSegmentSchema, segment));
      }),
    );

    socket.on('draw:undo', () =>
      quietly(() => {
        slowDown(limits.other);
        const { room, playerId } = requireSession();
        room.undo(playerId);
      }),
    );

    socket.on('draw:clear', () =>
      quietly(() => {
        slowDown(limits.other);
        const { room, playerId } = requireSession();
        room.clearCanvas(playerId);
      }),
    );

    socket.on('disconnect', () => {
      if (session) session.room.disconnect(session.playerId, socket.id);
      session = null;
    });
  });
}
