/**
 * Fixed-window request counters, kept in memory. Enough for a single API
 * instance; with several, the counters would need a shared store (Redis).
 */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetsAt: number }>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Count one request for `key`. Returns 0 when it is allowed, or how many
   * seconds to wait when the window is full.
   */
  take(key: string, limit: number, windowMs: number): number {
    const now = this.now();
    this.sweep(now);
    const window = this.windows.get(key);
    if (!window || window.resetsAt <= now) {
      this.windows.set(key, { count: 1, resetsAt: now + windowMs });
      return 0;
    }
    if (window.count >= limit) {
      return Math.max(1, Math.ceil((window.resetsAt - now) / 1000));
    }
    window.count += 1;
    return 0;
  }

  /** Forget windows that already ended, at most once a minute. */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (window.resetsAt <= now) this.windows.delete(key);
    }
  }
}
