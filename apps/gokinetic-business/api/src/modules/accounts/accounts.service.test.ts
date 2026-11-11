import { BusinessRuleError, ForbiddenError } from '../../lib/errors';
import { ACCOUNT_ID, adminCtx, passthroughDb, recordingAudit, userCtx } from '../../test/fixtures';
import { Account, AccountsRepository } from './accounts.repository';
import { AccountsService, MAX_APPROVAL_THRESHOLD_MINOR } from './accounts.service';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return { id: ACCOUNT_ID, name: 'Acme Ltd', status: 'ACTIVE', currency: 'GBP', slaTier: 'ENHANCED', approvalThresholdMinor: 100_000, ...overrides };
}

function setup(account = makeAccount()) {
  const repo: jest.Mocked<AccountsRepository> = {
    get: jest.fn(async () => account),
    updateApprovalThreshold: jest.fn(async (_id, threshold) => ({ ...account, approvalThresholdMinor: threshold }))
  };
  const audit = recordingAudit();
  return { repo, audit, service: new AccountsService(passthroughDb(), repo, audit) };
}

describe('AccountsService.me', () => {
  it('returns derived permissions for a business user', async () => {
    const { service } = setup();
    const me = await service.me(userCtx());
    expect(me.permissions).toContain('orders:create');
    expect(me.permissions).not.toContain('users:manage');
    expect(me.account.name).toBe('Acme Ltd');
    expect(me.siteScope).toEqual(userCtx().siteScope);
  });
});

describe('AccountsService.updateApprovalThreshold', () => {
  it('updates and audits the change', async () => {
    const { service, audit } = setup();
    const updated = await service.updateApprovalThreshold(adminCtx(), 250_000);
    expect(updated.approvalThresholdMinor).toBe(250_000);
    expect(audit.entries[0]).toMatchObject({ action: 'account.approval_threshold_changed', details: { from: 100_000, to: 250_000 } });
  });

  it('is a no-op when the value is unchanged', async () => {
    const { service, repo, audit } = setup();
    await service.updateApprovalThreshold(adminCtx(), 100_000);
    expect(repo.updateApprovalThreshold).not.toHaveBeenCalled();
    expect(audit.entries).toHaveLength(0);
  });

  it('rejects non-admins and out-of-range values', async () => {
    const { service } = setup();
    await expect(service.updateApprovalThreshold(userCtx(), 1)).rejects.toThrow(ForbiddenError);
    await expect(service.updateApprovalThreshold(adminCtx(), MAX_APPROVAL_THRESHOLD_MINOR + 1)).rejects.toThrow(BusinessRuleError);
    await expect(service.updateApprovalThreshold(adminCtx(), 10.5)).rejects.toThrow(BusinessRuleError);
  });

  it('refuses to modify a closed account', async () => {
    const { service } = setup(makeAccount({ status: 'CLOSED' }));
    await expect(service.updateApprovalThreshold(adminCtx(), 5)).rejects.toThrow(/Closed accounts/);
  });
});
