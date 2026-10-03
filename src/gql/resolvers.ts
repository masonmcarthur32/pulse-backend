import { GraphQLError } from 'graphql';
import { z } from 'zod';
import type { GraphQLContext } from '@/gql/context';
import * as profileService from '@/modules/profile/profile.service';
import * as financeService from '@/modules/finance/finance.service';
import * as insightsService from '@/modules/insights/insights.service';
import * as clientsService from '@/modules/clients/clients.service';
import * as leadsService from '@/modules/leads/leads.service';
import { businessProfileSchema } from '@/modules/profile/profile.schema';
import { createInvoiceSchema, kpiSchema } from '@/modules/finance/finance.schema';
import { createClientSchema, updateClientSchema } from '@/modules/clients/clients.schema';
import { createLeadSchema, updateLeadSchema, LEAD_STAGES } from '@/modules/leads/leads.schema';
import { AppError } from '@/lib/http-error';

function requireUser(ctx: GraphQLContext) {
  if (!ctx.user) {
    throw new GraphQLError('Authentication required', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  return ctx.user;
}

/** Every resolver body is wrapped through here so an AppError (which
 *  already carries a client-safe message and stable code — see
 *  lib/http-error.ts) becomes a GraphQLError with the same code, and a
 *  Zod validation failure becomes a clean BAD_USER_INPUT rather than a
 *  raw stack trace reaching the response. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) {
      throw new GraphQLError(err.message, { extensions: { code: err.code } });
    }
    if (err && typeof err === 'object' && 'issues' in err) {
      throw new GraphQLError('Invalid input', { extensions: { code: 'BAD_USER_INPUT' } });
    }
    throw err;
  }
}

function invoiceToGraphQL(inv: {
  id: string;
  customerName: string;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: Date;
  dueAt: Date;
  paidAt: Date | null;
}) {
  return {
    ...inv,
    issuedAt: inv.issuedAt.toISOString(),
    dueAt: inv.dueAt.toISOString(),
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null
  };
}

function summaryToGraphQL(summary: Awaited<ReturnType<typeof financeService.getDashboardSummary>>) {
  return {
    revenueCents: summary.revenueCents,
    outstandingCents: summary.outstandingCents,
    overdueCount: summary.overdueCount,
    agingCurrent: summary.aging.current,
    aging0to30: summary.aging['0-30'],
    aging31to60: summary.aging['31-60'],
    aging60Plus: summary.aging['60+'],
    recurringMonthlyCents: summary.recurringMonthlyCents,
    projectedAnnualCents: summary.projectedAnnualCents,
    activeClientCount: summary.activeClientCount,
    pipelineValueCents: summary.pipelineValueCents,
    openLeadCount: summary.openLeadCount,
    dueFollowupCount: summary.dueFollowupCount
  };
}

function clientToGraphQL(c: {
  id: string;
  name: string;
  contact: string | null;
  plan: string | null;
  status: string;
  monthlyValueCents: number;
  startDate: Date;
  lastContact: Date | null;
  notes: string | null;
}) {
  return {
    ...c,
    startDate: c.startDate.toISOString(),
    lastContact: c.lastContact ? c.lastContact.toISOString() : null
  };
}

function leadToGraphQL(l: {
  id: string;
  name: string;
  contact: string | null;
  source: string | null;
  stage: string;
  estValueCents: number;
  lastContact: Date | null;
  followUpDate: Date | null;
  lostReason: string | null;
  notes: string | null;
}) {
  return {
    ...l,
    lastContact: l.lastContact ? l.lastContact.toISOString() : null,
    followUpDate: l.followUpDate ? l.followUpDate.toISOString() : null
  };
}

export const resolvers = {
  Query: {
    me: (_: unknown, __: unknown, ctx: GraphQLContext) => ctx.user,

    businessProfile: (_: unknown, __: unknown, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        return profileService.getProfile(user.id) ?? null;
      }),

    invoices: (_: unknown, __: unknown, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const rows = await financeService.listInvoices(user.id);
        return rows.map(invoiceToGraphQL);
      }),

    kpis: (_: unknown, __: unknown, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        return financeService.listKpis(user.id);
      }),

    dashboardSummary: (_: unknown, __: unknown, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const summary = await financeService.getDashboardSummary(user.id);
        return summaryToGraphQL(summary);
      }),

    clients: (_: unknown, __: unknown, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const rows = await clientsService.listClients(user.id);
        return rows.map(clientToGraphQL);
      }),

    leads: (_: unknown, args: { stage?: string | null }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        let rows;
        if (args.stage === 'PIPELINE') rows = await leadsService.pipelineLeads(user.id);
        else if (args.stage === 'LOST') rows = await leadsService.followUpLeads(user.id);
        else rows = await leadsService.listLeads(user.id);
        return rows.map(leadToGraphQL);
      })
  },

  Mutation: {
    updateBusinessProfile: (_: unknown, args: { input: unknown }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const input = businessProfileSchema.parse(args.input);
        return profileService.upsertProfile(user.id, input);
      }),

    createInvoice: (_: unknown, args: { input: unknown }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const input = createInvoiceSchema.parse(args.input);
        const invoice = await financeService.createInvoice(user.id, input);
        return invoiceToGraphQL(invoice);
      }),

    markInvoicePaid: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const invoice = await financeService.markInvoicePaid(user.id, args.id);
        return invoiceToGraphQL(invoice);
      }),

    createKpi: (_: unknown, args: { input: unknown }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const input = kpiSchema.parse(args.input);
        return financeService.createKpi(user.id, input);
      }),

    generateInsights: (_: unknown, __: unknown, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const result = await insightsService.generateInsights(user.id);
        return { content: result.content, createdAt: result.createdAt.toISOString() };
      }),

    createClient: (_: unknown, args: { input: unknown }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const input = createClientSchema.parse(args.input);
        const client = await clientsService.createClient(user.id, input);
        return clientToGraphQL(client);
      }),

    updateClient: (_: unknown, args: { id: string; input: unknown }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const input = updateClientSchema.parse(args.input);
        const client = await clientsService.updateClient(user.id, args.id, input);
        return clientToGraphQL(client);
      }),

    deleteClient: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        await clientsService.deleteClient(user.id, args.id);
        return true;
      }),

    createLead: (_: unknown, args: { input: unknown }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const input = createLeadSchema.parse(args.input);
        const lead = await leadsService.createLead(user.id, input);
        return leadToGraphQL(lead);
      }),

    updateLead: (_: unknown, args: { id: string; input: unknown }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const input = updateLeadSchema.parse(args.input);
        const lead = await leadsService.updateLead(user.id, args.id, input);
        return leadToGraphQL(lead);
      }),

    deleteLead: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        await leadsService.deleteLead(user.id, args.id);
        return true;
      }),

    advanceLead: (_: unknown, args: { id: string; nextStage: string }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const { nextStage } = z.object({ nextStage: z.enum(LEAD_STAGES) }).parse({ nextStage: args.nextStage });
        const result = await leadsService.advanceLead(user.id, args.id, nextStage);
        return { lead: leadToGraphQL(result.lead), client: result.client ? clientToGraphQL(result.client) : null };
      }),

    reengageLead: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
      run(async () => {
        const user = requireUser(ctx);
        const lead = await leadsService.reengageLead(user.id, args.id);
        return leadToGraphQL(lead);
      })
  }
};
