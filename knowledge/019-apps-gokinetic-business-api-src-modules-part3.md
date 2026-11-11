# Go Kinetic Business self-care (B2B): apps/gokinetic-business/api/src/modules (part 3 of 8)

- **Application:** Go Kinetic Business self-care (B2B)
- **Tech stack:** Angular 17 + Node.js/Express API
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 14

## Files

- `apps/gokinetic-business/api/src/modules/inventory/inventory.service.ts` (202 lines)
- `apps/gokinetic-business/api/src/modules/inventory/inventory.types.ts` (62 lines)
- `apps/gokinetic-business/api/src/modules/notifications/outbox.test.ts` (43 lines)
- `apps/gokinetic-business/api/src/modules/notifications/outbox.ts` (67 lines)
- `apps/gokinetic-business/api/src/modules/orders/catalogue.ts` (43 lines)
- `apps/gokinetic-business/api/src/modules/orders/order-planner.test.ts` (175 lines)
- `apps/gokinetic-business/api/src/modules/orders/order-planner.ts` (214 lines)
- `apps/gokinetic-business/api/src/modules/orders/order-state-machine.ts` (54 lines)
- `apps/gokinetic-business/api/src/modules/orders/orders.repository.ts` (257 lines)
- `apps/gokinetic-business/api/src/modules/orders/orders.routes.ts` (148 lines)
- `apps/gokinetic-business/api/src/modules/orders/orders.service.test.ts` (216 lines)
- `apps/gokinetic-business/api/src/modules/orders/orders.service.ts` (343 lines)
- `apps/gokinetic-business/api/src/modules/orders/orders.types.ts` (64 lines)
- `apps/gokinetic-business/api/src/modules/payments/payment-gateway.ts` (72 lines)

## apps/gokinetic-business/api/src/modules/inventory/inventory.service.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/inventory/inventory.service.ts`.

```typescript
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
```

## apps/gokinetic-business/api/src/modules/inventory/inventory.types.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/inventory/inventory.types.ts`.

```typescript
export const SITE_STATUSES = ['PENDING', 'ACTIVE', 'DECOMMISSIONED'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const SERVICE_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'CEASED'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_CATEGORIES = ['BROADBAND', 'VOICE', 'SDWAN', 'HOSTED'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SLA_TIERS = ['STANDARD', 'ENHANCED', 'PREMIUM'] as const;
export type SlaTier = (typeof SLA_TIERS)[number];

export interface Site {
  id: string;
  accountId: string;
  code: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  country: string;
  status: SiteStatus;
  costCentreId: string | null;
  createdAt: string;
}

export interface Service {
  id: string;
  accountId: string;
  siteId: string;
  contractId: string | null;
  costCentreId: string | null;
  productCode: string;
  productName: string;
  category: ServiceCategory;
  bandwidthMbps: number | null;
  status: ServiceStatus;
  slaTier: SlaTier;
  monthlyChargeMinor: number;
  currency: string;
  activatedAt: string | null;
  ceasedAt: string | null;
}

export interface SiteSummary extends Site {
  activeServiceCount: number;
  monthlyRecurringMinor: number;
  totalBandwidthMbps: number;
}

export interface InventorySummary {
  siteCount: number;
  activeSiteCount: number;
  serviceCount: number;
  byCategory: Record<ServiceCategory, { count: number; monthlyRecurringMinor: number }>;
  byStatus: Record<ServiceStatus, number>;
  monthlyRecurringMinor: number;
  totalBandwidthMbps: number;
  currency: string;
}
```

## apps/gokinetic-business/api/src/modules/notifications/outbox.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/notifications/outbox.test.ts`.

