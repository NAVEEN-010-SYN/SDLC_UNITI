/** RFC 7807 problem details as emitted by the API, including the portal's extension members. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  correlationId?: string;
  errors?: { field: string; message: string }[];
  [extension: string]: unknown;
}

export class ProblemError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId?: string;
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title || `Request failed with status ${problem.status}`);
    this.name = 'ProblemError';
    this.status = problem.status;
    this.code = problem.code || `http.${problem.status}`;
    this.correlationId = problem.correlationId;
    this.problem = problem;
  }

  /** Validation errors keyed by field name, for highlighting form inputs. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.problem.errors ?? []) {
      out[e.field] ??= e.message;
    }
    return out;
  }

  /** Business-rule details the API attaches as string lists (blockers, problems, missing). */
  listDetail(key: string): string[] {
    const value = this.problem[key];
    return Array.isArray(value) ? value.map(String) : [];
  }
}

const PROBLEM_TYPES = ['application/problem+json', 'application/json'];

/**
 * Converts a failed response into a ProblemError. Non-JSON bodies (proxies, gateways) still
 * yield a usable error carrying the correlation ID from the response header.
 */
export async function toProblemError(response: Response, sentCorrelationId: string): Promise<ProblemError> {
  const contentType = response.headers.get('content-type') ?? '';
  const correlationId = response.headers.get('x-correlation-id') ?? sentCorrelationId;
  if (PROBLEM_TYPES.some((t) => contentType.includes(t))) {
    try {
      const body = (await response.json()) as Partial<ProblemDetails>;
      return new ProblemError({ ...body, status: body.status ?? response.status, correlationId: body.correlationId ?? correlationId });
    } catch {
      // fall through to the generic problem below
    }
  }
  return new ProblemError({
    status: response.status,
    title: response.statusText || 'Request failed',
    code: `http.${response.status}`,
    correlationId,
  });
}

export function describeError(error: unknown): string {
  if (error instanceof ProblemError) {
    const ref = error.correlationId ? ` (reference ${error.correlationId})` : '';
    return `${error.message}${ref}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong';
}
