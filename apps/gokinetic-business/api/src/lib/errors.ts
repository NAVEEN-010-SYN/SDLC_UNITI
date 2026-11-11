/**
 * Domain errors mapped to RFC 7807 problem+json responses by the error middleware.
 * Services throw these; controllers never format errors themselves.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  errors?: Array<{ field: string; message: string }>;
  [extension: string]: unknown;
}

const PROBLEM_BASE = 'https://errors.uniti.example/gokinetic-business';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    detail?: string,
    readonly extensions: Record<string, unknown> = {}
  ) {
    super(detail ?? title);
    this.name = new.target.name;
  }

  get type(): string {
    return `${PROBLEM_BASE}/${this.code}`;
  }

  toProblem(instance?: string, correlationId?: string): ProblemDetails {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.message,
      instance,
      correlationId,
      ...this.extensions
    };
  }
}

export class ValidationError extends AppError {
  constructor(readonly fieldErrors: Array<{ field: string; message: string }>, detail = 'Request validation failed') {
    super(400, 'validation-error', 'Invalid request', detail, { errors: fieldErrors });
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail = 'Authentication is required') {
    super(401, 'unauthorized', 'Unauthorized', detail);
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = 'You do not have permission to perform this action') {
    super(403, 'forbidden', 'Forbidden', detail);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, 'not-found', 'Resource not found', `${resource} ${id} was not found`, { resource, resourceId: id });
  }
}

export class ConflictError extends AppError {
  constructor(detail: string, extensions: Record<string, unknown> = {}) {
    super(409, 'conflict', 'Conflict', detail, extensions);
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(entity: string, from: string, to: string) {
    super(
      409,
      'invalid-state-transition',
      'Invalid state transition',
      `${entity} cannot move from ${from} to ${to}`,
      { entity, from, to }
    );
  }
}

export class BusinessRuleError extends AppError {
  constructor(rule: string, detail: string, extensions: Record<string, unknown> = {}) {
    super(422, `business-rule/${rule}`, 'Business rule violated', detail, { rule, ...extensions });
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
