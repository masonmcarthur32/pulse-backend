import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '@/config/env';

export interface AccessTokenPayload {
  sub: string; // user id
  role: 'owner' | 'accountant';
}

/** Short-lived (default 15m) — carried in the Authorization header, never
 *  in a cookie, so it is immune to CSRF and never sent automatically by
 *  the browser. */
export function signAccessToken(payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = {
    // Pin the algorithm explicitly rather than leaning on jsonwebtoken's
    // default. Harmless today (there's no RSA/EC keypair anywhere in this
    // system for a classic alg-confusion attack to exploit), but a signer
    // and verifier that both hardcode HS256 rather than trusting a library
    // default is a zero-cost hedge against that entire bug class in any
    // future version of this dependency.
    algorithm: 'HS256',
    // @types/jsonwebtoken types `expiresIn` as a template-literal union
    // (e.g. "15m") rather than a general `string`; env vars are always
    // plain strings, so validate the *value* with zod (config/env.ts) and
    // narrow the *type* here rather than losing type-checking on the rest
    // of this options object.
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'business-os',
    audience: 'business-os-client'
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
    issuer: 'business-os',
    audience: 'business-os-client'
  });
  if (typeof decoded === 'string' || !('sub' in decoded) || !('role' in decoded)) {
    throw new Error('Malformed access token payload');
  }
  return { sub: String(decoded.sub), role: decoded.role as AccessTokenPayload['role'] };
}

/**
 * Refresh tokens are opaque random strings, not JWTs — the server is the
 * only party that ever needs to look one up, so there is no reason to
 * make it self-describing (and no reason to risk an alg-confusion or
 * payload-tampering bug on a token that only needs to be compared by
 * hash). Only the SHA-256 hash is persisted; the raw value is sent to the
 * client once and never stored.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function refreshTokenExpiry(): Date {
  const days = env.JWT_REFRESH_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Constant-time comparison for anything checked against a stored hash
 *  (accountant share tokens, etc.) to avoid timing side-channels. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
