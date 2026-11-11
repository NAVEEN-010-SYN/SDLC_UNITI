import { AuthContext, canAccessSite, isAdmin, siteFilterFor } from '../../auth/permissions';
import { Db } from '../../db/query';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { Clock, systemClock } from '../../lib/dates';
import { Page, PageRequest } from '../../lib/pagination';
import { newReference } from '../../lib/references';
import { AccountsRepository } from '../accounts/accounts.repository';
import { AuditRepository } from '../audit/audit.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { Service, Site } from '../inventory/inventory.types';
import { findProduct } from './catalogue';
import { assertTransition, isCancellable, TransitionActor } from './order-state-machine';
import { OrderPlan, annualisedImpactMinor, planOrder } from './order-planner';
import { OrderFilter, OrdersRepository } from './orders.repository';
import { BulkRowError, Order, OrderBatch, OrderRequest, OrderStatus, OrderStatusChange } from './orders.types';

export const MAX_BULK_ITEMS = 200;

export interface OrderDetail extends Order {
  history: OrderStatusChange[];
}

interface InventorySnapshot {
  sites: Map<string, Site>;
  servicesById: Map<string, Service>;
  servicesBySite: Map<string, Service[]>;
  servicesWithOpenOrders: Set<string>;
}

/** Finds rows within one bulk upload that would conflict with each other. */
export function findIntraBatchConflicts(items: OrderRequest[]): BulkRowError[] {
  const errors: BulkRowError[] = [];
  const seenService = new Map<string, number>();
  const seenProvide = new Map<string, number>();
  items.forEach((item, index) => {
    const row = index + 1;
    if (item.serviceId) {
      const prior = seenService.get(item.serviceId);
      if (prior !== undefined) {
        errors.push({ row, field: 'serviceId', message: `Service is already modified by row ${prior}` });
      } else seenService.set(item.serviceId, row);
    }
    if (item.orderType === 'PROVIDE') {
      const prior = seenProvide.get(item.siteId);
      if (prior !== undefined) {
        errors.push({ row, field: 'siteId', message: `Site already has a PROVIDE in row ${prior}` });
      } else seenProvide.set(item.siteId, row);
    }
  });
  return errors;
}

export class OrdersService {
  constructor(
    private readonly db: Db,
    private readonly repo: OrdersRepository,
    private readonly inventory: InventoryRepository,
    private readonly accounts: AccountsRepository,
    private readonly audit: AuditRepository,
    private readonly clock: Clock = systemClock
  ) {}

  list(ctx: AuthContext, filter: Omit<OrderFilter, 'siteIds'>, page: PageRequest): Promise<Page<Order>> {
    return this.repo.list(ctx.accountId, { ...filter, siteIds: siteFilterFor(ctx) }, page);
  }

  async get(ctx: AuthContext, orderId: string): Promise<OrderDetail> {
    const order = await this.requireOrder(ctx, orderId);
    return { ...order, history: await this.repo.history(order.id) };
  }

  /** Prices an order without persisting it, so the UI can show charges before submission. */
  async quote(ctx: AuthContext, request: OrderRequest): Promise<OrderPlan & { requiresApproval: boolean }> {
    this.assertSiteAccess(ctx, request);
    const snapshot = await this.snapshot(ctx, [request]);
    const plan = this.planOrThrow(request, snapshot);
    const account = await this.accounts.get(ctx.accountId);
    return { ...plan, requiresApproval: this.needsApproval(ctx, plan, account.approvalThresholdMinor) };
  }

  async create(ctx: AuthContext, request: OrderRequest, submit = false): Promise<Order> {
    this.assertSiteAccess(ctx, request);
    const snapshot = await this.snapshot(ctx, [request]);
    const plan = this.planOrThrow(request, snapshot);
    const account = await this.accounts.get(ctx.accountId);
    this.assertAccountCanOrder(account.status);

    return this.db.tx(async (tx) => {
      const order = await this.insertOrder(ctx, request, plan, account.approvalThresholdMinor, account.currency, null, tx);
      await this.audit.record(
        { accountId: ctx.accountId, actorId: ctx.userId, action: 'order.created', entity: 'order', entityId: order.id, details: { reference: order.reference, type: order.orderType } },
        tx
      );
      return submit ? this.submitWithin(ctx, order, tx) : order;
    });
  }

