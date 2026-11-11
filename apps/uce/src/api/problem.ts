/**
 * RFC 7807 problem details as returned by every Uniti API, plus the error type
 * the API client throws so UI code can branch on status / field errors.
 */

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  errors?: Array<{ field: string; message: string }>;
}

export class ApiError extends Error {
  constructor(
    readonly problem: ProblemDetails,
    readonly correlationId: string,
  ) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  get status(): number {
    return this.problem.status;
  }

  /** Field-level validation messages keyed by field name, for form binding. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.problem.errors ?? []).map((e) => [e.field, e.message]));
  }

  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 502;
  }
}

function isProblem(value: unknown): value is ProblemDetails {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.title === 'string' && typeof v.status === 'number';
}

/**
 * Builds problem details from any HTTP error response. Non-conforming bodies
 * (HTML error pages from a proxy, empty bodies) are wrapped into a synthetic
 * problem so callers only ever handle one shape.
 */
export function toProblem(status: number, statusText: string, body: unknown, instance: string): ProblemDetails {
  if (isProblem(body)) return { ...body, type: body.type ?? 'about:blank' };
  return {
    type: 'about:blank',
    title: statusText || httpTitle(status),
    status,
    instance,
  };
}

function httpTitle(status: number): string {
  if (status === 401) return 'Unauthorized';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not found';
  if (status === 429) return 'Too many requests';
  if (status >= 500) return 'Service unavailable';
  return 'Request failed';
}

/** A user-presentable message; never leaks internal detail for server errors. */
export function userMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'We could not reach Uniti. Check your connection and try again.';
    if (error.status >= 500) return 'Something went wrong on our side. Please try again shortly.';
    if (error.status === 429) return 'You are doing that too often. Please wait a moment and try again.';
    return error.problem.detail ?? error.problem.title;
  }
  return 'Something went wrong. Please try again.';
}
