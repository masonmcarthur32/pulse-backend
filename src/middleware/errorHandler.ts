import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@/lib/http-error';
import { logger } from '@/lib/logger';
import { env } from '@/config/env';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

/**
 * Express recognizes this as an error handler purely by its four-argument
 * arity — keep that exact signature even though `next` is unused.
 *
 * The rule this file exists to enforce: an AppError's message is safe to
 * show a client (we wrote it, deliberately, for that purpose); anything
 * else is an unexpected failure, gets logged with full detail, and is
 * answered with a generic message. Stack traces, driver errors, and raw
 * exception messages never reach the response body.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ err, path: req.path }, 'Application error');
    }
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }

  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message:
        env.NODE_ENV === 'production'
          ? 'Something went wrong on our end.'
          : String(err instanceof Error ? err.stack : err)
    }
  });
}
