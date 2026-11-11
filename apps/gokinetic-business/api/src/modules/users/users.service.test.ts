import { BusinessRuleError, ConflictError, InvalidStateTransitionError } from '../../lib/errors';
import { ACCOUNT_ID, ADMIN_ID, SITE_A, SITE_B, adminCtx, makeSite, passthroughDb, recordingAudit } from '../../test/fixtures';
import { InventoryRepository } from '../inventory/inventory.repository';
import { UsersRepository } from './users.repository';
import { UsersService, resolveSiteScope } from './users.service';
import { BusinessUser } from './users.types';

const TARGET = '44444444-4444-4444-8444-444444444444';

function makeUser(overrides: Partial<BusinessUser> = {}): BusinessUser {
  return {
    id: TARGET,
    accountId: ACCOUNT_ID,
    email: 'jo@acme.example',
    firstName: 'Jo',
    lastName: 'Bloggs',
    role: 'BUSINESS_USER',
    status: 'ACTIVE',
    siteScope: null,
    invitedBy: ADMIN_ID,
    lastLoginAt: null,
    version: 3,
    createdAt: '2024-02-01T00:00:00.000Z',
    ...overrides
  };
}

function setup() {
  const repo: jest.Mocked<UsersRepository> = {
    list: jest.fn(),
    find: jest.fn(),
    findByEmail: jest.fn(async () => null),
    countActiveAdmins: jest.fn(async () => 2),
    countSeats: jest.fn(async () => 5),
    insert: jest.fn(async (u) => makeUser({ ...u, status: 'INVITED', version: 1 })),
    update: jest.fn(async (_a, _id, _v, patch) => makeUser({ ...patch }))
  };
  const inventory = {
    findSitesByIds: jest.fn(async (_acc: string, ids: string[]) => ids.map((id) => makeSite({ id })))
  } as unknown as jest.Mocked<InventoryRepository>;
  const invitations = { sendInvitation: jest.fn(async () => undefined) };
  const audit = recordingAudit();
  const service = new UsersService(passthroughDb(), repo, inventory, invitations, audit);
  return { repo, inventory, invitations, audit, service };
}

describe('resolveSiteScope', () => {
  it('returns null for admins', () => {
    expect(resolveSiteScope('BUSINESS_ADMIN', null)).toBeNull();
  });
  it('rejects a scoped admin', () => {
    expect(() => resolveSiteScope('BUSINESS_ADMIN', [SITE_A])).toThrow(BusinessRuleError);
  });
  it('deduplicates user scopes', () => {
    expect(resolveSiteScope('BUSINESS_USER', [SITE_A, SITE_A, SITE_B])).toEqual([SITE_A, SITE_B]);
  });
  it('rejects an explicitly empty scope', () => {
    expect(() => resolveSiteScope('BUSINESS_USER', [])).toThrow(BusinessRuleError);
  });
});

