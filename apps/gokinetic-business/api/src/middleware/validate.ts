import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodTypeAny, z } from 'zod';
import { ValidationError } from '../lib/errors';

export function zodToValidationError(err: ZodError, location: string): ValidationError {
  return new ValidationError(
    err.issues.map((issue) => ({
      field: [location, ...issue.path].join('.'),
      message: issue.message
    }))
  );
}

export function parseOrThrow<S extends ZodTypeAny>(schema: S, value: unknown, location = 'body'): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw zodToValidationError(result.error, location);
  return result.data;
}

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and normalises request parts in place. Controllers can then read
 * `res.locals.query` / `req.body` / `req.params` already coerced to the schema types.
 */
export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = parseOrThrow(schemas.params, req.params, 'params');
      if (schemas.query) res.locals.query = parseOrThrow(schemas.query, req.query, 'query');
      if (schemas.body) req.body = parseOrThrow(schemas.body, req.body ?? {}, 'body');
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const UuidParam = z.object({ id: z.string().uuid('id must be a UUID') });
