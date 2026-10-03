import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { leads } from '@/db/schema';
import { AppError } from '@/lib/http-error';
import * as clientsService from '@/modules/clients/clients.service';
import type { CreateLeadInput, UpdateLeadInput } from '@/modules/leads/leads.schema';

type LeadStage = (typeof leads.$inferSelect)['stage'];

export const PIPELINE_STAGES: LeadStage[] = ['new', 'contacted', 'proposal_sent', 'won'];
export const OPEN_PIPELINE_STAGES: LeadStage[] = ['new', 'contacted', 'proposal_sent'];

/**
 * The pipeline is a strict, one-directional graph, checked here rather
 * than trusted to whatever the client sends — a "Kanban" board is a UI
 * metaphor for this map, not a source of truth for it. `lost` is reachable
 * from any open stage (a deal can die at any point); the only way out of
 * `lost` is the dedicated `reengageLead` below, which is a deliberately
 * different operation (it also clears the lost reason) rather than a
 * transition this map allows generically.
 */
const ALLOWED_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  new: ['contacted', 'lost'],
  contacted: ['proposal_sent', 'lost'],
  proposal_sent: ['won', 'lost'],
  won: [],
  lost: []
};

/** Pure predicate over the transition graph above, exported so the rules
 *  are unit-testable without a database (see tests/leads.logic.test.ts). */
export function canAdvanceTo(current: LeadStage, next: LeadStage): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next);
}

export async function listLeads(userId: string) {
  return db.query.leads.findMany({ where: eq(leads.userId, userId) });
}

export async function getLead(userId: string, leadId: string) {
  return db.query.leads.findFirst({ where: and(eq(leads.id, leadId), eq(leads.userId, userId)) });
}

export async function pipelineLeads(userId: string) {
  const rows = await db.query.leads.findMany({
    where: and(eq(leads.userId, userId), inArray(leads.stage, PIPELINE_STAGES))
  });
  return rows;
}

export async function followUpLeads(userId: string) {
  return db.query.leads.findMany({ where: and(eq(leads.userId, userId), eq(leads.stage, 'lost')) });
}

export async function createLead(userId: string, input: CreateLeadInput) {
  const [created] = await db
    .insert(leads)
    .values({ userId, ...input, lastContact: input.lastContact ?? new Date() })
    .returning();
  if (!created) throw new Error('Lead insert returned no row');
  return created;
}

/** Free-form edit — the owner can set any field, including jumping
 *  straight to a stage, unlike `advanceLead` which enforces the pipeline
 *  graph. Deliberately permissive: this is the "edit" affordance, not the
 *  guided one. */
export async function updateLead(userId: string, leadId: string, input: UpdateLeadInput) {
  const [updated] = await db
    .update(leads)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.userId, userId)))
    .returning();
  if (!updated) throw AppError.notFound('Lead not found.', 'LEAD_NOT_FOUND');
  return updated;
}

export async function deleteLead(userId: string, leadId: string) {
  const [deleted] = await db
    .delete(leads)
    .where(and(eq(leads.id, leadId), eq(leads.userId, userId)))
    .returning({ id: leads.id });
  if (!deleted) throw AppError.notFound('Lead not found.', 'LEAD_NOT_FOUND');
  return deleted;
}

export async function openPipelineValueCents(userId: string): Promise<number> {
  const rows = await db.query.leads.findMany({
    where: and(eq(leads.userId, userId), inArray(leads.stage, OPEN_PIPELINE_STAGES))
  });
  return rows.reduce((sum, l) => sum + l.estValueCents, 0);
}

export async function dueFollowUpCount(userId: string): Promise<number> {
  const rows = await followUpLeads(userId);
  const now = new Date();
  return rows.filter((l) => l.followUpDate && l.followUpDate.getTime() <= now.getTime()).length;
}

/**
 * The guided transition. Validates the move against the pipeline graph,
 * and — the one piece of real cross-resource business logic in this
 * module — creates a `clients` row when a lead lands on `won`, so the
 * CRM and the pipeline never disagree about who's an active client.
 * Not wrapped in a database transaction (this driver/setup doesn't have
 * one wired up here): if the client insert fails after the lead update
 * commits, the lead is left on `won` without a client — logged and
 * surfaced as an error rather than silently swallowed, so it's visible
 * and fixable (re-run, or edit the lead back) rather than a silent data
 * mismatch. A production hardening pass would wrap both writes in a
 * single transaction; see docs/SECURITY.md.
 */
export async function advanceLead(userId: string, leadId: string, nextStage: LeadStage) {
  const lead = await getLead(userId, leadId);
  if (!lead) throw AppError.notFound('Lead not found.', 'LEAD_NOT_FOUND');

  const allowed = canAdvanceTo(lead.stage, nextStage);
  if (!allowed) {
    throw AppError.badRequest(
      `Cannot move a lead from "${lead.stage}" to "${nextStage}".`,
      'INVALID_STAGE_TRANSITION'
    );
  }

  const [updated] = await db
    .update(leads)
    .set({ stage: nextStage, lastContact: new Date(), updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.userId, userId)))
    .returning();
  if (!updated) throw AppError.notFound('Lead not found.', 'LEAD_NOT_FOUND');

  let createdClient = null;
  if (nextStage === 'won') {
    createdClient = await clientsService.createClient(userId, {
      name: lead.name,
      contact: lead.contact ?? '',
      plan: '',
      status: 'active',
      monthlyValueCents: lead.estValueCents,
      notes: `Converted from lead${lead.source ? ` (${lead.source})` : ''}.`
    });
  }

  return { lead: updated, client: createdClient };
}

/** The only way back from `lost`. A separate operation from `advanceLead`
 *  on purpose — re-engaging clears the lost reason and resets contact
 *  date, which is more than a plain stage write. */
export async function reengageLead(userId: string, leadId: string) {
  const lead = await getLead(userId, leadId);
  if (!lead) throw AppError.notFound('Lead not found.', 'LEAD_NOT_FOUND');
  if (lead.stage !== 'lost') {
    throw AppError.badRequest('Only a lost lead can be re-engaged.', 'INVALID_STAGE_TRANSITION');
  }
  const [updated] = await db
    .update(leads)
    .set({ stage: 'new', lostReason: '', lastContact: new Date(), updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.userId, userId)))
    .returning();
  if (!updated) throw AppError.notFound('Lead not found.', 'LEAD_NOT_FOUND');
  return updated;
}
