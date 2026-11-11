import { NextFunction, Request, Response } from 'express';
import { TokenVerifier } from '../auth/jwt';
import { AuthContext, Permission, can, isSupportAgent } from '../auth/permissions';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { requestContext } from '../lib/logger';

const ACCOUNT_OVERRIDE_HEADER = 'X-Acting-Account-Id';
const ACCOUNT_ID = /^ACC-\d{8}$/;

/**
 * Verifies the bearer JWT and attaches an AuthContext. Support agents may act on behalf of a
 * customer account using X-Acting-Account-Id; business roles are always pinned to their token account.
 */
export function authenticate(verifier: TokenVerifier) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header('Authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return next(new UnauthorizedError('A bearer token is required'));
    }
    try {
      const ctx = verifier.verify(token);
      const acting = req.header(ACCOUNT_OVERRIDE_HEADER);
      if (acting) {
        if (!isSupportAgent(ctx)) {
          throw new ForbiddenError('Only support agents may act on behalf of another account');
        }
        if (!ACCOUNT_ID.test(acting)) throw new UnauthorizedError('X-Acting-Account-Id is malformed');
        ctx.accountId = acting;
      }
      req.auth = ctx;
      const store = requestContext.getStore();
      if (store) {
        store.userId = ctx.userId;
        store.accountId = ctx.accountId;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}

/** Route-level RBAC guard: the caller must hold every listed permission. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(new UnauthorizedError());
    const missing = permissions.filter((p) => !can(req.auth!, p));
    if (missing.length > 0) {
      return next(new ForbiddenError(`Missing permission: ${missing.join(', ')}`));
    }
    next();
  };
}
