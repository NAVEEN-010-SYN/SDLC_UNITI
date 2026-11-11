import type { RequestHandler } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import type { Principal, Role } from '../domain/types';
import { UnauthorizedProblem } from '../errors/problem';
import { requestContext } from '../logging/logger';

export interface JwtSettings {
  issuer: string;
  audience: string;
  secret?: string;
  publicKey?: string;
  clockToleranceSec?: number;
}

const KNOWN_ROLES: Role[] = ['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT', 'PARTNER_ADMIN', 'PARTNER_AGENT'];
const ACCOUNT_ID = /^ACC-\d{8}$/;

/**
 * Roles may arrive as a flat `roles` claim or Keycloak-style `realm_access.roles`.
 * Unknown roles are ignored rather than rejected so the IdP can carry roles for
 * other portals in the same token.
 */
export function extractRoles(payload: JwtPayload): Role[] {
  const raw: unknown[] = [
    ...(Array.isArray(payload.roles) ? payload.roles : []),
    ...(Array.isArray(payload.realm_access?.roles) ? payload.realm_access.roles : []),
  ];
  return [...new Set(raw.filter((r): r is Role => typeof r === 'string' && KNOWN_ROLES.includes(r as Role)))];
}

export function payloadToPrincipal(payload: JwtPayload): Principal {
  if (!payload.sub) throw new UnauthorizedProblem('Token has no subject');
  const roles = extractRoles(payload);
  if (roles.length === 0) throw new UnauthorizedProblem('Token carries no SD-WAN portal role');
  const accountId = typeof payload.accountId === 'string' ? payload.accountId : undefined;
  if (accountId && !ACCOUNT_ID.test(accountId)) throw new UnauthorizedProblem('Token accountId claim is malformed');
  if (!roles.includes('SUPPORT_AGENT') && !accountId && !roles.some((r) => r.startsWith('PARTNER_'))) {
    throw new UnauthorizedProblem('Business users must carry an accountId claim');
  }
  const partnerAccountIds = Array.isArray(payload.partnerAccountIds)
    ? payload.partnerAccountIds.filter((a: unknown): a is string => typeof a === 'string' && ACCOUNT_ID.test(a))
    : undefined;
  return { userId: payload.sub, roles, accountId, partnerAccountIds };
}

export function verifyToken(token: string, settings: JwtSettings): Principal {
  const key = settings.publicKey ? settings.publicKey.replace(/\\n/g, '\n') : settings.secret;
  if (!key) throw new Error('JWT verification key not configured');
  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(token, key, {
      issuer: settings.issuer,
      audience: settings.audience,
      algorithms: settings.publicKey ? ['RS256', 'ES256'] : ['HS256'],
      clockTolerance: settings.clockToleranceSec ?? 30,
    });
  } catch (err) {
    const name = (err as Error).name;
    throw new UnauthorizedProblem(name === 'TokenExpiredError' ? 'Token has expired' : 'Token is invalid');
  }
  if (typeof payload === 'string') throw new UnauthorizedProblem('Token payload must be a JSON object');
  return payloadToPrincipal(payload);
}

export function authenticate(settings: JwtSettings): RequestHandler {
  return (req, res, next) => {
    try {
      const header = req.headers.authorization ?? '';
      const [scheme, token] = header.split(' ');
      if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedProblem();
      const principal = verifyToken(token, settings);
      res.locals.principal = principal;
      const ctx = requestContext.getStore();
      if (ctx) {
        ctx.userId = principal.userId;
        ctx.accountId = principal.accountId;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Test/dev helper: issues an HS256 token with the same claim layout as the IdP. */
export function signDevToken(principal: Principal, settings: JwtSettings, expiresInSec = 3600): string {
  if (!settings.secret) throw new Error('signDevToken requires an HS256 secret');
  return jwt.sign(
    { roles: principal.roles, accountId: principal.accountId, partnerAccountIds: principal.partnerAccountIds },
    settings.secret,
    { subject: principal.userId, issuer: settings.issuer, audience: settings.audience, expiresIn: expiresInSec, algorithm: 'HS256' },
  );
}
