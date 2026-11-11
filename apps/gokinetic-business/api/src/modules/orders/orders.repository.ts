import { Db, WhereBuilder } from '../../db/query';
import { Page, PageRequest, pageOf, toLimitOffset } from '../../lib/pagination';
import { Order, OrderStatus, OrderStatusChange, OrderType } from './orders.types';

interface OrderRow {
  id: string;
  account_id: string;
  batch_id: string | null;
  reference: string;
  order_type: OrderType;
  status: OrderStatus;
  site_id: string;
  target_site_id: string | null;
  service_id: string | null;
  product_code: string | null;
  bandwidth_mbps: number | null;
  monthly_delta_minor: string;
  one_off_charge_minor: string;
  currency: string;
  requires_approval: boolean;
  approved_by: string | null;
  requested_date: Date | null;
  notes: string | null;
  failure_reason: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  total?: string;
}

function toOrder(r: OrderRow): Order {
  return {
    id: r.id,
    accountId: r.account_id,
    batchId: r.batch_id,
    reference: r.reference,
    orderType: r.order_type,
    status: r.status,
    siteId: r.site_id,
    targetSiteId: r.target_site_id,
    serviceId: r.service_id,
    productCode: r.product_code,
    bandwidthMbps: r.bandwidth_mbps,
    monthlyDeltaMinor: Number(r.monthly_delta_minor),
    oneOffChargeMinor: Number(r.one_off_charge_minor),
    currency: r.currency,
    requiresApproval: r.requires_approval,
    approvedBy: r.approved_by,
    requestedDate: r.requested_date ? r.requested_date.toISOString().slice(0, 10) : null,
    notes: r.notes,
    failureReason: r.failure_reason,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString()
  };
}

export type NewOrder = Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'approvedBy' | 'failureReason' | 'status'> & {
  status: OrderStatus;
};

export interface OrderFilter {
  status?: OrderStatus;
  orderType?: OrderType;
  siteId?: string;
  batchId?: string;
  siteIds: string[] | null;
}

export interface OrdersRepository {
  list(accountId: string, filter: OrderFilter, page: PageRequest): Promise<Page<Order>>;
  find(accountId: string, orderId: string, db?: Db): Promise<Order | null>;
  findForUpdate(accountId: string, orderId: string, db: Db): Promise<Order | null>;
  insert(order: NewOrder, db?: Db): Promise<Order>;
  insertBatch(accountId: string, reference: string, createdBy: string, itemCount: number, db: Db): Promise<string>;
  updateStatus(
    orderId: string,
    to: OrderStatus,
    fields: { approvedBy?: string; failureReason?: string },
    db: Db
  ): Promise<Order>;
  recordHistory(orderId: string, from: OrderStatus | null, to: OrderStatus, by: string | null, reason: string | null, db: Db): Promise<void>;
  history(orderId: string): Promise<OrderStatusChange[]>;
  serviceIdsWithOpenOrders(accountId: string, db?: Db): Promise<Set<string>>;
  countOpenForSite(accountId: string, siteId: string): Promise<number>;
  /** Applies an activated order to the service inventory. */
  applyActivation(order: Order, product: { name: string; category: string } | null, at: Date, db: Db): Promise<void>;
}

const OPEN = `('DRAFT','SUBMITTED','VALIDATED','PROVISIONING')`;

