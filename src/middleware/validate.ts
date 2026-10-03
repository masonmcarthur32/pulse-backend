import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '@/lib/http-error';

type Source = 'body' | 'query' | 'params';

/**
 * Parses `req[source]` against `schema` and replaces it with the parsed
 * (and thus type-narrowed, coerced, and stripped-of-unknown-keys) value.
 * Every route that accepts client input should be wrapped in this —
 * there is no "trust the client" path anywhere in this API.
 */
export function validate(schema: ZodTypeAny, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || source}: ${issue.message}`)
        .join('; ');
      return next(AppError.badRequest(message, 'VALIDATION_ERROR'));
    }
    req[source] = result.data;
    return next();
  };
}
