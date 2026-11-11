import type { RequestHandler } from 'express';
import type { Principal, Role } from '../domain/types';
import { ForbiddenProblem, UnauthorizedProblem } from '../errors/problem';

export type Permission =
  | 'inventory:read'
  | 'health:read'
  | 'policy:read'
  | 'firewall:read'
  | 'change:read'
  | 'change:create'
  | 'change:approve'
  | 'change:execute'
  | 'backup:read'
  | 'backup:create'
  | 'maintenance:read'
  | 'maintenance:write'
  | 'alert:read'
  | 'alert:manage'
  | 'report:read';

const READ_ALL: Permission[] = [
  'inventory:read',
  'health:read',
  'policy:read',
  'firewall:read',
  'change:read',
  'backup:read',
  'maintenance:read',
  'alert:read',
  'report:read',
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  BUSINESS_ADMIN: new Set<Permission>([...READ_ALL, 'change:create', 'change:approve', 'backup:create', 'maintenance:write', 'alert:manage']),
  BUSINESS_USER: new Set<Permission>([...READ_ALL, 'change:create', 'alert:manage']),
  SUPPORT_AGENT: new Set<Permission>([
    ...READ_ALL,
    'change:create',
    'change:approve',
    'change:execute',
    'backup:create',
    'maintenance:write',
    'alert:manage',
  ]),
  PARTNER_ADMIN: new Set<Permission>([...READ_ALL]),
  PARTNER_AGENT: new Set<Permission>(['inventory:read', 'health:read', 'alert:read', 'report:read']),
};

export function hasPermission(principal: Principal, permission: Permission): boolean {
  return principal.roles.some((r) => ROLE_PERMISSIONS[r]?.has(permission));
}

/** Support agents operate across accounts; partners only on accounts they resell; everyone else on their own. */
export function canAccessAccount(principal: Principal, accountId: string): boolean {
  if (principal.roles.includes('SUPPORT_AGENT')) return true;
  if (principal.accountId === accountId) return true;
  if (principal.roles.some((r) => r === 'PARTNER_ADMIN' || r === 'PARTNER_AGENT')) {
    return principal.partnerAccountIds?.includes(accountId) ?? false;
  }
  return false;
}

export function assertAccountAccess(principal: Principal, accountId: string): void {
  if (!canAccessAccount(principal, accountId)) {
    // 403 rather than 404 is acceptable here: account IDs are not secret to the caller's tenant boundary.
    throw new ForbiddenProblem(`You do not have access to account ${accountId}`);
  }
}

export function principalOf(locals: Record<string, unknown>): Principal {
  const p = locals.principal as Principal | undefined;
  if (!p) throw new UnauthorizedProblem();
  return p;
}

export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (_req, res, next) => {
    try {
      const principal = principalOf(res.locals);
      const missing = permissions.filter((p) => !hasPermission(principal, p));
      if (missing.length) throw new ForbiddenProblem(`Missing permission(s): ${missing.join(', ')}`);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Guards `/accounts/:accountId/...` routes. */
export const requireAccountAccess: RequestHandler = (req, res, next) => {
  try {
    assertAccountAccess(principalOf(res.locals), req.params.accountId);
    next();
  } catch (err) {
    next(err);
  }
};