  /**
   * Creates a batch of orders atomically. Every row is validated first; if any row fails,
   * nothing is created and all row errors are returned together.
   */
  async createBulk(ctx: AuthContext, items: OrderRequest[], submit: boolean): Promise<OrderBatch> {
    if (items.length === 0) throw new BusinessRuleError('empty-batch', 'A bulk order needs at least one item');
    if (items.length > MAX_BULK_ITEMS) {
      throw new BusinessRuleError('batch-too-large', `A bulk order may contain at most ${MAX_BULK_ITEMS} items`);
    }
    const account = await this.accounts.get(ctx.accountId);
    this.assertAccountCanOrder(account.status);

    const rowErrors: BulkRowError[] = findIntraBatchConflicts(items);
    items.forEach((item, i) => {
      if (!canAccessSite(ctx, item.siteId) || (item.targetSiteId && !canAccessSite(ctx, item.targetSiteId))) {
        rowErrors.push({ row: i + 1, field: 'siteId', message: 'You do not have access to this site' });
      }
    });
    const snapshot = await this.snapshot(ctx, items);
    const plans: OrderPlan[] = [];
    items.forEach((item, i) => {
      const result = planOrder(item, this.planningContext(item, snapshot));
      if (result.ok) plans.push(result.plan);
      else result.issues.forEach((issue) => rowErrors.push({ row: i + 1, ...issue }));
    });

    if (rowErrors.length > 0) {
      rowErrors.sort((a, b) => a.row - b.row);
      throw new BusinessRuleError('bulk-validation-failed', `${new Set(rowErrors.map((e) => e.row)).size} row(s) failed validation`, {
        rowErrors
      });
    }

    return this.db.tx(async (tx) => {
      const reference = newReference('BAT', this.clock.now());
      const batchId = await this.repo.insertBatch(ctx.accountId, reference, ctx.userId, items.length, tx);
      const orders: Order[] = [];
      for (let i = 0; i < items.length; i++) {
        let order = await this.insertOrder(ctx, items[i], plans[i], account.approvalThresholdMinor, account.currency, batchId, tx);
        if (submit) order = await this.submitWithin(ctx, order, tx);
        orders.push(order);
      }
      await this.audit.record(
        { accountId: ctx.accountId, actorId: ctx.userId, action: 'order.bulk_created', entity: 'order_batch', entityId: batchId, details: { reference, itemCount: items.length, submitted: submit } },
        tx
      );
      return { id: batchId, reference, itemCount: orders.length, orders };
    });
  }

  async submit(ctx: AuthContext, orderId: string): Promise<Order> {
    return this.db.tx(async (tx) => {
      const order = await this.lockOrder(ctx, orderId, tx);
      if (order.createdBy !== ctx.userId && !isAdmin(ctx)) {
        throw new ForbiddenError('Only the order creator or an admin can submit this order');
      }
      return this.submitWithin(ctx, order, tx);
    });
  }

  async approve(ctx: AuthContext, orderId: string): Promise<Order> {
    return this.db.tx(async (tx) => {
      const order = await this.lockOrder(ctx, orderId, tx);
      if (!order.requiresApproval) {
        throw new BusinessRuleError('approval-not-required', 'This order does not require approval');
      }
      if (order.createdBy === ctx.userId) {
        throw new BusinessRuleError('self-approval', 'An order cannot be approved by the person who raised it');
      }
      return this.move(ctx, order, 'VALIDATED', 'approver', null, tx, { approvedBy: ctx.userId });
    });
  }

  async reject(ctx: AuthContext, orderId: string, reason: string): Promise<Order> {
    return this.db.tx(async (tx) => {
      const order = await this.lockOrder(ctx, orderId, tx);
      return this.move(ctx, order, 'FAILED', 'approver', reason, tx, { failureReason: `Rejected: ${reason}` });
    });
  }

  async cancel(ctx: AuthContext, orderId: string, reason: string): Promise<Order> {
    return this.db.tx(async (tx) => {
      const order = await this.lockOrder(ctx, orderId, tx);
      if (!isCancellable(order.status)) {
        throw new BusinessRuleError('not-cancellable', `Orders in ${order.status} can no longer be cancelled`);
      }
      if (order.createdBy !== ctx.userId && !isAdmin(ctx)) {
        throw new ForbiddenError('Only the order creator or an admin can cancel this order');
      }
      return this.move(ctx, order, 'CANCELLED', 'customer', reason, tx);
    });
  }

  /** Called by fulfilment (support/provisioning systems) to progress an order. */
  async fulfil(ctx: AuthContext, orderId: string, to: Extract<OrderStatus, 'PROVISIONING' | 'ACTIVE' | 'FAILED'>, reason?: string): Promise<Order> {
    return this.db.tx(async (tx) => {
      const order = await this.lockOrder(ctx, orderId, tx);
      const updated = await this.move(ctx, order, to, 'fulfilment', reason ?? null, tx, to === 'FAILED' ? { failureReason: reason ?? 'Provisioning failed' } : {});
      if (to === 'ACTIVE') {
        const product = findProduct(order.productCode);
        await this.repo.applyActivation(updated, product ? { name: product.name, category: product.category } : null, this.clock.now(), tx);
      }
      return updated;
    });
  }

  async countOpenOrdersForSite(accountId: string, siteId: string): Promise<number> {
    return this.repo.countOpenForSite(accountId, siteId);
  }

  private async submitWithin(ctx: AuthContext, order: Order, tx: Db): Promise<Order> {
    let current = await this.move(ctx, order, 'SUBMITTED', 'customer', null, tx);
    if (!current.requiresApproval) {
      current = await this.move(ctx, current, 'VALIDATED', 'approver', 'Auto-validated: within approval threshold', tx);
    }
    return current;
  }

