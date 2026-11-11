# eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/server/src (part 6 of 8)

- **Application:** eCom (GoKinetic, Business GoKinetic) storefront & checkout
- **Tech stack:** MERN (MongoDB, Express, React, Node.js)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 14

## Files

- `apps/ecom-gokinetic/server/src/server.js` (64 lines)
- `apps/ecom-gokinetic/server/src/services/accountService.js` (238 lines)
- `apps/ecom-gokinetic/server/src/services/accountService.test.js` (81 lines)
- `apps/ecom-gokinetic/server/src/services/authService.js` (204 lines)
- `apps/ecom-gokinetic/server/src/services/authService.test.js` (58 lines)
- `apps/ecom-gokinetic/server/src/services/cartService.js` (364 lines)
- `apps/ecom-gokinetic/server/src/services/cartService.test.js` (110 lines)
- `apps/ecom-gokinetic/server/src/services/catalogService.js` (115 lines)
- `apps/ecom-gokinetic/server/src/services/checkoutService.js` (198 lines)
- `apps/ecom-gokinetic/server/src/services/checkoutService.test.js` (79 lines)
- `apps/ecom-gokinetic/server/src/services/installSchedulingService.js` (44 lines)
- `apps/ecom-gokinetic/server/src/services/invoiceService.js` (127 lines)
- `apps/ecom-gokinetic/server/src/services/invoiceService.test.js` (52 lines)
- `apps/ecom-gokinetic/server/src/services/orderService.js` (238 lines)

## apps/ecom-gokinetic/server/src/server.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/server.js`.

```javascript
'use strict';

const config = require('./config');
const { logger } = require('./config/logger');
const { connectDatabase, disconnectDatabase, isDatabaseReady } = require('./config/db');
const { createContainer } = require('./container');
const { createApp } = require('./app');
const { buildScheduler } = require('./jobs');

const SHUTDOWN_GRACE_MS = 15000;

/**
 * Process entry point: connect to MongoDB, start HTTP and background jobs,
 * and shut down gracefully on SIGTERM/SIGINT (Kubernetes rolling deploys).
 */
async function main() {
  await connectDatabase(config.mongo.uri);

  const container = createContainer(config);
  const scheduler = buildScheduler(container);
  const app = createApp({ container, isDatabaseReady, scheduler });

  const server = app.listen(config.port, () => {
    logger.info('http.listening', { port: config.port, env: config.nodeEnv });
  });
  // Keep-alive must outlive the load balancer's idle timeout to avoid 502s.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  if (config.jobs.enabled) scheduler.start();

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('process.shutdown', { signal });
    scheduler.stop();
    const forced = setTimeout(() => {
      logger.error('process.shutdown_forced', { afterMs: SHUTDOWN_GRACE_MS });
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forced.unref();
    server.close(async () => {
      try {
        await disconnectDatabase();
      } finally {
        clearTimeout(forced);
        process.exit(0);
      }
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('process.unhandled_rejection', { error: reason instanceof Error ? reason : String(reason) });
  });
}

main().catch((err) => {
  logger.error('process.startup_failed', { error: err });
  process.exit(1);
});
```

## apps/ecom-gokinetic/server/src/services/accountService.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/accountService.js`.

```javascript
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
```

## apps/ecom-gokinetic/server/src/services/accountService.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/accountService.test.js`.

```javascript
'use strict';

const { createWorld, principals } = require('../../tests/support/world');
const { ADDRESS } = require('../../tests/support/fakes');

const { consumer, businessAdmin } = principals;

const USERS = [
  { id: 'u-consumer', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', accountId: 'ACC-00000001', roles: ['CONSUMER'], segment: 'CONSUMER', passwordHash: 'x' },
  { id: 'u-badmin', email: 'ops@acme.example', firstName: 'Grace', lastName: 'Hopper', accountId: 'ACC-00000002', roles: ['BUSINESS_ADMIN'], segment: 'BUSINESS', passwordHash: 'x' },
];

describe('accountService', () => {
  let world;
  let accounts;
  beforeEach(() => {
    world = createWorld({ users: USERS });
    accounts = world.services.accountService;
  });

  test('overview combines account and profile', async () => {
    const overview = await accounts.getOverview(consumer);
    expect(overview.account).toMatchObject({ accountId: 'ACC-00000001', segment: 'CONSUMER' });
    expect(overview.profile).toMatchObject({ email: 'ada@example.com' });
    expect(overview.profile.passwordHash).toBeUndefined();
  });

  test('renaming a consumer renames their account', async () => {
    await accounts.updateProfile(consumer, { firstName: 'Augusta' });
    expect(world.repos.accounts.rows.get('ACC-00000001').displayName).toBe('Augusta Lovelace');
  });

  test('saved addresses are qualified, defaulted and de-duplicated', async () => {
    const saved = await accounts.addAddress(consumer, { label: 'Home', address: ADDRESS, isDefault: false });
    expect(saved[0]).toMatchObject({ label: 'Home', isDefault: true, serviceable: true });
    await expect(
      accounts.addAddress(consumer, { label: 'Again', address: { ...ADDRESS, line1: '12 main st.' }, isDefault: false }),
    ).rejects.toMatchObject({ status: 409 });
  });

  test('an upstream outage still saves the address with unknown status', async () => {
    world.api.qualify = async () => {
      throw new Error('timeout');
    };
    const saved = await accounts.addAddress(consumer, { label: 'Cabin', address: ADDRESS, isDefault: true });
    expect(saved[0].serviceable).toBeNull();
  });

  test('invited colleagues activate with the emailed token exactly once', async () => {
    const invited = await accounts.inviteMember(businessAdmin, {
      email: 'new@acme.example',
      firstName: 'Kat',
      lastName: 'Johnson',
      role: 'BUSINESS_USER',
    });
    expect(invited.status).toBe('INVITED');
    const email = world.notifier.sent.find((m) => m.template === 'USER_INVITED');
    expect(email.data.inviter).toBe('Grace Hopper');
    const token = decodeURIComponent(email.data.activationUrl.split('token=')[1]);

    const active = await accounts.activateInvite({ token, password: 'Sup3rSecretPass' });
    expect(active.status).toBe('ACTIVE');
    await expect(accounts.activateInvite({ token, password: 'Sup3rSecretPass' })).rejects.toMatchObject({
      code: 'INVITE_ALREADY_USED',
    });
  });

  test('rejects forged invite tokens', async () => {
    await expect(accounts.activateInvite({ token: 'not-a-real-token-at-all', password: 'Sup3rSecretPass' })).rejects.toMatchObject({
      status: 401,
    });
  });

  test('team management is business-only and admins cannot disable themselves', async () => {
    await expect(accounts.listMembers(consumer)).rejects.toMatchObject({ status: 403 });
    await expect(accounts.disableMember(businessAdmin, businessAdmin.id)).rejects.toMatchObject({ code: 'CANNOT_DISABLE_SELF' });
    const members = await accounts.listMembers(businessAdmin);
    expect(members.map((m) => m.email)).toEqual(['ops@acme.example']);
  });
});
```

## apps/ecom-gokinetic/server/src/services/authService.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/authService.js`.

```javascript
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
```

## apps/ecom-gokinetic/server/src/services/authService.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/authService.test.js`.