```typescript
import { USER_ID, AGENT_ID } from '../../test/fixtures';
import { makeTicket } from '../../test/ticket-fixtures';
import { TicketEvent } from '../tickets/tickets.types';
import { Outbox, OutboxMessage, outboxTicketNotifier } from './outbox';

function recordingOutbox(): Outbox & { messages: OutboxMessage[] } {
  const messages: OutboxMessage[] = [];
  return { messages, enqueue: async (m) => void messages.push(m) };
}

function event(overrides: Partial<TicketEvent> = {}): TicketEvent {
  return {
    id: 1,
    ticketId: makeTicket().id,
    kind: 'STATUS_CHANGE',
    authorId: AGENT_ID,
    body: null,
    fromValue: 'OPEN',
    toValue: 'IN_PROGRESS',
    internal: false,
    createdAt: '2024-06-03T10:00:00.000Z',
    ...overrides
  };
}

describe('outboxTicketNotifier', () => {
  it('notifies the raiser about agent updates', async () => {
    const outbox = recordingOutbox();
    await outboxTicketNotifier(outbox).ticketUpdated(makeTicket(), event());
    expect(outbox.messages).toEqual([
      expect.objectContaining({ kind: 'TICKET_UPDATED', recipient: USER_ID, payload: expect.objectContaining({ toValue: 'IN_PROGRESS' }) })
    ]);
  });

  it('skips internal notes and the raiser’s own actions', async () => {
    const outbox = recordingOutbox();
    const notifier = outboxTicketNotifier(outbox);
    await notifier.ticketUpdated(makeTicket(), event({ internal: true }));
    await notifier.ticketUpdated(makeTicket(), event({ authorId: USER_ID }));
    expect(outbox.messages).toHaveLength(0);
  });
});
```

## apps/gokinetic-business/api/src/modules/notifications/outbox.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/notifications/outbox.ts`.

```typescript
import { Db } from '../../db/query';
import { currentCorrelationId } from '../../lib/logger';
import { TicketNotifier } from '../tickets/tickets.service';
import { Ticket, TicketEvent } from '../tickets/tickets.types';
import { InvitationSender } from '../users/users.service';
import { BusinessUser } from '../users/users.types';

export type NotificationKind = 'USER_INVITATION' | 'TICKET_UPDATED';

export interface OutboxMessage {
  accountId: string;
  kind: NotificationKind;
  /** An email address, or a user id the relay resolves to the user's current address. */
  recipient: string;
  payload: Record<string, unknown>;
}

export interface Outbox {
  enqueue(message: OutboxMessage): Promise<void>;
}

export function createOutbox(db: Db): Outbox {
  return {
    async enqueue(message) {
      await db.exec(
        `INSERT INTO notification_outbox (account_id, kind, recipient, payload, correlation_id)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [message.accountId, message.kind, message.recipient, JSON.stringify(message.payload), currentCorrelationId() ?? null]
      );
    }
  };
}

export function outboxInvitationSender(outbox: Outbox): InvitationSender {
  return {
    sendInvitation: (user: BusinessUser, invitedByEmail: string) =>
      outbox.enqueue({
        accountId: user.accountId,
        kind: 'USER_INVITATION',
        recipient: user.email,
        payload: { userId: user.id, firstName: user.firstName, role: user.role, invitedBy: invitedByEmail }
      })
  };
}

/** Customers hear about public changes to their tickets; the author of an event is never notified of their own action. */
export function outboxTicketNotifier(outbox: Outbox): TicketNotifier {
  return {
    async ticketUpdated(ticket: Ticket, event: TicketEvent) {
      if (event.internal || event.authorId === ticket.raisedBy) return;
      await outbox.enqueue({
        accountId: ticket.accountId,
        kind: 'TICKET_UPDATED',
        recipient: ticket.raisedBy,
        payload: {
          ticketId: ticket.id,
          reference: ticket.reference,
          subject: ticket.subject,
          status: ticket.status,
          eventKind: event.kind,
          toValue: event.toValue
        }
      });
    }
  };
}
```

## apps/gokinetic-business/api/src/modules/orders/catalogue.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/orders/catalogue.ts`.

