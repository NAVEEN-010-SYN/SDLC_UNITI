'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  BusinessRuleError,
  UnauthorizedError,
} = require('../errors');
const { SEGMENTS } = require('../domain/constants');
const { addressKey } = require('../domain/address');
const { logger } = require('../config/logger');

const MAX_SAVED_ADDRESSES = 10;
const INVITE_TTL_SECONDS = 72 * 3600;

/**
 * Self-service account management: profile, saved service addresses and,
 * for Business GoKinetic, inviting colleagues onto the account.
 */
function createAccountService({
  users,
  accounts,
  serviceability,
  notifier,
  authConfig,
  maxUsersPerBusinessAccount = 50,
  businessPortalUrl = 'https://business.gokinetic.example',
  now = () => new Date(),
  log = logger,
}) {
  async function loadAccount(accountId) {
    const account = await accounts.findByAccountId(accountId);
    if (!account) throw new NotFoundError('Account', accountId);
    return account;
  }

  function assertBusinessAccount(account) {
    if (account.segment !== SEGMENTS.BUSINESS) {
      throw new ForbiddenError('Team management is available to Business GoKinetic accounts only.');
    }
  }

  function signInviteToken(userId, accountId) {
    return jwt.sign({ sub: userId, acc: accountId, typ: 'invite' }, authConfig.jwtSecret, {
      issuer: authConfig.issuer,
      audience: authConfig.audience,
      expiresIn: INVITE_TTL_SECONDS,
      algorithm: 'HS256',
    });
  }

  function verifyInviteToken(token) {
    try {
      const claims = jwt.verify(token, authConfig.jwtSecret, {
        issuer: authConfig.issuer,
        audience: authConfig.audience,
        algorithms: ['HS256'],
      });
      if (claims.typ !== 'invite') throw new Error('wrong type');
      return claims;
    } catch {
      throw new UnauthorizedError('The invitation link is invalid or has expired.');
    }
  }

  function publicMember(user) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      status: user.status,
      lastLoginAt: user.lastLoginAt || null,
    };
  }

  return {
    /** Account summary plus the signed-in user's profile. */
    async getOverview(principal) {
      const [account, user] = await Promise.all([loadAccount(principal.accountId), users.findById(principal.id)]);
      if (!user) throw new NotFoundError('User', principal.id);
      return {
        account: {
          accountId: account.accountId,
          segment: account.segment,
          displayName: account.displayName,
          businessName: account.businessName || null,
          status: account.status,
          taxExempt: account.taxExempt,
          creditTermsDays: account.creditTermsDays,
          addresses: account.addresses,
        },
        profile: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone || null,
          marketingOptIn: user.marketingOptIn,
          roles: user.roles,
        },
      };
    },

    async updateProfile(principal, patch) {
      const updated = await users.update(principal.id, patch);
      if (!updated) throw new NotFoundError('User', principal.id);
      const account = await accounts.findByAccountId(principal.accountId);
      // Consumer accounts are named after their holder; keep them in sync.
      if (account && account.segment === SEGMENTS.CONSUMER && (patch.firstName || patch.lastName)) {
        await accounts.update(principal.accountId, { displayName: `${updated.firstName} ${updated.lastName}` });
      }
      return publicMember(updated);
    },

    /**
     * Saves a service address. The address is qualified on the way in so
     * the storefront can show "fibre available" badges; an upstream outage
     * stores it with an unknown status rather than failing the request.
     */
    async addAddress(principal, { label, address, isDefault }) {
      const account = await loadAccount(principal.accountId);
      if (account.addresses.length >= MAX_SAVED_ADDRESSES) {
        throw new BusinessRuleError('ADDRESS_LIMIT', `You can save at most ${MAX_SAVED_ADDRESSES} addresses.`);
      }
      const key = addressKey(address);
      if (account.addresses.some((a) => addressKey(a.address) === key)) {
        throw new ConflictError('This address is already saved.');
      }
      let serviceable = null;
      let normalized = address;
      try {
        const check = await serviceability.check(address, { segment: account.segment });
        serviceable = check.serviceable;
        normalized = check.address;
      } catch (err) {
        log.warn('account.address_check_failed', { error: err.message });
      }
      const makeDefault = isDefault || account.addresses.length === 0;
      const updated = await accounts.addAddress(principal.accountId, {
        label,
        address: normalized,
        isDefault: makeDefault,
        serviceable,
      });
      return updated.addresses;
    },

    async removeAddress(principal, addressId) {
      const account = await loadAccount(principal.accountId);
      const target = account.addresses.find((a) => String(a._id || a.id) === addressId);
      if (!target) throw new NotFoundError('Address', addressId);
      const updated = await accounts.removeAddress(principal.accountId, addressId);
      return updated.addresses;
    },

    async listMembers(principal) {
      const account = await loadAccount(principal.accountId);
      assertBusinessAccount(account);
      const members = await users.listByAccount(principal.accountId);
      return members.map(publicMember);
    },

    /** Invites a colleague; they set their own password via the emailed link. */
    async inviteMember(principal, input) {
      const account = await loadAccount(principal.accountId);
      assertBusinessAccount(account);
      const members = await users.listByAccount(principal.accountId);
      const seats = members.filter((m) => m.status !== 'DISABLED').length;
      if (seats >= maxUsersPerBusinessAccount) {
        throw new BusinessRuleError('USER_LIMIT', `Business accounts can have at most ${maxUsersPerBusinessAccount} users.`);
      }
      if (await users.findByEmailWithSecret(input.email)) {
        throw new ConflictError('A user with this email already exists.');
      }
      // Unusable random password until the invite is accepted.
      const placeholder = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), authConfig.bcryptRounds);
      const created = await users.create({
        email: input.email,
        passwordHash: placeholder,
        firstName: input.firstName,
        lastName: input.lastName,
        accountId: principal.accountId,
        roles: [input.role],
        segment: SEGMENTS.BUSINESS,
        status: 'INVITED',
      });
      const userId = String(created._id || created.id);
      const token = signInviteToken(userId, principal.accountId);
      const inviter = await users.findById(principal.id);
      await notifier.send({
        template: 'USER_INVITED',
        to: input.email,
        reference: `invite:${userId}`,
        data: {
          inviter: inviter ? `${inviter.firstName} ${inviter.lastName}` : 'Your administrator',
          accountName: account.displayName,
          activationUrl: `${businessPortalUrl}/activate?token=${encodeURIComponent(token)}`,
        },
      });
      log.info('account.member_invited', { accountId: principal.accountId, role: input.role });
      return publicMember({ ...created, id: userId });
    },

    /** Completes an invitation by setting the password and activating the login. */
    async activateInvite({ token, password }) {
      const claims = verifyInviteToken(token);
      const user = await users.findById(claims.sub);
      if (!user || user.accountId !== claims.acc) throw new UnauthorizedError('The invitation link is invalid.');
      if (user.status !== 'INVITED') {
        throw new BusinessRuleError('INVITE_ALREADY_USED', 'This invitation has already been accepted. Sign in instead.');
      }
      const passwordHash = await bcrypt.hash(password, authConfig.bcryptRounds);
      const updated = await users.update(claims.sub, { passwordHash, status: 'ACTIVE', lastLoginAt: now() });
      return publicMember(updated);
    },

    /** Disables a colleague's login. Admins cannot disable themselves. */
    async disableMember(principal, userId) {
      const account = await loadAccount(principal.accountId);
      assertBusinessAccount(account);
      if (userId === principal.id) {
        throw new BusinessRuleError('CANNOT_DISABLE_SELF', 'You cannot disable your own login.');
      }
      const member = await users.findById(userId);
      if (!member || member.accountId !== principal.accountId) throw new NotFoundError('User', userId);
      return publicMember(await users.update(userId, { status: 'DISABLED' }));
    },
  };
}

module.exports = { createAccountService, MAX_SAVED_ADDRESSES };