```javascript
'use strict';

const jwt = require('jsonwebtoken');
const { createWorld, testConfig } = require('../../tests/support/world');
const { LOCK_THRESHOLD } = require('./authService');

const REGISTRATION = {
  email: 'ada@example.com',
  password: 'Correct-Horse-9',
  firstName: 'Ada',
  lastName: 'Lovelace',
  segment: 'CONSUMER',
  marketingOptIn: false,
};

describe('authService', () => {
  let world;
  let auth;
  beforeEach(() => {
    world = createWorld({ accounts: [] });
    auth = world.services.authService;
  });

  test('registration creates the account and issues verifiable tokens', async () => {
    const result = await auth.register(REGISTRATION);
    expect(result.user).toMatchObject({ accountId: 'ACC-00000001', roles: ['CONSUMER'] });
    const claims = jwt.verify(result.accessToken, testConfig.auth.jwtSecret, { audience: testConfig.auth.audience });
    expect(claims).toMatchObject({ acc: 'ACC-00000001', typ: 'access', seg: 'CONSUMER' });
    await expect(auth.register(REGISTRATION)).rejects.toMatchObject({ status: 409 });
  });

  test('business sign-ups need a business name and become admins', async () => {
    await expect(auth.register({ ...REGISTRATION, segment: 'BUSINESS' })).rejects.toMatchObject({ status: 400 });
    const result = await auth.register({ ...REGISTRATION, segment: 'BUSINESS', businessName: 'Acme Corp' });
    expect(result.user.roles).toEqual(['BUSINESS_ADMIN']);
    expect(world.repos.accounts.rows.get(result.user.accountId).displayName).toBe('Acme Corp');
  });

  test('repeated wrong passwords lock the login', async () => {
    await auth.register(REGISTRATION);
    for (let i = 0; i < LOCK_THRESHOLD; i += 1) {
      await expect(auth.login({ email: REGISTRATION.email, password: 'wrong' })).rejects.toMatchObject({ status: 401 });
    }
    await expect(auth.login({ email: REGISTRATION.email, password: REGISTRATION.password })).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
  });

  test('refresh tokens rotate and reuse revokes the family', async () => {
    const { refreshToken } = await auth.register(REGISTRATION);
    const rotated = await auth.refresh(refreshToken);
    expect(rotated.refreshToken).not.toBe(refreshToken);

    await expect(auth.refresh(refreshToken)).rejects.toMatchObject({ status: 401 });
    await expect(auth.refresh(rotated.refreshToken)).rejects.toMatchObject({ status: 401 });
  });
});
```

## apps/ecom-gokinetic/server/src/services/cartService.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/cartService.js`.