```typescript
import { ServiceCategory } from '../inventory/inventory.types';

export interface CatalogueProduct {
  code: string;
  name: string;
  category: ServiceCategory;
  bandwidthMbps: number | null;
  monthlyPriceMinor: number;
  installChargeMinor: number;
  /** Products that can only be added to a site already carrying an active connectivity service. */
  requiresConnectivity: boolean;
}

/**
 * Business price book (ex-VAT, pence). Tiers mirror the fibre portfolio:
 * 100 Mbps, 500 Mbps, 1 Gbps, 2 Gbps symmetrical, plus add-on voice, SD-WAN and hosted.
 */
const PRODUCTS: readonly CatalogueProduct[] = [
  { code: 'FTTP-100', name: 'Business Fibre 100 Mbps', category: 'BROADBAND', bandwidthMbps: 100, monthlyPriceMinor: 3500, installChargeMinor: 9900, requiresConnectivity: false },
  { code: 'FTTP-500', name: 'Business Fibre 500 Mbps', category: 'BROADBAND', bandwidthMbps: 500, monthlyPriceMinor: 5500, installChargeMinor: 9900, requiresConnectivity: false },
  { code: 'FTTP-1000', name: 'Business Fibre 1 Gbps', category: 'BROADBAND', bandwidthMbps: 1000, monthlyPriceMinor: 7500, installChargeMinor: 9900, requiresConnectivity: false },
  { code: 'FTTP-2000', name: 'Business Fibre 2 Gbps', category: 'BROADBAND', bandwidthMbps: 2000, monthlyPriceMinor: 11000, installChargeMinor: 14900, requiresConnectivity: false },
  { code: 'VOICE-SIP-4', name: 'SIP Voice (4 channels)', category: 'VOICE', bandwidthMbps: null, monthlyPriceMinor: 2400, installChargeMinor: 0, requiresConnectivity: true },
  { code: 'VOICE-SIP-10', name: 'SIP Voice (10 channels)', category: 'VOICE', bandwidthMbps: null, monthlyPriceMinor: 5200, installChargeMinor: 0, requiresConnectivity: true },
  { code: 'SDWAN-STD', name: 'Managed SD-WAN Standard', category: 'SDWAN', bandwidthMbps: null, monthlyPriceMinor: 8900, installChargeMinor: 25000, requiresConnectivity: true },
  { code: 'HOSTED-EMAIL-25', name: 'Hosted Email (25 mailboxes)', category: 'HOSTED', bandwidthMbps: null, monthlyPriceMinor: 3750, installChargeMinor: 0, requiresConnectivity: false }
];

const BY_CODE = new Map(PRODUCTS.map((p) => [p.code, p]));

/** Charge for relocating an existing service to another site on the account. */
export const MOVE_CHARGE_MINOR = 12500;
/** Charge for downgrading a service mid-term (upgrades are free). */
export const DOWNGRADE_CHARGE_MINOR = 5000;

export function findProduct(code: string | null | undefined): CatalogueProduct | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

export function listProducts(): readonly CatalogueProduct[] {
  return PRODUCTS;
}
```

## apps/gokinetic-business/api/src/modules/orders/order-planner.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/orders/order-planner.test.ts`.

