import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { accountantLinks } from '@/db/schema';
import { generateRefreshToken as generateOpaqueToken, hashToken } from '@/lib/jwt';
import { env } from '@/config/env';
import { AppError } from '@/lib/http-error';
import { getProfile } from '@/modules/profile/profile.service';
import { listInvoices, getDashboardSummary } from '@/modules/finance/finance.service';

export async function createAccountantLink(userId: string) {
  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + env.ACCOUNTANT_LINK_TTL_HOURS * 60 * 60 * 1000);

  const [link] = await db
    .insert(accountantLinks)
    .values({ userId, tokenHash: hashToken(rawToken), expiresAt })
    .returning({ id: accountantLinks.id, expiresAt: accountantLinks.expiresAt, createdAt: accountantLinks.createdAt });

  if (!link) throw new Error('Accountant link insert returned no row');

  // The raw token is returned exactly once. It is not retrievable again —
  // only its hash is stored — so if the owner loses it, they revoke and
  // create a new one.
  return { ...link, token: rawToken };
}

export async function listAccountantLinks(userId: string) {
  return db.query.accountantLinks.findMany({
    where: eq(accountantLinks.userId, userId),
    orderBy: desc(accountantLinks.createdAt),
    columns: { id: true, createdAt: true, expiresAt: true, revokedAt: true }
  });
}

export async function revokeAccountantLink(userId: string, linkId: string) {
  const [updated] = await db
    .update(accountantLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(accountantLinks.id, linkId), eq(accountantLinks.userId, userId), isNull(accountantLinks.revokedAt)))
    .returning({ id: accountantLinks.id });
  if (!updated) throw AppError.notFound('Link not found or already revoked.', 'LINK_NOT_FOUND');
  return updated;
}

/**
 * Resolves a raw share token to a read-only financial export. Returns
 * `null` (never a distinguishing error) for a token that is missing,
 * expired, or revoked — an accountant-export endpoint is a prime target
 * for enumeration, so "not found" and "expired" must look identical from
 * the outside.
 */
export async function resolveAccountantExport(rawToken: string) {
  const record = await db.query.accountantLinks.findFirst({
    where: and(eq(accountantLinks.tokenHash, hashToken(rawToken)), isNull(accountantLinks.revokedAt))
  });
  if (!record || record.expiresAt.getTime() < Date.now()) return null;

  const [profile, invoiceList, summary] = await Promise.all([
    getProfile(record.userId),
    listInvoices(record.userId),
    getDashboardSummary(record.userId)
  ]);

  // Deliberately narrow: business name for context, financial records,
  // and nothing else — no email, no AI insights, no target-customer notes.
  return {
    businessName: profile?.name ?? 'Business',
    generatedAt: new Date().toISOString(),
    linkExpiresAt: record.expiresAt.toISOString(),
    summary,
    invoices: invoiceList.map((inv) => ({
      customerName: inv.customerName,
      amountCents: inv.amountCents,
      currency: inv.currency,
      status: inv.status,
      issuedAt: inv.issuedAt,
      dueAt: inv.dueAt,
      paidAt: inv.paidAt
    }))
  };
}
