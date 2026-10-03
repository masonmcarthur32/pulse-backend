import { eq, desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { insights } from '@/db/schema';
import { generateText, AnthropicUnavailableError } from '@/lib/anthropic';
import { getProfile } from '@/modules/profile/profile.service';
import { getDashboardSummary } from '@/modules/finance/finance.service';
import { AppError } from '@/lib/http-error';
import { createKeyedLimiter } from '@/lib/rateLimit';

// Enforced here, in the shared service, rather than only in the REST
// route's `aiLimiter` middleware — GraphQL's `generateInsights` mutation
// calls this same function directly, with no Express middleware in front
// of it, so a limiter mounted only on the REST route left that path
// completely unthrottled. Every call to this function costs a real
// Anthropic API request; the cap has to live where it can't be bypassed
// by choosing a different entry point.
const aiCallLimiter = createKeyedLimiter({ windowMs: 10 * 60 * 1000, max: 5 });

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildPrompt(
  profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>,
  summary: Awaited<ReturnType<typeof getDashboardSummary>>
): string {
  return [
    'You are the insights assistant inside a small-business tracking dashboard called Pulse.',
    'Read the business profile and current snapshot below, then respond directly to the owner in second person — warm, concise, plain text, no markdown headers, at most 4 short paragraphs:',
    '1) One sentence confirming you understand what their business does.',
    "2) Three KPIs to track this quarter, tailored to their stated goal and business model, each with a one-line reason.",
    '3) One note on what to watch given their current clients, leads and financial numbers (cash flow pattern, overdue payments, stalled pipeline, or similar).',
    '4) One short, specific, encouraging closing line.',
    '',
    'BUSINESS PROFILE:',
    `Name: ${profile.name}`,
    `What they do: ${profile.description}`,
    `Business model: ${profile.model}`,
    `Ideal customer: ${profile.idealCustomer || 'not specified'}`,
    `This quarter's goal: ${profile.quarterlyGoal || 'not specified'}`,
    `Accounting software: ${profile.accountingSoftware || 'not specified'}`,
    '',
    'CURRENT SNAPSHOT:',
    `Revenue collected (invoiced): ${formatCents(summary.revenueCents)}`,
    `Outstanding (unpaid) invoices: ${formatCents(summary.outstandingCents)}`,
    `Invoices currently overdue: ${summary.overdueCount}`,
    `Active clients: ${summary.activeClientCount}, recurring monthly value: ${formatCents(summary.recurringMonthlyCents)}`,
    `Open leads in the pipeline: ${summary.openLeadCount}, open pipeline value: ${formatCents(summary.pipelineValueCents)}`,
    `Lost leads due for follow-up: ${summary.dueFollowupCount}`
  ].join('\n');
}

export async function generateInsights(userId: string): Promise<{ content: string; createdAt: Date }> {
  aiCallLimiter.consume(userId);

  const profile = await getProfile(userId);
  if (!profile) {
    throw AppError.badRequest('Complete your business profile before requesting insights.', 'PROFILE_REQUIRED');
  }
  const summary = await getDashboardSummary(userId);

  let content: string;
  try {
    content = await generateText(buildPrompt(profile, summary));
  } catch (err) {
    if (err instanceof AnthropicUnavailableError) {
      throw AppError.badRequest(
        'AI insights are not available right now — check ANTHROPIC_API_KEY is configured.',
        'AI_UNAVAILABLE'
      );
    }
    throw err;
  }

  const [row] = await db.insert(insights).values({ userId, content }).returning();
  if (!row) throw new Error('Insight insert returned no row');
  return { content: row.content, createdAt: row.createdAt };
}

export async function getLatestInsight(userId: string) {
  return db.query.insights.findFirst({
    where: eq(insights.userId, userId),
    orderBy: desc(insights.createdAt)
  });
}
