import { randomInt } from 'node:crypto';
import type { GameConfig } from '../config.js';
import type { RoomSettings } from '../protocol.js';
import type { WordBank } from '../words/wordBank.js';
import { GameError } from './errors.js';
import { Room, type Outbox } from './Room.js';

/** No I, O, 0 or 1, so codes are easy to read out loud and type. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
/** Rooms live in memory; this keeps one server from being swamped. */
const MAX_ROOMS = 2000;

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly words: WordBank,
    private readonly outboxFor: (code: string) => Outbox,
    private readonly config?: GameConfig,
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  create(settings: RoomSettings): Room {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new GameError('server_busy', 'The server is full right now. Please try again in a few minutes.');
    }
    if (!this.words.hasCategory(settings.category)) {
      throw new GameError('unknown_category', `Unknown category "${settings.category}"`);
    }
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const room = new Room(code, settings, this.words, this.outboxFor(code), {
      config: this.config,
      onEmpty: (r) => this.rooms.delete(r.code),
    });
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new GameError('room_not_found', 'No room with that code');
    return room;
  }

  /** Drops a room that never got a player (e.g. its creator failed to join). */
  discardIfEmpty(room: Room): void {
    if (room.playerCount === 0) {
      room.dispose();
      this.rooms.delete(room.code);
    }
  }

  disposeAll(): void {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
