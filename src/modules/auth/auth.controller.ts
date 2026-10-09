import type { Request, Response } from 'express';
import { env } from '@/config/env';
import * as authService from '@/modules/auth/auth.service';
import { AppError } from '@/lib/http-error';

const REFRESH_COOKIE = 'refresh_token';

/** httpOnly (never readable by page JS — mitigates token theft via XSS),
 *  secure outside local dev (never sent over plain HTTP), sameSite=strict
 *  (never sent on a cross-site request — this is the primary CSRF
 *  mitigation for this cookie, on top of it not being usable directly by
 *  an attacker's page since it is httpOnly). */
function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

/**
 * The refresh token also goes to httpOnly cookie clients to keep the
 * existing, stronger web flow exactly as-is (cookie-only, token never
 * touches page JS). It is ADDITIONALLY echoed in the JSON body for
 * clients that cannot rely on the cookie at all: a native app's WebView
 * calls a cross-origin API domain (its own origin is capacitor://... or
 * similar, not this API's), and that cookie is set with
 * sameSite:'strict' deliberately for CSRF protection — which also means
 * no browser will ever attach it to a cross-site request, cookie-store
 * quirks aside. A native client therefore stores this body value itself
 * and presents it back explicitly (today the dashboard keeps it in the
 * WebView's localStorage; moving it to the iOS Keychain is a documented
 * hardening follow-up in docs/SECURITY.md); see
 * refreshHandler/logoutHandler below. This changes nothing for a cookie
 * client: it already ignores response-body fields it doesn't use, and
 * its cookie's httpOnly/sameSite/secure flags are untouched.
 */
export async function signupHandler(req: Request, res: Response) {
  const result = await authService.signup(req.body);
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json({ accessToken: result.accessToken, refreshToken: result.refreshToken, userId: result.userId });
}

export async function loginHandler(req: Request, res: Response) {
  const result = await authService.login(req.body);
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({ accessToken: result.accessToken, refreshToken: result.refreshToken, userId: result.userId });
}

/**
 * Cookie first (the existing, stronger path); body second (for a client
 * that was never sent — or can't retain — the cookie). Both ultimately
 * hit the same authService.refresh(), so a stolen/replayed token is
 * detected and rejected identically either way.
 */
export async function refreshHandler(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  if (!raw) throw AppError.unauthorized('No refresh token presented.', 'REFRESH_MISSING');
  const tokens = await authService.refresh(raw);
  setRefreshCookie(res, tokens.refreshToken);
  res.status(200).json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
}

export async function logoutHandler(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  if (raw) await authService.logout(raw);
  clearRefreshCookie(res);
  res.status(204).send();
}
