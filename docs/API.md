# API Reference

Base URL: `http://localhost:4000` (or wherever you deploy it).

All request/response bodies are JSON. All protected routes require:

```
Authorization: Bearer <accessToken>
```

`accessToken` comes from `/api/auth/signup`, `/api/auth/login`, or
`/api/auth/refresh`. The refresh token itself is never in the response
body — it's set as an httpOnly cookie, scoped to `/api/auth`, and the
browser sends it automatically to `/api/auth/refresh`.

---

## REST

### Auth — `/api/auth`

| Method | Path       | Auth | Body                          | Notes |
|--------|-----------|------|-------------------------------|-------|
| POST   | `/signup` | none | `{ email, password }`         | Password ≥12 chars. Sets refresh cookie. Returns `{ accessToken, userId }`. |
| POST   | `/login`  | none | `{ email, password }`         | Same response shape as signup. |
| POST   | `/refresh`| refresh cookie | — | Rotates the refresh token. Returns `{ accessToken }`. |
| POST   | `/logout` | refresh cookie | — | Revokes the refresh token, clears the cookie. `204`. |

Auth routes are rate-limited to 10 requests / 10 minutes per IP+email.

### Business profile — `/api/profile` (auth required)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET  | `/` | — | `404 PROFILE_NOT_FOUND` if not yet created. |
| PUT  | `/` | `{ name, description, model, idealCustomer?, quarterlyGoal?, accountingSoftware? }` | Create-or-update (one profile per user). `model` must be one of: `Service / coaching`, `Subscription`, `One-time product sales`, `Hybrid`. |

### Clients (CRM) — `/api/clients` (auth required)

Deliberately generic — `plan` is free text, not an industry-specific
field, so the same schema fits a coaching business, a plumber, or an
accounting firm.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET    | `/` | — | List, newest first. |
| POST   | `/` | `{ name, contact?, plan?, status?, monthlyValueCents?, startDate?, lastContact?, notes? }` | `status` is one of `active`/`paused`/`churned` (default `active`). `monthlyValueCents` is the client's recurring contracted value — summed across `active` clients for the dashboard's revenue run-rate. |
| GET    | `/:id` | — | `404 CLIENT_NOT_FOUND` if missing or owned by someone else (identical response either way). |
| PATCH  | `/:id` | any subset of the POST fields | Partial update. |
| DELETE | `/:id` | — | `204`. |

### Leads — `/api/leads` (auth required)

The pipeline and the follow-up ledger are the same resource, filtered by
stage — a lead never has to move between two different tables to go from
"open" to "lost." `stage` is one of `new` / `contacted` / `proposal_sent`
/ `won` / `lost`.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET    | `/?stage=pipeline` | — | Open pipeline: `new`, `contacted`, `proposal_sent`, `won`. |
| GET    | `/?stage=lost` | — | The follow-up ledger. |
| GET    | `/` (no query) | — | Every lead, any stage. |
| POST   | `/` | `{ name, contact?, source?, stage?, estValueCents?, lastContact?, followUpDate?, lostReason?, notes? }` | Free-form create — can start a lead at any stage. |
| GET    | `/:id` | — | `404 LEAD_NOT_FOUND` if missing or owned by someone else. |
| PATCH  | `/:id` | any subset of the POST fields | Free-form edit, including jumping straight to a stage — unlike `/advance` below, this does not enforce the pipeline graph. |
| DELETE | `/:id` | — | `204`. |
| POST   | `/:id/advance` | `{ nextStage }` | **Guided** move, enforcing the pipeline graph: `new`→`contacted`→`proposal_sent`→`won`, with `lost` reachable from any open stage. `400 INVALID_STAGE_TRANSITION` for a skip, a backward move, or a no-op. Landing on `won` also creates a `clients` row from the lead — response is `{ lead, client }` (`client` is `null` unless this call converted it). |
| POST   | `/:id/reengage` | — | The only way back from `lost`: resets to `new`, clears `lostReason`. `400 INVALID_STAGE_TRANSITION` if the lead isn't currently `lost`. |

