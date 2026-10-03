import type { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildApp } from '@/app';

let app: Express;

beforeAll(async () => {
  app = await buildApp();
});

describe('health check', () => {
  it('responds without requiring auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('unknown routes', () => {
  it('returns a clean 404 rather than an Express default page', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('auth guard on protected REST routes', () => {
  it('rejects a request with no Authorization header before touching the database', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed bearer token', async () => {
    const res = await request(app).get('/api/profile').set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('rejects a token signed with a different secret (would indicate a forged token)', async () => {
    const forged = jwt.sign({ sub: 'someone', role: 'owner' }, 'wrong-secret', {
      issuer: 'business-os',
      audience: 'business-os-client'
    });
    const res = await request(app).get('/api/finance/dashboard-summary').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('never reaches a controller for a protected route missing auth, even with a bad body', async () => {
    // If this ever returned 400 instead of 401, it would mean validation
    // middleware ran before the auth guard on a protected route — a sign
    // the two were wired in the wrong order for that route.
    const res = await request(app).put('/api/profile').send({ not: 'valid' });
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated access to clients (list, create, advance-style writes)', async () => {
    const list = await request(app).get('/api/clients');
    expect(list.status).toBe(401);

    const create = await request(app).post('/api/clients').send({ name: 'Acme' });
    expect(create.status).toBe(401);
  });

  it('rejects unauthenticated access to leads, including the guided pipeline endpoints', async () => {
    const list = await request(app).get('/api/leads');
    expect(list.status).toBe(401);

    const advance = await request(app)
      .post('/api/leads/00000000-0000-0000-0000-000000000000/advance')
      .send({ nextStage: 'won' });
    expect(advance.status).toBe(401);

    const reengage = await request(app).post('/api/leads/00000000-0000-0000-0000-000000000000/reengage');
    expect(reengage.status).toBe(401);
  });
});

describe('input validation on public auth routes', () => {
  it('rejects signup with an invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'not-an-email', password: 'correct-horse-battery' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects signup with a short password', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects refresh with no cookie present', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_MISSING');
  });
});

describe('error handler', () => {
  it('never includes a stack trace in a client-facing AppError response', async () => {
    const res = await request(app).get('/api/profile');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\(.*:\d+:\d+\)/); // a typical stack-frame line
  });
});

describe('GraphQL', () => {
  it('answers `me` with null when no token is presented, rather than erroring', async () => {
    const res = await request(app).post('/graphql').send({ query: '{ me { id role } }' });
    expect(res.status).toBe(200);
    expect(res.body.data.me).toBeNull();
  });

  it('rejects an authenticated-only query with UNAUTHENTICATED', async () => {
    const res = await request(app)
      .post('/graphql')
      .send({ query: '{ businessProfile { name } }' });
    expect(res.status).toBe(200); // GraphQL errors still return HTTP 200 by spec
    expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a mutation with no auth', async () => {
    const res = await request(app)
      .post('/graphql')
      .send({
        query: `mutation { createInvoice(input: { customerName: "Acme", amountCents: 100, dueAt: "2026-12-31" }) { id } }`
      });
    expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('rejects clients and leads queries with no auth', async () => {
    const clientsRes = await request(app).post('/graphql').send({ query: '{ clients { id name } }' });
    expect(clientsRes.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');

    const leadsRes = await request(app).post('/graphql').send({ query: '{ leads { id name } }' });
    expect(leadsRes.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('rejects the guided advanceLead mutation with no auth', async () => {
    const res = await request(app).post('/graphql').send({
      query: `mutation { advanceLead(id: "00000000-0000-0000-0000-000000000000", nextStage: "won") { lead { id } } }`
    });
    expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
  });
});
