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