```javascript
'use strict';

const crypto = require('node:crypto');
const {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BusinessRuleError,
} = require('../errors');
const { PRODUCT_TYPES, SEGMENTS } = require('../domain/constants');
const { priceItems } = require('../domain/pricing');
const { resolveTaxBps, toPricingLines, itemFromProduct, refreshItemPrices } = require('./pricingContext');

const MAX_DISTINCT_ITEMS = 20;

/**
 * Shopping cart behaviour: bundle rules, serviceability gating, promo codes
 * and live repricing.
 *
 * Bundle rules
 *  - exactly zero or one PLAN line per cart; adding a new plan replaces it
 *  - consumer plans are quantity 1; business plans may cover several sites
 *  - add-ons flagged `requiresPlan` need a compatible plan in the cart and
 *    are removed automatically if the plan changes to an incompatible one
 *  - products must be sold in the cart's segment
 */
function createCartService({
  carts,
  products,
  accounts,
  serviceability,
  promoService,
  cartTtlHours = 72,
  now = () => new Date(),
}) {
  const expiry = () => new Date(now().getTime() + cartTtlHours * 3600000);

  function tokensMatch(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /** Owned carts need the owner (or support); guest carts need their token. */
  function assertAccess(cart, principal, guestToken) {
    if (cart.userId) {
      if (principal && principal.id === cart.userId) return;
      if (principal && principal.roles.includes('SUPPORT_AGENT')) return;
      throw new ForbiddenError('This cart belongs to another user.');
    }
    if (!tokensMatch(guestToken, cart.guestToken)) {
      throw new ForbiddenError('A valid cart token is required.');
    }
  }

  async function load(cartId, principal, guestToken) {
    const cart = await carts.findById(cartId);
    if (!cart) throw new NotFoundError('Cart', cartId);
    assertAccess(cart, principal, guestToken);
    if (cart.status !== 'OPEN') {
      throw new BusinessRuleError('CART_CLOSED', 'This cart has already been checked out or has expired.');
    }
    return cart;
  }

  async function save(cart, patch) {
    const updated = await carts.updateVersioned(cart.id, cart.version, { ...patch, expiresAt: expiry() });
    if (!updated) {
      throw new ConflictError('The cart was changed in another window. Refresh and try again.', {
        code: 'CART_VERSION_CONFLICT',
      });
    }
    return updated;
  }

  /** Removes add-ons that are incompatible with the plan currently in `items`. */
  function pruneIncompatible(items, productsBySku) {
    const plan = items.find((i) => i.productType === PRODUCT_TYPES.PLAN);
    const removed = [];
    const kept = items.filter((item) => {
      const product = productsBySku.get(item.sku);
      if (!product || !product.requiresPlan) return true;
      const compatible =
        plan && (product.compatiblePlanSkus.length === 0 || product.compatiblePlanSkus.includes(plan.sku));
      if (!compatible) removed.push(item.sku);
      return compatible;
    });
    return { items: kept, removed };
  }

  async function catalogueFor(items) {
    const list = await products.findActiveBySkus(items.map((i) => i.sku));
    return new Map(list.map((p) => [p.sku, p]));
  }

  /**
   * Builds the full cart view: refreshed prices, pricing breakdown and any
   * warnings (price changes, promo no longer valid, plan unavailable).
   */
  async function view(cart) {
    const catalogue = await catalogueFor(cart.items);
    const { items, warnings } = refreshItemPrices(cart.items, catalogue);
    const account = cart.accountId ? await accounts.findByAccountId(cart.accountId) : null;

    let promoDescriptor = null;
    if (cart.promoCode) {
      const evaluation = await promoService.evaluate(cart.promoCode, {
        segment: cart.segment,
        accountId: cart.accountId,
        skus: items.map((i) => i.sku),
        monthlySubtotal: items.reduce((a, i) => a + i.unitMonthly * i.quantity, 0),
        contractTermMonths: cart.contractTermMonths,
      });
      if (evaluation.ok) promoDescriptor = evaluation.descriptor;
      else warnings.push({ code: evaluation.code, message: evaluation.message, promoCode: cart.promoCode });
    }

    if (cart.serviceability) {
      const planSkus = items.filter((i) => i.productType === PRODUCT_TYPES.PLAN).map((i) => i.sku);
      const blocked = planSkus.filter((s) => !cart.serviceability.availablePlanSkus.includes(s));
      if (!cart.serviceability.serviceable) {
        warnings.push({ code: 'ADDRESS_NOT_SERVICEABLE', message: 'Fibre is not available at the service address.' });
      } else if (blocked.length) {
        warnings.push({ code: 'PLAN_NOT_AVAILABLE_AT_ADDRESS', skus: blocked, message: 'The selected plan is not available at this address.' });
      }
    }

    const pricing = priceItems({
      lines: toPricingLines(items),
      contractTermMonths: cart.contractTermMonths,
      segment: cart.segment,
      promo: promoDescriptor,
      taxBps: resolveTaxBps(cart.serviceAddress, account),
    });

    return {
      id: cart.id,
      segment: cart.segment,
      version: cart.version,
      status: cart.status,
      items,
      contractTermMonths: cart.contractTermMonths,
      serviceAddress: cart.serviceAddress,
      serviceability: cart.serviceability,
      promoCode: cart.promoCode,
      pricing,
      warnings,
      readyForCheckout: isReady(cart, items, warnings),
      expiresAt: cart.expiresAt,
    };
  }

  function isReady(cart, items, warnings) {
    const hasPlan = items.some((i) => i.productType === PRODUCT_TYPES.PLAN);
    const blocking = warnings.some((w) =>
      ['ADDRESS_NOT_SERVICEABLE', 'PLAN_NOT_AVAILABLE_AT_ADDRESS', 'ITEM_UNAVAILABLE'].includes(w.code),
    );
    return hasPlan && Boolean(cart.serviceability) && !blocking;
  }

  return {
    view,

    async create({ segment }, principal) {
      if (principal && principal.segment && principal.segment !== segment) {
        throw new BusinessRuleError('SEGMENT_MISMATCH', `Your login is for the ${principal.segment} storefront.`);
      }
      if (principal) {
        const open = await carts.findOpenByUser(principal.id);
        if (open && open.segment === segment) return { cart: await view(open), guestToken: null };
      }
      const guestToken = principal ? null : crypto.randomBytes(24).toString('hex');
      const cart = await carts.create({
        segment,
        userId: principal ? principal.id : null,
        accountId: principal ? principal.accountId : null,
        guestToken,
        items: [],
        contractTermMonths: segment === SEGMENTS.BUSINESS ? 36 : 12,
        expiresAt: expiry(),
      });
      return { cart: await view(cart), guestToken };
    },

    async get(cartId, principal, guestToken) {
      return view(await load(cartId, principal, guestToken));
    },

    async addItem(cartId, { sku, quantity }, principal, guestToken) {
      const cart = await load(cartId, principal, guestToken);
      const product = await products.findBySku(sku);
      if (!product || !product.active) throw new NotFoundError('Product', sku);
      if (!product.segments.includes(cart.segment)) {
        throw new BusinessRuleError('PRODUCT_NOT_IN_SEGMENT', `${product.name} is not sold on this storefront.`);
      }

      let items = [...cart.items];
      const existing = items.find((i) => i.sku === sku);
      const newQuantity = (existing ? existing.quantity : 0) + quantity;

      if (product.type === PRODUCT_TYPES.PLAN) {
        if (cart.segment === SEGMENTS.CONSUMER && newQuantity > 1) {
          throw new BusinessRuleError('PLAN_QUANTITY_LIMIT', 'Consumer orders include a single broadband plan.');
        }
        items = items.filter((i) => i.productType !== PRODUCT_TYPES.PLAN || i.sku === sku);
        if (cart.serviceability && !cart.serviceability.availablePlanSkus.includes(sku)) {
          throw new BusinessRuleError(
            'PLAN_NOT_AVAILABLE_AT_ADDRESS',
            `${product.name} is not available at your address (max ${cart.serviceability.maxSpeedMbps} Mbps).`,
          );
        }
      } else if (product.requiresPlan) {
        const plan = items.find((i) => i.productType === PRODUCT_TYPES.PLAN);
        if (!plan) throw new BusinessRuleError('PLAN_REQUIRED', `Add a broadband plan before adding ${product.name}.`);
        if (product.compatiblePlanSkus.length && !product.compatiblePlanSkus.includes(plan.sku)) {
          throw new BusinessRuleError('ADDON_INCOMPATIBLE', `${product.name} is not compatible with ${plan.name}.`);
        }
      }
      if (newQuantity > product.maxQuantity) {
        throw new BusinessRuleError('MAX_QUANTITY_EXCEEDED', `You can order at most ${product.maxQuantity} of ${product.name}.`, {
          maxQuantity: product.maxQuantity,
        });
      }
      if (product.stockOnHand != null && product.stockOnHand < newQuantity) {
        throw new BusinessRuleError('OUT_OF_STOCK', `${product.name} is out of stock.`, { available: product.stockOnHand });
      }

      if (existing) {
        items = items.map((i) => (i.sku === sku ? { ...itemFromProduct(product, newQuantity), addedAt: i.addedAt } : i));
      } else {
        if (items.length >= MAX_DISTINCT_ITEMS) {
          throw new BusinessRuleError('CART_FULL', `A cart can hold at most ${MAX_DISTINCT_ITEMS} different items.`);
        }
        items.push({ ...itemFromProduct(product, quantity), addedAt: now() });
      }

      const catalogue = await catalogueFor(items);
      const pruned = pruneIncompatible(items, catalogue);
      const saved = await save(cart, { items: pruned.items });
      const result = await view(saved);
      if (pruned.removed.length) {
        result.warnings.push({ code: 'ADDONS_REMOVED', skus: pruned.removed, message: 'Some add-ons were removed because they do not work with the new plan.' });
      }
      return result;
    },

    async updateItem(cartId, sku, { quantity }, principal, guestToken) {
      const cart = await load(cartId, principal, guestToken);
      const item = cart.items.find((i) => i.sku === sku);
      if (!item) throw new NotFoundError('Cart item', sku);

      let items;
      if (quantity === 0) {
        items = cart.items.filter((i) => i.sku !== sku);
      } else {
        const product = await products.findBySku(sku);
        if (product && quantity > product.maxQuantity) {
          throw new BusinessRuleError('MAX_QUANTITY_EXCEEDED', `You can order at most ${product.maxQuantity}.`);
        }
        if (item.productType === PRODUCT_TYPES.PLAN && cart.segment === SEGMENTS.CONSUMER && quantity > 1) {
          throw new BusinessRuleError('PLAN_QUANTITY_LIMIT', 'Consumer orders include a single broadband plan.');
        }
        items = cart.items.map((i) => (i.sku === sku ? { ...i, quantity } : i));
      }
      const catalogue = await catalogueFor(items);
      const pruned = pruneIncompatible(items, catalogue);
      return view(await save(cart, { items: pruned.items }));
    },

    async setContractTerm(cartId, { contractTermMonths }, principal, guestToken) {
      const cart = await load(cartId, principal, guestToken);
      if (cart.segment === SEGMENTS.BUSINESS && contractTermMonths === 0) {
        throw new BusinessRuleError('TERM_REQUIRED', 'Business plans require a 12, 24 or 36 month term.');
      }
      return view(await save(cart, { contractTermMonths }));
    },

    /** Sets the service address and stores a serviceability snapshot. */
    async setServiceAddress(cartId, { address }, principal, guestToken) {
      const cart = await load(cartId, principal, guestToken);
      const check = await serviceability.check(address, { segment: cart.segment });
      const snapshot = {
        checkId: check.checkId,
        serviceable: check.serviceable,
        maxSpeedMbps: check.maxDownloadMbps,
        availablePlanSkus: check.availablePlanSkus,
        checkedAt: now(),
      };
      return view(await save(cart, { serviceAddress: check.address, serviceability: snapshot }));
    },

    async applyPromo(cartId, { code }, principal, guestToken) {
      const cart = await load(cartId, principal, guestToken);
      const evaluation = await promoService.evaluate(code, {
        segment: cart.segment,
        accountId: cart.accountId,
        skus: cart.items.map((i) => i.sku),
        monthlySubtotal: cart.items.reduce((a, i) => a + i.unitMonthly * i.quantity, 0),
        contractTermMonths: cart.contractTermMonths,
      });
      if (!evaluation.ok) throw new BusinessRuleError(evaluation.code, evaluation.message);
      return view(await save(cart, { promoCode: evaluation.promo.code }));
    },

    async removePromo(cartId, principal, guestToken) {
      const cart = await load(cartId, principal, guestToken);
      return view(await save(cart, { promoCode: null }));
    },

    /**
     * Attaches a guest cart to the signed-in user. If the user already has an
     * open cart in the same segment the guest items are merged into it.
     */
    async claim(cartId, guestToken, principal) {
      const guest = await carts.findById(cartId);
      if (!guest || guest.status !== 'OPEN') throw new NotFoundError('Cart', cartId);
      if (guest.userId) {
        if (guest.userId === principal.id) return view(guest);
        throw new ForbiddenError('This cart belongs to another user.');
      }
      if (!tokensMatch(guestToken, guest.guestToken)) throw new ForbiddenError('A valid cart token is required.');

      const existing = await carts.findOpenByUser(principal.id);
      if (existing && existing.segment === guest.segment) {
        const merged = [...existing.items];
        for (const item of guest.items) {
          if (item.productType === PRODUCT_TYPES.PLAN) {
            const withoutPlan = merged.filter((i) => i.productType !== PRODUCT_TYPES.PLAN);
            merged.length = 0;
            merged.push(...withoutPlan, item);
          } else if (!merged.some((i) => i.sku === item.sku)) {
            merged.push(item);
          }
        }
        await carts.updateVersioned(guest.id, guest.version, { status: 'ABANDONED' });
        const saved = await save(existing, {
          items: merged,
          serviceAddress: guest.serviceAddress || existing.serviceAddress,
          serviceability: guest.serviceability || existing.serviceability,
          promoCode: guest.promoCode || existing.promoCode,
        });
        return view(saved);
      }
      return view(
        await save(guest, { userId: principal.id, accountId: principal.accountId, guestToken: null }),
      );
    },

    async markCheckedOut(cartId) {
      await carts.markCheckedOut(cartId);
    },

    /** Loads an open cart for checkout, enforcing ownership. */
    async loadForCheckout(cartId, principal) {
      const cart = await load(cartId, principal, null);
      if (!cart.userId || cart.userId !== principal.id) {
        throw new ForbiddenError('Sign in and claim the cart before checking out.');
      }
      return cart;
    },
  };
}

module.exports = { createCartService, MAX_DISTINCT_ITEMS };
```