```typescript
import { SITE_A, SITE_B, makeService, makeSite } from '../../test/fixtures';
import { DOWNGRADE_CHARGE_MINOR, MOVE_CHARGE_MINOR } from './catalogue';
import { PlanningContext, annualisedImpactMinor, planOrder } from './order-planner';

const TODAY = new Date('2024-06-03T09:00:00Z'); // Monday
const SVC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function ctx(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    site: makeSite(),
    servicesAtSite: [],
    servicesWithOpenOrders: new Set(),
    today: TODAY,
    ...overrides
  };
}

function issuesOf(result: ReturnType<typeof planOrder>) {
  return result.ok ? [] : result.issues;
}

describe('planOrder PROVIDE', () => {
  it('prices a new fibre connection', () => {
    const result = planOrder({ orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-1000' }, ctx());
    expect(result).toEqual({
      ok: true,
      plan: { productCode: 'FTTP-1000', bandwidthMbps: 1000, monthlyDeltaMinor: 7500, oneOffChargeMinor: 9900 }
    });
  });

  it('rejects a provide at a site that already has connectivity', () => {
    const result = planOrder(
      { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-500' },
      ctx({ servicesAtSite: [makeService()] })
    );
    expect(issuesOf(result)).toContainEqual(expect.objectContaining({ field: 'siteId' }));
  });

  it('rejects non-connectivity products on PROVIDE', () => {
    const result = planOrder({ orderType: 'PROVIDE', siteId: SITE_A, productCode: 'HOSTED-EMAIL-25' }, ctx());
    expect(issuesOf(result)[0].field).toBe('productCode');
  });

  it('enforces the 10-day lead time and weekday appointments', () => {
    const tooSoon = planOrder(
      { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-100', requestedDate: '2024-06-05' },
      ctx()
    );
    expect(issuesOf(tooSoon).map((i) => i.message)).toEqual([expect.stringContaining('lead time')]);

    const saturday = planOrder(
      { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-100', requestedDate: '2024-06-22' },
      ctx()
    );
    expect(issuesOf(saturday).map((i) => i.message)).toEqual([expect.stringContaining('weekdays')]);
  });

  it('rejects decommissioned sites and unknown sites', () => {
    expect(issuesOf(planOrder({ orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-100' }, ctx({ site: undefined })))[0].field).toBe('siteId');
    const decom = planOrder(
      { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-100' },
      ctx({ site: makeSite({ status: 'DECOMMISSIONED' }) })
    );
    expect(issuesOf(decom)[0].message).toMatch(/decommissioned/);
  });
});

describe('planOrder ADD', () => {
  it('requires connectivity for voice', () => {
    const result = planOrder({ orderType: 'ADD', siteId: SITE_A, productCode: 'VOICE-SIP-4' }, ctx());
    expect(issuesOf(result)[0].message).toMatch(/requires an active fibre service/);
  });

  it('allows voice at a connected site', () => {
    const result = planOrder(
      { orderType: 'ADD', siteId: SITE_A, productCode: 'VOICE-SIP-4' },
      ctx({ servicesAtSite: [makeService()] })
    );
    expect(result.ok).toBe(true);
  });

  it('rejects duplicate add-ons', () => {
    const result = planOrder(
      { orderType: 'ADD', siteId: SITE_A, productCode: 'VOICE-SIP-4' },
      ctx({ servicesAtSite: [makeService(), makeService({ id: 'v1', category: 'VOICE', productCode: 'VOICE-SIP-4' })] })
    );
    expect(issuesOf(result)[0].message).toMatch(/already present/);
  });
});

describe('planOrder CHANGE', () => {
  it('prices an upgrade with no one-off charge', () => {
    const service = makeService({ productCode: 'FTTP-500', bandwidthMbps: 500, monthlyChargeMinor: 5500 });
    const result = planOrder(
      { orderType: 'CHANGE', siteId: SITE_A, serviceId: SVC, productCode: 'FTTP-2000' },
      ctx({ service, servicesAtSite: [service] })
    );
    expect(result).toEqual({
      ok: true,
      plan: { productCode: 'FTTP-2000', bandwidthMbps: 2000, monthlyDeltaMinor: 5500, oneOffChargeMinor: 0 }
    });
  });

  it('charges for a downgrade', () => {
    const service = makeService({ productCode: 'FTTP-1000', monthlyChargeMinor: 7500 });
    const result = planOrder(
      { orderType: 'CHANGE', siteId: SITE_A, serviceId: SVC, productCode: 'FTTP-100' },
      ctx({ service })
    );
    expect(result.ok && result.plan).toMatchObject({ monthlyDeltaMinor: -4000, oneOffChargeMinor: DOWNGRADE_CHARGE_MINOR });
  });

  it('rejects category changes, same product and services with open orders', () => {
    const service = makeService();
    const crossCategory = planOrder(
      { orderType: 'CHANGE', siteId: SITE_A, serviceId: SVC, productCode: 'VOICE-SIP-4' },
      ctx({ service })
    );
    expect(issuesOf(crossCategory)[0].message).toMatch(/Cannot change a BROADBAND/);

    const same = planOrder({ orderType: 'CHANGE', siteId: SITE_A, serviceId: SVC, productCode: 'FTTP-1000' }, ctx({ service }));
    expect(issuesOf(same)[0].message).toMatch(/already on this product/);

    const busy = planOrder(
      { orderType: 'CHANGE', siteId: SITE_A, serviceId: SVC, productCode: 'FTTP-2000' },
      ctx({ service, servicesWithOpenOrders: new Set([SVC]) })
    );
    expect(issuesOf(busy)[0].message).toMatch(/open order/);
  });

  it('rejects ceased services', () => {
    const service = makeService({ status: 'CEASED' });
    const result = planOrder({ orderType: 'CHANGE', siteId: SITE_A, serviceId: SVC, productCode: 'FTTP-2000' }, ctx({ service }));
    expect(issuesOf(result)[0].message).toMatch(/CEASED/);
  });
});

describe('planOrder MOVE', () => {
  it('charges the move fee and requires a different live target site', () => {
    const service = makeService();
    const ok = planOrder(
      { orderType: 'MOVE', siteId: SITE_A, serviceId: SVC, targetSiteId: SITE_B, requestedDate: '2024-06-24' },
      ctx({ service, targetSite: makeSite({ id: SITE_B }) })
    );
    expect(ok.ok && ok.plan.oneOffChargeMinor).toBe(MOVE_CHARGE_MINOR);

    const same = planOrder({ orderType: 'MOVE', siteId: SITE_A, serviceId: SVC, targetSiteId: SITE_A }, ctx({ service }));
    expect(issuesOf(same)[0].field).toBe('targetSiteId');
  });
});

describe('planOrder CEASE', () => {
  it('blocks ceasing connectivity while dependent services remain', () => {
    const fibre = makeService();
    const voice = makeService({ id: 'v1', category: 'VOICE', productCode: 'VOICE-SIP-4', productName: 'SIP Voice (4 channels)' });
    const result = planOrder({ orderType: 'CEASE', siteId: SITE_A, serviceId: SVC }, ctx({ service: fibre, servicesAtSite: [fibre, voice] }));
    expect(issuesOf(result)[0].message).toMatch(/SIP Voice/);
  });

  it('returns a negative monthly delta', () => {
    const fibre = makeService({ monthlyChargeMinor: 7500 });
    const result = planOrder({ orderType: 'CEASE', siteId: SITE_A, serviceId: SVC }, ctx({ service: fibre, servicesAtSite: [fibre] }));
    expect(result.ok && result.plan.monthlyDeltaMinor).toBe(-7500);
  });
});

describe('annualisedImpactMinor', () => {
  it('counts twelve months of increases plus one-off charges', () => {
    expect(annualisedImpactMinor({ monthlyDeltaMinor: 1000, oneOffChargeMinor: 500 })).toBe(12500);
  });
  it('ignores recurring reductions', () => {
    expect(annualisedImpactMinor({ monthlyDeltaMinor: -1000, oneOffChargeMinor: 500 })).toBe(500);
  });
});
```

