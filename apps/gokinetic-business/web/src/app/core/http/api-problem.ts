import { HttpErrorResponse } from '@angular/common/http';

export interface FieldError {
  field: string;
  message: string;
}

const PROBLEM_BASE = 'https://errors.uniti.example/gokinetic-business/';

/**
 * Client-side view of an RFC 7807 problem. Every failed API call surfaces as an ApiProblem so
 * components never inspect raw HttpErrorResponse objects.
 */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail: string,
    readonly code: string,
    readonly fieldErrors: FieldError[] = [],
    readonly correlationId: string | null = null,
    readonly extensions: Record<string, unknown> = {}
  ) {
    super(detail || title);
    this.name = 'ApiProblem';
  }

  get isValidation(): boolean {
    return this.status === 400 && this.fieldErrors.length > 0;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  /** e.g. "business-rule/last-admin" for a 422 rule violation. */
  isRule(rule: string): boolean {
    return this.code === `business-rule/${rule}`;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function parseFieldErrors(raw: unknown): FieldError[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(asRecord)
    .filter((e): e is Record<string, unknown> => !!e && typeof e['field'] === 'string' && typeof e['message'] === 'string')
    .map((e) => ({ field: e['field'] as string, message: e['message'] as string }));
}

/** Converts any HTTP failure (problem+json, plain JSON, network error) into an ApiProblem. */
export function toApiProblem(error: HttpErrorResponse): ApiProblem {
  const correlationId = error.headers?.get('X-Correlation-Id') ?? null;
  if (error.status === 0) {
    return new ApiProblem(0, 'Network error', 'The service could not be reached. Check your connection and try again.', 'network', [], correlationId);
  }
  const body = asRecord(error.error);
  if (!body || typeof body['title'] !== 'string') {
    return new ApiProblem(error.status, error.statusText || 'Request failed', 'An unexpected error occurred.', `http-${error.status}`, [], correlationId);
  }
  const type = typeof body['type'] === 'string' ? (body['type'] as string) : '';
  const code = type.startsWith(PROBLEM_BASE) ? type.slice(PROBLEM_BASE.length) : type || `http-${error.status}`;
  const { type: _t, title, status: _s, detail, instance: _i, correlationId: bodyCorrelation, errors, ...extensions } = body;
  return new ApiProblem(
    error.status,
    title as string,
    typeof detail === 'string' ? detail : '',
    code,
    parseFieldErrors(errors),
    typeof bodyCorrelation === 'string' ? bodyCorrelation : correlationId,
    extensions
  );
}