## apps/ecom-gokinetic/server/src/services/cartService.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/cartService.test.js`.

```javascript
'use strict';

const { createWorld, principals } = require('../../tests/support/world');
const { ADDRESS } = require('../../tests/support/fakes');

const { consumer } = principals;

describe('cartService', () => {
  let world;
  let carts;
  beforeEach(() => {
    world = createWorld({
      serviceabilityByZip: { 10001: { serviceable: true, maxDownloadMbps: 500 }, 99501: { serviceable: false } },
      promos: [{ code: 'FREEINSTALL', kind: 'FREE_INSTALLATION', segments: ['CONSUMER'] }],
    });
    carts = world.services.cartService;
  });

  test('guest carts are only reachable with their token', async () => {
    const { cart, guestToken } = await carts.create({ segment: 'CONSUMER' }, null);
    expect(guestToken).toMatch(/^[a-f0-9]{48}$/);
    await expect(carts.get(cart.id, null, 'wrong-token')).rejects.toMatchObject({ status: 403 });
    await expect(carts.get(cart.id, null, guestToken)).resolves.toMatchObject({ id: cart.id });
  });

  test('a signed-in shopper reuses their open cart', async () => {
    const first = await carts.create({ segment: 'CONSUMER' }, consumer);
    const second = await carts.create({ segment: 'CONSUMER' }, consumer);
    expect(second.cart.id).toBe(first.cart.id);
    expect(second.guestToken).toBeNull();
  });

  test('refuses a cart for the other storefront', async () => {
    await expect(carts.create({ segment: 'BUSINESS' }, consumer)).rejects.toMatchObject({ code: 'SEGMENT_MISMATCH' });
  });

  test('swapping plans removes add-ons the new plan does not support', async () => {
    const { cart } = await carts.create({ segment: 'CONSUMER' }, consumer);
    await carts.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, consumer, null);
    await carts.addItem(cart.id, { sku: 'ADD-STATIC-IP', quantity: 1 }, consumer, null);
    const view = await carts.addItem(cart.id, { sku: 'GK-FIBRE-500', quantity: 1 }, consumer, null);
    expect(view.items.map((i) => i.sku)).toEqual(['GK-FIBRE-500']);
    expect(view.warnings).toContainEqual(expect.objectContaining({ code: 'ADDONS_REMOVED', skus: ['ADD-STATIC-IP'] }));
  });

  test.each([
    ['ADD-STATIC-IP', 1, 'PLAN_REQUIRED'],
    ['GK-FIBRE-1000', 2, 'PLAN_QUANTITY_LIMIT'],
    ['BGK-FIBRE-1000', 1, 'PRODUCT_NOT_IN_SEGMENT'],
    ['HW-MESH-EXTENDER', 3, 'OUT_OF_STOCK'],
  ])('adding %s x%i fails with %s', async (sku, quantity, code) => {
    const { cart } = await carts.create({ segment: 'CONSUMER' }, consumer);
    await expect(carts.addItem(cart.id, { sku, quantity }, consumer, null)).rejects.toMatchObject({ code });
  });

  test('address with a slower line blocks a faster plan', async () => {
    const { cart } = await carts.create({ segment: 'CONSUMER' }, consumer);
    await carts.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, consumer, null);
    const view = await carts.setServiceAddress(cart.id, { address: { ...ADDRESS, state: 'NY', postalCode: '10001' } }, consumer, null);
    expect(view.serviceability.availablePlanSkus).toEqual(['GK-FIBRE-500']);
    expect(view.warnings).toContainEqual(expect.objectContaining({ code: 'PLAN_NOT_AVAILABLE_AT_ADDRESS' }));
    expect(view.readyForCheckout).toBe(false);
    await expect(carts.addItem(cart.id, { sku: 'GK-FIBRE-2000', quantity: 1 }, consumer, null)).rejects.toMatchObject({
      code: 'PLAN_NOT_AVAILABLE_AT_ADDRESS',
    });
  });

  test('a qualified address with a plan is ready for checkout and taxed by state', async () => {
    const { cart } = await carts.create({ segment: 'CONSUMER' }, consumer);
    await carts.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, consumer, null);
    const view = await carts.setServiceAddress(cart.id, { address: ADDRESS }, consumer, null);
    expect(view.readyForCheckout).toBe(true);
    expect(view.serviceAddress.line1).toBe('12 MAIN ST');
    expect(view.pricing.taxBps).toBe(625);
  });

  test('promo codes are validated before being stored', async () => {
    const { cart } = await carts.create({ segment: 'CONSUMER' }, consumer);
    await carts.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, consumer, null);
    const noContract = await carts.setContractTerm(cart.id, { contractTermMonths: 0 }, consumer, null);
    expect(noContract.pricing.dueToday).toBe(9900);
    await expect(carts.applyPromo(cart.id, { code: 'NOPE-CODE' }, consumer, null)).rejects.toMatchObject({ code: 'PROMO_NOT_FOUND' });
    const view = await carts.applyPromo(cart.id, { code: 'FREEINSTALL' }, consumer, null);
    expect(view.promoCode).toBe('FREEINSTALL');
    expect(view.pricing.dueToday).toBe(0);
  });

  test('concurrent edits surface as a 409 version conflict', async () => {
    const { cart } = await carts.create({ segment: 'CONSUMER' }, consumer);
    world.repos.carts.updateVersioned = async () => null;
    await expect(carts.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, consumer, null)).rejects.toMatchObject({
      status: 409,
      extensions: { code: 'CART_VERSION_CONFLICT' },
    });
  });

  test('claiming a guest cart merges it into the shopper\'s open cart', async () => {
    const mine = await carts.create({ segment: 'CONSUMER' }, consumer);
    await carts.addItem(mine.cart.id, { sku: 'GK-FIBRE-500', quantity: 1 }, consumer, null);
    const guest = await carts.create({ segment: 'CONSUMER' }, null);
    await carts.addItem(guest.cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, null, guest.guestToken);
    await carts.addItem(guest.cart.id, { sku: 'ADD-STATIC-IP', quantity: 1 }, null, guest.guestToken);

    const merged = await carts.claim(guest.cart.id, guest.guestToken, consumer);
    expect(merged.id).toBe(mine.cart.id);
    expect(merged.items.map((i) => i.sku).sort()).toEqual(['ADD-STATIC-IP', 'GK-FIBRE-1000']);
    expect(world.repos.carts.rows.get(guest.cart.id).status).toBe('ABANDONED');
  });
});
```

## apps/ecom-gokinetic/server/src/services/catalogService.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/catalogService.js`.