## apps/gokinetic-business/api/src/modules/orders/order-planner.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/orders/order-planner.ts`.

```typescript
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
```

## apps/gokinetic-business/api/src/modules/orders/order-state-machine.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/orders/order-state-machine.ts`.

```typescript
import { InvalidStateTransitionError } from '../../lib/errors';
import { OrderStatus } from './orders.types';

/**
 * Order lifecycle: DRAFT → SUBMITTED → VALIDATED → PROVISIONING → ACTIVE,
 * with CANCELLED available to the customer until provisioning starts and FAILED
 * set by validation (rejection) or provisioning.
 */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['VALIDATED', 'CANCELLED', 'FAILED'],
  VALIDATED: ['PROVISIONING', 'CANCELLED'],
  PROVISIONING: ['ACTIVE', 'FAILED'],
  ACTIVE: [],
  CANCELLED: [],
  FAILED: []
};

export type TransitionActor = 'customer' | 'approver' | 'fulfilment';

/** Which actor class is allowed to drive each target state. */
const ACTOR_FOR_TARGET: Readonly<Record<OrderStatus, readonly TransitionActor[]>> = {
  DRAFT: [],
  SUBMITTED: ['customer'],
  VALIDATED: ['approver', 'fulfilment'],
  PROVISIONING: ['fulfilment'],
  ACTIVE: ['fulfilment'],
  CANCELLED: ['customer', 'approver'],
  FAILED: ['approver', 'fulfilment']
};

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus, actor?: TransitionActor): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  return actor === undefined || ACTOR_FOR_TARGET[to].includes(actor);
}

export function assertTransition(from: OrderStatus, to: OrderStatus, actor?: TransitionActor): void {
  if (!canTransition(from, to, actor)) {
    throw new InvalidStateTransitionError('Order', from, to);
  }
}

export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function isCancellable(status: OrderStatus): boolean {
  return TRANSITIONS[status].includes('CANCELLED');
}
```

