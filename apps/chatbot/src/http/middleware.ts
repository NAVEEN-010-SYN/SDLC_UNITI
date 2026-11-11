import { randomUUID } from 'crypto';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthConfig } from '../config';
import { AppError, RateLimitedError, UnauthorizedError } from '../domain/errors';
import { Principal, Role } from '../domain/types';
import { Logger } from '../logger';
import { RateLimiter } from '../ratelimit/rateLimiter';

/** Express request augmented by our middleware. */
export interface ChatRequest extends Request {
  correlationId: string;
  principal?: Principal;
  bearerToken?: string;
}

const CORRELATION_HEADER = 'x-correlation-id';
const SAFE_CORRELATION = /^[A-Za-z0-9._:-]{8,128}$/;
const KNOWN_ROLES: Role[] = ['CONSUMER', 'BUSINESS_ADMIN', 'BUSINESS_USER', 'PARTNER_ADMIN', 'PARTNER_AGENT', 'WHOLESALE_BUYER', 'SUPPORT_AGENT'];

/** Accepts a well-formed inbound correlation id or mints one, and echoes it back. */
export function correlationId(): RequestHandler {
  return (req, res, next) => {
    const inbound = req.header(CORRELATION_HEADER);
    const id = inbound && SAFE_CORRELATION.test(inbound) ? inbound : randomUUID();
    (req as ChatRequest).correlationId = id;
    res.setHeader('X-Correlation-Id', id);
    next();
  };
}

export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      logger.info('http request', {
        method: req.method,
        path: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        correlationId: (req as ChatRequest).correlationId,
      });
    });
    next();
  };
}

export interface TokenClaims {
  sub?: string;
  account_id?: string;
  roles?: unknown;
  name?: string;
}

/** Keeps only the role claims this service recognises. */
function knownRoles(raw: unknown): Role[] {
  const roles: Role[] = [];
  if (!Array.isArray(raw)) return roles;
  for (const r of raw) {
    if (KNOWN_ROLES.includes(r as Role)) roles.push(r as Role);
  }
  return roles;
}

/** Verifies a bearer JWT and maps its claims onto a Principal. Shared with the WS gateway. */
export function verifyToken(token: string, config: AuthConfig): Principal {
  const key = config.publicKey ?? config.sharedSecret;
  if (!key) throw new UnauthorizedError('Token verification is not configured');
  let claims: TokenClaims;
  try {
    claims = jwt.verify(token, key, {
      algorithms: config.publicKey ? ['RS256'] : ['HS256'],
      issuer: config.issuer,
      audience: config.audience,
      clockTolerance: 30,
    }) as TokenClaims;
  } catch (error) {
    throw new UnauthorizedError(error instanceof Error ? `Invalid token: ${error.message}` : 'Invalid token');
  }
  if (!claims.sub || !claims.account_id) throw new UnauthorizedError('Token is missing sub or account_id');
  if (!/^ACC-\d{8}$/.test(claims.account_id)) throw new UnauthorizedError('Token account_id is malformed');
  const roles = knownRoles(claims.roles);
  if (roles.length === 0) throw new UnauthorizedError('Token carries no recognised roles');
  return { userId: claims.sub, accountId: claims.account_id, roles, displayName: claims.name };
}

export function authenticate(config: AuthConfig): RequestHandler {
  return (req, _res, next) => {
    const header = req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return next(new UnauthorizedError());
    try {
      const chatReq = req as ChatRequest;
      chatReq.principal = verifyToken(match[1], config);
      chatReq.bearerToken = match[1];
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const principal = (req as ChatRequest).principal;
    if (!principal || !principal.roles.some((r) => roles.includes(r))) {
      return next(new AppError(403, 'forbidden', 'Forbidden', `Requires one of: ${roles.join(', ')}`));
    }
    next();
  };
}

/** Per-user message rate limit; sets standard RateLimit headers. */
export function rateLimit(limiter: RateLimiter): RequestHandler {
  return (req, res, next) => {
    const chatReq = req as ChatRequest;
    const key = chatReq.principal ? `user:${chatReq.principal.userId}` : `ip:${req.ip}`;
    const decision = limiter.hit(key);
    res.setHeader('RateLimit-Limit', String(decision.limit));
    res.setHeader('RateLimit-Remaining', String(decision.remaining));
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      return next(new RateLimitedError(decision.retryAfterSeconds));
    }
    next();
  };
}

/** Wraps async handlers so rejections reach the error middleware. */
export function asyncHandler(fn: (req: ChatRequest, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req as ChatRequest, res).catch(next);
  };
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const isJsonSyntax = error instanceof SyntaxError && 'body' in (error as object);
  if (isJsonSyntax) return new AppError(400, 'malformed-json', 'Malformed JSON body');
  return new AppError(500, 'internal', 'Internal server error');
}

/** RFC 7807 error responder. Unknown errors become a generic 500 without leaking internals. */
export function problemHandler(logger: Logger) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const correlation = (req as ChatRequest).correlationId;
    const appError = toAppError(error);

    if (appError.status >= 500) {
      logger.error('request failed', { error, correlationId: correlation, path: req.path });
    } else {
      logger.info('request rejected', { status: appError.status, code: appError.code, correlationId: correlation });
    }
    const body = JSON.stringify(appError.toProblem(req.originalUrl, correlation));
    res.status(appError.status);
    res.type('application/problem+json');
    res.send(body);
  };
}

export function notFoundHandler(): RequestHandler {
  return (req, _res, next) => next(new AppError(404, 'route-not-found', 'Route not found', `${req.method} ${req.path} does not exist`));
}
