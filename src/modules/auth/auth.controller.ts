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

export async function signupHandler(req: Request, res: Response) {
  const result = await authService.signup(req.body);
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json({ accessToken: result.accessToken, userId: result.userId });
}

export async function loginHandler(req: Request, res: Response) {
  const result = await authService.login(req.body);
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({ accessToken: result.accessToken, userId: result.userId });
}

export async function refreshHandler(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) throw AppError.unauthorized('No refresh token presented.', 'REFRESH_MISSING');
  const tokens = await authService.refresh(raw);
  setRefreshCookie(res, tokens.refreshToken);
  res.status(200).json({ accessToken: tokens.accessToken });
}

export async function logoutHandler(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (raw) await authService.logout(raw);
  clearRefreshCookie(res);
  res.status(204).send();
}
