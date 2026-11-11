'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ConflictError, UnauthorizedError, ValidationError, BusinessRuleError } = require('../errors');
const { ROLES, SEGMENTS } = require('../domain/constants');
const { formatAccountId } = require('../domain/identifiers');

const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;

/**
 * Registration, login and refresh-token rotation.
 *
 * Refresh tokens are JWTs carrying a `jti` and `fam` (family id). Each refresh
 * rotates the token; presenting an already-rotated token revokes the whole
 * family (token theft detection, per OAuth 2.0 Security BCP).
 */
function createAuthService({ users, accounts, sessions, authConfig, now = () => new Date() }) {
  function signAccessToken(user) {
    return jwt.sign(
      {
        sub: String(user._id || user.id),
        acc: user.accountId,
        roles: user.roles,
        seg: user.segment,
        email: user.email,
        typ: 'access',
      },
      authConfig.jwtSecret,
      {
        issuer: authConfig.issuer,
        audience: authConfig.audience,
        expiresIn: authConfig.accessTtlSeconds,
        algorithm: 'HS256',
      },
    );
  }

  async function issueRefreshToken(userId, familyId, userAgent) {
    const jti = crypto.randomUUID();
    const token = jwt.sign({ sub: userId, jti, fam: familyId, typ: 'refresh' }, authConfig.jwtSecret, {
      issuer: authConfig.issuer,
      audience: authConfig.audience,
      expiresIn: authConfig.refreshTtlSeconds,
      algorithm: 'HS256',
    });
    await sessions.create({
      jti,
      userId,
      familyId,
      userAgent,
      expiresAt: new Date(now().getTime() + authConfig.refreshTtlSeconds * 1000),
    });
    return { token, jti };
  }

  async function issueTokens(user, { familyId = crypto.randomUUID(), userAgent } = {}) {
    const userId = String(user._id || user.id);
    const refresh = await issueRefreshToken(userId, familyId, userAgent);
    return {
      tokenType: 'Bearer',
      accessToken: signAccessToken(user),
      expiresIn: authConfig.accessTtlSeconds,
      refreshToken: refresh.token,
      jti: refresh.jti,
    };
  }

  function publicUser(user) {
    return {
      id: String(user._id || user.id),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      accountId: user.accountId,
      roles: user.roles,
      segment: user.segment,
    };
  }

  return {
    /**
     * Creates an account plus its first user. Business sign-ups become
     * BUSINESS_ADMIN of a new business account.
     */
    async register(input, { userAgent } = {}) {
      const existing = await users.findByEmailWithSecret(input.email);
      if (existing) throw new ConflictError('An account with this email already exists.');
      if (input.segment === SEGMENTS.BUSINESS && !input.businessName) {
        throw new ValidationError([{ path: 'businessName', message: 'Is required for business accounts.' }]);
      }

      const sequence = await accounts.nextSequence();
      const accountId = formatAccountId(sequence);
      const isBusiness = input.segment === SEGMENTS.BUSINESS;
      await accounts.create({
        accountId,
        segment: input.segment,
        displayName: isBusiness ? input.businessName : `${input.firstName} ${input.lastName}`,
        businessName: isBusiness ? input.businessName : undefined,
      });

      const passwordHash = await bcrypt.hash(input.password, authConfig.bcryptRounds);
      const user = await users.create({
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        accountId,
        roles: [isBusiness ? ROLES.BUSINESS_ADMIN : ROLES.CONSUMER],
        segment: input.segment,
        marketingOptIn: input.marketingOptIn,
      });
      const tokens = await issueTokens(user, { userAgent });
      return { user: publicUser(user), ...tokens, jti: undefined };
    },

    async login({ email, password }, { userAgent } = {}) {
      const user = await users.findByEmailWithSecret(email);
      // Compare against a dummy hash when the user is unknown so response
      // timing does not reveal which emails are registered.
      const hash = user ? user.passwordHash : '$2a$12$C6UzMDM.H6dfI/f/IKcEeO5ocpz1lUo7uO5/m5v0V8sXDxmP1KJ6e';
      const passwordOk = await bcrypt.compare(password, hash);

      if (!user) throw new UnauthorizedError('Email or password is incorrect.');
      if (user.status === 'DISABLED') throw new UnauthorizedError('This login has been disabled.');
      if (user.lockedUntil && new Date(user.lockedUntil) > now()) {
        throw new BusinessRuleError('ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.', {
          lockedUntil: new Date(user.lockedUntil).toISOString(),
        });
      }
      if (!passwordOk) {
        await users.recordLoginFailure(user._id, { lockThreshold: LOCK_THRESHOLD, lockMinutes: LOCK_MINUTES, now: now() });
        throw new UnauthorizedError('Email or password is incorrect.');
      }
      await users.recordLoginSuccess(user._id, now());
      const tokens = await issueTokens(user, { userAgent });
      return { user: publicUser(user), ...tokens, jti: undefined };
    },

    /** Rotates a refresh token and returns a fresh token pair. */
    async refresh(refreshToken, { userAgent } = {}) {
      let claims;
      try {
        claims = jwt.verify(refreshToken, authConfig.jwtSecret, {
          issuer: authConfig.issuer,
          audience: authConfig.audience,
          algorithms: ['HS256'],
        });
      } catch {
        throw new UnauthorizedError('Refresh token is invalid or expired.');
      }
      if (claims.typ !== 'refresh') throw new UnauthorizedError('Token is not a refresh token.');

      const session = await sessions.findByJti(claims.jti);
      if (!session) throw new UnauthorizedError('Session not found.');
      if (session.revokedAt) {
        // Reuse of a rotated token: assume theft and kill the family.
        await sessions.revokeFamily(session.familyId);
        throw new UnauthorizedError('Refresh token has already been used.');
      }
      const user = await users.findByIdWithSecret(claims.sub);
      if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError('User is not active.');

      const tokens = await issueTokens(user, { familyId: session.familyId, userAgent });
      const rotated = await sessions.rotate(claims.jti, tokens.jti);
      if (!rotated) {
        await sessions.revokeFamily(session.familyId);
        throw new UnauthorizedError('Refresh token has already been used.');
      }
      return { user: publicUser(user), ...tokens, jti: undefined };
    },

    async logout(refreshToken) {
      const claims = jwt.decode(refreshToken);
      if (!claims || !claims.jti) return;
      const session = await sessions.findByJti(claims.jti);
      if (session) await sessions.revokeFamily(session.familyId);
    },

    async changePassword(userId, { currentPassword, newPassword }) {
      const user = await users.findByIdWithSecret(userId);
      if (!user) throw new UnauthorizedError();
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        throw new ValidationError([{ path: 'currentPassword', message: 'Current password is incorrect.' }]);
      }
      if (await bcrypt.compare(newPassword, user.passwordHash)) {
        throw new ValidationError([{ path: 'newPassword', message: 'Must differ from the current password.' }]);
      }
      await users.update(userId, { passwordHash: await bcrypt.hash(newPassword, authConfig.bcryptRounds) });
      await sessions.revokeAllForUser(userId);
    },

    signAccessToken,
    publicUser,
  };
}

module.exports = { createAuthService, LOCK_THRESHOLD, LOCK_MINUTES };
