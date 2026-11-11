import { BusinessRuleError, InvalidStateTransitionError, NotFoundError } from '../../lib/errors';
import { fixedClock } from '../../lib/dates';
import { ACCOUNT_ID, SITE_A, adminCtx, makeSite, passthroughDb, recordingAudit } from '../../test/fixtures';
import { InventoryRepository } from '../inventory/inventory.repository';
import { BillingRepository } from './billing.repository';
import { BillingService, buildSpendTrend, daysOverdue, effectiveStatus } from './billing.service';
import { CostCentre, Invoice } from './billing.types';

const NOW = '2024-06-20T12:00:00Z';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    accountId: ACCOUNT_ID,
    number: 'INV-2024-05',
    period: '2024-05',
    issueDate: '2024-06-01T00:00:00.000Z',
    dueDate: '2024-06-15T00:00:00.000Z',
    status: 'ISSUED',
    subtotalMinor: 10_000,
    taxMinor: 2_000,
    totalMinor: 12_000,
    currency: 'GBP',
    ...overrides
  };
}

function cc(id: string, active = true): CostCentre {
  return { id, accountId: ACCOUNT_ID, code: id.toUpperCase(), name: id, monthlyBudgetMinor: null, active };
}

function setup() {
  const repo = {
    listInvoices: jest.fn(),
    findInvoice: jest.fn(async () => makeInvoice()),
    invoiceLines: jest.fn(async () => []),
    setInvoiceStatus: jest.fn(async (_id: string, status: Invoice['status']) => makeInvoice({ status })),
    costCentres: jest.fn(async () => [cc('ops'), cc('sales'), cc('old', false)]),
    findCostCentre: jest.fn(async (_a: string, id: string) => cc(id)),
    insertCostCentre: jest.fn(),
    updateCostCentre: jest.fn(async (_a: string, id: string) => cc(id, false)),
    costCentreUsage: jest.fn(async () => ({ sites: 0, splitRules: 0, services: 0 })),
    siteCostCentres: jest.fn(async () => new Map()),
    splitRules: jest.fn(async () => []),
    replaceSplitRules: jest.fn(async () => undefined),
    periodSpend: jest.fn()
  } as jest.Mocked<BillingRepository>;
  const inventory = { findSite: jest.fn(async () => makeSite()) } as unknown as jest.Mocked<InventoryRepository>;
  const audit = recordingAudit();
  const service = new BillingService(passthroughDb(), repo, inventory, audit, fixedClock(NOW));
  return { repo, inventory, audit, service };
}

describe('invoice status helpers', () => {
  const now = new Date(NOW);
  it('derives OVERDUE for unpaid invoices past due', () => {
    expect(effectiveStatus(makeInvoice(), now)).toBe('OVERDUE');
    expect(daysOverdue(makeInvoice(), now)).toBe(5);
  });
  it('keeps PAID and future-due invoices as-is', () => {
    expect(effectiveStatus(makeInvoice({ status: 'PAID' }), now)).toBe('PAID');
    expect(effectiveStatus(makeInvoice({ dueDate: '2024-07-01T00:00:00.000Z' }), now)).toBe('ISSUED');
    expect(daysOverdue(makeInvoice({ status: 'PAID' }), now)).toBe(0);
  });
});

describe('buildSpendTrend', () => {
  it('computes month-over-month change in minor units and basis points', () => {
    expect(
      buildSpendTrend([
        { period: '2024-03', totalMinor: 10_000 },
        { period: '2024-04', totalMinor: 12_500 },
        { period: '2024-05', totalMinor: 0 },
        { period: '2024-06', totalMinor: 5_000 }
      ])
    ).toEqual([
      { period: '2024-03', totalMinor: 10_000, changeMinor: null, changeBps: null },
      { period: '2024-04', totalMinor: 12_500, changeMinor: 2_500, changeBps: 2_500 },
      { period: '2024-05', totalMinor: 0, changeMinor: -12_500, changeBps: -10_000 },
      { period: '2024-06', totalMinor: 5_000, changeMinor: 5_000, changeBps: null }
    ]);
  });
});

describe('BillingService', () => {
  it('returns invoice detail with derived overdue status', async () => {
    const { service } = setup();
    const detail = await service.getInvoice(adminCtx(), 'x');
    expect(detail).toMatchObject({ status: 'OVERDUE', daysOverdue: 5 });
  });

  it('disputes an overdue invoice within the window', async () => {
    const { service, audit } = setup();
    const result = await service.disputeInvoice(adminCtx(), 'x', 'Charged twice for site LDN-01');
    expect(result.status).toBe('DISPUTED');
    expect(audit.entries[0].action).toBe('invoice.disputed');
  });

  it('refuses disputes on paid invoices', async () => {
    const { service, repo } = setup();
    repo.findInvoice.mockResolvedValue(makeInvoice({ status: 'PAID' }));
    await expect(service.disputeInvoice(adminCtx(), 'x', 'reason text here')).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('refuses disputes after the dispute window', async () => {
    const { service, repo } = setup();
    repo.findInvoice.mockResolvedValue(makeInvoice({ issueDate: '2024-03-01T00:00:00.000Z' }));
    await expect(service.disputeInvoice(adminCtx(), 'x', 'reason text here')).rejects.toMatchObject({
      code: 'business-rule/dispute-window-closed'
    });
  });

  it('404s for unknown invoices', async () => {
    const { service, repo } = setup();
    repo.findInvoice.mockResolvedValue(null);
    await expect(service.getInvoice(adminCtx(), 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('blocks deactivating a cost centre that is still in use', async () => {
    const { service, repo } = setup();
    repo.costCentreUsage.mockResolvedValue({ sites: 2, splitRules: 0, services: 1 });
    await expect(service.updateCostCentre(adminCtx(), 'ops', { active: false })).rejects.toMatchObject({
      code: 'business-rule/cost-centre-in-use'
    });
  });

  it('deactivates an unused cost centre', async () => {
    const { service } = setup();
    await expect(service.updateCostCentre(adminCtx(), 'ops', { active: false })).resolves.toMatchObject({ active: false });
  });

  it('validates split rules against active cost centres before saving', async () => {
    const { service, repo } = setup();
    await expect(
      service.setSplitRules(adminCtx(), SITE_A, [
        { costCentreId: 'ops', shareBps: 5000 },
        { costCentreId: 'old', shareBps: 5000 }
      ])
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(repo.replaceSplitRules).not.toHaveBeenCalled();

    const saved = await service.setSplitRules(adminCtx(), SITE_A, [
      { costCentreId: 'ops', shareBps: 2500 },
      { costCentreId: 'sales', shareBps: 7500 }
    ]);
    expect(saved).toHaveLength(2);
    expect(repo.replaceSplitRules).toHaveBeenCalledTimes(1);
  });

  it('rejects inverted period ranges', async () => {
    const { service } = setup();
    await expect(service.spendTrend(adminCtx(), '2024-06', '2024-01')).rejects.toBeInstanceOf(BusinessRuleError);
  });
});
