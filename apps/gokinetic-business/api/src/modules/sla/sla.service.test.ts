import { BusinessRuleError } from '../../lib/errors';
import { fixedClock } from '../../lib/dates';
import { ACCOUNT_ID, SITE_A, SITE_B, adminCtx, makeService, userCtx } from '../../test/fixtures';
import { AccountsRepository } from '../accounts/accounts.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { SlaRepository } from './sla.repository';
import { SlaService, summariseCompliance, weightedAvailability } from './sla.service';
import { ServiceAvailability } from './sla.availability';

const SVC_1 = 'd1111111-1111-4111-8111-111111111111';
const SVC_2 = 'd2222222-2222-4222-8222-222222222222';

function setup(now = '2024-07-10T09:00:00.000Z') {
  const repo: jest.Mocked<SlaRepository> = {
    outages: jest.fn(async () => [
      { serviceId: SVC_1, startedAt: new Date('2024-06-10T10:00:00Z'), endedAt: new Date('2024-06-10T16:00:00Z'), planned: false }
    ]),
    ticketCompliance: jest.fn(async () => [{ priority: 'P2' as const, resolvedCount: 4, responseMetCount: 4, resolutionMetCount: 3 }])
  };
  const inventory = {
    allServices: jest.fn(async () => [
      makeService({ id: SVC_1, siteId: SITE_A, slaTier: 'STANDARD', monthlyChargeMinor: 10_000 }),
      makeService({ id: SVC_2, siteId: SITE_B, slaTier: 'PREMIUM', monthlyChargeMinor: 20_000 }),
      makeService({ id: 'pending', activatedAt: null, status: 'PENDING' })
    ])
  } as unknown as jest.Mocked<InventoryRepository>;
  const accounts = {
    get: jest.fn(async () => ({ id: ACCOUNT_ID, name: 'Acme', status: 'ACTIVE', currency: 'GBP', slaTier: 'ENHANCED', approvalThresholdMinor: 0 }))
  } as unknown as jest.Mocked<AccountsRepository>;
  return { repo, inventory, accounts, service: new SlaService(repo, inventory, accounts, fixedClock(now)) };
}

describe('summariseCompliance', () => {
  it('computes met ratios in basis points and leaves empty buckets null', () => {
    expect(summariseCompliance([{ priority: 'P1', resolvedCount: 3, responseMetCount: 2, resolutionMetCount: 3 }])[0]).toMatchObject({
      responseMetBps: 6_666,
      resolutionMetBps: 10_000
    });
    expect(summariseCompliance([{ priority: 'P4', resolvedCount: 0, responseMetCount: 0, resolutionMetCount: 0 }])[0].responseMetBps).toBeNull();
  });
});

describe('weightedAvailability', () => {
  it('weights by measured minutes', () => {
    const a = { measuredMinutes: 1_000, downtimeMinutes: 10 } as ServiceAvailability;
    const b = { measuredMinutes: 3_000, downtimeMinutes: 0 } as ServiceAvailability;
    expect(weightedAvailability([a, b])).toBe(99_750);
    expect(weightedAvailability([])).toBeNull();
  });
});

describe('SlaService.monthlyReport', () => {
  it('builds a closed-period report with credits for breached services', async () => {
    const { service } = setup();
    const report = await service.monthlyReport(adminCtx(), '2024-06');
    expect(report.provisional).toBe(false);
    expect(report.servicesMeasured).toBe(2);
    expect(report.servicesBreached).toBe(1);
    // 360 min down of 43,200 => 99.166% < 99.5% STANDARD target => 5% credit of £100
    expect(report.services[0]).toMatchObject({ serviceId: SVC_1, downtimeMinutes: 360, creditBps: 500 });
    expect(report.totalCredit).toEqual({ amountMinor: 500, currency: 'GBP' });
    expect(report.tickets[0].resolutionMetBps).toBe(7_500);
  });

  it('marks the current month as provisional', async () => {
    const { service } = setup('2024-06-15T00:00:00.000Z');
    expect((await service.monthlyReport(adminCtx(), '2024-06')).provisional).toBe(true);
  });

  it('restricts data to the caller site scope', async () => {
    const { service, repo, inventory } = setup();
    await service.monthlyReport(userCtx(), '2024-06');
    expect(inventory.allServices).toHaveBeenCalledWith(ACCOUNT_ID, [SITE_A]);
    expect(repo.outages).toHaveBeenCalledWith(ACCOUNT_ID, expect.any(Date), expect.any(Date), [SITE_A]);
  });

  it('rejects future and archived periods', async () => {
    const { service } = setup();
    await expect(service.monthlyReport(adminCtx(), '2024-08')).rejects.toThrow(BusinessRuleError);
    await expect(service.monthlyReport(adminCtx(), '2021-01')).rejects.toThrow(/last 24 months/);
  });
});

describe('SlaService.policy', () => {
  it('returns the targets for the account tier', async () => {
    const { service } = setup();
    const policy = await service.policy(adminCtx());
    expect(policy.tier).toBe('ENHANCED');
    expect(policy.tickets.P1.responseMinutes).toBe(30);
    expect(policy.availability.targetMilliPct).toBe(99_900);
  });
});
