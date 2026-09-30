import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  let now = 0;
  const limiter = () => new RateLimiter(() => now);

  beforeEach(() => {
    now = 1_000_000;
  });

  it('lets requests through up to the limit, then asks to wait', () => {
    const rl = limiter();
    for (let i = 0; i < 3; i++) expect(rl.take('k', 3, 60_000)).toBe(0);
    expect(rl.take('k', 3, 60_000)).toBe(60);
  });

  it('says how long is left in the window', () => {
    const rl = limiter();
    rl.take('k', 1, 60_000);
    now += 45_000;
    expect(rl.take('k', 1, 60_000)).toBe(15);
  });

  it('opens a new window once the old one ends', () => {
    const rl = limiter();
    rl.take('k', 1, 60_000);
    now += 60_000;
    expect(rl.take('k', 1, 60_000)).toBe(0);
  });

  it('counts every key on its own', () => {
    const rl = limiter();
    rl.take('a', 1, 60_000);
    expect(rl.take('b', 1, 60_000)).toBe(0);
    expect(rl.take('a', 1, 60_000)).toBeGreaterThan(0);
  });
});
