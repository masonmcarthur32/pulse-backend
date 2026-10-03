import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  pgEnum,
  uniqueIndex,
  index
} from 'drizzle-orm/pg-core';

/**
 * Roles are intentionally coarse: "owner" is the business owner who signed
 * up; "accountant" is a role reserved for future first-class accountant
 * accounts. Today, accountant access is granted via short-lived signed
 * links (see accountantLinks) rather than a shared login — see
 * docs/SECURITY.md for the reasoning.
 */
export const userRole = pgEnum('user_role', ['owner', 'accountant']);

export const invoiceStatus = pgEnum('invoice_status', ['pending', 'paid', 'overdue', 'void']);

export const clientStatus = pgEnum('client_status', ['active', 'paused', 'churned']);

/**
 * Lead stages are a strict pipeline, enforced at the service layer
 * (see leads.service.ts `ALLOWED_TRANSITIONS`), not just this column's
 * type: New -> Contacted -> Proposal Sent -> Won, with Lost reachable
 * from any pre-Won stage and Lost -> New the one way back in ("re-engage").
 */
export const leadStage = pgEnum('lead_stage', ['new', 'contacted', 'proposal_sent', 'won', 'lost']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 320 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  emailIdx: uniqueIndex('users_email_unique_idx').on(table.email)
}));

/**
 * Refresh tokens are stored HASHED (never plaintext) so a database leak
 * does not hand out reusable sessions. Rotated on every refresh; the old
 * one is marked revoked rather than deleted, so reuse of a stolen token
 * after rotation is detectable.
 */
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdx: index('refresh_tokens_user_idx').on(table.userId)
}));

export const businessProfiles = pgTable('business_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description').notNull(),
  model: varchar('model', { length: 60 }).notNull(),
  idealCustomer: text('ideal_customer').default(''),
  quarterlyGoal: varchar('quarterly_goal', { length: 300 }).default(''),
  accountingSoftware: varchar('accounting_software', { length: 60 }).default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdx: uniqueIndex('business_profiles_user_unique_idx').on(table.userId)
}));

/** Amounts are stored as integer minor units (cents) — never floats — to
 *  avoid rounding drift in financial totals. */
export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  customerName: varchar('customer_name', { length: 200 }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('AUD'),
  status: invoiceStatus('status').notNull().default('pending'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  notes: text('notes').default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdx: index('invoices_user_idx').on(table.userId),
  statusIdx: index('invoices_status_idx').on(table.status)
}));

export const kpis = pgTable('kpis', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  goal: varchar('goal', { length: 300 }).notNull(),
  keyResult: varchar('key_result', { length: 300 }).notNull(),
  kpiName: varchar('kpi_name', { length: 200 }).notNull(),
  dataSource: varchar('data_source', { length: 200 }).default(''),
  currentValue: varchar('current_value', { length: 100 }).default(''),
  targetValue: varchar('target_value', { length: 100 }).default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdx: index('kpis_user_idx').on(table.userId)
}));

export const insights = pgTable('insights', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdx: index('insights_user_idx').on(table.userId)
}));

/**
 * The CRM's client list — deliberately generic (a free-text "plan"
 * field rather than an industry-specific one) so the same schema fits
 * a coaching business, a plumber, or an accounting firm. `monthlyValueCents`
 * is the client's recurring contracted value, which the dashboard sums
 * for a run-rate view of revenue distinct from actual invoiced/collected
 * revenue in `invoices` — see docs/API.md for how the two relate.
 */
export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  contact: varchar('contact', { length: 300 }).default(''),
  plan: varchar('plan', { length: 200 }).default(''),
  status: clientStatus('status').notNull().default('active'),
  monthlyValueCents: integer('monthly_value_cents').notNull().default(0),
  startDate: timestamp('start_date', { withTimezone: true }).notNull().defaultNow(),
  lastContact: timestamp('last_contact', { withTimezone: true }),
  notes: text('notes').default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdx: index('clients_user_idx').on(table.userId),
  statusIdx: index('clients_status_idx').on(table.status)
}));

/**
 * The lead pipeline plus a "Lost" ledger used for follow-up (the same
 * table — filtering by stage, not a separate collection, avoids the two
 * ever drifting out of sync). Winning a lead creates a `clients` row —
 * see leads.service.ts `advanceLead`.
 */
export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  contact: varchar('contact', { length: 300 }).default(''),
  source: varchar('source', { length: 200 }).default(''),
  stage: leadStage('stage').notNull().default('new'),
  estValueCents: integer('est_value_cents').notNull().default(0),
  lastContact: timestamp('last_contact', { withTimezone: true }),
  followUpDate: timestamp('follow_up_date', { withTimezone: true }),
  lostReason: varchar('lost_reason', { length: 300 }).default(''),
  notes: text('notes').default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdx: index('leads_user_idx').on(table.userId),
  stageIdx: index('leads_stage_idx').on(table.stage)
}));

/**
 * Scoped, read-only, time-limited accountant access — no shared login,
 * no write path. Only tokenHash is stored; the raw token is shown to the
 * owner once, at creation time.
 */
export const accountantLinks = pgTable('accountant_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdx: index('accountant_links_user_idx').on(table.userId)
}));
