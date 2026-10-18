/** A typed error that carries an HTTP status + stable error code. */
export class ApiError extends Error {
  /** @param {number} status @param {string} code @param {string} message @param {object} [details] */
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentication required') => new ApiError(401, 'unauthorized', message);
export const forbidden = (message = 'Not allowed') => new ApiError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new ApiError(404, 'not_found', message);
export const conflict = (message) => new ApiError(409, 'conflict', message);

/**
 * Centralized error middleware. Emits the consistent shape
 * `{ error: { code, message, details? } }`. Never leaks internals on a 500.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  // Unexpected: log server-side, return a generic message.
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  return res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
}
