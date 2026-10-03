/**
 * A deliberate, expected failure (bad input, missing resource, denied
 * access) as opposed to a bug. The centralized error handler trusts this
 * class's `message` to be safe to show a client; anything else (a thrown
 * TypeError, a driver exception) is logged in full server-side and
 * answered with a generic message, so internals never leak in a response.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }

  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new AppError(400, code, message);
  }
  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }
  static forbidden(message = 'Not allowed', code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }
  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }
  static conflict(message: string, code = 'CONFLICT') {
    return new AppError(409, code, message);
  }
  static tooMany(message = 'Too many requests', code = 'RATE_LIMITED') {
    return new AppError(429, code, message);
  }
}
