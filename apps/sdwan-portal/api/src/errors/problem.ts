import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from '../logging/logger';
import { currentCorrelationId } from '../logging/logger';

const TYPE_BASE = 'https://errors.uniti.example/sdwan';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  [extension: string]: unknown;
}

/** Base for every error that maps onto an RFC 7807 response. */
export class ProblemError extends Error {
  constructor(
    public readonly status: number,
    public readonly slug: string,
    public readonly title: string,
    detail?: string,
    public readonly extensions: Record<string, unknown> = {},
  ) {
    super(detail ?? title);
    this.name = new.target.name;
  }

  toProblem(instance?: string): ProblemDetails {
    return {
      type: `${TYPE_BASE}/${this.slug}`,
      title: this.title,
      status: this.status,
      detail: this.message,
      instance,
      correlationId: currentCorrelationId(),
      ...this.extensions,
    };
  }
}

export class ValidationProblem extends ProblemError {
  constructor(errors: Array<{ path: string; message: string }>) {
    super(400, 'validation', 'Request validation failed', `${errors.length} field(s) invalid`, { errors });
  }
}

export class UnauthorizedProblem extends ProblemError {
  constructor(detail = 'A valid bearer token is required') {
    super(401, 'unauthorized', 'Unauthorized', detail);
  }
}

export class ForbiddenProblem extends ProblemError {
  constructor(detail = 'You do not have permission to perform this action') {
    super(403, 'forbidden', 'Forbidden', detail);
  }
}

export class NotFoundProblem extends ProblemError {
  constructor(resource: string, id: string) {
    super(404, 'not-found', 'Resource not found', `${resource} ${id} was not found`, { resource, id });
  }
}

export class ConflictProblem extends ProblemError {
  constructor(detail: string, extensions: Record<string, unknown> = {}) {
    super(409, 'conflict', 'Conflict', detail, extensions);
  }
}

export class BusinessRuleProblem extends ProblemError {
  constructor(rule: string, detail: string, extensions: Record<string, unknown> = {}) {
    super(422, `rule/${rule}`, 'Business rule violated', detail, { rule, ...extensions });
  }
}

/** Upstream vendor (VCO / FortiManager / FortiGate) failed or returned something we cannot use. */
export class UpstreamProblem extends ProblemError {
  constructor(vendor: string, detail: string, public readonly retryable = false, upstreamStatus?: number) {
    super(502, 'upstream', 'Upstream SD-WAN controller error', detail, { vendor, retryable, upstreamStatus });
  }
}

export class UpstreamTimeoutProblem extends ProblemError {
  constructor(vendor: string, timeoutMs: number) {
    super(504, 'upstream-timeout', 'Upstream SD-WAN controller timed out', `${vendor} did not respond within ${timeoutMs} ms`, {
      vendor,
      retryable: true,
    });
  }
}

export function zodToValidationProblem(err: ZodError): ValidationProblem {
  return new ValidationProblem(
    err.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
  );
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ProblemError(404, 'route-not-found', 'Route not found', `${req.method} ${req.path} is not a known endpoint`));
};

export function problemHandler(logger: Logger): ErrorRequestHandler {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err, req, res, _next) => {
    let problem: ProblemError;
    if (err instanceof ProblemError) {
      problem = err;
    } else if (err instanceof ZodError) {
      problem = zodToValidationProblem(err);
    } else if (err?.type === 'entity.parse.failed') {
      problem = new ProblemError(400, 'malformed-json', 'Malformed JSON body', 'The request body is not valid JSON');
    } else {
      logger.error('unhandled error', { err, path: req.path, method: req.method });
      problem = new ProblemError(500, 'internal', 'Internal Server Error', 'An unexpected error occurred');
    }
    if (problem.status >= 500 && err instanceof ProblemError) {
      logger.warn('upstream/server problem', { status: problem.status, slug: problem.slug, detail: problem.message });
    }
    res.status(problem.status).type('application/problem+json').json(problem.toProblem(req.originalUrl));
  };
}
