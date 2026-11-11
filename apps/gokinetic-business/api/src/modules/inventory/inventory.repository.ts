import { Db, WhereBuilder } from '../../db/query';
import { Page, PageRequest, pageOf, toLimitOffset } from '../../lib/pagination';
import { Service, ServiceCategory, ServiceStatus, Site, SiteStatus, SiteSummary } from './inventory.types';

interface SiteRow {
  id: string;
  account_id: string;
  code: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  postcode: string;
  country: string;
  status: SiteStatus;
  cost_centre_id: string | null;
  created_at: Date;
  active_service_count?: string;
  monthly_recurring_minor?: string;
  total_bandwidth_mbps?: string;
  total?: string;
}

interface ServiceRow {
  id: string;
  account_id: string;
  site_id: string;
  contract_id: string | null;
  cost_centre_id: string | null;
  product_code: string;
  product_name: string;
  category: ServiceCategory;
  bandwidth_mbps: number | null;
  status: ServiceStatus;
  sla_tier: Service['slaTier'];
  monthly_charge_minor: string;
  currency: string;
  activated_at: Date | null;
  ceased_at: Date | null;
  total?: string;
}

export function toSite(r: SiteRow): Site {
  return {
    id: r.id,
    accountId: r.account_id,
    code: r.code,
    name: r.name,
    addressLine1: r.address_line1,
    addressLine2: r.address_line2,
    city: r.city,
    postcode: r.postcode,
    country: r.country,
    status: r.status,
    costCentreId: r.cost_centre_id,
    createdAt: r.created_at.toISOString()
  };
}

export function toService(r: ServiceRow): Service {
  return {
    id: r.id,
    accountId: r.account_id,
    siteId: r.site_id,
    contractId: r.contract_id,
    costCentreId: r.cost_centre_id,
    productCode: r.product_code,
    productName: r.product_name,
    category: r.category,
    bandwidthMbps: r.bandwidth_mbps,
    status: r.status,
    slaTier: r.sla_tier,
    monthlyChargeMinor: Number(r.monthly_charge_minor),
    currency: r.currency,
    activatedAt: r.activated_at?.toISOString() ?? null,
    ceasedAt: r.ceased_at?.toISOString() ?? null
  };
}

export interface SiteFilter {
  status?: SiteStatus;
  search?: string;
  costCentreId?: string;
  siteIds: string[] | null;
}

export interface ServiceFilter {
  siteId?: string;
  category?: ServiceCategory;
  status?: ServiceStatus;
  contractId?: string;
  siteIds: string[] | null;
}

export interface NewSite {
  accountId: string;
  code: string;
  name: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  postcode: string;
  country: string;
  costCentreId?: string | null;
}

export interface InventoryRepository {
  listSites(accountId: string, filter: SiteFilter, page: PageRequest): Promise<Page<SiteSummary>>;
  findSite(accountId: string, siteId: string, db?: Db): Promise<Site | null>;
  findSitesByIds(accountId: string, siteIds: string[], db?: Db): Promise<Site[]>;
  createSite(site: NewSite, db?: Db): Promise<Site>;
  updateSite(accountId: string, siteId: string, patch: Partial<Pick<Site, 'name' | 'costCentreId' | 'status'>>, db?: Db): Promise<Site>;
  listServices(accountId: string, filter: ServiceFilter, page: PageRequest): Promise<Page<Service>>;
  findService(accountId: string, serviceId: string, db?: Db): Promise<Service | null>;
  servicesForSite(accountId: string, siteId: string, db?: Db): Promise<Service[]>;
  allServices(accountId: string, siteIds: string[] | null): Promise<Service[]>;
  countSites(accountId: string, siteIds: string[] | null): Promise<{ total: number; active: number }>;
  updateServiceStatus(serviceId: string, status: ServiceStatus, at: Date, db?: Db): Promise<void>;
}

