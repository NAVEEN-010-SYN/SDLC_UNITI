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
