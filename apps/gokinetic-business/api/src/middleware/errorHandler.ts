import { NextFunction, Request, Response } from 'express';
import { AppError, ProblemDetails, isAppError } from '../lib/errors';
import { logger } from '../lib/logger';

const PROBLEM_JSON = 'application/problem+json';

export function notFoundHandler() {
  return (req: Request, res: Response): void => {
    const problem: ProblemDetails = {
      type: 'https://errors.uniti.example/gokinetic-business/route-not-found',
      title: 'Route not found',
      status: 404,
      detail: `No route for ${req.method} ${req.path}`,
      instance: req.originalUrl,
      correlationId: req.correlationId
    };
    res.status(404).type(PROBLEM_JSON).json(problem);
  };
}

/**
 * Final error middleware: maps domain errors to RFC 7807 responses, hides internals for
 * unexpected failures, and always includes the correlation id for support diagnostics.
 */
export function errorHandler() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (isBodyParserError(err)) {
      const problem: ProblemDetails = {
        type: 'https://errors.uniti.example/gokinetic-business/malformed-body',
        title: 'Malformed request body',
        status: 400,
        detail: 'The request body is not valid JSON',
        instance: req.originalUrl,
        correlationId: req.correlationId
      };
      res.status(400).type(PROBLEM_JSON).json(problem);
      return;
    }

    if (isAppError(err)) {
      logAppError(err, req);
      res.status(err.status).type(PROBLEM_JSON).json(err.toProblem(req.originalUrl, req.correlationId));
      return;
    }

    logger.error('unhandled error', { err, method: req.method, path: req.path });
    const problem: ProblemDetails = {
      type: 'https://errors.uniti.example/gokinetic-business/internal',
      title: 'Internal server error',
      status: 500,
      detail: 'An unexpected error occurred. Quote the correlation id when contacting support.',
      instance: req.originalUrl,
      correlationId: req.correlationId
    };
    res.status(500).type(PROBLEM_JSON).json(problem);
  };
}

function logAppError(err: AppError, req: Request): void {
  const fields = { code: err.code, status: err.status, method: req.method, path: req.path, detail: err.message };
  if (err.status >= 500) logger.error('request failed', fields);
  else if (err.status === 401 || err.status === 403) logger.warn('access denied', fields);
  else logger.info('request rejected', fields);
}

function isBodyParserError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: string }).type === 'entity.parse.failed'
  );
}
