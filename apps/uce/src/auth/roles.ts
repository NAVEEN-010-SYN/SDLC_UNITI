/** Platform roles from CONVENTIONS.md; enforced server-side, used here only to shape the UI. */
export const ROLES = [
  'CONSUMER',
  'BUSINESS_ADMIN',
  'BUSINESS_USER',
  'PARTNER_ADMIN',
  'PARTNER_AGENT',
  'WHOLESALE_BUYER',
  'SUPPORT_AGENT',
] as const;

export type Role = (typeof ROLES)[number];

export type Segment = 'CONSUMER' | 'BUSINESS' | 'PARTNER' | 'WHOLESALE' | 'INTERNAL';

export function parseRoles(raw: unknown): Role[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((r): r is Role => (ROLES as readonly string[]).includes(r as string)))];
}

export function hasAnyRole(roles: readonly Role[], required: readonly Role[]): boolean {
  return required.length === 0 || roles.some((r) => required.includes(r));
}

/** Coarse audience segment used for analytics and portal defaults (most privileged wins). */
export function segmentOf(roles: readonly Role[]): Segment {
  if (roles.includes('SUPPORT_AGENT')) return 'INTERNAL';
  if (roles.includes('PARTNER_ADMIN') || roles.includes('PARTNER_AGENT')) return 'PARTNER';
  if (roles.includes('WHOLESALE_BUYER')) return 'WHOLESALE';
  if (roles.includes('BUSINESS_ADMIN') || roles.includes('BUSINESS_USER')) return 'BUSINESS';
  return 'CONSUMER';
}

/** Roles that may act on more than one billing account. */
export const MULTI_ACCOUNT_ROLES: Role[] = ['BUSINESS_ADMIN', 'BUSINESS_USER', 'PARTNER_ADMIN', 'PARTNER_AGENT', 'SUPPORT_AGENT'];