```javascript
'use strict';

const { NotFoundError, ValidationError } = require('../errors');
const { PRODUCT_TYPES } = require('../domain/constants');

/**
 * Catalogue browsing and administration.
 */
function createCatalogService({ products, serviceability }) {
  /** Business rules that the schema alone cannot express. */
  function assertProductRules(product) {
    const errors = [];
    if (product.type === PRODUCT_TYPES.PLAN) {
      if (!product.speedMbps) errors.push({ path: 'speedMbps', message: 'Plans require a download speed.' });
      if (product.monthlyPrice <= 0) errors.push({ path: 'monthlyPrice', message: 'Plans must have a monthly price.' });
      if (product.requiresPlan) errors.push({ path: 'requiresPlan', message: 'A plan cannot require a plan.' });
      if (product.uploadMbps && product.speedMbps && product.uploadMbps > product.speedMbps) {
        errors.push({ path: 'uploadMbps', message: 'Upload speed cannot exceed download speed.' });
      }
    }
    if (product.type === PRODUCT_TYPES.HARDWARE && product.monthlyPrice > 0 && product.oneTimePrice > 0) {
      errors.push({ path: 'oneTimePrice', message: 'Hardware is either rented monthly or bought outright, not both.' });
    }
    if (product.type !== PRODUCT_TYPES.PLAN && product.compatiblePlanSkus.length > 0 && !product.requiresPlan) {
      errors.push({ path: 'requiresPlan', message: 'Items restricted to plans must set requiresPlan.' });
    }
    if (errors.length) throw new ValidationError(errors);
  }

  return {
    /**
     * Lists products. When `serviceabilityCheckId` is given, plans are limited
     * to those the address can support.
     */
    async list(query, { serviceabilityCheckId } = {}) {
      const criteria = {
        segment: query.segment,
        type: query.type,
        minSpeedMbps: query.minSpeedMbps,
        maxMonthlyPrice: query.maxMonthlyPrice,
        search: query.search,
      };
      if (serviceabilityCheckId) {
        const check = await serviceability.getCheck(serviceabilityCheckId);
        if (query.type === PRODUCT_TYPES.PLAN || !query.type) {
          criteria.type = PRODUCT_TYPES.PLAN;
          criteria.onlySkus = check.availablePlanSkus;
        }
      }
      return products.list(criteria, { page: query.page, pageSize: query.pageSize, sort: query.sort });
    },

    async getBySku(sku) {
      const product = await products.findBySku(sku);
      if (!product || !product.active) throw new NotFoundError('Product', sku);
      return product;
    },

    /** Product detail plus add-ons/hardware that can be bundled with a plan. */
    async getWithBundleOptions(sku, segment) {
      const product = await this.getBySku(sku);
      if (product.type !== PRODUCT_TYPES.PLAN) return { product, addons: [] };
      const addons = await products.listCompatibleAddons(product.sku, segment || product.segments[0]);
      return { product, addons };
    },

    /**
     * Side-by-side comparison of up to four plans with derived metrics
     * (price per Mbps) to help shoppers choose.
     */
    async compare(skus) {
      if (skus.length < 2 || skus.length > 4) {
        throw new ValidationError([{ path: 'skus', message: 'Compare between 2 and 4 plans.' }]);
      }
      const found = await products.findActiveBySkus(skus);
      const missing = skus.filter((s) => !found.some((p) => p.sku === s));
      if (missing.length) throw new NotFoundError('Product', missing.join(','));
      const plans = found.filter((p) => p.type === PRODUCT_TYPES.PLAN);
      if (plans.length !== found.length) {
        throw new ValidationError([{ path: 'skus', message: 'Only plans can be compared.' }]);
      }
      const cheapest = Math.min(...plans.map((p) => p.monthlyPrice));
      const fastest = Math.max(...plans.map((p) => p.speedMbps));
      return plans
        .sort((a, b) => a.speedMbps - b.speedMbps)
        .map((p) => ({
          sku: p.sku,
          name: p.name,
          speedMbps: p.speedMbps,
          uploadMbps: p.uploadMbps,
          monthlyPrice: p.monthlyPrice,
          installationFee: p.installationFee,
          // cents per Mbps, rounded to the nearest cent
          centsPerMbps: Math.round(p.monthlyPrice / p.speedMbps),
          isCheapest: p.monthlyPrice === cheapest,
          isFastest: p.speedMbps === fastest,
          features: p.features,
        }));
    },

    async upsert(product) {
      assertProductRules(product);
      return products.upsert(product);
    },

    async deactivate(sku) {
      const updated = await products.deactivate(sku);
      if (!updated) throw new NotFoundError('Product', sku);
      return updated;
    },
  };
}

module.exports = { createCatalogService };
```

## apps/ecom-gokinetic/server/src/services/checkoutService.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/checkoutService.js`.

```javascript
'use strict';

const { BusinessRuleError, PaymentDeclinedError } = require('../errors');
const { ORDER_STATUS, PAYMENT_STATUS, PRODUCT_TYPES } = require('../domain/constants');
const { orderStateMachine } = require('../domain/stateMachine');
const { generateOrderNumber } = require('../domain/identifiers');
const { logger } = require('../config/logger');

const BLOCKING_WARNINGS = new Set([
  'ADDRESS_NOT_SERVICEABLE',
  'PLAN_NOT_AVAILABLE_AT_ADDRESS',
  'ITEM_UNAVAILABLE',
]);

/**
 * Turns an open cart into a SUBMITTED order.
 *
 * The saga, with compensation on failure:
 *   1. re-price the cart and refuse if anything blocks checkout
 *   2. re-confirm serviceability (refreshing an expired check)
 *   3. reserve hardware stock                    -> release on failure
 *   4. persist the order as DRAFT
 *   5. authorise the due-today amount            -> cancel order on decline
 *   6. redeem the promo code                     -> void auth on failure
 *   7. DRAFT -> SUBMITTED, close the cart, send confirmation
 */
function createCheckoutService({
  cartService,
  serviceability,
  products,
  orders,
  promoService,
  paymentGateway,
  notifier,
  now = () => new Date(),
  log = logger,
}) {
  async function reserveHardware(items) {
    const reserved = [];
    for (const item of items.filter((i) => i.productType === PRODUCT_TYPES.HARDWARE)) {
      const ok = await products.reserveStock(item.sku, item.quantity);
      if (!ok) {
        await releaseHardware(reserved);
        throw new BusinessRuleError('OUT_OF_STOCK', `${item.name} sold out while you were checking out.`, { sku: item.sku });
      }
      reserved.push(item);
    }
    return reserved;
  }

  async function releaseHardware(items) {
    await Promise.all(items.map((i) => products.releaseStock(i.sku, i.quantity)));
  }

  async function confirmServiceability(cart) {
    let check = await serviceability.getCheck(cart.serviceability.checkId, { segment: cart.segment });
    if (serviceability.isExpired(check)) {
      check = await serviceability.check(cart.serviceAddress, { segment: cart.segment, forceRefresh: true });
    }
    const planSkus = cart.items.filter((i) => i.productType === PRODUCT_TYPES.PLAN).map((i) => i.sku);
    serviceability.assertPlansDeliverable(check, planSkus);
    return check;
  }

  async function cancelDraft(order, reason) {
    const entry = orderStateMachine.transition(order, ORDER_STATUS.CANCELLED, { reason, at: now() });
    await orders.transition(order.orderNumber, ORDER_STATUS.DRAFT, entry, { cancellationReason: reason });
  }

  return {
    /**
     * @param {object} principal authenticated user
     * @param {object} input validated checkout body
     * @returns {Promise<object>} the submitted order
     */
    async placeOrder(principal, input) {
      const cart = await cartService.loadForCheckout(input.cartId, principal);
      const view = await cartService.view(cart);

      if (!view.items.some((i) => i.productType === PRODUCT_TYPES.PLAN)) {
        throw new BusinessRuleError('PLAN_REQUIRED', 'Add a broadband plan to your cart before checking out.');
      }
      if (!cart.serviceAddress || !cart.serviceability) {
        throw new BusinessRuleError('SERVICE_ADDRESS_REQUIRED', 'Check your address before checking out.');
      }
      const blocking = view.warnings.filter((w) => BLOCKING_WARNINGS.has(w.code));
      if (blocking.length) {
        throw new BusinessRuleError(blocking[0].code, blocking[0].message, { warnings: blocking });
      }
      const promoProblem = view.warnings.find((w) => w.promoCode);
      if (promoProblem) {
        throw new BusinessRuleError(promoProblem.code, `${promoProblem.message} Remove the code to continue.`);
      }

      const check = await confirmServiceability({ ...cart, items: view.items });
      const reserved = await reserveHardware(view.items);

      const orderNumber = generateOrderNumber(now());
      const pricing = view.pricing;
      let order;
      try {
        order = await orders.create({
          orderNumber,
          accountId: principal.accountId,
          userId: principal.id,
          segment: cart.segment,
          status: ORDER_STATUS.DRAFT,
          statusHistory: [{ from: null, to: ORDER_STATUS.DRAFT, at: now(), actor: principal.id }],
          items: view.items.map(({ addedAt, ...item }) => item),
          contractTermMonths: cart.contractTermMonths,
          serviceAddress: cart.serviceAddress,
          billingAddress: input.billingAddress || cart.serviceAddress,
          contact: input.contact,
          promoCode: pricing.promo && pricing.promo.applied ? cart.promoCode : null,
          pricing,
          currency: pricing.currency,
          dueToday: pricing.dueToday,
          monthlyRecurring: pricing.recurring.total,
          preferredInstallDate: input.preferredInstallDate || null,
          serviceabilityCheckId: check.checkId,
          cartId: cart.id,
          payment: { status: PAYMENT_STATUS.PENDING },
        });
      } catch (err) {
        await releaseHardware(reserved);
        throw err;
      }

      let authorization;
      try {
        authorization = await paymentGateway.authorize({
          orderNumber,
          amount: pricing.dueToday,
          currency: pricing.currency,
          paymentToken: input.paymentToken,
          customerEmail: input.contact.email,
        });
      } catch (err) {
        await releaseHardware(reserved);
        const reason = err instanceof PaymentDeclinedError ? 'Payment declined' : 'Payment authorisation failed';
        await cancelDraft(order, reason);
        await orders.updatePayment(orderNumber, {
          status: PAYMENT_STATUS.FAILED,
          failureCode: err.extensions && err.extensions.declineCode ? err.extensions.declineCode : 'GATEWAY_ERROR',
        });
        log.warn('checkout.payment_failed', { orderNumber, reason });
        throw err;
      }

      if (order.promoCode) {
        try {
          await promoService.redeem({
            code: order.promoCode,
            accountId: principal.accountId,
            orderNumber,
            discountValue: pricing.promo.totalValue,
          });
        } catch (err) {
          if (authorization.reference) {
            await paymentGateway.void({ reference: authorization.reference, orderNumber }).catch(() => {});
          }
          await releaseHardware(reserved);
          await cancelDraft(order, 'Promo code could not be redeemed');
          throw err;
        }
      }

      const entry = orderStateMachine.transition(order, ORDER_STATUS.SUBMITTED, { actor: principal.id, at: now() });
      const submitted = await orders.transition(orderNumber, ORDER_STATUS.DRAFT, entry, {
        submittedAt: now(),
        payment: {
          status: authorization.status === 'NOT_REQUIRED' ? PAYMENT_STATUS.NOT_REQUIRED : PAYMENT_STATUS.AUTHORIZED,
          gatewayReference: authorization.reference,
          authorizedAmount: pricing.dueToday,
          capturedAmount: 0,
          refundedAmount: 0,
          last4: authorization.last4,
          brand: authorization.brand,
          failureCode: null,
        },
      });
      await cartService.markCheckedOut(cart.id);
      log.info('checkout.order_submitted', { orderNumber, dueToday: pricing.dueToday, segment: cart.segment });

      await notifier.send({
        template: 'ORDER_CONFIRMATION',
        to: submitted.contact.email,
        reference: orderNumber,
        data: { order: submitted },
        dedupe: true,
      });
      return submitted;
    },
  };
}

module.exports = { createCheckoutService };
```