### Finance — `/api/finance` (auth required)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET  | `/dashboard-summary` | — | See below — folds in invoices, clients and leads. |
| GET  | `/invoices` | — | List, newest due date first. `status` is computed live (`pending`→`overdue` once past due), not a stale column. |
| POST | `/invoices` | `{ customerName, amountCents, currency?, dueAt }` | `amountCents` is an integer (no floats — avoids rounding drift). |
| POST | `/invoices/:id/mark-paid` | — | Sets `status=paid`, `paidAt=now`. |
| GET  | `/kpis` | — | List, newest first. |
| POST | `/kpis` | `{ goal, keyResult, kpiName, dataSource?, currentValue?, targetValue? }` | Mirrors the goal → key result → KPI table from the master-prompt design. |

`dashboard-summary`'s response:

```json
{
  "summary": {
    "revenueCents": 0, "outstandingCents": 0, "overdueCount": 0,
    "aging": { "current": { "count": 0, "totalCents": 0 }, "0-30": {}, "31-60": {}, "60+": {} },
    "recurringMonthlyCents": 0, "projectedAnnualCents": 0, "activeClientCount": 0,
    "pipelineValueCents": 0, "openLeadCount": 0, "dueFollowupCount": 0
  }
}
```

`revenueCents` is actually **invoiced/collected** money; `recurringMonthlyCents`
(and `projectedAnnualCents`, which is just that × 12) is **contracted,
ongoing client value** from active clients, which may not all be invoiced
yet this period. They're kept separate rather than blended into one
number because they answer different questions — "what came in" vs.
"what this book of clients is worth on an annualized basis."

### AI insights — `/api/insights` (auth required)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET  | `/latest` | — | `{ insight: {...} \| null }`. |
| POST | `/generate` | — | Reads the current profile, dashboard summary, clients and leads, calls Claude server-side, persists and returns `{ content, createdAt }`. Rate-limited to 5 requests / 10 minutes **per user**. `400 PROFILE_REQUIRED` if no profile exists yet. |

### Accountant access — `/api/accountant`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST   | `/links` | owner | Creates a share link. Returns `{ link: { id, token, createdAt, expiresAt } }` — **`token` is shown exactly once.** |
| GET    | `/links` | owner | Lists links (never includes the token itself, only metadata + revoked status). |
| DELETE | `/links/:id` | owner | Revokes a link early. |
| GET    | `/export/:token` | **none — the token is the credential** | Read-only financial export: business name, dashboard summary, invoice list. No email, no AI insights, no target-customer notes. Identical response for invalid/expired/revoked (no enumeration signal). |

Share the full URL (`.../api/accountant/export/<token>`) with your
accountant directly — there's nothing else for them to log into.

---

## GraphQL — `POST /graphql`

Same auth model: `Authorization: Bearer <accessToken>`. Introspection is
enabled outside `NODE_ENV=production`.

```graphql
type Query {
  me: Me                                 # null if unauthenticated
  businessProfile: BusinessProfile
  invoices: [Invoice!]!
  kpis: [Kpi!]!
  dashboardSummary: DashboardSummary!
  clients: [Client!]!
  leads(stage: String): [Lead!]!         # stage: "PIPELINE" | "LOST" | omitted for all
}

type Mutation {
  updateBusinessProfile(input: BusinessProfileInput!): BusinessProfile!
  createInvoice(input: CreateInvoiceInput!): Invoice!
  markInvoicePaid(id: ID!): Invoice!
  createKpi(input: KpiInput!): Kpi!
  generateInsights: Insight!
  createClient(input: ClientInput!): Client!
  updateClient(id: ID!, input: ClientInput!): Client!
  deleteClient(id: ID!): Boolean!
  createLead(input: LeadInput!): Lead!
  updateLead(id: ID!, input: LeadInput!): Lead!
  deleteLead(id: ID!): Boolean!
  advanceLead(id: ID!, nextStage: String!): AdvanceLeadResult!  # { lead, client }
  reengageLead(id: ID!): Lead!
}
```

Every field except `me` throws `UNAUTHENTICATED` (in `extensions.code`)
if no valid token is presented — same guard as REST, same underlying
service functions, just a different transport. There is no
GraphQL-only capability and no REST-only capability; pick whichever
suits your client.

Example:

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ dashboardSummary { revenueCents outstandingCents overdueCount } }"}'
```

---

## Error shape

Every error response (REST) looks like:

```json
{ "error": { "code": "SOME_CODE", "message": "Human-readable, safe to show." } }
```

GraphQL errors carry the same `code` in `extensions.code`. Codes are
stable and meant to be branched on in client code; messages are meant to
be read by a human, not parsed.