  private async move(
    ctx: AuthContext,
    order: Order,
    to: OrderStatus,
    actor: TransitionActor,
    reason: string | null,
    tx: Db,
    fields: { approvedBy?: string; failureReason?: string } = {}
  ): Promise<Order> {
    assertTransition(order.status, to, actor);
    const updated = await this.repo.updateStatus(order.id, to, fields, tx);
    await this.repo.recordHistory(order.id, order.status, to, ctx.userId, reason, tx);
    await this.audit.record(
      { accountId: ctx.accountId, actorId: ctx.userId, action: `order.${to.toLowerCase()}`, entity: 'order', entityId: order.id, details: { from: order.status, to, reason } },
      tx
    );
    return updated;
  }

  private async insertOrder(
    ctx: AuthContext,
    request: OrderRequest,
    plan: OrderPlan,
    thresholdMinor: number,
    currency: string,
    batchId: string | null,
    tx: Db
  ): Promise<Order> {
    const order = await this.repo.insert(
      {
        accountId: ctx.accountId,
        batchId,
        reference: newReference('ORD', this.clock.now()),
        orderType: request.orderType,
        status: 'DRAFT',
        siteId: request.siteId,
        targetSiteId: request.targetSiteId ?? null,
        serviceId: request.serviceId ?? null,
        productCode: plan.productCode,
        bandwidthMbps: plan.bandwidthMbps,
        monthlyDeltaMinor: plan.monthlyDeltaMinor,
        oneOffChargeMinor: plan.oneOffChargeMinor,
        currency,
        requiresApproval: this.needsApproval(ctx, plan, thresholdMinor),
        requestedDate: request.requestedDate ?? null,
        notes: request.notes ?? null,
        createdBy: ctx.userId
      },
      tx
    );
    await this.repo.recordHistory(order.id, null, 'DRAFT', ctx.userId, null, tx);
    return order;
  }

  private needsApproval(ctx: AuthContext, plan: OrderPlan, thresholdMinor: number): boolean {
    if (isAdmin(ctx) || thresholdMinor <= 0) return false;
    return annualisedImpactMinor(plan) > thresholdMinor;
  }

  private assertAccountCanOrder(status: string): void {
    if (status !== 'ACTIVE') {
      throw new BusinessRuleError('account-not-active', `New orders cannot be placed while the account is ${status}`);
    }
  }

  private assertSiteAccess(ctx: AuthContext, request: OrderRequest): void {
    if (!canAccessSite(ctx, request.siteId) || (request.targetSiteId && !canAccessSite(ctx, request.targetSiteId))) {
      throw new ForbiddenError('You do not have access to this site');
    }
  }

  private planOrThrow(request: OrderRequest, snapshot: InventorySnapshot): OrderPlan {
    const result = planOrder(request, this.planningContext(request, snapshot));
    if (!result.ok) {
      throw new BusinessRuleError('order-invalid', 'The order cannot be placed', { errors: result.issues });
    }
    return result.plan;
  }

  private planningContext(request: OrderRequest, snapshot: InventorySnapshot) {
    return {
      site: snapshot.sites.get(request.siteId),
      targetSite: request.targetSiteId ? snapshot.sites.get(request.targetSiteId) : undefined,
      service: request.serviceId ? snapshot.servicesById.get(request.serviceId) : undefined,
      servicesAtSite: snapshot.servicesBySite.get(request.siteId) ?? [],
      servicesWithOpenOrders: snapshot.servicesWithOpenOrders,
      today: this.clock.now()
    };
  }

  private async snapshot(ctx: AuthContext, items: OrderRequest[]): Promise<InventorySnapshot> {
    const siteIds = new Set<string>();
    for (const item of items) {
      siteIds.add(item.siteId);
      if (item.targetSiteId) siteIds.add(item.targetSiteId);
    }
    const [sites, services, open] = await Promise.all([
      this.inventory.findSitesByIds(ctx.accountId, [...siteIds]),
      this.inventory.allServices(ctx.accountId, null),
      this.repo.serviceIdsWithOpenOrders(ctx.accountId)
    ]);
    const servicesBySite = new Map<string, Service[]>();
    for (const svc of services) {
      const list = servicesBySite.get(svc.siteId) ?? [];
      list.push(svc);
      servicesBySite.set(svc.siteId, list);
    }
    return {
      sites: new Map(sites.map((s) => [s.id, s])),
      servicesById: new Map(services.map((s) => [s.id, s])),
      servicesBySite,
      servicesWithOpenOrders: open
    };
  }

  private async requireOrder(ctx: AuthContext, orderId: string): Promise<Order> {
    const order = await this.repo.find(ctx.accountId, orderId);
    if (!order || !canAccessSite(ctx, order.siteId)) throw new NotFoundError('Order', orderId);
    return order;
  }

  private async lockOrder(ctx: AuthContext, orderId: string, tx: Db): Promise<Order> {
    const order = await this.repo.findForUpdate(ctx.accountId, orderId, tx);
    if (!order || !canAccessSite(ctx, order.siteId)) throw new NotFoundError('Order', orderId);
    return order;
  }
}
