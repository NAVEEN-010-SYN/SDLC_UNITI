import { Service, Site } from '../inventory/inventory.types';
import { DOWNGRADE_CHARGE_MINOR, MOVE_CHARGE_MINOR, findProduct } from './catalogue';
import { OrderRequest } from './orders.types';

export interface PlanningContext {
  site: Site | undefined;
  targetSite?: Site | undefined;
  service?: Service | undefined;
  servicesAtSite: Service[];
  /** Service ids already referenced by another open order. */
  servicesWithOpenOrders: Set<string>;
  today: Date;
}

export interface OrderPlan {
  productCode: string | null;
  bandwidthMbps: number | null;
  monthlyDeltaMinor: number;
  oneOffChargeMinor: number;
}

export interface FieldIssue {
  field: string;
  message: string;
}

export type PlanResult = { ok: true; plan: OrderPlan } | { ok: false; issues: FieldIssue[] };

const MAX_LEAD_DAYS = 180;
const MIN_LEAD_DAYS_PROVIDE = 10;

function daysBetween(a: Date, b: Date): number {
  const aUtc = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bUtc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bUtc - aUtc) / 86_400_000);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function validateRequestedDate(req: OrderRequest, today: Date, issues: FieldIssue[]): void {
  if (!req.requestedDate) return;
  const date = new Date(`${req.requestedDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    issues.push({ field: 'requestedDate', message: 'requestedDate must be a valid YYYY-MM-DD date' });
    return;
  }
  const lead = daysBetween(today, date);
  const minLead = req.orderType === 'PROVIDE' || req.orderType === 'MOVE' ? MIN_LEAD_DAYS_PROVIDE : 1;
  if (lead < minLead) {
    issues.push({ field: 'requestedDate', message: `${req.orderType} orders need at least ${minLead} day(s) lead time` });
  } else if (lead > MAX_LEAD_DAYS) {
    issues.push({ field: 'requestedDate', message: `requestedDate cannot be more than ${MAX_LEAD_DAYS} days ahead` });
  }
  if (isWeekend(date) && req.orderType !== 'CEASE') {
    issues.push({ field: 'requestedDate', message: 'Engineering appointments are only available on weekdays' });
  }
}

function requireLiveService(ctx: PlanningContext, req: OrderRequest, issues: FieldIssue[]): Service | undefined {
  const svc = ctx.service;
  if (!req.serviceId) {
    issues.push({ field: 'serviceId', message: `serviceId is required for ${req.orderType} orders` });
    return undefined;
  }
  if (!svc) {
    issues.push({ field: 'serviceId', message: 'Service not found on this account' });
    return undefined;
  }
  if (svc.siteId !== req.siteId) {
    issues.push({ field: 'serviceId', message: 'Service does not belong to the given site' });
  }
  if (svc.status !== 'ACTIVE' && svc.status !== 'SUSPENDED') {
    issues.push({ field: 'serviceId', message: `Service is ${svc.status} and cannot be modified` });
  }
  if (ctx.servicesWithOpenOrders.has(svc.id)) {
    issues.push({ field: 'serviceId', message: 'Service already has an open order in progress' });
  }
  return svc;
}

/**
 * Validates a single move/add/change request against current inventory and prices it.
 * Returns field issues rather than throwing so the same logic powers bulk uploads,
 * where every row's problems are reported together.
 */
export function planOrder(req: OrderRequest, ctx: PlanningContext): PlanResult {
  const issues: FieldIssue[] = [];
  const site = ctx.site;

  if (!site) {
    return { ok: false, issues: [{ field: 'siteId', message: 'Site not found on this account' }] };
  }
  if (site.status === 'DECOMMISSIONED') {
    issues.push({ field: 'siteId', message: 'Site is decommissioned' });
  }
  validateRequestedDate(req, ctx.today, issues);

  let plan: OrderPlan = { productCode: null, bandwidthMbps: null, monthlyDeltaMinor: 0, oneOffChargeMinor: 0 };

  switch (req.orderType) {
    case 'PROVIDE':
    case 'ADD': {
      const product = findProduct(req.productCode);
      if (!product) {
        issues.push({ field: 'productCode', message: 'Unknown product code' });
        break;
      }
      const liveAtSite = ctx.servicesAtSite.filter((s) => s.status === 'ACTIVE' || s.status === 'PENDING');
      const hasConnectivity = liveAtSite.some((s) => s.category === 'BROADBAND');
      if (req.orderType === 'PROVIDE' && product.category !== 'BROADBAND') {
        issues.push({ field: 'productCode', message: 'PROVIDE orders are for connectivity; use ADD for add-on products' });
      }
      if (req.orderType === 'PROVIDE' && hasConnectivity) {
        issues.push({ field: 'siteId', message: 'Site already has connectivity; use CHANGE to alter bandwidth' });
      }
      if (product.requiresConnectivity && !hasConnectivity) {
        issues.push({ field: 'productCode', message: `${product.name} requires an active fibre service at the site` });
      }
      if (req.orderType === 'ADD' && liveAtSite.some((s) => s.productCode === product.code)) {
        issues.push({ field: 'productCode', message: `${product.name} is already present at this site` });
      }
      plan = {
        productCode: product.code,
        bandwidthMbps: product.bandwidthMbps,
        monthlyDeltaMinor: product.monthlyPriceMinor,
        oneOffChargeMinor: product.installChargeMinor
      };
      break;
    }

    case 'CHANGE': {
      const svc = requireLiveService(ctx, req, issues);
      const product = findProduct(req.productCode);
      if (!product) {
        issues.push({ field: 'productCode', message: 'Unknown product code' });
        break;
      }
      if (!svc) break;
      if (product.category !== svc.category) {
        issues.push({ field: 'productCode', message: `Cannot change a ${svc.category} service to a ${product.category} product` });
      }
      if (product.code === svc.productCode) {
        issues.push({ field: 'productCode', message: 'Service is already on this product' });
      }
      const current = findProduct(svc.productCode);
      const isDowngrade =
        (product.bandwidthMbps ?? 0) < (current?.bandwidthMbps ?? svc.bandwidthMbps ?? 0) ||
        product.monthlyPriceMinor < svc.monthlyChargeMinor;
      plan = {
        productCode: product.code,
        bandwidthMbps: product.bandwidthMbps,
        monthlyDeltaMinor: product.monthlyPriceMinor - svc.monthlyChargeMinor,
        oneOffChargeMinor: isDowngrade ? DOWNGRADE_CHARGE_MINOR : 0
      };
      break;
    }

    case 'MOVE': {
      const svc = requireLiveService(ctx, req, issues);
      if (!req.targetSiteId) {
        issues.push({ field: 'targetSiteId', message: 'targetSiteId is required for MOVE orders' });
      } else if (req.targetSiteId === req.siteId) {
        issues.push({ field: 'targetSiteId', message: 'Target site must differ from the current site' });
      } else if (!ctx.targetSite) {
        issues.push({ field: 'targetSiteId', message: 'Target site not found on this account' });
      } else if (ctx.targetSite.status === 'DECOMMISSIONED') {
        issues.push({ field: 'targetSiteId', message: 'Target site is decommissioned' });
      }
      plan = {
        productCode: svc?.productCode ?? null,
        bandwidthMbps: svc?.bandwidthMbps ?? null,
        monthlyDeltaMinor: 0,
        oneOffChargeMinor: MOVE_CHARGE_MINOR
      };
      break;
    }

    case 'CEASE': {
      const svc = requireLiveService(ctx, req, issues);
      if (svc && svc.category === 'BROADBAND') {
        const dependants = ctx.servicesAtSite.filter(
          (s) => s.id !== svc.id && s.status !== 'CEASED' && findProduct(s.productCode)?.requiresConnectivity
        );
        if (dependants.length > 0) {
          issues.push({
            field: 'serviceId',
            message: `Cease the dependent services first: ${dependants.map((d) => d.productName).join(', ')}`
          });
        }
      }
      plan = {
        productCode: svc?.productCode ?? null,
        bandwidthMbps: null,
        monthlyDeltaMinor: svc ? -svc.monthlyChargeMinor : 0,
        oneOffChargeMinor: 0
      };
      break;
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, plan };
}

/**
 * Annualised financial impact used for approval thresholds:
 * twelve months of any recurring increase plus the one-off charge.
 */
export function annualisedImpactMinor(plan: Pick<OrderPlan, 'monthlyDeltaMinor' | 'oneOffChargeMinor'>): number {
  return Math.max(0, plan.monthlyDeltaMinor) * 12 + plan.oneOffChargeMinor;
}
