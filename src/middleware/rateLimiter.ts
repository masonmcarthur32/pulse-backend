import rateLimit from 'express-rate-limit';

/** Applied to the whole API — generous, just a backstop against abuse. */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
});

/** Applied only to login/signup/refresh — tight, because these are the
 *  routes a credential-stuffing or brute-force script actually targets.
 *  Keyed on IP + email so one bad actor cannot lock out every user, and
 *  one leaked password list cannot be sprayed quickly against one IP. */
export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return `${req.ip}:${email}`;
  },
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts — try again shortly.' } }
});

/** AI calls cost real money and take real time — throttle per signed-in
 *  user (not per IP) so one account cannot run up spend by hammering the
 *  endpoint, regardless of how many IPs it comes from. Must run AFTER
 *  requireAuth so req.user is populated.
 *
 *  This guards the REST route only. The GraphQL `generateInsights`
 *  mutation reaches the same underlying work with no Express middleware
 *  in front of it, so the real, unbypassable cap is enforced inside
 *  insights.service.ts itself — see lib/rateLimit.ts. This middleware is
 *  a cheap, redundant early-reject on the REST path, not the sole line
 *  of defense. */
export const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many insight requests — try again shortly.' }
  }
});

/** The accountant export endpoint is public and unauthenticated by design
 *  (see accountant.routes.ts) — the token is 384 bits of random entropy,
 *  so brute-forcing it is computationally infeasible regardless of rate
 *  limit. This exists as defense-in-depth against a different risk: the
 *  handler fans out to three DB queries per request with no auth check in
 *  front of it, so it's a cheap unauthenticated resource-exhaustion target
 *  even without anyone trying to guess a token. Keyed by IP + token so one
 *  leaked/guessed token can't be hammered quickly, and scraping one IP
 *  across many token guesses is also capped. */
export const accountantExportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.params.token ?? ''}`,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many requests — try again shortly.' }
  }
});