## apps/gokinetic-business/api/src/modules/orders/orders.repository.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/orders/orders.repository.ts`.

```typescript
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
```

## apps/gokinetic-business/api/src/modules/orders/orders.routes.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/orders/orders.routes.ts`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { PaginationQuery } from '../../lib/pagination';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { UuidParam, validate } from '../../middleware/validate';
import { listProducts } from './catalogue';
import { MAX_BULK_ITEMS, OrdersService } from './orders.service';
import { ORDER_STATUSES, ORDER_TYPES } from './orders.types';

const OrderRequestSchema = z.object({
  orderType: z.enum(ORDER_TYPES),
  siteId: z.string().uuid(),
  targetSiteId: z.string().uuid().nullish(),
  serviceId: z.string().uuid().nullish(),
  productCode: z.string().trim().max(40).nullish(),
  requestedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'requestedDate must be YYYY-MM-DD')
    .nullish(),
  notes: z.string().trim().max(1000).nullish()
});

const CreateBody = OrderRequestSchema.extend({ submit: z.boolean().default(false) });

const BulkBody = z.object({
  submit: z.boolean().default(false),
  items: z.array(OrderRequestSchema).min(1).max(MAX_BULK_ITEMS)
});

const ListQuery = PaginationQuery.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  orderType: z.enum(ORDER_TYPES).optional(),
  siteId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional()
});

const ReasonBody = z.object({ reason: z.string().trim().min(3).max(500) });

const FulfilBody = z.object({
  status: z.enum(['PROVISIONING', 'ACTIVE', 'FAILED']),
  reason: z.string().trim().max(500).optional()
});

export function ordersRoutes(service: OrdersService): Router {
  const router = Router();

  router.get('/catalogue/products', requirePermission('orders:read'), (_req, res) => {
    res.json({ items: listProducts() });
  });

  router.get(
    '/orders',
    requirePermission('orders:read'),
    validate({ query: ListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof ListQuery>;
      res.json(await service.list(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.post(
    '/orders/quote',
    requirePermission('orders:create'),
    validate({ body: OrderRequestSchema }),
    asyncHandler(async (req, res) => {
      res.json(await service.quote(requireAuth(req), req.body));
    })
  );

  router.post(
    '/orders',
    requirePermission('orders:create'),
    validate({ body: CreateBody }),
    asyncHandler(async (req, res) => {
      const { submit, ...request } = req.body as z.infer<typeof CreateBody>;
      const order = await service.create(requireAuth(req), request, submit);
      res.status(201).location(`/api/v1/orders/${order.id}`).json(order);
    })
  );

  router.post(
    '/orders/bulk',
    requirePermission('orders:create'),
    validate({ body: BulkBody }),
    asyncHandler(async (req, res) => {
      const { submit, items } = req.body as z.infer<typeof BulkBody>;
      res.status(201).json(await service.createBulk(requireAuth(req), items, submit));
    })
  );

  router.get(
    '/orders/:id',
    requirePermission('orders:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.get(requireAuth(req), req.params.id));
    })
  );

  router.post(
    '/orders/:id/submit',
    requirePermission('orders:create'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.submit(requireAuth(req), req.params.id));
    })
  );

  router.post(
    '/orders/:id/approve',
    requirePermission('orders:approve'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.approve(requireAuth(req), req.params.id));
    })
  );

  router.post(
    '/orders/:id/reject',
    requirePermission('orders:approve'),
    validate({ params: UuidParam, body: ReasonBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.reject(requireAuth(req), req.params.id, req.body.reason));
    })
  );

  router.post(
    '/orders/:id/cancel',
    requirePermission('orders:create'),
    validate({ params: UuidParam, body: ReasonBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.cancel(requireAuth(req), req.params.id, req.body.reason));
    })
  );

  router.post(
    '/orders/:id/fulfilment',
    requirePermission('orders:fulfil'),
    validate({ params: UuidParam, body: FulfilBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.fulfil(requireAuth(req), req.params.id, req.body.status, req.body.reason));
    })
  );

  return router;
}
```

## apps/gokinetic-business/api/src/modules/orders/orders.service.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/orders/orders.service.test.ts`.