export function createInventoryRepository(defaultDb: Db): InventoryRepository {
  return {
    async listSites(accountId, filter, page) {
      const where = new WhereBuilder()
        .add('s.account_id = ?', accountId)
        .add('s.status = ?', filter.status)
        .add('s.cost_centre_id = ?', filter.costCentreId);
      if (filter.search) {
        const p = where.nextParam(`%${filter.search.toLowerCase()}%`);
        where.addRaw(`(lower(s.name) LIKE ${p} OR lower(s.code) LIKE ${p} OR lower(s.postcode) LIKE ${p})`);
      }
      if (filter.siteIds) where.addRaw(`s.id = ANY(${where.nextParam(filter.siteIds)}::uuid[])`);
      const { limit, offset } = toLimitOffset(page);
      const rows = await defaultDb.many<SiteRow>(
        `SELECT s.*,
                count(sv.id) FILTER (WHERE sv.status = 'ACTIVE') AS active_service_count,
                coalesce(sum(sv.monthly_charge_minor) FILTER (WHERE sv.status IN ('ACTIVE','SUSPENDED')), 0) AS monthly_recurring_minor,
                coalesce(sum(sv.bandwidth_mbps) FILTER (WHERE sv.status = 'ACTIVE'), 0) AS total_bandwidth_mbps,
                count(*) OVER() AS total
           FROM sites s
           LEFT JOIN services sv ON sv.site_id = s.id
           ${where.toSql()}
          GROUP BY s.id
          ORDER BY s.name
          LIMIT ${where.nextParam(limit)} OFFSET ${where.nextParam(offset)}`,
        where.params
      );
      const total = rows.length ? Number(rows[0].total) : 0;
      return pageOf(
        rows.map((r) => ({
          ...toSite(r),
          activeServiceCount: Number(r.active_service_count ?? 0),
          monthlyRecurringMinor: Number(r.monthly_recurring_minor ?? 0),
          totalBandwidthMbps: Number(r.total_bandwidth_mbps ?? 0)
        })),
        page,
        total
      );
    },

    async findSite(accountId, siteId, db = defaultDb) {
      const row = await db.oneOrNone<SiteRow>('SELECT * FROM sites WHERE account_id = $1 AND id = $2', [accountId, siteId]);
      return row ? toSite(row) : null;
    },

    async findSitesByIds(accountId, siteIds, db = defaultDb) {
      if (siteIds.length === 0) return [];
      const rows = await db.many<SiteRow>('SELECT * FROM sites WHERE account_id = $1 AND id = ANY($2::uuid[])', [
        accountId,
        siteIds
      ]);
      return rows.map(toSite);
    },

    async createSite(site, db = defaultDb) {
      const row = await db.one<SiteRow>(
        `INSERT INTO sites (account_id, code, name, address_line1, address_line2, city, postcode, country, status, cost_centre_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)
         RETURNING *`,
        [
          site.accountId,
          site.code,
          site.name,
          site.addressLine1,
          site.addressLine2 ?? null,
          site.city,
          site.postcode,
          site.country,
          site.costCentreId ?? null
        ]
      );
      return toSite(row);
    },

    async updateSite(accountId, siteId, patch, db = defaultDb) {
      const row = await db.one<SiteRow>(
        `UPDATE sites SET
            name = coalesce($3, name),
            cost_centre_id = CASE WHEN $4::boolean THEN $5::uuid ELSE cost_centre_id END,
            status = coalesce($6, status)
          WHERE account_id = $1 AND id = $2
          RETURNING *`,
        [accountId, siteId, patch.name ?? null, 'costCentreId' in patch, patch.costCentreId ?? null, patch.status ?? null]
      );
      return toSite(row);
    },

    async listServices(accountId, filter, page) {
      const where = new WhereBuilder()
        .add('account_id = ?', accountId)
        .add('site_id = ?', filter.siteId)
        .add('category = ?', filter.category)
        .add('status = ?', filter.status)
        .add('contract_id = ?', filter.contractId);
      if (filter.siteIds) where.addRaw(`site_id = ANY(${where.nextParam(filter.siteIds)}::uuid[])`);
      const { limit, offset } = toLimitOffset(page);
      const rows = await defaultDb.many<ServiceRow>(
        `SELECT *, count(*) OVER() AS total FROM services ${where.toSql()}
          ORDER BY created_at DESC
          LIMIT ${where.nextParam(limit)} OFFSET ${where.nextParam(offset)}`,
        where.params
      );
      return pageOf(rows.map(toService), page, rows.length ? Number(rows[0].total) : 0);
    },

    async findService(accountId, serviceId, db = defaultDb) {
      const row = await db.oneOrNone<ServiceRow>('SELECT * FROM services WHERE account_id = $1 AND id = $2', [
        accountId,
        serviceId
      ]);
      return row ? toService(row) : null;
    },

    async servicesForSite(accountId, siteId, db = defaultDb) {
      const rows = await db.many<ServiceRow>(
        'SELECT * FROM services WHERE account_id = $1 AND site_id = $2 ORDER BY created_at',
        [accountId, siteId]
      );
      return rows.map(toService);
    },

    async allServices(accountId, siteIds) {
      const rows = await defaultDb.many<ServiceRow>(
        `SELECT * FROM services WHERE account_id = $1 AND ($2::uuid[] IS NULL OR site_id = ANY($2::uuid[]))`,
        [accountId, siteIds]
      );
      return rows.map(toService);
    },

    async countSites(accountId, siteIds) {
      const row = await defaultDb.one<{ total: string; active: string }>(
        `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'ACTIVE') AS active
           FROM sites WHERE account_id = $1 AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))`,
        [accountId, siteIds]
      );
      return { total: Number(row.total), active: Number(row.active) };
    },

    async updateServiceStatus(serviceId, status, at, db = defaultDb) {
      await db.exec(
        `UPDATE services SET status = $2,
            activated_at = CASE WHEN $2 = 'ACTIVE' AND activated_at IS NULL THEN $3 ELSE activated_at END,
            ceased_at = CASE WHEN $2 = 'CEASED' THEN $3 ELSE ceased_at END
          WHERE id = $1`,
        [serviceId, status, at]
      );
    }
  };
}
