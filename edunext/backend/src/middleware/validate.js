import { badRequest } from './error.js';

/**
 * Body-validation middleware factory. Parses `req.body` with a zod schema,
 * replaces it with the parsed (typed) value, and turns failures into a 400 with
 * per-field details.
 *
 * @param {import('zod').ZodTypeAny} schema
 */
export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(badRequest('Validation failed', details));
    }
    req.body = result.data;
    return next();
  };
}
