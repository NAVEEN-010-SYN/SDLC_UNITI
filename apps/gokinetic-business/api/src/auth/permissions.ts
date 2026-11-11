/**
 * Role-based access control for the business self-care portal.
 *
 * Roles come from the identity provider (JWT `roles` claim). Permissions are derived here
 * so that a role change in the IdP never needs a code change in consumers of `can()`.
 */
export const ROLES = ['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'sites:read',
  'sites:manage',
  'services:read',
  'users:read',
  'users:manage',
  'orders:read',
  'orders:create',
  'orders:approve',
  'orders:fulfil',
  'billing:read',
  'billing:manage',
  'sla:read',
  'tickets:read',
  'tickets:create',
  'tickets:escalate',
  'tickets:internal',
  'contracts:read',
  'contracts:renew',
  'documents:read',
  'audit:read'
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  BUSINESS_ADMIN: new Set<Permission>(PERMISSIONS.filter((p) => p !== 'tickets:internal' && p !== 'orders:fulfil')),
  BUSINESS_USER: new Set<Permission>([
    'sites:read',
    'services:read',
    'orders:read',
    'orders:create',
    'billing:read',
    'sla:read',
    'tickets:read',
    'tickets:create',
    'tickets:escalate',
    'contracts:read',
    'documents:read'
  ]),
  SUPPORT_AGENT: new Set<Permission>([
    'sites:read',
    'services:read',
    'users:read',
    'orders:read',
    'orders:fulfil',
    'billing:read',
    'sla:read',
    'tickets:read',
    'tickets:create',
    'tickets:escalate',
    'tickets:internal',
    'contracts:read',
    'documents:read',
    'audit:read'
  ])
};

export interface AuthContext {
  userId: string;
  email: string;
  roles: Role[];
  /** The business account the caller acts on. Support agents may act on any account. */
  accountId: string;
  /**
   * Optional site restriction for BUSINESS_USERs. `null` means all sites on the account.
   */
  siteScope: string[] | null;
}

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) result.add(p);
  }
  return result;
}

export function can(ctx: Pick<AuthContext, 'roles'>, permission: Permission): boolean {
  return ctx.roles.some((r) => ROLE_PERMISSIONS[r]?.has(permission));
}

export function isAdmin(ctx: Pick<AuthContext, 'roles'>): boolean {
  return ctx.roles.includes('BUSINESS_ADMIN');
}

export function isSupportAgent(ctx: Pick<AuthContext, 'roles'>): boolean {
  return ctx.roles.includes('SUPPORT_AGENT');
}

/** True if the caller may see data belonging to the given site. */
export function canAccessSite(ctx: AuthContext, siteId: string | null | undefined): boolean {
  if (!siteId) return true;
  if (isAdmin(ctx) || isSupportAgent(ctx)) return true;
  return ctx.siteScope === null || ctx.siteScope.includes(siteId);
}

/**
 * Site ids a repository query must be restricted to; `null` means "no restriction".
 */
export function siteFilterFor(ctx: AuthContext): string[] | null {
  if (isAdmin(ctx) || isSupportAgent(ctx)) return null;
  return ctx.siteScope;
}
