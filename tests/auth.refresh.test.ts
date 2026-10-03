/**
 * Integration test against a real Postgres (see tests/setup-env.ts for the
 * connection string) — login/refresh/logout are exactly the kind of
 * multi-step, stateful flow that unit tests with a mocked db would get
 * wrong silently. This covers both refresh-token channels the controller
 * now supports: the existing httpOnly cookie (unchanged), and the new
 * JSON-body fallback added for the native (Capacitor) client, which runs
 * on a different origin than the API and can never receive a
 * sameSite:'strict' cookie cross-site.
 */
import type { Express } from 'express';
import request from 'supertest';
import { buildApp } from '@/app';
import { db, pool } from '@/db/client';
import { users } from '@/db/schema';

let app: Express;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await db.delete(users);
});

function uniqueEmail() {
  return `auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

describe('signup/login response shape', () => {
  it('returns the refresh token in the body AND sets it as an httpOnly cookie', async () => {
    const email = uniqueEmail();
    const res = await request(app).post('/api/auth/signup').send({ email, password: 'CorrectHorse123!' });

    expect(res.status).toBe(201);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');

    const cookie = res.headers['set-cookie']?.[0] || '';
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });
});

describe('refresh via cookie (existing web-style flow, unchanged)', () => {
  it('issues a new access token using only the cookie, no body', async () => {
    const email = uniqueEmail();
    const signup = await request(app).post('/api/auth/signup').send({ email, password: 'CorrectHorse123!' });
    const rawCookies = signup.headers['set-cookie'];
    const cookie = (Array.isArray(rawCookies) ? rawCookies[0] : rawCookies) as string;
    expect(cookie).toBeDefined();

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie).send({});
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    // Not asserting this differs from the signup token by string equality:
    // access-token JWTs are signed deterministically from {sub, role, iat,
    // exp}, and iat has second-level precision, so two tokens issued for
    // the same user within the same wall-clock second are legitimately
    // byte-identical — that's not a bug, just something this fast test can
    // hit. The refresh *token* rotating (covered below) is what actually
    // proves the refresh happened.
  });
});

describe('refresh via JSON body (native-app flow, no cookie presented)', () => {
  it('issues a new access token from a body-supplied refresh token', async () => {
    const email = uniqueEmail();
    const signup = await request(app).post('/api/auth/signup').send({ email, password: 'CorrectHorse123!' });
    const refreshToken = signup.body.refreshToken;

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('rejects a reused (rotated-out) body refresh token exactly like a reused cookie one', async () => {
    const email = uniqueEmail();
    const signup = await request(app).post('/api/auth/signup').send({ email, password: 'CorrectHorse123!' });
    const refreshToken = signup.body.refreshToken;

    const first = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);

    // The original token was rotated out by the first refresh — replaying
    // it must fail, whether it arrives via cookie or body.
    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_INVALID');
  });

  it('still rejects with no token presented at all', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_MISSING');
  });
});

describe('logout via JSON body (native-app flow)', () => {
  it('revokes a body-supplied refresh token so it can no longer be used to refresh', async () => {
    const email = uniqueEmail();
    const signup = await request(app).post('/api/auth/signup').send({ email, password: 'CorrectHorse123!' });
    const refreshToken = signup.body.refreshToken;

    const logout = await request(app).post('/api/auth/logout').send({ refreshToken });
    expect(logout.status).toBe(204);

    const afterLogout = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(afterLogout.status).toBe(401);
  });
});
