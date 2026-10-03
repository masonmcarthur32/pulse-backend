import { signupSchema, loginSchema } from '@/modules/auth/auth.schema';
import { businessProfileSchema } from '@/modules/profile/profile.schema';
import { createInvoiceSchema, kpiSchema } from '@/modules/finance/finance.schema';
import { createClientSchema, updateClientSchema } from '@/modules/clients/clients.schema';
import { createLeadSchema, advanceLeadSchema } from '@/modules/leads/leads.schema';

describe('auth.schema', () => {
  it('accepts a valid signup payload and lowercases the email', () => {
    const result = signupSchema.parse({ email: 'Owner@Example.com', password: 'correct-horse-battery' });
    expect(result.email).toBe('owner@example.com');
  });

  it('rejects a password shorter than 12 characters', () => {
    expect(() => signupSchema.parse({ email: 'a@b.com', password: 'short1' })).toThrow();
  });

  it('rejects a malformed email', () => {
    expect(() => signupSchema.parse({ email: 'not-an-email', password: 'correct-horse-battery' })).toThrow();
  });

  it('login accepts any non-empty password (length is enforced at signup, not login)', () => {
    expect(() => loginSchema.parse({ email: 'a@b.com', password: 'x' })).not.toThrow();
  });

  it('strips unknown fields rather than passing them through', () => {
    const result = signupSchema.parse({
      email: 'a@b.com',
      password: 'correct-horse-battery',
      role: 'admin' // an attempted privilege-escalation field
    } as unknown as Record<string, unknown>);
    expect(result).not.toHaveProperty('role');
  });
});

describe('profile.schema', () => {
  it('accepts a full valid profile', () => {
    expect(() =>
      businessProfileSchema.parse({
        name: 'Only Coaching',
        description: 'Online fitness coaching.',
        model: 'Service / coaching',
        idealCustomer: 'Busy professionals',
        quarterlyGoal: '$15k MRR',
        accountingSoftware: 'Xero'
      })
    ).not.toThrow();
  });

  it('rejects an unlisted business model (prevents arbitrary strings reaching the DB enum)', () => {
    expect(() =>
      businessProfileSchema.parse({
        name: 'Only Coaching',
        description: 'Online fitness coaching.',
        model: 'Something Else Entirely'
      })
    ).toThrow();
  });

  it('requires a non-empty name and description', () => {
    expect(() => businessProfileSchema.parse({ name: '', description: '', model: 'Hybrid' })).toThrow();
  });

  it('defaults optional fields when omitted', () => {
    const result = businessProfileSchema.parse({
      name: 'Only Coaching',
      description: 'Online fitness coaching.',
      model: 'Hybrid'
    });
    expect(result.idealCustomer).toBe('');
    expect(result.accountingSoftware).toBe('None yet');
  });
});

describe('finance.schema', () => {
  it('accepts a valid invoice', () => {
    expect(() =>
      createInvoiceSchema.parse({ customerName: 'Acme Pty Ltd', amountCents: 15000, dueAt: '2026-12-31' })
    ).not.toThrow();
  });

  it('rejects a zero or negative amount', () => {
    expect(() =>
      createInvoiceSchema.parse({ customerName: 'Acme', amountCents: 0, dueAt: '2026-12-31' })
    ).toThrow();
    expect(() =>
      createInvoiceSchema.parse({ customerName: 'Acme', amountCents: -500, dueAt: '2026-12-31' })
    ).toThrow();
  });

  it('rejects a non-integer amount (fractional cents are not a valid amount)', () => {
    expect(() =>
      createInvoiceSchema.parse({ customerName: 'Acme', amountCents: 100.5, dueAt: '2026-12-31' })
    ).toThrow();
  });

  it('uppercases a lowercase currency code', () => {
    const result = createInvoiceSchema.parse({
      customerName: 'Acme',
      amountCents: 1000,
      currency: 'aud',
      dueAt: '2026-12-31'
    });
    expect(result.currency).toBe('AUD');
  });

  it('rejects an invalid date', () => {
    expect(() =>
      createInvoiceSchema.parse({ customerName: 'Acme', amountCents: 1000, dueAt: 'not-a-date' })
    ).toThrow();
  });

  it('validates KPI input requires the core fields', () => {
    expect(() => kpiSchema.parse({ goal: 'Grow MRR', keyResult: '$15k by EOQ', kpiName: 'New sign-ups' })).not.toThrow();
    expect(() => kpiSchema.parse({ goal: '', keyResult: '', kpiName: '' })).toThrow();
  });
});

describe('clients.schema', () => {
  it('accepts a minimal valid client and defaults status to active', () => {
    const result = createClientSchema.parse({ name: 'Acme Pty Ltd' });
    expect(result.status).toBe('active');
    expect(result.monthlyValueCents).toBe(0);
  });

  it('rejects an unlisted status (prevents an arbitrary string reaching the DB enum)', () => {
    expect(() => createClientSchema.parse({ name: 'Acme', status: 'vip' })).toThrow();
  });

  it('rejects a negative monthly value', () => {
    expect(() => createClientSchema.parse({ name: 'Acme', monthlyValueCents: -500 })).toThrow();
  });

  it('rejects an empty name', () => {
    expect(() => createClientSchema.parse({ name: '' })).toThrow();
  });

  it('update schema allows a partial payload (every field optional)', () => {
    expect(() => updateClientSchema.parse({ status: 'paused' })).not.toThrow();
    expect(() => updateClientSchema.parse({})).not.toThrow();
  });

  it('update schema still rejects an invalid value for a field that is present', () => {
    expect(() => updateClientSchema.parse({ monthlyValueCents: -1 })).toThrow();
  });
});

describe('leads.schema', () => {
  it('accepts a minimal valid lead and defaults stage to new', () => {
    const result = createLeadSchema.parse({ name: 'Jordan Smith' });
    expect(result.stage).toBe('new');
  });

  it('rejects an unlisted stage', () => {
    expect(() => createLeadSchema.parse({ name: 'Jordan', stage: 'interested' })).toThrow();
  });

  it('rejects a negative estimated value', () => {
    expect(() => createLeadSchema.parse({ name: 'Jordan', estValueCents: -100 })).toThrow();
  });

  it('advanceLeadSchema only accepts a known stage as nextStage', () => {
    expect(() => advanceLeadSchema.parse({ nextStage: 'won' })).not.toThrow();
    expect(() => advanceLeadSchema.parse({ nextStage: 'not-a-stage' })).toThrow();
    expect(() => advanceLeadSchema.parse({})).toThrow();
  });
});
