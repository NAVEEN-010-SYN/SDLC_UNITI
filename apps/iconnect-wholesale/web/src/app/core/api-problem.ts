import { HttpErrorResponse } from '@angular/common/http';

/** An RFC 7807 problem returned by the API, normalised so every page can render it the same way. */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly detail: string | null,
    readonly fieldErrors: Record<string, string[]>,
    readonly correlationId: string | null,
  ) {
    super(detail ?? title);
    this.name = 'ApiProblem';
  }

  /** First error for a form field, matching the camelCase keys the API emits. */
  fieldError(field: string): string | null {
    return this.fieldErrors[field]?.[0] ?? null;
  }

  static from(error: HttpErrorResponse): ApiProblem {
    const correlationId = error.headers?.get('X-Correlation-Id') ?? null;
    const body = error.error;
    if (body && typeof body === 'object' && typeof body.title === 'string') {
      return new ApiProblem(
        body.status ?? error.status,
        typeof body.code === 'string' ? body.code : 'http.error',
        body.title,
        typeof body.detail === 'string' ? body.detail : null,
        isErrorMap(body.errors) ? body.errors : {},
        typeof body.correlationId === 'string' ? body.correlationId : correlationId,
      );
    }

    if (error.status === 0) {
      return new ApiProblem(0, 'network.unreachable', 'The service could not be reached', 'Check your connection and try again.', {}, null);
    }

    return new ApiProblem(error.status, 'http.error', error.statusText || 'Request failed', null, {}, correlationId);
  }
}

function isErrorMap(value: unknown): value is Record<string, string[]> {
  return !!value && typeof value === 'object' && Object.values(value).every((v) => Array.isArray(v));
}
