import { BusinessRuleError, ForbiddenError, InvalidStateTransitionError } from '../../lib/errors';
import { fixedClock } from '../../lib/dates';
import { ACCOUNT_ID, ADMIN_ID, SITE_A, SITE_B, USER_ID, adminCtx, agentCtx, makeService, makeSite, passthroughDb, recordingAudit, userCtx } from '../../test/fixtures';
import { AccountsRepository } from '../accounts/accounts.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { canTransition, isTerminal } from './order-state-machine';
import { OrdersRepository } from './orders.repository';
import { OrdersService, findIntraBatchConflicts } from './orders.service';
import { Order } from './orders.types';

const ORDER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: ORDER_ID,
    accountId: ACCOUNT_ID,
    batchId: null,
    reference: 'ORD-20240603-ABCDEF',
    orderType: 'PROVIDE',
    status: 'DRAFT',
    siteId: SITE_A,
    targetSiteId: null,
    serviceId: null,
    productCode: 'FTTP-1000',
    bandwidthMbps: 1000,
    monthlyDeltaMinor: 7500,
    oneOffChargeMinor: 9900,
    currency: 'GBP',
    requiresApproval: false,
    approvedBy: null,
    requestedDate: null,
    notes: null,
    failureReason: null,
    createdBy: USER_ID,
    createdAt: '2024-06-03T09:00:00.000Z',
    updatedAt: '2024-06-03T09:00:00.000Z',
    ...overrides
  };
}

function setup(threshold = 50_000) {
  let current = makeOrder();
  const repo: jest.Mocked<OrdersRepository> = {
    list: jest.fn(),
    find: jest.fn(async () => current),
    findForUpdate: jest.fn(async () => current),
    insert: jest.fn(async (o) => (current = makeOrder({ ...o }))),
    insertBatch: jest.fn(async () => 'batch-1'),
    updateStatus: jest.fn(async (_id, to, fields) => (current = { ...current, status: to, ...fields })),
    recordHistory: jest.fn(async () => undefined),
    history: jest.fn(async () => []),
    serviceIdsWithOpenOrders: jest.fn(async () => new Set<string>()),
    countOpenForSite: jest.fn(async () => 0),
    applyActivation: jest.fn(async () => undefined)
  };
  const inventory = {
    findSitesByIds: jest.fn(async (_a: string, ids: string[]) => ids.map((id) => makeSite({ id }))),
    allServices: jest.fn(async () => [] as ReturnType<typeof makeService>[])
  } as unknown as jest.Mocked<InventoryRepository>;
  const accounts: jest.Mocked<AccountsRepository> = {
    get: jest.fn(async () => ({ id: ACCOUNT_ID, name: 'Acme', status: 'ACTIVE' as const, currency: 'GBP', slaTier: 'ENHANCED' as const, approvalThresholdMinor: threshold })),
    updateApprovalThreshold: jest.fn()
  };
  const audit = recordingAudit();
  const service = new OrdersService(passthroughDb(), repo, inventory, accounts, audit, fixedClock('2024-06-03T09:00:00Z'));
  return { repo, inventory, accounts, audit, service, setCurrent: (o: Order) => (current = o) };
}

describe('order state machine', () => {
  it('follows the documented lifecycle', () => {
    expect(canTransition('DRAFT', 'SUBMITTED', 'customer')).toBe(true);
    expect(canTransition('SUBMITTED', 'VALIDATED', 'approver')).toBe(true);
    expect(canTransition('VALIDATED', 'PROVISIONING', 'fulfilment')).toBe(true);
    expect(canTransition('PROVISIONING', 'ACTIVE', 'fulfilment')).toBe(true);
  });
  it('blocks customers from driving provisioning states', () => {
    expect(canTransition('VALIDATED', 'PROVISIONING', 'customer')).toBe(false);
    expect(canTransition('PROVISIONING', 'CANCELLED', 'customer')).toBe(false);
  });
  it('treats ACTIVE, CANCELLED and FAILED as terminal', () => {
    expect(['ACTIVE', 'CANCELLED', 'FAILED'].every((s) => isTerminal(s as Order['status']))).toBe(true);
  });
});

describe('findIntraBatchConflicts', () => {
  it('flags the same service twice and duplicate provides', () => {
    const errors = findIntraBatchConflicts([
      { orderType: 'CHANGE', siteId: SITE_A, serviceId: 's1', productCode: 'FTTP-2000' },
      { orderType: 'CEASE', siteId: SITE_A, serviceId: 's1' },
      { orderType: 'PROVIDE', siteId: SITE_B, productCode: 'FTTP-100' },
      { orderType: 'PROVIDE', siteId: SITE_B, productCode: 'FTTP-500' }
    ]);
    expect(errors).toEqual([
      { row: 2, field: 'serviceId', message: 'Service is already modified by row 1' },
      { row: 4, field: 'siteId', message: 'Site already has a PROVIDE in row 3' }
    ]);
  });
});