## apps/ecom-gokinetic/server/src/services/checkoutService.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/checkoutService.test.js`.

```javascript
'use strict';

const { createWorld, placeOrder, principals } = require('../../tests/support/world');
const { PaymentDeclinedError } = require('../errors');

const { consumer } = principals;
const WITH_MESH = [
  { sku: 'GK-FIBRE-1000', quantity: 1 },
  { sku: 'HW-MESH-EXTENDER', quantity: 1 },
];

describe('checkoutService.placeOrder', () => {
  let world;
  beforeEach(() => {
    world = createWorld({
      promos: [{ code: 'FREEINSTALL', kind: 'FREE_INSTALLATION', segments: ['CONSUMER'], maxRedemptions: 10 }],
    });
  });

  test('submits the order, authorises due-today and closes the cart', async () => {
    const order = await placeOrder(world, consumer, { items: WITH_MESH });

    expect(order).toMatchObject({ status: 'SUBMITTED', dueToday: 24225, monthlyRecurring: 8500 });
    expect(order.orderNumber).toMatch(/^GK-\d{8}-[A-Z0-9]{6}$/);
    expect(order.payment).toMatchObject({ status: 'AUTHORIZED', authorizedAmount: 24225, last4: '4242' });
    expect(order.statusHistory.map((h) => h.to)).toEqual(['DRAFT', 'SUBMITTED']);
    expect(world.repos.products.rows.find((p) => p.sku === 'HW-MESH-EXTENDER').stockOnHand).toBe(1);
    expect(world.repos.carts.rows.get(order.cartId).status).toBe('CHECKED_OUT');
    expect(world.notifier.sent).toContainEqual(expect.objectContaining({ template: 'ORDER_CONFIRMATION', reference: order.orderNumber }));
  });

  test('a declined card cancels the draft and returns reserved stock', async () => {
    world.gateway.decline = new PaymentDeclinedError('The card has insufficient funds.', { declineCode: 'insufficient_funds' });
    await expect(placeOrder(world, consumer, { items: WITH_MESH })).rejects.toBeInstanceOf(PaymentDeclinedError);

    const [order] = [...world.repos.orders.rows.values()];
    expect(order.status).toBe('CANCELLED');
    expect(order.payment).toMatchObject({ status: 'FAILED', failureCode: 'insufficient_funds' });
    expect(world.repos.products.rows.find((p) => p.sku === 'HW-MESH-EXTENDER').stockOnHand).toBe(2);
    const cart = world.repos.carts.rows.get(order.cartId);
    expect(cart.status).toBe('OPEN');
  });

  test('a promo exhausted mid-checkout voids the authorisation', async () => {
    world.repos.promos.claimRedemption = async () => false;
    await expect(placeOrder(world, consumer, { promoCode: 'FREEINSTALL', items: WITH_MESH })).rejects.toMatchObject({
      code: 'PROMO_USAGE_EXHAUSTED',
    });
    const [order] = [...world.repos.orders.rows.values()];
    expect(order.status).toBe('CANCELLED');
    expect(world.gateway.calls.map(([name]) => name)).toEqual(['authorize', 'void']);
  });

  test('records the redemption when the promo applies', async () => {
    const order = await placeOrder(world, consumer, { promoCode: 'FREEINSTALL' });
    expect(order.promoCode).toBe('FREEINSTALL');
    expect(order.dueToday).toBe(0);
    expect(order.payment.status).toBe('NOT_REQUIRED');
    expect(world.repos.promos.redemptions).toHaveLength(1);
  });

  test('requires a checked address', async () => {
    const { cartService, checkoutService } = world.services;
    const { cart } = await cartService.create({ segment: 'CONSUMER' }, consumer);
    await cartService.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, consumer, null);
    await expect(
      checkoutService.placeOrder(consumer, { cartId: cart.id, paymentToken: 'tok_x', contact: {}, acceptTerms: true }),
    ).rejects.toMatchObject({ code: 'SERVICE_ADDRESS_REQUIRED' });
  });

  test('guest carts must be claimed before checkout', async () => {
    const { cartService, checkoutService } = world.services;
    const { cart } = await cartService.create({ segment: 'CONSUMER' }, null);
    await expect(
      checkoutService.placeOrder(consumer, { cartId: cart.id, paymentToken: 'tok_x', contact: {}, acceptTerms: true }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
```

## apps/ecom-gokinetic/server/src/services/installSchedulingService.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/installSchedulingService.js`.

```javascript
'use strict';

const { BusinessRuleError } = require('../errors');
const { listInstallSlots, preferredDateProblem, earliestInstallDate } = require('../domain/installWindows');

/**
 * Offers installation dates for a qualified address and vets the shopper's
 * preferred date before an order is placed.
 */
function createInstallSchedulingService({ serviceability, now = () => new Date() }) {
  return {
    async listSlots(checkId, { days = 14, segment } = {}) {
      const check = await serviceability.getCheck(checkId, { segment });
      if (!check.serviceable) {
        throw new BusinessRuleError('ADDRESS_NOT_SERVICEABLE', 'Fibre is not available at this address yet.');
      }
      return {
        checkId,
        requiresSiteSurvey: check.requiresSiteSurvey,
        earliestDate: earliestInstallDate(check, now()).toISOString().slice(0, 10),
        slots: listInstallSlots(check, now(), days),
      };
    },

    /**
     * Throws a 422 when the preferred date is not bookable for the cart's
     * serviceability check. A missing preference is always fine: the
     * field-force system then picks the first free slot.
     */
    async assertPreferredDate(checkId, preferredInstallDate) {
      if (!preferredInstallDate) return;
      const check = await serviceability.getCheck(checkId);
      const problem = preferredDateProblem(check, preferredInstallDate, now());
      if (problem) {
        throw new BusinessRuleError('INSTALL_DATE_UNAVAILABLE', problem, {
          earliestDate: earliestInstallDate(check, now()).toISOString().slice(0, 10),
        });
      }
    },
  };
}

module.exports = { createInstallSchedulingService };
```

