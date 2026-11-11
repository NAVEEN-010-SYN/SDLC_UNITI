import type { Role } from '../api/types';

export interface SessionUser {
  userId: string;
  roles: Role[];
  accountId?: string;
  partnerAccountIds: string[];
  expiresAt: number;
}

const KNOWN_ROLES: Role[] = ['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT', 'PARTNER_ADMIN', 'PARTNER_AGENT'];

function base64UrlDecode(segment: string): string {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Reads the claims the UI needs for navigation and gating. The signature is NOT verified
 * here - the API verifies every request; the client only uses claims to decide what to show.
 * Returns null for malformed or expired tokens.
 */
export function decodeSession(token: string, nowMs = Date.now()): SessionUser | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
  if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
  const expiresAt = claims.exp * 1000;
  if (expiresAt <= nowMs) return null;
  const realm = (claims.realm_access as { roles?: unknown } | undefined)?.roles;
  const raw = [...(Array.isArray(claims.roles) ? claims.roles : []), ...(Array.isArray(realm) ? realm : [])];
  const roles = [...new Set(raw.filter((r): r is Role => KNOWN_ROLES.includes(r as Role)))];
  if (roles.length === 0) return null;
  return {
    userId: claims.sub,
    roles,
    accountId: typeof claims.accountId === 'string' ? claims.accountId : undefined,
    partnerAccountIds: Array.isArray(claims.partnerAccountIds) ? claims.partnerAccountIds.filter((x): x is string => typeof x === 'string') : [],
    expiresAt,
  };
}

/** Extracts `access_token` from an OIDC implicit-flow redirect fragment. */
export function tokenFromFragment(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get('access_token');
}

export const canApprove = (u: SessionUser | null): boolean => !!u?.roles.some((r) => r === 'BUSINESS_ADMIN' || r === 'SUPPORT_AGENT');
export const canRequestChanges = (u: SessionUser | null): boolean =>
  !!u?.roles.some((r) => r === 'BUSINESS_ADMIN' || r === 'BUSINESS_USER' || r === 'SUPPORT_AGENT');
export const canManageAlerts = canRequestChanges;
