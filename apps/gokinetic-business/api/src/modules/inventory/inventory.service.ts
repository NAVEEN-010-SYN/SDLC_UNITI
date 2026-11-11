import { AuthContext, canAccessSite, siteFilterFor } from '../../auth/permissions';
import { Db } from '../../db/query';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { Page, PageRequest } from '../../lib/pagination';
import { AuditRepository } from '../audit/audit.repository';
import { InventoryRepository, NewSite, ServiceFilter, SiteFilter } from './inventory.repository';
import {
  InventorySummary,
  SERVICE_CATEGORIES,
  SERVICE_STATUSES,
  Service,
  ServiceCategory,
  ServiceStatus,
  Site,
  SiteSummary
} from './inventory.types';

/** Ports into other modules, kept narrow to avoid circular dependencies. */
export interface CostCentreLookup {
  isActiveCostCentre(accountId: string, costCentreId: string): Promise<boolean>;
}

export interface OpenOrderLookup {
  countOpenOrdersForSite(accountId: string, siteId: string): Promise<number>;
}

export interface SiteDetail extends Site {
  services: Service[];
  monthlyRecurringMinor: number;
}

const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})$/i;

/** Normalises a UK postcode to upper case with a single space before the inward code. */
export function normalisePostcode(postcode: string, country: string): string {
  const trimmed = postcode.trim().toUpperCase();
  if (country !== 'GB') return trimmed;
  const match = UK_POSTCODE.exec(trimmed.replace(/\s+/g, ''));
  if (!match) {
    throw new BusinessRuleError('invalid-postcode', `"${postcode}" is not a valid UK postcode`, { field: 'postcode' });
  }
  return `${match[1]} ${match[2]}`;
}

export function summariseServices(services: Service[], currency: string): Omit<InventorySummary, 'siteCount' | 'activeSiteCount'> {
  const byCategory = Object.fromEntries(
    SERVICE_CATEGORIES.map((c) => [c, { count: 0, monthlyRecurringMinor: 0 }])
  ) as InventorySummary['byCategory'];
  const byStatus = Object.fromEntries(SERVICE_STATUSES.map((s) => [s, 0])) as Record<ServiceStatus, number>;
  let monthlyRecurringMinor = 0;
  let totalBandwidthMbps = 0;

  for (const svc of services) {
    byStatus[svc.status] += 1;
    if (svc.status === 'CEASED') continue;
    byCategory[svc.category].count += 1;
    if (svc.status === 'ACTIVE' || svc.status === 'SUSPENDED') {
      byCategory[svc.category].monthlyRecurringMinor += svc.monthlyChargeMinor;
      monthlyRecurringMinor += svc.monthlyChargeMinor;
    }
    if (svc.status === 'ACTIVE' && svc.bandwidthMbps) totalBandwidthMbps += svc.bandwidthMbps;
  }

  return {
    serviceCount: services.filter((s) => s.status !== 'CEASED').length,
    byCategory,
    byStatus,
    monthlyRecurringMinor,
    totalBandwidthMbps,
    currency
  };
}

export class InventoryService {
  constructor(
    private readonly db: Db,
    private readonly repo: InventoryRepository,
    private readonly costCentres: CostCentreLookup,
    private readonly openOrders: OpenOrderLookup,
    private readonly audit: AuditRepository
  ) {}

  listSites(ctx: AuthContext, filter: Omit<SiteFilter, 'siteIds'>, page: PageRequest): Promise<Page<SiteSummary>> {
    return this.repo.listSites(ctx.accountId, { ...filter, siteIds: siteFilterFor(ctx) }, page);
  }

  async getSite(ctx: AuthContext, siteId: string): Promise<SiteDetail> {
    const site = await this.requireSite(ctx, siteId);
    const services = await this.repo.servicesForSite(ctx.accountId, siteId);
    const monthlyRecurringMinor = services
      .filter((s) => s.status === 'ACTIVE' || s.status === 'SUSPENDED')
      .reduce((acc, s) => acc + s.monthlyChargeMinor, 0);
    return { ...site, services, monthlyRecurringMinor };
  }

