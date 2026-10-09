# Security

This maps what's actually implemented against the OWASP Top 10 (2021), and
is honest about what is not done. "No security fails" is not a promise any
codebase can make — this is a record of what was checked and how, so gaps
are visible instead of assumed away.

## OWASP Top 10 (2021)

**A01 — Broken Access Control**
- Every mutating/reading route except `/health`, `/api/auth/*`, and the
  accountant export requires a valid access token (`middleware/auth.ts`).
- Every resource query is scoped to `req.user.id` at the service layer
  (`eq(table.userId, userId)`) — there is no endpoint that takes a
  resource ID without also filtering by owner, so one user cannot address
  another user's invoice/profile/KPI/client/lead by guessing an ID (IDOR).
  Confirmed for the client and lead resources in `clients.service.ts` /
  `leads.service.ts`, and for the invoice delete and update routes added
  in this pass (`finance.service.ts` `deleteInvoice`/`updateInvoice`,
  `tests/invoices.delete.test.ts`, `tests/invoices.update.test.ts`) —
  same pattern throughout.
- The new `PATCH /api/finance/invoices/:id` free-form edit is deliberately
  narrower than its own schema would allow a careless implementation to
  be: `updateInvoiceSchema` has no `status`/`paidAt` fields at all, so a
  client that sends `{"status":"paid"}` on this route has that key
  stripped by validation before the service ever sees it — status can
  only change through `POST /invoices/:id/mark-paid`. This is enforced
  structurally (the field doesn't exist in the schema the controller
  trusts), not by a runtime check that could be forgotten on the next
  edit — see `tests/invoices.update.test.ts` ("ignores an attempt to
  change status/paidAt through the generic edit").
- Accountant access is a separate, deliberately narrower mechanism (scoped
  token, read-only, time-limited) rather than a shared login — see A07.
- `requireRole('owner')` gates link creation/revocation so a future
  `accountant`-role account (if one is ever added) cannot mint its own
  access.

**A02 — Cryptographic Failures**
- Passwords: bcrypt, cost factor 12, never logged (see A09), never
  returned in any response.
- Refresh tokens and accountant-link tokens: stored as SHA-256 hashes
  only — a database dump does not yield usable sessions.
- Transport: Postgres connections use TLS outside development
  (`db/client.ts`); deploy behind TLS termination (see README) — this
  service does not terminate TLS itself.
- JWTs: HMAC-signed, explicit `issuer`/`audience` checked on verify (not
  just signature), explicit expiry, and the algorithm itself is pinned
  (`algorithm: 'HS256'` on sign, `algorithms: ['HS256']` on verify) rather
  than left to the `jsonwebtoken` library's default. No sensitive data in
  the JWT payload beyond user ID and role.
  - A later security pass demonstrated why the explicit pin matters:
    `jwt.verify()` without an `algorithms` allowlist accepts *any*
    HMAC variant valid for that secret type, not just the one this service
    signs with. A token forged with the real access secret but signed
    under HS384 was verified as accepted before the pin was added, and
    confirmed rejected after — see `tests/jwt.test.ts` ("rejects a token
    signed with the same secret under a different algorithm") and the
    live-HTTP proof below.
- Refresh token delivery is channel-aware, not one-size-fits-all. The
  existing web-style flow (httpOnly, `sameSite:'strict'`, `secure` outside
  dev cookie, scoped to `path:/api/auth`) is unchanged and remains the
  stronger of the two — a browser-based attacker cannot read it via XSS
  and it is never attached to a cross-site request. It is now
  *additionally* echoed once in the signup/login/refresh JSON response
  body, for a client that structurally cannot use the cookie at all: a
  native app's WebView runs on its own origin (`capacitor://localhost`,
  not this API's origin), so a `sameSite:'strict'` cookie is never
  attached to its cross-origin requests regardless of `credentials`
  settings — that's not a bug to route around with laxer cookie flags
  (which would weaken the *web* flow's CSRF protection for no reason,
  since no code here currently serves a cross-site browser client), it's
  a different client needing a different, explicit channel. The native
  app is responsible for storing that body value itself rather than
  relying on the browser's cookie jar. **Current limitation:** the
  dashboard stores it (and the access token) in the WebView's
  `localStorage`, which is app-sandboxed but not hardware-backed and is
  readable by any script running in the page. The mitigations are that
  the page loads no third-party scripts, every record field is HTML-
  escaped before rendering, and the native build ships a restrictive CSP;
  the stronger fix — a Keychain-backed secure-storage plugin — is a
  recommended follow-up before wide distribution. Both channels
  terminate in the same `authService.refresh()`/`logout()` — rotation,
  reuse-detection, and revocation behave identically either way; see
  `tests/auth.refresh.test.ts`.

**A05 note — CORS for the native client:** `render.yaml` allows only
`capacitor://localhost` (the iOS app's origin). Earlier drafts also listed
`ionic://localhost` and `http://localhost`; those were removed as unneeded.

**A03 — Injection**
- All SQL goes through Drizzle's parameterized query builder — no string
  concatenation into queries anywhere in this codebase.
- All request input (body, params) is parsed through a Zod schema before
  a controller/resolver ever sees it (`middleware/validate.ts`); GraphQL
  resolvers re-validate their `input` args with the same schemas, since
  GraphQL's own type system checks shape, not business rules (length,
  enum membership, etc.).
- `drizzle-orm` is pinned to `0.45.2`, which fixes a real high-severity
  identifier-escaping SQL injection advisory present in `0.33.x` — see
  "Known residual risk" below for how this was found.

**A04 — Insecure Design**
- Accountant access was designed as a scoped capability (a link, an
  expiry, a revoke) rather than "give the accountant a login and trust
  them not to click around" — this is the direct implementation of the
  master-prompt requirement that the accountant sees financials only.
- Password policy is length-based (NIST 800-63B: ≥12 chars) rather than
  forced complexity, which pushes users toward predictable substitutions
  (`Password1!`) without meaningfully raising entropy.
- Generic error messages on login (`Incorrect email or password`) and on
  signup-with-existing-email avoid confirming which emails are
  registered.
- **A throttle enforced only at the Express-middleware layer is bypassable
  by any second entry point to the same operation** — found during a
  later review: `insights.service.ts generateInsights()` is called by both
  the REST route (behind `aiLimiter` middleware) and the GraphQL
  `generateInsights` mutation (which has no Express middleware in front of
  it at all, since Apollo's `expressMiddleware` wraps the whole `/graphql`
  endpoint, not individual operations). The GraphQL path had no cap on
  calls to a real, metered Anthropic API request. Fixed by moving the
  actual enforcement into the shared service function itself
  (`lib/rateLimit.ts`'s `createKeyedLimiter`, consumed as the first line of
  `generateInsights`), so the limit holds regardless of which API surface
  reaches it; the REST middleware now serves as a cheap redundant
  early-reject, not the real boundary. Verified live: 1 REST call + 4
  GraphQL calls consumed the shared 5-per-10-minute budget for one user,
  and the 6th call (5th via GraphQL) was rejected with `RATE_LIMITED` —
  see "How this was verified" below. The general lesson generalizes: any
  future function reachable from more than one router needs its limiter
  at the function, not just at whichever route happened to get one first.

**A05 — Security Misconfiguration**
- `helmet()` sets CSP, HSTS, frame-options, etc. by default.
- CORS is an explicit allowlist (`CORS_ORIGINS`); no wildcard fallback —
  an empty allowlist trusts no browser origin at all, by design (see
  `app.ts` for why a disallowed origin fails closed without 500ing).
- Environment config is Zod-validated at boot (`config/env.ts`) — the
  process refuses to start with a missing or too-short JWT secret rather
  than running with an insecure default.
- `NODE_ENV=production` disables GraphQL introspection and hides
  unexpected-error detail (`gql/server.ts`, `middleware/errorHandler.ts`).
- Docker image runs as a non-root user, ships no dev dependencies or
  build tooling in the final layer (see `Dockerfile`).
- The config schema no longer declares an env var no code path ever reads.
  `JWT_REFRESH_SECRET` was required at boot (and checked to differ from
  `JWT_ACCESS_SECRET` in production) despite refresh tokens being opaque
  random strings, not JWTs — nothing in the codebase ever read it. Removed
  from `config/env.ts`, `.env.example`, `README.md`, and CI/test env setup.
  Not a vulnerability on its own, but a config surface implying a security
  property ("refresh tokens are separately signed") that didn't actually
  exist is exactly the kind of thing that misleads someone auditing the
  deployment later.

**A06 — Vulnerable and Outdated Components**
- `npm audit --omit=dev --audit-level=high` is a required CI step
  (`.github/workflows/ci.yml`) — a high/critical advisory in a production
  dependency fails the build, not just a warning someone has to notice.
- Dependencies are pinned with a committed lockfile (`package-lock.json`)
  for reproducible installs.
- Apollo Server was deliberately built on v5, not v4 — v4 reached
  end-of-life in January 2026.

**A07 — Identification and Authentication Failures**
- Access tokens are short-lived (15 min default) and live only in
  client memory (never a cookie), so they are not a CSRF target and a
  leaked one has a small blast radius.
- Refresh tokens rotate on every use and the presented token is revoked
  *before* the new one is issued — a stolen-and-replayed refresh token
  works at most once.
- Auth endpoints (`/api/auth/*`) are rate-limited per `IP + email`
  (`middleware/rateLimiter.ts`), so brute-forcing one account cannot lock
  out every other account sharing an IP (e.g. an office NAT), and a
  breached-password list cannot be sprayed quickly from one IP.
- No accountant account/login exists at all — see A01, A04.

**A08 — Software and Data Integrity Failures**
- CI builds from a committed lockfile, not floating ranges resolved at
  build time.
- The Docker build is a from-source multi-stage build (not "curl a binary
  and run it") with a pinned base image tag.
- No dynamic `eval`/`Function()`/deserialization of untrusted input
  anywhere in this codebase (also enforced by `no-eval`/`no-implied-eval`
  lint rules).

**A09 — Security Logging and Monitoring Failures**
- Structured logging via `pino`, with `req`/`res` metadata on every
  request (`pino-http` in `app.ts`).
- Explicit redaction list (`lib/logger.ts`) for `authorization`, `cookie`,
  password/token/hash fields — a route that accidentally logs `req.body`
  or a full user object cannot leak a secret through this logger.
- **Gap, honestly**: there is no shipped alerting/SIEM integration — logs
  go to stdout, which is the right shape for most log-aggregation
  platforms (Datadog, CloudWatch, etc.) to pick up, but wiring one up is
  left to deployment, not faked here.

- The accountant export endpoint (`GET /api/accountant/export/:token`) is
  intentionally public and unauthenticated — the token is the credential
  (see A01, A04) — but a later review noted it had no rate limit of its
  own, only the generic 300-per-15-minutes-per-IP backstop that applies to
  the whole API. The token's 384 bits of entropy makes brute-forcing it
  computationally infeasible regardless of rate limit, but the handler
  fans out to three DB queries per request with zero auth check in front
  of it, making it a cheap unauthenticated resource-exhaustion target even
  without anyone attempting to guess a token. Added
  `accountantExportLimiter` (30 requests per 15 minutes, keyed by
  `IP + token`) in front of it specifically. Verified live: 30 requests to
  the same token succeeded, the 31st through 35th were rejected with `429`.

**A10 — Server-Side Request Forgery (SSRF)**
- The only outbound server-initiated HTTP call this service makes is to
  `api.anthropic.com`, a single hardcoded URL never built from user input
  (`lib/anthropic.ts`). There is no endpoint that fetches an
  arbitrary user-supplied URL.

## Known residual risk (tracked, not hidden)

- **Lead-to-client conversion is not wrapped in a database transaction.**
  `leads.service.ts` `advanceLead` writes the lead's new `won` stage and
  then creates the matching `clients` row as two separate statements
  (this driver setup doesn't have a transaction helper wired up). If the
  process crashes between the two — a narrow window — a lead can be left
  on `won` without a client. The failure is visible (the client insert's
  error propagates as a normal 500, not swallowed) and recoverable (edit
  the lead's stage back and re-advance it), so this is a data-consistency
  rough edge, not a silent-corruption or security issue. Wrapping both
  writes in a single transaction is the fix; worth doing before this
  carries real financial data.
- **`drizzle-kit`'s dev tooling** pulls a deprecated `@esbuild-kit/esm-loader`
  transitive dependency with a moderate-severity advisory (the bundled
  `esbuild` dev server accepts requests from any origin). This only
  matters if you run `drizzle-kit studio`'s local GUI server on an
  untrusted network — it is dev-only tooling, not something the
  production container runs or imports (`Dockerfile`'s runtime stage
  never installs `drizzle-kit`). Re-run `npm audit` periodically; this
  should resolve upstream without action once drizzle-kit drops the
  dependency.
- **HaveIBeenPwned / breached-password checking** is not implemented.
  The password policy (≥12 chars) is enforced; checking new passwords
  against a breached-password corpus (e.g. the k-anonymity HIBP range
  API) would be a reasonable next step before a real launch.
- **No automated dependency-update bot** (Dependabot/Renovate) is
  configured. CI will catch a *known* high/critical advisory in an
  existing dependency, but nothing here proactively opens PRs to bump
  versions.
- **No WAF / DDoS-layer protection** is described here — that belongs at
  the infrastructure layer (Cloudflare, AWS WAF, etc.), not the
  application.
- **Multi-factor authentication** is not implemented. For a
  financial-data product, this is a reasonable next investment.

## How this was verified, not just written

- `npx tsc --noEmit` — passes.
- `npx eslint` (including `eslint-plugin-security`) — passes.
- `npx jest` — 85 tests passing, covering: JWT forgery/expiry/algorithm-
  downgrade/algorithm-substitution rejection, invoice aging-bucket
  boundaries, the lead pipeline's stage-transition graph (every legal
  move, every illegal skip/backward/no-op move, both terminal stages),
  every validation schema's accept/reject cases, the keyed in-process
  rate limiter's own logic (independent per-key budgets, window expiry,
  correct error shape), integration tests asserting that protected REST
  *and* GraphQL routes — including the clients and leads endpoints —
  reject before reaching a controller, that middleware ordering is
  correct (auth before validation), and that error responses never leak
  a stack trace — and, against a real local Postgres (not a mock),
  `tests/auth.refresh.test.ts`: signup/login return the refresh token in
  both the cookie and the body, the cookie-only flow still works
  untouched, the new body-only flow issues a fresh access token, a
  reused/rotated-out refresh token is rejected identically whichever
  channel it arrives on, and logout via body revokes it. Also added:
  `tests/invoices.delete.test.ts`, covering the new `DELETE
  /api/finance/invoices/:id` route — a normal owner delete, a
  cross-tenant attempt confirmed rejected 404 (not leaked as 403, and the
  other owner's invoice confirmed still present), and the unauthenticated
  case. Also added: `tests/invoices.update.test.ts`, covering the new
  `PATCH /api/finance/invoices/:id` route — a normal edit including the
  new `notes` field round-tripping correctly, confirmation that a
  `status`/`paidAt` payload is silently stripped rather than applied (and
  that `mark-paid` still works afterwards as the one real path to a paid
  status), a cross-tenant attempt rejected 404, and the unauthenticated
  case.
- `npm audit` — was run for real; a high-severity `drizzle-orm` SQL
  injection advisory and an EOL'd Apollo Server v4 were both found and
  fixed during an earlier pass, not left as pre-existing issues. Re-run on
  this pass and unchanged: the same 4 moderate `drizzle-kit`
  dev-tooling-only findings (see "Known residual risk" below); no stable
  upstream fix exists yet and the affected package never ships in the
  production image.
- **The compiled production build was actually booted and hit with real
  HTTP requests** (`node dist/index.js`, then `curl`) — not just compiled
  and assumed to work. An earlier pass caught two bugs this way that
  `tsc --noEmit` and the test suite both missed entirely, because both run
  through `ts-jest`/`tsx`, which resolve the `@/*` path alias at runtime
  themselves: (1) the compiled output's `@/*` imports are not valid Node
  specifiers on their own and need a rewrite step (`tsc-alias`, added to
  the `build` script), and (2) `tsc-alias`'s rewriter had a naming
  collision — this project's own `src/graphql/` folder shadowed the npm
  `graphql` package in the compiled output's `require()` calls, silently
  breaking the GraphQL layer at boot. Fixed by renaming the folder to
  `src/gql/`. Both would have shipped invisibly if the compiled artifact
  had never actually been run.
- **This pass additionally ran a live integration smoke test against a
  real Postgres instance** (not previously possible in this sandbox): a
  local Postgres was started, the real `drizzle` migrations were applied
  with the actual migration runner (`src/db/migrate.ts`), and the compiled
  server was booted against it and driven with `curl` through full
  request/response cycles — signup, an authenticated call, an unauthenticated
  call, a token forged with the right secret under the wrong algorithm,
  accountant-link creation, a valid export, a bogus-token export, 35 rapid
  requests against one accountant-export token, and 6 combined REST+GraphQL
  calls to the AI-insights path from one user. Every one of these produced
  the intended status code and, for the four items fixed in this pass,
  demonstrated the *broken* behavior would have occurred without the fix
  (a cross-algorithm forgery would have verified; the GraphQL path would
  never have been capped; the export endpoint would have had no cap beyond
  the generic per-IP one).

What remains **not** possible to verify in this environment: a real
`docker build`/container boot (no Docker daemon available here — the CLI
is present but there is no daemon to connect to). This is covered by
`docker-compose.yml` and the CI pipeline for you to run.
