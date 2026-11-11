import { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger';

/** Emits one structured access-log line per request once the response has finished. */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const fields = {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        userAgent: req.header('User-Agent')
      };
      if (res.statusCode >= 500) logger.error('http request', fields);
      else logger.info('http request', fields);
    });
    next();
  };
}
