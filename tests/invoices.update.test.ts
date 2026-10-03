/**
 * Integration test against a real Postgres (see tests/setup-env.ts) for
 * the new PATCH /api/finance/invoices/:id route — a free-form "edit" for
 * fields like customerName/amountCents/dueAt/notes, distinct from the
 * dedicated mark-paid action. `status`/`paidAt` are not part of
 * updateInvoiceSchema, so they are silently stripped rather than ever
 * changing the invoice's paid state through this endpoint.
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
  const email = `invoice-update-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app).post('/api/auth/signup').send({ email, password: 'CorrectHorse123!' });
  return res.body.accessToken as string;
}

describe('PATCH /api/finance/invoices/:id', () => {
  it('updates an invoice owned by the caller, including notes', async () => {
    const token = await signupAndGetToken();
    const created = await request(app)
      .post('/api/finance/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerName: 'Test Client', amountCents: 10000, dueAt: '2026-12-01' });
    expect(created.status).toBe(201);
    const id = created.body.invoice.id;

    const patch = await request(app)
      .patch(`/api/finance/invoices/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ customerName: 'Renamed Client', amountCents: 25000, notes: 'Paid via bank transfer, ref 1234' });
    expect(patch.status).toBe(200);
    expect(patch.body.invoice.customerName).toBe('Renamed Client');
    expect(patch.body.invoice.amountCents).toBe(25000);
    expect(patch.body.invoice.notes).toBe('Paid via bank transfer, ref 1234');

    const list = await request(app).get('/api/finance/invoices').set('Authorization', `Bearer ${token}`);
    const fetched = list.body.invoices.find((i: { id: string }) => i.id === id);
    expect(fetched.customerName).toBe('Renamed Client');
    expect(fetched.notes).toBe('Paid via bank transfer, ref 1234');
  });

  it('ignores an attempt to change status/paidAt through the generic edit', async () => {
    const token = await signupAndGetToken();
    const created = await request(app)
      .post('/api/finance/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerName: 'Test Client', amountCents: 10000, dueAt: '2026-12-01' });
    const id = created.body.invoice.id;
    expect(created.body.invoice.status).toBe('pending');

    const patch = await request(app)
      .patch(`/api/finance/invoices/${id}`)
      .set('Authorization', `Bearer ${token}`)
      // status/paidAt aren't in updateInvoiceSchema, so these keys are
      // stripped by validation rather than ever reaching the service.
      .send({ status: 'paid', paidAt: '2026-01-01', notes: 'attempted sneaky mark-paid' });
    expect(patch.status).toBe(200);
    expect(patch.body.invoice.status).toBe('pending');
    expect(patch.body.invoice.paidAt).toBeNull();
    expect(patch.body.invoice.notes).toBe('attempted sneaky mark-paid');

    // Mark-paid remains the only real way to flip status.
    const markPaid = await request(app)
      .post(`/api/finance/invoices/${id}/mark-paid`)
      .set('Authorization', `Bearer ${token}`);
    expect(markPaid.status).toBe(200);
    expect(markPaid.body.invoice.status).toBe('paid');
  });

  it('returns 404 for an invoice that does not belong to the caller (no cross-tenant update)', async () => {
    const ownerToken = await signupAndGetToken();
    const created = await request(app)
      .post('/api/finance/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerName: 'Owner Client', amountCents: 5000, dueAt: '2026-12-01' });
    const id = created.body.invoice.id;

    const otherToken = await signupAndGetToken();
    const patch = await request(app)
      .patch(`/api/finance/invoices/${id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ customerName: 'Hijacked' });
    expect(patch.status).toBe(404);
    expect(patch.body.error.code).toBe('INVOICE_NOT_FOUND');

    const list = await request(app).get('/api/finance/invoices').set('Authorization', `Bearer ${ownerToken}`);
    const fetched = list.body.invoices.find((i: { id: string }) => i.id === id);
    expect(fetched.customerName).toBe('Owner Client');
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .patch('/api/finance/invoices/00000000-0000-0000-0000-000000000000')
      .send({ customerName: 'Nope' });
    expect(res.status).toBe(401);
  });
});
