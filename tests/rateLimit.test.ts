import { createKeyedLimiter } from '@/lib/rateLimit';
import { AppError } from '@/lib/http-error';

describe('createKeyedLimiter', () => {
  it('allows calls up to the limit, then throws', () => {
    const limiter = createKeyedLimiter({ windowMs: 60_000, max: 3 });
    limiter.consume('user-1');
    limiter.consume('user-1');
    limiter.consume('user-1');
    expect(() => limiter.consume('user-1')).toThrow(AppError);
  });

  it('throws a 429 tooMany error with a stable code', () => {
    const limiter = createKeyedLimiter({ windowMs: 60_000, max: 1 });
    limiter.consume('user-2');
    try {
      limiter.consume('user-2');
      throw new Error('expected consume() to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(429);
      expect((err as AppError).code).toBe('RATE_LIMITED');
    }
  });

  it('tracks each key independently — one caller cannot exhaust another\'s budget', () => {
    const limiter = createKeyedLimiter({ windowMs: 60_000, max: 1 });
    limiter.consume('user-a');
    expect(() => limiter.consume('user-a')).toThrow(AppError);
    // A different key still has its own untouched budget.
    expect(() => limiter.consume('user-b')).not.toThrow();
  });

  it('allows calls again once the window has fully elapsed', () => {
    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      const limiter = createKeyedLimiter({ windowMs: 1_000, max: 1 });
      limiter.consume('user-3');
      expect(() => limiter.consume('user-3')).toThrow(AppError);
      now += 1_001; // advance past the window
      expect(() => limiter.consume('user-3')).not.toThrow();
    } finally {
      Date.now = realNow;
    }
  });
});