```typescript
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
```

## apps/gokinetic-business/api/src/modules/orders/orders.service.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/orders/orders.service.ts`.

```typescript
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
```

## apps/gokinetic-business/api/src/modules/orders/orders.types.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/orders/orders.types.ts`.

```typescript
export const ORDER_TYPES = ['PROVIDE', 'MOVE', 'ADD', 'CHANGE', 'CEASE'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = ['DRAFT', 'SUBMITTED', 'VALIDATED', 'PROVISIONING', 'ACTIVE', 'CANCELLED', 'FAILED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const OPEN_ORDER_STATUSES: OrderStatus[] = ['DRAFT', 'SUBMITTED', 'VALIDATED', 'PROVISIONING'];

export interface Order {
  id: string;
  accountId: string;
  batchId: string | null;
  reference: string;
  orderType: OrderType;
  status: OrderStatus;
  siteId: string;
  targetSiteId: string | null;
  serviceId: string | null;
  productCode: string | null;
  bandwidthMbps: number | null;
  monthlyDeltaMinor: number;
  oneOffChargeMinor: number;
  currency: string;
  requiresApproval: boolean;
  approvedBy: string | null;
  requestedDate: string | null;
  notes: string | null;
  failureReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderStatusChange {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string | null;
  reason: string | null;
  changedAt: string;
}

export interface OrderRequest {
  orderType: OrderType;
  siteId: string;
  targetSiteId?: string | null;
  serviceId?: string | null;
  productCode?: string | null;
  requestedDate?: string | null;
  notes?: string | null;
}

export interface OrderBatch {
  id: string;
  reference: string;
  itemCount: number;
  orders: Order[];
}

export interface BulkRowError {
  row: number;
  field: string;
  message: string;
}
```

## apps/gokinetic-business/api/src/modules/payments/payment-gateway.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/payments/payment-gateway.ts`.

```typescript
import { AppError } from '../../lib/errors';
import { currentCorrelationId, logger } from '../../lib/logger';

export interface MandateRequest {
  accountId: string;
  holderName: string;
  sortCode: string;
  accountNumber: string;
}

export interface PaymentGateway {
  /** Creates a Direct Debit mandate; bank details are not retained by this service. */
  createMandate(request: MandateRequest): Promise<{ mandateRef: string }>;
  /** Confirms a card token issued by the provider's hosted fields belongs to us and is reusable. */
  verifyCardToken(token: string): Promise<{ reusableRef: string }>;
  revoke(providerRef: string): Promise<void>;
}

export class PaymentGatewayError extends AppError {
  constructor(detail: string, status = 502) {
    super(status, 'payment-gateway', 'Payment provider error', detail);
  }
}

export interface GatewaySettings {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

/** REST adapter for the payment service provider; propagates the correlation id. */
export function createHttpPaymentGateway(settings: GatewaySettings, fetchImpl: typeof fetch = fetch): PaymentGateway {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
      const response = await fetchImpl(`${settings.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
          'X-Correlation-Id': currentCorrelationId() ?? ''
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      if (response.status === 422) {
        throw new PaymentGatewayError('The payment provider rejected these details', 422);
      }
      if (!response.ok) {
        logger.error('payment gateway call failed', { path, status: response.status });
        throw new PaymentGatewayError('The payment provider is unavailable; please try again later');
      }
      return (response.status === 204 ? undefined : await response.json()) as T;
    } catch (err) {
      if (err instanceof PaymentGatewayError) throw err;
      logger.error('payment gateway unreachable', { path, err });
      throw new PaymentGatewayError('The payment provider is unavailable; please try again later');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    createMandate: (req) => call<{ mandateRef: string }>('POST', '/v1/mandates', req),
    verifyCardToken: (token) => call<{ reusableRef: string }>('POST', '/v1/card-tokens/verify', { token }),
    revoke: async (ref) => {
      await call<void>('DELETE', `/v1/payment-instruments/${encodeURIComponent(ref)}`);
    }
  };
}
```
