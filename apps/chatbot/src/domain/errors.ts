/**
 * Application error hierarchy mapped to RFC 7807 problem details by the HTTP layer.
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

const PROBLEM_BASE = 'https://errors.uniti.example/chatbot';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    message?: string,
  ) {
    super(message ?? title);
    this.name = new.target.name;
  }

  toProblem(instance?: string, correlationId?: string): ProblemDetails {
    return {
      type: `${PROBLEM_BASE}/${this.code}`,
      title: this.title,
      status: this.status,
      detail: this.message !== this.title ? this.message : undefined,
      instance,
      correlationId,
    };
  }
}

export class ValidationError extends AppError {
  constructor(readonly fieldErrors: Array<{ field: string; message: string }>) {
    super(400, 'validation-failed', 'Request validation failed', fieldErrors.map((e) => `${e.field}: ${e.message}`).join('; '));
  }

  override toProblem(instance?: string, correlationId?: string): ProblemDetails {
    return { ...super.toProblem(instance, correlationId), errors: this.fieldErrors };
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'A valid bearer token is required') {
    super(401, 'unauthorized', 'Unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super(403, 'forbidden', 'Forbidden', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, 'not-found', 'Resource not found', `${resource} ${id} was not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'conflict', 'Conflict', message);
  }
}

export class RateLimitedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super(429, 'rate-limited', 'Too many messages', `Retry after ${retryAfterSeconds}s`);
  }
}

export class DownstreamError extends AppError {
  constructor(
    readonly service: string,
    readonly upstreamStatus: number | undefined,
    message: string,
  ) {
    super(502, 'downstream-failure', 'Downstream service failure', `${service}: ${message}`);
  }

  get retryable(): boolean {
    return this.upstreamStatus === undefined || this.upstreamStatus >= 500 || this.upstreamStatus === 429;
  }
}
