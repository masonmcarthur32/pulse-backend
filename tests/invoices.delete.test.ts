/**
 * Integration test against a real Postgres (see tests/setup-env.ts) for
 * the new DELETE /api/finance/invoices/:id route — the dashboard needed a
 * way to remove a mistakenly-created invoice, which the API didn't expose
 * before (only create/list/mark-paid existed).
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

async function signupAndGetToken() {
  const email = `invoice-delete-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app).post('/api/auth/signup').send({ email, password: 'CorrectHorse123!' });
  return res.body.accessToken as string;
}

describe('DELETE /api/finance/invoices/:id', () => {
  it('deletes an invoice owned by the caller', async () => {
    const token = await signupAndGetToken();
    const created = await request(app)
      .post('/api/finance/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerName: 'Test Client', amountCents: 10000, dueAt: '2026-12-01' });
    expect(created.status).toBe(201);
    const id = created.body.invoice.id;

    const del = await request(app).delete(`/api/finance/invoices/${id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/finance/invoices').set('Authorization', `Bearer ${token}`);
    expect(list.body.invoices.find((i: { id: string }) => i.id === id)).toBeUndefined();
  });

  it('returns 404 for an invoice that does not belong to the caller (no cross-tenant delete)', async () => {
    const ownerToken = await signupAndGetToken();
    const created = await request(app)
      .post('/api/finance/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerName: 'Owner Client', amountCents: 5000, dueAt: '2026-12-01' });
    const id = created.body.invoice.id;

    const otherToken = await signupAndGetToken();
    const del = await request(app).delete(`/api/finance/invoices/${id}`).set('Authorization', `Bearer ${otherToken}`);
    expect(del.status).toBe(404);
    expect(del.body.error.code).toBe('INVOICE_NOT_FOUND');

    // Still there for the real owner.
    const list = await request(app).get('/api/finance/invoices').set('Authorization', `Bearer ${ownerToken}`);
    expect(list.body.invoices.find((i: { id: string }) => i.id === id)).toBeDefined();
  });

  it('requires authentication', async () => {
    const res = await request(app).delete('/api/finance/invoices/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(401);
  });
});
