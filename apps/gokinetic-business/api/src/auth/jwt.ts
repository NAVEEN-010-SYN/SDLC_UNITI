import jwt, { JwtPayload } from 'jsonwebtoken';
import { AuthContext, ROLES, Role } from './permissions';
import { UnauthorizedError } from '../lib/errors';

export interface JwtSettings {
  issuer: string;
  audience: string;
  publicKey: string;
  sharedSecret: string;
}

const ACCOUNT_ID = /^ACC-\d{8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface BusinessClaims extends JwtPayload {
  email?: string;
  roles?: unknown;
  account_id?: unknown;
  site_scope?: unknown;
}

export interface TokenVerifier {
  verify(token: string): AuthContext;
}

export function createTokenVerifier(settings: JwtSettings): TokenVerifier {
  const key = settings.publicKey || settings.sharedSecret;
  const algorithms: jwt.Algorithm[] = settings.publicKey ? ['RS256', 'ES256'] : ['HS256'];

  return {
    verify(token: string): AuthContext {
      let claims: BusinessClaims;
      try {
        claims = jwt.verify(token, key, {
          issuer: settings.issuer,
          audience: settings.audience,
          algorithms,
          clockTolerance: 30
        }) as BusinessClaims;
      } catch (err) {
        const reason = err instanceof jwt.TokenExpiredError ? 'Access token has expired' : 'Access token is invalid';
        throw new UnauthorizedError(reason);
      }
      return claimsToContext(claims);
    }
  };
}

export function claimsToContext(claims: BusinessClaims): AuthContext {
  if (!claims.sub || !UUID.test(claims.sub)) throw new UnauthorizedError('Token subject is missing or malformed');
  if (typeof claims.account_id !== 'string' || !ACCOUNT_ID.test(claims.account_id)) {
    throw new UnauthorizedError('Token is not bound to a business account');
  }
  const rawRoles = Array.isArray(claims.roles) ? claims.roles : [];
  const roles = rawRoles.filter((r): r is Role => typeof r === 'string' && (ROLES as readonly string[]).includes(r));
  if (roles.length === 0) throw new UnauthorizedError('Token carries no business self-care role');

  let siteScope: string[] | null = null;
  if (Array.isArray(claims.site_scope)) {
    siteScope = claims.site_scope.filter((s): s is string => typeof s === 'string' && UUID.test(s));
  }

  return {
    userId: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : '',
    roles,
    accountId: claims.account_id,
    siteScope
  };
}
