import type { ZodTypeAny, z } from 'zod';
import { zodToValidationProblem } from '../errors/problem';

/** Parses `input` with `schema`, throwing a 400 problem listing every invalid field. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw zodToValidationProblem(result.error);
  return result.data;
}
