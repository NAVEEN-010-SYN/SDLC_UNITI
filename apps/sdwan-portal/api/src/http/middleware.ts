import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger } from '../logging/logger';
import { requestContext } from '../logging/logger';

const CORRELATION_HEADER = 'x-correlation-id';
const VALID_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Accepts an inbound X-Correlation-Id (if well-formed) or mints one, echoes it on the
 * response, and runs the rest of the request inside an AsyncLocalStorage context so
 * logs and outbound vendor calls carry it automatically.
 */
export const correlationId: RequestHandler = (req, res, next) => {
  const inbound = req.header(CORRELATION_HEADER);
  const id = inbound && VALID_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Correlation-Id', id);
  requestContext.run({ correlationId: id }, () => next());
};

export function accessLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      let level: 'error' | 'warn' | 'info' = 'info';
      if (res.statusCode >= 500) level = 'error';
      else if (res.statusCode >= 400) level = 'warn';
      logger[level]('http request', {
        method: req.method,
        path: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path,
        status: res.statusCode,
        durationMs: Math.round(ms * 10) / 10,
      });
    });
    next();
  };
}

export function cors(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins.filter(Boolean));
  return (req, res, next) => {
    const origin = req.header('origin');
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Correlation-Id, If-Match');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'X-Correlation-Id, ETag');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

/** Wraps an async handler so rejections reach the problem+json error handler. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