describe('UsersService.invite', () => {
  const input = { email: 'new@acme.example', firstName: 'New', lastName: 'Person', role: 'BUSINESS_USER' as const };

  it('creates an invited user and sends the invitation', async () => {
    const { service, invitations, audit } = setup();
    const user = await service.invite(adminCtx(), { ...input, siteScope: [SITE_A] });
    expect(user.status).toBe('INVITED');
    expect(invitations.sendInvitation).toHaveBeenCalledWith(user, 'admin@acme.example');
    expect(audit.entries[0].action).toBe('user.invited');
  });

  it('rejects an email that already has access', async () => {
    const { service, repo } = setup();
    repo.findByEmail.mockResolvedValue(makeUser());
    await expect(service.invite(adminCtx(), input)).rejects.toBeInstanceOf(ConflictError);
  });

  it('re-invites a previously deactivated user', async () => {
    const { service, repo, audit } = setup();
    repo.findByEmail.mockResolvedValue(makeUser({ status: 'DEACTIVATED' }));
    await service.invite(adminCtx(), input);
    expect(repo.update).toHaveBeenCalledWith(ACCOUNT_ID, TARGET, 3, expect.objectContaining({ status: 'INVITED' }), expect.anything());
    expect(audit.entries[0].action).toBe('user.reinvited');
  });

  it('enforces the seat limit', async () => {
    const { service, repo } = setup();
    repo.countSeats.mockResolvedValue(250);
    await expect(service.invite(adminCtx(), input)).rejects.toMatchObject({ code: 'business-rule/seat-limit' });
  });

  it('rejects decommissioned sites in the scope', async () => {
    const { service, inventory } = setup();
    (inventory.findSitesByIds as jest.Mock).mockResolvedValue([makeSite({ id: SITE_A, status: 'DECOMMISSIONED' })]);
    await expect(service.invite(adminCtx(), { ...input, siteScope: [SITE_A] })).rejects.toMatchObject({
      code: 'business-rule/invalid-site-scope'
    });
  });

  it('still returns the user when invitation delivery fails', async () => {
    const { service, invitations } = setup();
    invitations.sendInvitation.mockRejectedValue(new Error('smtp down'));
    await expect(service.invite(adminCtx(), input)).resolves.toMatchObject({ email: 'new@acme.example' });
  });
});

describe('UsersService.changeRole', () => {
  it('prevents changing your own role', async () => {
    const { service } = setup();
    await expect(service.changeRole(adminCtx(), ADMIN_ID, { role: 'BUSINESS_USER', version: 1 })).rejects.toMatchObject({
      code: 'business-rule/self-role-change'
    });
  });

  it('prevents demoting the last active admin', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue(makeUser({ role: 'BUSINESS_ADMIN' }));
    repo.countActiveAdmins.mockResolvedValue(1);
    await expect(service.changeRole(adminCtx(), TARGET, { role: 'BUSINESS_USER', version: 3 })).rejects.toMatchObject({
      code: 'business-rule/last-admin'
    });
  });

  it('promotes a user to admin and clears the scope', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue(makeUser({ siteScope: [SITE_A] }));
    await service.changeRole(adminCtx(), TARGET, { role: 'BUSINESS_ADMIN', version: 3 });
    expect(repo.update).toHaveBeenCalledWith(ACCOUNT_ID, TARGET, 3, { role: 'BUSINESS_ADMIN', siteScope: null }, expect.anything());
  });
});

describe('UsersService.transition', () => {
  it('suspends an active user', async () => {
    const { service, repo, audit } = setup();
    repo.find.mockResolvedValue(makeUser());
    await service.transition(adminCtx(), TARGET, 'suspend', 3);
    expect(repo.update).toHaveBeenCalledWith(ACCOUNT_ID, TARGET, 3, { status: 'SUSPENDED' }, expect.anything());
    expect(audit.entries[0].action).toBe('user.suspended');
  });

  it('rejects reactivating an active user', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue(makeUser());
    await expect(service.transition(adminCtx(), TARGET, 'reactivate', 3)).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('prevents deactivating the last admin', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue(makeUser({ role: 'BUSINESS_ADMIN' }));
    repo.countActiveAdmins.mockResolvedValue(1);
    await expect(service.transition(adminCtx(), TARGET, 'deactivate', 3)).rejects.toMatchObject({
      code: 'business-rule/last-admin'
    });
  });

  it('allows revoking a pending invitation', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue(makeUser({ status: 'INVITED' }));
    await service.transition(adminCtx(), TARGET, 'deactivate', 3);
    expect(repo.update).toHaveBeenCalledWith(ACCOUNT_ID, TARGET, 3, { status: 'DEACTIVATED' }, expect.anything());
  });

  it('prevents acting on yourself', async () => {
    const { service } = setup();
    await expect(service.transition(adminCtx(), ADMIN_ID, 'suspend', 1)).rejects.toBeInstanceOf(BusinessRuleError);
  });
});
