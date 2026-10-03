import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '@/lib/jwt';
import { AppError } from '@/lib/http-error';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: 'owner' | 'accountant' };
    }
  }
}

/** Requires a valid, non-expired access token in `Authorization: Bearer <token>`.
 *  Access tokens live in memory on the client and are never stored in a
 *  cookie, so this route is not a CSRF target. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(AppError.unauthorized());
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return next(AppError.unauthorized('Invalid or expired access token', 'TOKEN_INVALID'));
  }
}

export function requireRole(...roles: Array<'owner' | 'accountant'>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    return next();
  };
}