  async createSite(ctx: AuthContext, input: Omit<NewSite, 'accountId'>): Promise<Site> {
    const postcode = normalisePostcode(input.postcode, input.country);
    if (input.costCentreId) await this.assertCostCentre(ctx.accountId, input.costCentreId);
    return this.db.tx(async (tx) => {
      const site = await this.repo.createSite(
        { ...input, accountId: ctx.accountId, postcode, code: input.code.toUpperCase() },
        tx
      );
      await this.audit.record(
        { accountId: ctx.accountId, actorId: ctx.userId, action: 'site.created', entity: 'site', entityId: site.id, details: { code: site.code } },
        tx
      );
      return site;
    });
  }

  async updateSite(ctx: AuthContext, siteId: string, patch: { name?: string; costCentreId?: string | null }): Promise<Site> {
    const site = await this.requireSite(ctx, siteId);
    if (site.status === 'DECOMMISSIONED') {
      throw new BusinessRuleError('site-decommissioned', 'A decommissioned site cannot be modified');
    }
    if (patch.costCentreId) await this.assertCostCentre(ctx.accountId, patch.costCentreId);
    return this.db.tx(async (tx) => {
      const updated = await this.repo.updateSite(ctx.accountId, siteId, patch, tx);
      await this.audit.record(
        {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          action: 'site.updated',
          entity: 'site',
          entityId: siteId,
          details: { before: { name: site.name, costCentreId: site.costCentreId }, after: patch }
        },
        tx
      );
      return updated;
    });
  }

  /**
   * A site can be decommissioned only when every service on it is ceased and there are no
   * in-flight orders referencing it (moves into the site included).
   */
  async decommissionSite(ctx: AuthContext, siteId: string): Promise<Site> {
    const site = await this.requireSite(ctx, siteId);
    if (site.status === 'DECOMMISSIONED') return site;
    const services = await this.repo.servicesForSite(ctx.accountId, siteId);
    const live = services.filter((s) => s.status !== 'CEASED');
    if (live.length > 0) {
      throw new BusinessRuleError('site-has-live-services', `Site has ${live.length} service(s) that must be ceased first`, {
        serviceIds: live.map((s) => s.id)
      });
    }
    const openOrders = await this.openOrders.countOpenOrdersForSite(ctx.accountId, siteId);
    if (openOrders > 0) {
      throw new BusinessRuleError('site-has-open-orders', `Site has ${openOrders} open order(s)`);
    }
    return this.db.tx(async (tx) => {
      const updated = await this.repo.updateSite(ctx.accountId, siteId, { status: 'DECOMMISSIONED' }, tx);
      await this.audit.record(
        { accountId: ctx.accountId, actorId: ctx.userId, action: 'site.decommissioned', entity: 'site', entityId: siteId },
        tx
      );
      return updated;
    });
  }

  listServices(ctx: AuthContext, filter: Omit<ServiceFilter, 'siteIds'>, page: PageRequest): Promise<Page<Service>> {
    if (filter.siteId && !canAccessSite(ctx, filter.siteId)) {
      throw new ForbiddenError('You do not have access to this site');
    }
    return this.repo.listServices(ctx.accountId, { ...filter, siteIds: siteFilterFor(ctx) }, page);
  }

  async getService(ctx: AuthContext, serviceId: string): Promise<Service> {
    const svc = await this.repo.findService(ctx.accountId, serviceId);
    if (!svc || !canAccessSite(ctx, svc.siteId)) throw new NotFoundError('Service', serviceId);
    return svc;
  }

  async summary(ctx: AuthContext, currency = 'GBP'): Promise<InventorySummary> {
    const scope = siteFilterFor(ctx);
    const [services, counts] = await Promise.all([
      this.repo.allServices(ctx.accountId, scope),
      this.repo.countSites(ctx.accountId, scope)
    ]);
    return { siteCount: counts.total, activeSiteCount: counts.active, ...summariseServices(services, currency) };
  }

  /** Used by other modules: resolves a site the caller is allowed to see or throws 404. */
  async requireSite(ctx: AuthContext, siteId: string): Promise<Site> {
    const site = await this.repo.findSite(ctx.accountId, siteId);
    if (!site || !canAccessSite(ctx, siteId)) throw new NotFoundError('Site', siteId);
    return site;
  }

  private async assertCostCentre(accountId: string, costCentreId: string): Promise<void> {
    if (!(await this.costCentres.isActiveCostCentre(accountId, costCentreId))) {
      throw new BusinessRuleError('unknown-cost-centre', 'Cost centre does not exist or is inactive', { costCentreId });
    }
  }
}

export function isCategory(value: string): value is ServiceCategory {
  return (SERVICE_CATEGORIES as readonly string[]).includes(value);
}