describe('OrdersService', () => {
  it('auto-validates a submitted order within the approval threshold', async () => {
    const { service, repo } = setup();
    const order = await service.create(userCtx(), { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-100' }, true);
    expect(order.status).toBe('VALIDATED');
    expect(repo.recordHistory.mock.calls.map((c) => c[2])).toEqual(['DRAFT', 'SUBMITTED', 'VALIDATED']);
  });

  it('holds orders above the threshold for approval', async () => {
    const { service } = setup(50_000);
    // FTTP-2000: 11000 * 12 + 14900 = 146900 > 50000
    const order = await service.create(userCtx(), { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-2000' }, true);
    expect(order.requiresApproval).toBe(true);
    expect(order.status).toBe('SUBMITTED');
  });

  it('never requires approval for admins', async () => {
    const { service } = setup(1);
    const quote = await service.quote(adminCtx(), { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-2000' });
    expect(quote.requiresApproval).toBe(false);
  });

  it('rejects orders for out-of-scope sites', async () => {
    const { service } = setup();
    await expect(service.create(userCtx(), { orderType: 'PROVIDE', siteId: SITE_B, productCode: 'FTTP-100' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses orders on a suspended account', async () => {
    const { service, accounts } = setup();
    accounts.get.mockResolvedValue({ id: ACCOUNT_ID, name: 'Acme', status: 'SUSPENDED', currency: 'GBP', slaTier: 'STANDARD', approvalThresholdMinor: 0 });
    await expect(service.create(adminCtx(), { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-100' })).rejects.toMatchObject({
      code: 'business-rule/account-not-active'
    });
  });

  it('surfaces planner issues as a business rule error', async () => {
    const { service } = setup();
    await expect(service.create(adminCtx(), { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'NOPE' })).rejects.toMatchObject({
      code: 'business-rule/order-invalid'
    });
  });

  it('prevents self-approval', async () => {
    const { service, setCurrent } = setup();
    setCurrent(makeOrder({ status: 'SUBMITTED', requiresApproval: true, createdBy: ADMIN_ID }));
    await expect(service.approve(adminCtx(), ORDER_ID)).rejects.toMatchObject({ code: 'business-rule/self-approval' });
  });

  it('lets a different admin approve', async () => {
    const { service, setCurrent } = setup();
    setCurrent(makeOrder({ status: 'SUBMITTED', requiresApproval: true }));
    const order = await service.approve(adminCtx(), ORDER_ID);
    expect(order).toMatchObject({ status: 'VALIDATED', approvedBy: ADMIN_ID });
  });

  it('only allows the creator or an admin to cancel', async () => {
    const { service, setCurrent } = setup();
    setCurrent(makeOrder({ status: 'SUBMITTED', createdBy: ADMIN_ID }));
    await expect(service.cancel(userCtx(), ORDER_ID, 'changed mind')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses cancellation once provisioning has started', async () => {
    const { service, setCurrent } = setup();
    setCurrent(makeOrder({ status: 'PROVISIONING' }));
    await expect(service.cancel(adminCtx(), ORDER_ID, 'too late')).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('applies activation to inventory when fulfilment completes', async () => {
    const { service, repo, setCurrent } = setup();
    setCurrent(makeOrder({ status: 'PROVISIONING' }));
    await service.fulfil(agentCtx(), ORDER_ID, 'ACTIVE');
    expect(repo.applyActivation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' }),
      { name: 'Business Fibre 1 Gbps', category: 'BROADBAND' },
      new Date('2024-06-03T09:00:00Z'),
      expect.anything()
    );
  });

  it('rejects skipping straight to ACTIVE', async () => {
    const { service, setCurrent } = setup();
    setCurrent(makeOrder({ status: 'VALIDATED' }));
    await expect(service.fulfil(agentCtx(), ORDER_ID, 'ACTIVE')).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('reports every failing row of a bulk upload and creates nothing', async () => {
    const { service, repo } = setup();
    await expect(
      service.createBulk(adminCtx(), [
        { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-100' },
        { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-500' },
        { orderType: 'CHANGE', siteId: SITE_B, productCode: 'FTTP-500' }
      ], true)
    ).rejects.toMatchObject({
      code: 'business-rule/bulk-validation-failed',
      extensions: {
        rowErrors: [
          expect.objectContaining({ row: 2, field: 'siteId' }),
          expect.objectContaining({ row: 3, field: 'serviceId' })
        ]
      }
    });
    expect(repo.insertBatch).not.toHaveBeenCalled();
  });

  it('creates a valid bulk batch atomically', async () => {
    const { service, repo } = setup();
    const batch = await service.createBulk(adminCtx(), [
      { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-100' },
      { orderType: 'PROVIDE', siteId: SITE_B, productCode: 'FTTP-500' }
    ], false);
    expect(batch.itemCount).toBe(2);
    expect(batch.reference).toMatch(/^BAT-20240603-/);
    expect(repo.insert).toHaveBeenCalledTimes(2);
  });
});
