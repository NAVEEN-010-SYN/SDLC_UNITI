'use strict';

const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../errors');

/**
 * Bearer JWT authentication (OIDC-compatible claims).
 *
 * Expected claims: `sub` (user id), `acc` (account id), `roles` (array),
 * `seg` (CONSUMER|BUSINESS), `typ` = "access". Tokens are verified for
 * signature, issuer, audience and expiry.
 */

function extractBearer(req) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

function toPrincipal(claims) {
  return {
    id: claims.sub,
    accountId: claims.acc,
    roles: Array.isArray(claims.roles) ? claims.roles : [],
    segment: claims.seg,
    email: claims.email,
  };
}

function verifyAccessToken(token, authConfig) {
  let claims;
  try {
    claims = jwt.verify(token, authConfig.jwtSecret, {
      issuer: authConfig.issuer,
      audience: authConfig.audience,
      algorithms: ['HS256'],
    });
  } catch (err) {
    const detail = err.name === 'TokenExpiredError' ? 'Access token has expired.' : 'Access token is invalid.';
    throw new UnauthorizedError(detail);
  }
  if (claims.typ !== 'access') throw new UnauthorizedError('Token is not an access token.');
  return toPrincipal(claims);
}

/**
 * Requires a valid bearer token; populates `req.user`.
 * @param {object} authConfig config.auth
 */
function authenticate(authConfig) {
  return (req, _res, next) => {
    const token = extractBearer(req);
    if (!token) return next(new UnauthorizedError());
    try {
      req.user = verifyAccessToken(token, authConfig);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Populates `req.user` when a valid token is present but lets anonymous
 * shoppers through (guest carts, catalogue browsing). An invalid token is
 * still rejected so clients notice expired sessions.
 */
function optionalAuthenticate(authConfig) {
  return (req, _res, next) => {
    const token = extractBearer(req);
    if (!token) return next();
    try {
      req.user = verifyAccessToken(token, authConfig);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { authenticate, optionalAuthenticate, verifyAccessToken, extractBearer };
