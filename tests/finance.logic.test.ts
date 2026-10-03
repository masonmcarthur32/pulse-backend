import { effectiveStatus, agingBucket } from '@/modules/finance/finance.service';

const DAY = 24 * 60 * 60 * 1000;

describe('effectiveStatus', () => {
  const now = new Date('2026-06-15T00:00:00.000Z');

  it('leaves paid invoices as paid regardless of due date', () => {
    expect(effectiveStatus({ status: 'paid', dueAt: new Date('2020-01-01') }, now)).toBe('paid');
  });

  it('leaves voided invoices as void', () => {
    expect(effectiveStatus({ status: 'void', dueAt: new Date('2020-01-01') }, now)).toBe('void');
  });

  it('reports pending as pending before the due date', () => {
    const dueAt = new Date(now.getTime() + DAY);
    expect(effectiveStatus({ status: 'pending', dueAt }, now)).toBe('pending');
  });

  it('reports pending as overdue once the due date has passed', () => {
    const dueAt = new Date(now.getTime() - DAY);
    expect(effectiveStatus({ status: 'pending', dueAt }, now)).toBe('overdue');
  });

  it('treats the exact due-date instant as not yet overdue', () => {
    expect(effectiveStatus({ status: 'pending', dueAt: now }, now)).toBe('pending');
  });
});

describe('agingBucket', () => {
  const now = new Date('2026-06-15T00:00:00.000Z');

  it('buckets a future or same-day due date as current', () => {
    expect(agingBucket(new Date(now.getTime() + DAY), now)).toBe('current');
    expect(agingBucket(now, now)).toBe('current');
  });

  it('buckets 1-30 days overdue as 0-30', () => {
    expect(agingBucket(new Date(now.getTime() - 1 * DAY), now)).toBe('0-30');
    expect(agingBucket(new Date(now.getTime() - 30 * DAY), now)).toBe('0-30');
  });

  it('buckets 31-60 days overdue as 31-60', () => {
    expect(agingBucket(new Date(now.getTime() - 31 * DAY), now)).toBe('31-60');
    expect(agingBucket(new Date(now.getTime() - 60 * DAY), now)).toBe('31-60');
  });

  it('buckets anything past 60 days as 60+', () => {
    expect(agingBucket(new Date(now.getTime() - 61 * DAY), now)).toBe('60+');
    expect(agingBucket(new Date(now.getTime() - 400 * DAY), now)).toBe('60+');
  });
});
