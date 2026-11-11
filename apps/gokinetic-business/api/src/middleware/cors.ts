import { NextFunction, Request, Response } from 'express';
import { CORRELATION_HEADER } from './correlationId';

const ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const ALLOWED_HEADERS = `Authorization,Content-Type,Accept,${CORRELATION_HEADER},X-Acting-Account-Id`;
const PREFLIGHT_MAX_AGE_SECONDS = 600;

/**
 * Strict allow-list CORS. Only configured origins are reflected; credentials are not used
 * because the portal authenticates with bearer tokens.
 */
export function cors(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.header('Origin');
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Expose-Headers', `${CORRELATION_HEADER},Location,Content-Disposition`);
      res.append('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS' && req.header('Access-Control-Request-Method')) {
      if (!origin || !allowed.has(origin)) {
        res.status(403).end();
        return;
      }
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Max-Age', String(PREFLIGHT_MAX_AGE_SECONDS));
      res.status(204).end();
      return;
    }
    next();
  };
}