export function createOrdersRepository(defaultDb: Db): OrdersRepository {
  return {
    async list(accountId, filter, page) {
      const where = new WhereBuilder()
        .add('account_id = ?', accountId)
        .add('status = ?', filter.status)
        .add('order_type = ?', filter.orderType)
        .add('site_id = ?', filter.siteId)
        .add('batch_id = ?', filter.batchId);
      if (filter.siteIds) where.addRaw(`site_id = ANY(${where.nextParam(filter.siteIds)}::uuid[])`);
      const { limit, offset } = toLimitOffset(page);
      const rows = await defaultDb.many<OrderRow>(
        `SELECT *, count(*) OVER() AS total FROM orders ${where.toSql()}
          ORDER BY created_at DESC
          LIMIT ${where.nextParam(limit)} OFFSET ${where.nextParam(offset)}`,
        where.params
      );
      return pageOf(rows.map(toOrder), page, rows.length ? Number(rows[0].total) : 0);
    },

    async find(accountId, orderId, db = defaultDb) {
      const row = await db.oneOrNone<OrderRow>('SELECT * FROM orders WHERE account_id = $1 AND id = $2', [accountId, orderId]);
      return row ? toOrder(row) : null;
    },

    async findForUpdate(accountId, orderId, db) {
      const row = await db.oneOrNone<OrderRow>('SELECT * FROM orders WHERE account_id = $1 AND id = $2 FOR UPDATE', [
        accountId,
        orderId
      ]);
      return row ? toOrder(row) : null;
    },

    async insert(o, db = defaultDb) {
      const row = await db.one<OrderRow>(
        `INSERT INTO orders (account_id, batch_id, reference, order_type, status, site_id, target_site_id, service_id,
                             product_code, bandwidth_mbps, monthly_delta_minor, one_off_charge_minor, currency,
                             requires_approval, requested_date, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [
          o.accountId,
          o.batchId,
          o.reference,
          o.orderType,
          o.status,
          o.siteId,
          o.targetSiteId,
          o.serviceId,
          o.productCode,
          o.bandwidthMbps,
          o.monthlyDeltaMinor,
          o.oneOffChargeMinor,
          o.currency,
          o.requiresApproval,
          o.requestedDate,
          o.notes,
          o.createdBy
        ]
      );
      return toOrder(row);
    },

    async insertBatch(accountId, reference, createdBy, itemCount, db) {
      const row = await db.one<{ id: string }>(
        `INSERT INTO order_batches (account_id, reference, created_by, item_count) VALUES ($1,$2,$3,$4) RETURNING id`,
        [accountId, reference, createdBy, itemCount]
      );
      return row.id;
    },

    async updateStatus(orderId, to, fields, db) {
      const row = await db.one<OrderRow>(
        `UPDATE orders SET status = $2,
            approved_by = coalesce($3, approved_by),
            failure_reason = coalesce($4, failure_reason),
            updated_at = now()
          WHERE id = $1 RETURNING *`,
        [orderId, to, fields.approvedBy ?? null, fields.failureReason ?? null]
      );
      return toOrder(row);
    },

    async recordHistory(orderId, from, to, by, reason, db) {
      await db.exec(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason) VALUES ($1,$2,$3,$4,$5)`,
        [orderId, from, to, by, reason]
      );
    },

    async history(orderId) {
      const rows = await defaultDb.many<{
        from_status: OrderStatus | null;
        to_status: OrderStatus;
        changed_by: string | null;
        reason: string | null;
        changed_at: Date;
      }>('SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY changed_at, id', [orderId]);
      return rows.map((r) => ({
        fromStatus: r.from_status,
        toStatus: r.to_status,
        changedBy: r.changed_by,
        reason: r.reason,
        changedAt: r.changed_at.toISOString()
      }));
    },

    async serviceIdsWithOpenOrders(accountId, db = defaultDb) {
      const rows = await db.many<{ service_id: string }>(
        `SELECT DISTINCT service_id FROM orders WHERE account_id = $1 AND service_id IS NOT NULL AND status IN ${OPEN}`,
        [accountId]
      );
      return new Set(rows.map((r) => r.service_id));
    },

    async countOpenForSite(accountId, siteId) {
      const row = await defaultDb.one<{ n: string }>(
        `SELECT count(*) AS n FROM orders
          WHERE account_id = $1 AND (site_id = $2 OR target_site_id = $2) AND status IN ${OPEN}`,
        [accountId, siteId]
      );
      return Number(row.n);
    },

    async applyActivation(order, product, at, db) {
      switch (order.orderType) {
        case 'PROVIDE':
        case 'ADD':
          await db.exec(
            `INSERT INTO services (account_id, site_id, product_code, product_name, category, bandwidth_mbps, status,
                                   monthly_charge_minor, currency, activated_at, cost_centre_id)
             SELECT $1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8, $9, s.cost_centre_id FROM sites s WHERE s.id = $2`,
            [
              order.accountId,
              order.siteId,
              order.productCode,
              product?.name ?? order.productCode,
              product?.category ?? 'BROADBAND',
              order.bandwidthMbps,
              order.monthlyDeltaMinor,
              order.currency,
              at
            ]
          );
          await db.exec(`UPDATE sites SET status = 'ACTIVE' WHERE id = $1 AND status = 'PENDING'`, [order.siteId]);
          break;
        case 'CHANGE':
          await db.exec(
            `UPDATE services SET product_code = $2, bandwidth_mbps = $3,
                    monthly_charge_minor = monthly_charge_minor + $4
              WHERE id = $1`,
            [order.serviceId, order.productCode, order.bandwidthMbps, order.monthlyDeltaMinor]
          );
          break;
        case 'MOVE':
          await db.exec(`UPDATE services SET site_id = $2 WHERE id = $1`, [order.serviceId, order.targetSiteId]);
          await db.exec(`UPDATE sites SET status = 'ACTIVE' WHERE id = $1 AND status = 'PENDING'`, [order.targetSiteId]);
          break;
        case 'CEASE':
          await db.exec(`UPDATE services SET status = 'CEASED', ceased_at = $2 WHERE id = $1`, [order.serviceId, at]);
          break;
      }
    }
  };
}