## apps/ecom-gokinetic/server/src/services/invoiceService.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/invoiceService.js`.

```javascript
'use strict';

const { NotFoundError } = require('../errors');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../domain/constants');
const {
  INVOICE_STATUS,
  generateInvoiceNumber,
  buildInitialInvoice,
  buildRecurringInvoice,
  dueDate,
  displayStatus,
} = require('../domain/billing');
const { canAccessAccountResource } = require('../middleware/rbac');
const { logger } = require('../config/logger');

const BILLING_PAGE_SIZE = 100;

/**
 * Issues and serves customer invoices.
 *
 * Generation is idempotent: the repository refuses a second invoice for the
 * same order/kind/period, so the billing job and order pipeline can safely
 * retry after a crash.
 */
function createInvoiceService({
  invoices,
  orders,
  accounts,
  consumerDueDays = 14,
  now = () => new Date(),
  log = logger,
}) {
  async function persist(body, { paid }) {
    const issuedAt = now();
    const account = await accounts.findByAccountId(body.accountId);
    const { invoice, created } = await invoices.createIfAbsent({
      ...body,
      invoiceNumber: generateInvoiceNumber(issuedAt),
      status: paid ? INVOICE_STATUS.PAID : INVOICE_STATUS.ISSUED,
      issuedAt,
      paidAt: paid ? issuedAt : null,
      dueAt: dueDate(issuedAt, { creditTermsDays: account ? account.creditTermsDays : 0, consumerDueDays }),
    });
    return { invoice, created };
  }

  function present(invoice) {
    return { ...invoice, displayStatus: displayStatus(invoice, now()) };
  }

  return {
    /**
     * Issues the checkout invoice once payment has been captured (or the
     * order is on account credit). Returns the invoice or null if nothing
     * was due.
     */
    async issueInitial(order) {
      const body = buildInitialInvoice(order);
      if (!body) return null;
      const paid = order.payment && order.payment.status === PAYMENT_STATUS.CAPTURED;
      const { invoice, created } = await persist(body, { paid });
      if (created) log.info('invoice.issued', { invoiceNumber: invoice.invoiceNumber, kind: body.kind, total: body.total });
      return invoice;
    },

    /**
     * Issues the RECURRING invoice for the period containing `asOf` for
     * every ACTIVE order. Returns counts for observability.
     */
    async runBillingCycle(asOf = now()) {
      let page = 1;
      let issued = 0;
      let skipped = 0;
      let failed = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await orders.list({ status: ORDER_STATUS.ACTIVE }, { page, pageSize: BILLING_PAGE_SIZE });
        for (const order of batch.items) {
          try {
            if (!order.activatedAt || new Date(order.activatedAt) > asOf) {
              skipped += 1;
              continue;
            }
            const { created } = await persist(buildRecurringInvoice(order, asOf), { paid: false });
            if (created) issued += 1;
            else skipped += 1;
          } catch (err) {
            failed += 1;
            log.error('invoice.billing_failed', { orderNumber: order.orderNumber, error: err });
          }
        }
        if (page * batch.pageSize >= batch.total) break;
        page += 1;
      }
      log.info('invoice.billing_cycle', { asOf: asOf.toISOString(), issued, skipped, failed });
      return { issued, skipped, failed };
    },

    /** Voids unpaid invoices when an order is cancelled or fails. */
    async voidForOrder(orderNumber) {
      const voided = await invoices.voidOpenForOrder(orderNumber);
      if (voided) log.info('invoice.voided', { orderNumber, count: voided });
      return voided;
    },

    async list(principal, query) {
      const isStaff = principal.roles.includes('SUPPORT_AGENT');
      const accountId = isStaff && query.accountId ? query.accountId : principal.accountId;
      const page = await invoices.list(
        { accountId, status: query.status, orderNumber: query.orderNumber },
        { page: query.page, pageSize: query.pageSize },
      );
      return { ...page, items: page.items.map(present) };
    },

    async get(principal, invoiceNumber) {
      const invoice = await invoices.findByNumber(invoiceNumber);
      if (!invoice || !canAccessAccountResource(principal, invoice.accountId, 'order:read:any')) {
        throw new NotFoundError('Invoice', invoiceNumber);
      }
      return present(invoice);
    },
  };
}

module.exports = { createInvoiceService };
```

## apps/ecom-gokinetic/server/src/services/invoiceService.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/invoiceService.test.js`.

```javascript
'use strict';

const { createWorld, placeOrder, principals } = require('../../tests/support/world');

const { consumer, otherConsumer, agent } = principals;

describe('invoiceService', () => {
  let world;
  let invoices;
  let order;
  beforeEach(async () => {
    world = createWorld();
    invoices = world.services.invoiceService;
    const placed = await placeOrder(world, consumer);
    await world.services.orderService.processSubmitted(placed);
    order = await world.repos.orders.findByNumber(placed.orderNumber);
  });

  test('issues a paid initial invoice for captured checkout charges', async () => {
    const invoice = await invoices.issueInitial(order);
    expect(invoice).toMatchObject({ kind: 'INITIAL', status: 'PAID', total: 10519, orderNumber: order.orderNumber });
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{6}-[A-Z0-9]{6}$/);
    // Re-issuing is a no-op.
    await invoices.issueInitial(order);
    expect(world.repos.invoices.rows).toHaveLength(1);
  });

  test('the billing cycle invoices active services once per period', async () => {
    await world.services.orderService.advance(agent, order.orderNumber, { status: 'ACTIVE' });
    const asOf = new Date(Date.now() + 60000);
    expect(await invoices.runBillingCycle(asOf)).toEqual({ issued: 1, skipped: 0, failed: 0 });
    expect(await invoices.runBillingCycle(asOf)).toEqual({ issued: 0, skipped: 1, failed: 0 });
    const recurring = world.repos.invoices.rows.find((i) => i.kind === 'RECURRING');
    expect(recurring.status).toBe('ISSUED');
    expect(recurring.lines[0].sku).toBe('GK-FIBRE-1000');
  });

  test('cancellation voids open invoices', async () => {
    await world.services.orderService.advance(agent, order.orderNumber, { status: 'ACTIVE' });
    await invoices.runBillingCycle(new Date(Date.now() + 60000));
    expect(await invoices.voidForOrder(order.orderNumber)).toBe(1);
  });

  test('customers only see their own invoices', async () => {
    const invoice = await invoices.issueInitial(order);
    const page = await invoices.list(consumer, { page: 1, pageSize: 20 });
    expect(page.items.map((i) => i.invoiceNumber)).toEqual([invoice.invoiceNumber]);
    expect(page.items[0].displayStatus).toBe('PAID');
    await expect(invoices.get(otherConsumer, invoice.invoiceNumber)).rejects.toMatchObject({ status: 404 });
  });
});
```

## apps/ecom-gokinetic/server/src/services/orderService.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/orderService.js`.

