import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { clients } from '@/db/schema';
import { AppError } from '@/lib/http-error';
import type { CreateClientInput, UpdateClientInput } from '@/modules/clients/clients.schema';

export async function listClients(userId: string) {
  return db.query.clients.findMany({ where: eq(clients.userId, userId), orderBy: desc(clients.createdAt) });
}

export async function getClient(userId: string, clientId: string) {
  return db.query.clients.findFirst({ where: and(eq(clients.id, clientId), eq(clients.userId, userId)) });
}

export async function createClient(userId: string, input: CreateClientInput) {
  const [created] = await db
    .insert(clients)
    .values({
      userId,
      ...input,
      startDate: input.startDate ?? new Date(),
      lastContact: input.lastContact ?? new Date()
    })
    .returning();
  if (!created) throw new Error('Client insert returned no row');
  return created;
}

/** Scoped by userId in the WHERE clause, not just looked up by id first —
 *  the same IDOR-safe pattern as every other resource in this API (see
 *  docs/SECURITY.md, A01). A client that exists but belongs to someone
 *  else behaves exactly like one that does not exist. */
export async function updateClient(userId: string, clientId: string, input: UpdateClientInput) {
  const [updated] = await db
    .update(clients)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(clients.id, clientId), eq(clients.userId, userId)))
    .returning();
  if (!updated) throw AppError.notFound('Client not found.', 'CLIENT_NOT_FOUND');
  return updated;
}

export async function deleteClient(userId: string, clientId: string) {
  const [deleted] = await db
    .delete(clients)
    .where(and(eq(clients.id, clientId), eq(clients.userId, userId)))
    .returning({ id: clients.id });
  if (!deleted) throw AppError.notFound('Client not found.', 'CLIENT_NOT_FOUND');
  return deleted;
}

export async function activeClients(userId: string) {
  return (await listClients(userId)).filter((c) => c.status === 'active');
}

export async function monthlyRecurringCents(userId: string): Promise<number> {
  return (await activeClients(userId)).reduce((sum, c) => sum + c.monthlyValueCents, 0);
}
