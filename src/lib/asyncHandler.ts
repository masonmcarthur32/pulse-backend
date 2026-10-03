import type { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Express 4 does not catch rejected promises from async handlers on its
 *  own — an unhandled rejection here would otherwise hang the request
 *  instead of reaching errorHandler. Wrap every async controller in this. */
export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
