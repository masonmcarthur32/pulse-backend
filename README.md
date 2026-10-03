# Pulse — Backend

A real REST + GraphQL backend for the Pulse dashboard: auth, a business
profile, a CRM (clients), a lead pipeline with guided stage transitions
and a follow-up ledger, invoices with automatic aging/overdue tracking,
KPIs tied to quarterly goals, AI-generated insights (calling Claude
server-side), and scoped read-only accountant export links.

This is the server for the ideas in the earlier design work — see
**"How this relates to the front-end prototype"** below before you wire
anything together.

## Stack, and why

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Type errors caught at compile time, not in production. |
| HTTP | Express 4 | Boring and well-understood; not the interesting part of this system. |
| API shape | REST + GraphQL, one service layer | No duplicated business logic between the two — see `src/gql/resolvers.ts`, which calls the exact same functions as the REST controllers. |
| Database | PostgreSQL | Relational data with real foreign keys (a user's data should not be orphanable by a typo). |
| ORM | Drizzle | Chosen over Prisma specifically because Prisma's query-engine binary download is unreachable from a network-restricted build environment; Drizzle is pure TypeScript, no binary fetch, and its SQL stays inspectable. |
| Auth | JWT access token + rotating opaque refresh token | Short-lived, in-memory access token; long-lived refresh token that's httpOnly, hashed at rest, and single-use (rotated on every refresh). |
| AI | Direct server-side call to `api.anthropic.com` | The API key never reaches a browser. |

## How this relates to the front-end prototype

The earlier interactive prototype (published as a Claude artifact) is a
**separate, self-contained thing** — it uses Anthropic's own hosted
per-artifact capabilities (`db`, `user`, `sample`) instead of a real
backend, because a published Claude artifact's content-security policy
does not allow it to call an arbitrary external API. That means:

- This backend **cannot** be pointed at from that artifact — its `fetch()`
  calls to any domain other than a couple of CDNs and Anthropic's own
  services are blocked by the platform, by design.
- That artifact's data (profiles, clients, and leads people entered while
  testing it) **does not** live in this backend's database — it's in
  Anthropic's artifact storage, and the two are not connected. The two
  data models are deliberately kept compatible in shape (same fields for
  a client, the same pipeline stages for a lead) so migrating from one to
  the other later is straightforward, but nothing syncs automatically.

If you want one real product — your own frontend talking to *this* API —
build the frontend as an ordinary web app (React, plain HTML, whatever)
and either:
1. **Serve it from this same server** as static files (simplest: no CORS
   config needed, same origin), or
2. **Host it separately** (Vercel, Netlify, Cloudflare Pages, S3 —
   anywhere) and add its exact origin to `CORS_ORIGINS` in `.env`.

Either way, the frontend would call `/api/*` or `/graphql` the same way
the tests in `tests/app.security.test.ts` do — plain `fetch()`/`axios`
with the access token in an `Authorization` header.

## Project layout

```
src/
  app.ts               Express app assembly (middleware order matters — read the comments)
  index.ts             Process entry point, graceful shutdown
  config/env.ts        Zod-validated environment config — refuses to boot if misconfigured
  db/                  Drizzle schema, connection pool, migration runner, seed script
  lib/                 JWT, password hashing helpers, logger, Anthropic client, typed AppError
  middleware/          Auth guard, Zod validation, rate limiting, centralized error handler
  modules/
    auth/              Signup, login, refresh rotation, logout
    profile/           Business profile (the onboarding fields)
    clients/           CRM — the client list, generic across business types
    leads/             Lead pipeline (guided stage transitions) and the Lost/follow-up ledger
    finance/           Invoices, aging-bucket math, KPIs, dashboard summary
    insights/          AI-generated insights (server-side Anthropic call; reads clients/leads too)
    accountant/        Scoped, time-limited, read-only export links
  gql/                 Schema (SDL), resolvers (thin wrappers over the same services), context
tests/                 Jest — see "Testing" below
docs/
  API.md               Full endpoint reference, REST + GraphQL
  SECURITY.md           OWASP-Top-10-mapped mitigations, and known residual risk
```

## Setup

```bash
cp .env.example .env
# then edit .env — at minimum, set a real JWT_ACCESS_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Run locally with Docker (recommended — includes Postgres)

```bash
docker compose up --build
# in another terminal, apply migrations once the app is healthy:
docker compose exec app node dist/db/migrate.js
```

### Run locally without Docker

Requires a Postgres instance reachable at `DATABASE_URL`.

```bash
npm install
npm run db:migrate      # applies drizzle/*.sql
npm run seed            # optional: creates a demo user with a seeded business profile
npm run dev             # http://localhost:4000, auto-reloads on change
```

### Generating a new migration after changing `src/db/schema.ts`

```bash
npm run db:generate     # writes a new SQL file under drizzle/
npm run db:migrate      # applies it
```

## Testing

```bash
npm run typecheck
npm run lint
npm test                 # or: npm run test:coverage
```

67 tests currently cover: JWT signing/verification (including forged
signatures, expired tokens, wrong audience, and the classic `alg: none`
downgrade attack), invoice aging-bucket boundaries, the lead pipeline's
stage-transition graph (every legal move, every illegal skip, backward
move, and no-op, plus both terminal stages), every Zod schema's
accept/reject cases, and integration tests (via `supertest`, no live DB
required for these) confirming protected REST *and* GraphQL routes —
including the new `/api/clients` and `/api/leads` endpoints — reject
unauthenticated requests before reaching a controller, that middleware
runs in the right order, and that error responses never leak internals.

**Not covered without a live database**: end-to-end flows that actually
write to Postgres (signup → add a client → win a lead and confirm it
became a client, etc.). `docker-compose.yml` gives you a real Postgres to
point integration tests at; wiring up a `tests/integration/` suite
against it is the natural next step once you have a database running
somewhere the test runner can reach.

## Deploying

The `Dockerfile` builds a small, non-root production image with a
built-in healthcheck at `/health`. The CI pipeline
(`.github/workflows/ci.yml`) lints, type-checks, tests, audits
dependencies, and builds the image on every push — it stops short of an
actual deploy step, which is commented out and waiting on you to pick a
host (Fly.io, Render, ECS, a VPS, whatever fits). Point `DATABASE_URL` at
a managed Postgres instance, set real secrets, and put a TLS-terminating
load balancer or platform (this app does not terminate TLS itself) in
front of it.

## Security

See `docs/SECURITY.md` for the full picture, including what's
**not** done yet and why. Short version: parameterized queries
throughout, Zod validation on every input, hashed passwords and hashed
refresh/accountant tokens, rate limiting tuned per-endpoint, every
client/lead/invoice/KPI query scoped by owning user (not just looked up
by id first), and a CI step that fails the build on a high/critical
dependency advisory. A real, high-severity SQL-injection advisory in a
pinned dependency was found and fixed during this build — see
SECURITY.md for how.