```javascript
'use strict';

const { NotFoundError, ForbiddenError, BusinessRuleError } = require('../errors');
const { ORDER_STATUS, PAYMENT_STATUS, PRODUCT_TYPES } = require('../domain/constants');
const { orderStateMachine } = require('../domain/stateMachine');
const { buildTimeline, isSelfCancellable } = require('../domain/orderTracking');
const { canAccessAccountResource } = require('../middleware/rbac');
const { logger } = require('../config/logger');

const NOTIFY_ON = new Set([
  ORDER_STATUS.VALIDATED,
  ORDER_STATUS.PROVISIONING,
  ORDER_STATUS.ACTIVE,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.FAILED,
]);

/**
 * Order queries, customer cancellation, back-office status changes and the
 * post-submission validation pipeline used by the background job.
 */
function createOrderService({
  orders,
  accounts,
  products,
  promoService,
  paymentGateway,
  serviceability,
  serviceabilityApi,
  notifier,
  now = () => new Date(),
  log = logger,
}) {
  async function loadAuthorized(principal, orderNumber) {
    const order = await orders.findByNumber(orderNumber);
    if (!order) throw new NotFoundError('Order', orderNumber);
    if (!canAccessAccountResource(principal, order.accountId, 'order:read:any')) {
      // Do not leak existence of other accounts' orders.
      throw new NotFoundError('Order', orderNumber);
    }
    return order;
  }

  async function notify(order, status) {
    if (!NOTIFY_ON.has(status)) return;
    await notifier.send({
      template: 'ORDER_STATUS_CHANGED',
      to: order.contact.email,
      reference: `${order.orderNumber}:${status}`,
      data: { order, status },
      dedupe: true,
    });
  }

  /**
   * Returns money to the customer according to how far payment progressed:
   * void an authorisation, refund a capture, nothing otherwise.
   */
  async function settlePaymentOnExit(order, reason) {
    const p = order.payment || {};
    if (p.status === PAYMENT_STATUS.AUTHORIZED && p.gatewayReference) {
      await paymentGateway.void({ reference: p.gatewayReference, orderNumber: order.orderNumber });
      return { status: PAYMENT_STATUS.VOIDED };
    }
    if (p.status === PAYMENT_STATUS.CAPTURED && p.gatewayReference && p.capturedAmount > 0) {
      const refundable = p.capturedAmount - (p.refundedAmount || 0);
      if (refundable > 0) {
        await paymentGateway.refund({
          reference: p.gatewayReference,
          amount: refundable,
          orderNumber: order.orderNumber,
          reason,
        });
      }
      return { status: PAYMENT_STATUS.REFUNDED, refundedAmount: p.capturedAmount };
    }
    return null;
  }

  async function releaseResources(order) {
    const hardware = order.items.filter((i) => i.productType === PRODUCT_TYPES.HARDWARE);
    await Promise.all(hardware.map((i) => products.releaseStock(i.sku, i.quantity)));
    if (order.promoCode) await promoService.reverse(order.orderNumber);
  }

  /**
   * Applies a validated transition with compare-and-set semantics.
   * @returns {Promise<object>} updated order
   */
  async function applyTransition(order, to, { actor = 'system', reason, patch = {} } = {}) {
    const entry = orderStateMachine.transition(order, to, { actor, reason, at: now() });
    const updated = await orders.transition(order.orderNumber, order.status, entry, patch);
    if (!updated) {
      throw new BusinessRuleError('ORDER_CHANGED', 'The order changed while it was being updated. Reload and retry.');
    }
    log.info('order.transition', { orderNumber: order.orderNumber, from: order.status, to, actor });
    await notify(updated, to);
    return updated;
  }

  /** Exit path shared by cancellation and failure. */
  async function exitOrder(order, to, { actor, reason }) {
    const payment = await settlePaymentOnExit(order, reason);
    const patch = to === ORDER_STATUS.CANCELLED ? { cancellationReason: reason } : { failureReason: reason };
    if (payment) {
      patch['payment.status'] = payment.status;
      if (payment.refundedAmount) patch['payment.refundedAmount'] = payment.refundedAmount;
    }
    const updated = await applyTransition(order, to, { actor, reason, patch });
    await releaseResources(order);
    return updated;
  }

  return {
    async list(principal, query) {
      const accountId = principal.roles.includes('SUPPORT_AGENT') && query.accountId ? query.accountId : principal.accountId;
      return orders.list({ accountId, status: query.status }, { page: query.page, pageSize: query.pageSize });
    },

    async get(principal, orderNumber) {
      return loadAuthorized(principal, orderNumber);
    },

    /** Order plus tracking timeline. */
    async track(principal, orderNumber) {
      const order = await loadAuthorized(principal, orderNumber);
      let estimatedInstallDays = null;
      if (order.serviceabilityCheckId) {
        const check = await serviceability.getCheck(order.serviceabilityCheckId).catch(() => null);
        estimatedInstallDays = check ? check.estimatedInstallDays : null;
      }
      return {
        orderNumber: order.orderNumber,
        timeline: buildTimeline(order, { estimatedInstallDays }),
        canCancel: isSelfCancellable(order),
      };
    },

    async cancel(principal, orderNumber, { reason }) {
      const order = await loadAuthorized(principal, orderNumber);
      const isStaff = principal.roles.includes('SUPPORT_AGENT');
      if (!isStaff && order.accountId !== principal.accountId) throw new ForbiddenError();
      if (!isSelfCancellable(order)) {
        throw new BusinessRuleError(
          'ORDER_NOT_CANCELLABLE',
          'Installation is already under way. Please contact support to cancel this order.',
          { status: order.status },
        );
      }
      return exitOrder(order, ORDER_STATUS.CANCELLED, { actor: principal.id, reason });
    },

    /** Back-office manual status change. */
    async advance(principal, orderNumber, { status, reason }) {
      const order = await orders.findByNumber(orderNumber);
      if (!order) throw new NotFoundError('Order', orderNumber);
      if (status === ORDER_STATUS.CANCELLED || status === ORDER_STATUS.FAILED) {
        return exitOrder(order, status, { actor: principal.id, reason: reason || `Set to ${status} by support` });
      }
      const patch = {};
      if (status === ORDER_STATUS.ACTIVE) patch.activatedAt = now();
      const updated = await applyTransition(order, status, { actor: principal.id, reason, patch });
      if (status === ORDER_STATUS.ACTIVE) {
        await accounts.update(order.accountId, { existingCustomer: true });
      }
      return updated;
    },

    /**
     * Validation pipeline for a SUBMITTED order (run by the background job):
     * re-qualify the address, capture payment, book the installation and move
     * the order to PROVISIONING. Any hard failure fails the order and returns
     * the customer's money.
     * @returns {Promise<{orderNumber: string, outcome: string}>}
     */
    async processSubmitted(order) {
      const fail = async (reason) => {
        await exitOrder(order, ORDER_STATUS.FAILED, { actor: 'order-validation-job', reason });
        return { orderNumber: order.orderNumber, outcome: 'FAILED', reason };
      };

      let check;
      try {
        check = await serviceability.check(order.serviceAddress, { segment: order.segment, forceRefresh: true });
        const planSkus = order.items.filter((i) => i.productType === PRODUCT_TYPES.PLAN).map((i) => i.sku);
        serviceability.assertPlansDeliverable(check, planSkus);
      } catch (err) {
        if (err instanceof BusinessRuleError) return fail(err.detail);
        throw err; // upstream outage: leave SUBMITTED, retry next run
      }

      let current = order;
      if (order.payment.status === PAYMENT_STATUS.AUTHORIZED) {
        try {
          const capture = await paymentGateway.capture({
            reference: order.payment.gatewayReference,
            amount: order.payment.authorizedAmount,
            orderNumber: order.orderNumber,
          });
          current = await orders.updatePayment(order.orderNumber, {
            status: PAYMENT_STATUS.CAPTURED,
            capturedAmount: capture.capturedAmount,
          });
        } catch (err) {
          if (err.status === 402) return fail('Payment capture was declined');
          throw err;
        }
      }

      current = await applyTransition(current, ORDER_STATUS.VALIDATED, {
        actor: 'order-validation-job',
        patch: { serviceabilityCheckId: check.checkId },
      });

      const slot = await serviceabilityApi
        .reserveInstallSlot({
          upstreamReference: check.upstreamReference || check.checkId,
          preferredDate: order.preferredInstallDate ? new Date(order.preferredInstallDate) : null,
          orderNumber: order.orderNumber,
        })
        .catch((err) => {
          log.warn('order.install_slot_failed', { orderNumber: order.orderNumber, error: err.message });
          return null;
        });
      if (!slot || !slot.scheduledFor) {
        return { orderNumber: order.orderNumber, outcome: 'VALIDATED' };
      }
      await applyTransition(current, ORDER_STATUS.PROVISIONING, {
        actor: 'order-validation-job',
        patch: { installAppointment: slot.scheduledFor },
      });
      return { orderNumber: order.orderNumber, outcome: 'PROVISIONING' };
    },
  };
}

module.exports = { createOrderService };
```
