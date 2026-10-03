import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiry,
  safeEqual
} from '@/lib/jwt';

describe('access tokens', () => {
  it('round-trips a valid payload', () => {
    const token = signAccessToken({ sub: 'user-123', role: 'owner' });
    const decoded = verifyAccessToken(token);
    expect(decoded).toEqual({ sub: 'user-123', role: 'owner' });
  });

  it('rejects a token signed with the wrong secret', () => {
    const forged = jwt.sign({ sub: 'user-123', role: 'owner' }, 'not-the-real-secret', {
      issuer: 'business-os',
      audience: 'business-os-client'
    });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: 'user-123', role: 'owner' }, process.env.JWT_ACCESS_SECRET as string, {
      issuer: 'business-os',
      audience: 'business-os-client',
      expiresIn: -10 // already expired
    });
    expect(() => verifyAccessToken(expired)).toThrow();
  });

  it('rejects a token with the wrong audience (e.g. issued for a different app)', () => {
    const wrongAudience = jwt.sign(
      { sub: 'user-123', role: 'owner' },
      process.env.JWT_ACCESS_SECRET as string,
      { issuer: 'business-os', audience: 'some-other-app' }
    );
    expect(() => verifyAccessToken(wrongAudience)).toThrow();
  });

  it('rejects the "none" algorithm (classic JWT downgrade attack)', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sub: 'user-123', role: 'owner', iss: 'business-os', aud: 'business-os-client' })
    ).toString('base64url');
    const forgedNoneToken = `${header}.${body}.`;
    expect(() => verifyAccessToken(forgedNoneToken)).toThrow();
  });

  it('rejects a token signed with the same secret under a different algorithm', () => {
    // verifyAccessToken pins algorithms: ['HS256'] explicitly rather than
    // trusting jsonwebtoken's default — this proves that pin is load-
    // bearing and not just a comment, by signing under HS384 with the
    // exact same secret and confirming verification still refuses it.
    const wrongAlg = jwt.sign({ sub: 'user-123', role: 'owner' }, process.env.JWT_ACCESS_SECRET as string, {
      algorithm: 'HS384',
      issuer: 'business-os',
      audience: 'business-os-client'
    });
    expect(() => verifyAccessToken(wrongAlg)).toThrow();
  });
});

describe('refresh token helpers', () => {
  it('generates high-entropy, URL-safe tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes deterministically so a stored hash can be matched on lookup', () => {
    const raw = generateRefreshToken();
    expect(hashToken(raw)).toEqual(hashToken(raw));
    expect(hashToken(raw)).not.toEqual(raw);
  });

  it('produces an expiry in the future', () => {
    expect(refreshTokenExpiry().getTime()).toBeGreaterThan(Date.now());
  });
});

describe('safeEqual', () => {
  it('matches identical strings', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
  });

  it('rejects different strings, including different lengths', () => {
    expect(safeEqual('abc123', 'abc124')).toBe(false);
    expect(safeEqual('abc123', 'abc12')).toBe(false);
  });
});
