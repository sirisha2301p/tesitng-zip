import type { ErrorCode } from '../protocol.js';

/** An expected, user-facing failure (bad input, wrong turn, full room...). */
export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'GameError';
  }
}
