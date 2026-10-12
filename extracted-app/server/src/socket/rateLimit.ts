/** A token bucket: allows short bursts up to `burst`, refilling at `perSecond`. */
export class RateLimiter {
  private tokens: number;
  private last = Date.now();

  constructor(
    private readonly perSecond: number,
    private readonly burst: number,
  ) {
    this.tokens = burst;
  }

  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Limits per connection. Generous for real play, tight enough to stop a flooding script. */
export const createLimiters = () => ({
  /** create / join / rejoin */
  rooms: new RateLimiter(0.5, 5),
  guesses: new RateLimiter(3, 6),
  /** Drawing sends ~25 segments a second while the finger moves. */
  strokes: new RateLimiter(60, 120),
  other: new RateLimiter(5, 10),
});
