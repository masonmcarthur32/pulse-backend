import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { invoices, kpis } from '@/db/schema';
import { AppError } from '@/lib/http-error';
import * as clientsService from '@/modules/clients/clients.service';
import * as leadsService from '@/modules/leads/leads.service';
import type { CreateInvoiceInput, UpdateInvoiceInput, KpiInput } from '@/modules/finance/finance.schema';

type Invoice = typeof invoices.$inferSelect;

/** The persisted `status` only changes on an explicit action (created,
 *  marked paid, voided) — "overdue" is a function of the due date, not a
 *  column a background job has to keep in sync, so it can never drift out
 *  of date. */
export function effectiveStatus(invoice: Pick<Invoice, 'status' | 'dueAt'>, now = new Date()): Invoice['status'] {
  if (invoice.status === 'paid' || invoice.status === 'void') return invoice.status;
  return invoice.dueAt.getTime() < now.getTime() ? 'overdue' : 'pending';
}

export type AgingBucket = 'current' | '0-30' | '31-60' | '60+';

export function agingBucket(dueAt: Date, now = new Date()): AgingBucket {
  const daysOverdue = Math.floor((now.getTime() - dueAt.getTime()) / (24 * 60 * 60 * 1000));
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '0-30';
  if (daysOverdue <= 60) return '31-60';
  return '60+';
}

export async function createInvoice(userId: string, input: CreateInvoiceInput) {
  const [created] = await db
    .insert(invoices)
    .values({ userId, ...input })
    .returning();
  if (!created) throw new Error('Invoice insert returned no row');
  return created;
}

export async function listInvoices(userId: string) {
  const rows = await db.query.invoices.findMany({
    where: eq(invoices.userId, userId),
    orderBy: desc(invoices.dueAt)
  });
  return rows.map((row) => ({ ...row, status: effectiveStatus(row) }));
}

export async function markInvoicePaid(userId: string, invoiceId: string) {
  const [updated] = await db
    .update(invoices)
    .set({ status: 'paid', paidAt: new Date() })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
    .returning();
  if (!updated) throw AppError.notFound('Invoice not found.', 'INVOICE_NOT_FOUND');
  return updated;
}

/** Free-form edit of an invoice's own fields — deliberately excludes
 *  `status`/`paidAt` (see updateInvoiceSchema), so this can never be used
 *  to quietly mark something paid or unpaid outside markInvoicePaid. */
export async function updateInvoice(userId: string, invoiceId: string, input: UpdateInvoiceInput) {
  const [updated] = await db
    .update(invoices)
    .set(input)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
    .returning();
  if (!updated) throw AppError.notFound('Invoice not found.', 'INVOICE_NOT_FOUND');
  return { ...updated, status: effectiveStatus(updated) };
}

export async function deleteInvoice(userId: string, invoiceId: string) {
  const [deleted] = await db
    .delete(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
    .returning({ id: invoices.id });
  if (!deleted) throw AppError.notFound('Invoice not found.', 'INVOICE_NOT_FOUND');
  return deleted;
}

export async function getDashboardSummary(userId: string) {
  const rows = await listInvoices(userId); // already has effective status applied
  const now = new Date();

  let revenueCents = 0;
  let outstandingCents = 0;
  let overdueCount = 0;
  const buckets: Record<AgingBucket, { count: number; totalCents: number }> = {
    current: { count: 0, totalCents: 0 },
    '0-30': { count: 0, totalCents: 0 },
    '31-60': { count: 0, totalCents: 0 },
    '60+': { count: 0, totalCents: 0 }
  };

  for (const inv of rows) {
    if (inv.status === 'paid') {
      revenueCents += inv.amountCents;
      continue;
    }
    if (inv.status === 'void') continue;

    outstandingCents += inv.amountCents;
    if (inv.status === 'overdue') overdueCount += 1;

    const bucket = agingBucket(inv.dueAt, now);
    buckets[bucket].count += 1;
    buckets[bucket].totalCents += inv.amountCents;
  }

  // Two distinct, complementary revenue views, kept separate rather than
  // blended into one misleading number: `revenueCents` above is actually
  // invoiced/collected money; `recurringMonthlyCents` is contracted,
  // ongoing client value that may not have been invoiced yet this period.
  // See docs/API.md for how a client is meant to read the two together.
  const [recurringMonthlyCents, activeClientCount, pipelineValueCents, openLeadCount, dueFollowupCount] =
    await Promise.all([
      clientsService.monthlyRecurringCents(userId),
      clientsService.activeClients(userId).then((rows2) => rows2.length),
      leadsService.openPipelineValueCents(userId),
      leadsService
        .pipelineLeads(userId)
        .then((rows2) => rows2.filter((l) => l.stage !== 'won').length),
      leadsService.dueFollowUpCount(userId)
    ]);

  return {
    revenueCents,
    outstandingCents,
    overdueCount,
    aging: buckets,
    recurringMonthlyCents,
    projectedAnnualCents: recurringMonthlyCents * 12,
    activeClientCount,
    pipelineValueCents,
    openLeadCount,
    dueFollowupCount
  };
}

export async function createKpi(userId: string, input: KpiInput) {
  const [created] = await db
    .insert(kpis)
    .values({ userId, ...input })
    .returning();
  if (!created) throw new Error('KPI insert returned no row');
  return created;
}

export async function listKpis(userId: string) {
  return db.query.kpis.findMany({ where: eq(kpis.userId, userId), orderBy: desc(kpis.createdAt) });
}
