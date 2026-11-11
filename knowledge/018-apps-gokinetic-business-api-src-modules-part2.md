# Go Kinetic Business self-care (B2B): apps/gokinetic-business/api/src/modules (part 2 of 8)

- **Application:** Go Kinetic Business self-care (B2B)
- **Tech stack:** Angular 17 + Node.js/Express API
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 13

## Files

- `apps/gokinetic-business/api/src/modules/audit/audit.routes.ts` (44 lines)
- `apps/gokinetic-business/api/src/modules/audit/audit.service.test.ts` (88 lines)
- `apps/gokinetic-business/api/src/modules/audit/audit.service.ts` (102 lines)
- `apps/gokinetic-business/api/src/modules/billing/billing.repository.ts` (213 lines)
- `apps/gokinetic-business/api/src/modules/billing/billing.routes.ts` (149 lines)
- `apps/gokinetic-business/api/src/modules/billing/billing.service.test.ts` (155 lines)
- `apps/gokinetic-business/api/src/modules/billing/billing.service.ts` (206 lines)
- `apps/gokinetic-business/api/src/modules/billing/billing.types.ts` (83 lines)
- `apps/gokinetic-business/api/src/modules/billing/cost-allocation.test.ts` (175 lines)
- `apps/gokinetic-business/api/src/modules/billing/cost-allocation.ts` (193 lines)
- `apps/gokinetic-business/api/src/modules/inventory/inventory.repository.ts` (270 lines)
- `apps/gokinetic-business/api/src/modules/inventory/inventory.routes.ts` (123 lines)
- `apps/gokinetic-business/api/src/modules/inventory/inventory.service.test.ts` (186 lines)

## apps/gokinetic-business/api/src/modules/audit/audit.routes.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/audit/audit.routes.ts`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { PaginationQuery } from '../../lib/pagination';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AuditService } from './audit.service';

const Filter = z.object({
  entity: z
    .string()
    .regex(/^[a-z_]{2,40}$/, 'entity must be a lower-case entity name')
    .optional(),
  actorId: z.string().uuid().optional()
});

const ListQuery = PaginationQuery.merge(Filter);

export function auditRoutes(service: AuditService): Router {
  const router = Router();

  router.get(
    '/audit-log',
    requirePermission('audit:read'),
    validate({ query: ListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof ListQuery>;
      res.json(await service.list(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.get(
    '/audit-log/export',
    requirePermission('audit:read'),
    validate({ query: Filter }),
    asyncHandler(async (req, res) => {
      const csv = await service.exportCsv(requireAuth(req), res.locals.query as z.infer<typeof Filter>);
      res.type('text/csv').attachment(csv.filename).send(csv.body);
    })
  );

  return router;
}
```

## apps/gokinetic-business/api/src/modules/audit/audit.service.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/audit/audit.service.test.ts`.

```typescript
import { BusinessRuleError } from '../../lib/errors';
import { ACCOUNT_ID, ADMIN_ID, adminCtx } from '../../test/fixtures';
import { AuditRecord, AuditRepository } from './audit.repository';
import { AuditService, auditToCsv, csvField, describeAuditEntry } from './audit.service';

function record(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id: 1,
    accountId: ACCOUNT_ID,
    actorId: ADMIN_ID,
    action: 'site.created',
    entity: 'site',
    entityId: 'x',
    details: { code: 'LDN-01' },
    correlationId: 'corr-12345678',
    createdAt: '2024-06-01T10:00:00.000Z',
    ...overrides
  };
}

describe('describeAuditEntry', () => {
  it('uses specific descriptions where known', () => {
    expect(describeAuditEntry(record())).toBe('Created site LDN-01');
    expect(
      describeAuditEntry(record({ action: 'user.role_changed', details: { from: { role: 'BUSINESS_USER' }, to: { role: 'BUSINESS_ADMIN' } } }))
    ).toBe("Changed a user's role from BUSINESS_USER to BUSINESS_ADMIN");
  });

  it('derives descriptions for state-machine actions', () => {
    expect(describeAuditEntry(record({ action: 'order.provisioning', details: {} }))).toBe('Moved an order to PROVISIONING');
    expect(describeAuditEntry(record({ action: 'ticket.pending_customer', details: {} }))).toBe('Moved a ticket to PENDING CUSTOMER');
  });

  it('falls back to the raw action', () => {
    expect(describeAuditEntry(record({ action: 'contract.renewed', details: {} }))).toBe('contract.renewed');
  });
});

describe('csvField', () => {
  it.each([
    ['plain', 'plain'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['=SUM(A1)', "'=SUM(A1)"],
    ['-1,2', `"'-1,2"`]
  ])('escapes %s', (input, expected) => {
    expect(csvField(input)).toBe(expected);
  });
});

describe('auditToCsv', () => {
  it('writes a header and CRLF-terminated rows', () => {
    const csv = auditToCsv([{ ...record(), summary: 'Created site LDN-01' }]);
    expect(csv.split('\r\n')).toEqual([
      'timestamp,actor_id,action,entity,entity_id,summary,correlation_id',
      `2024-06-01T10:00:00.000Z,${ADMIN_ID},site.created,site,x,Created site LDN-01,corr-12345678`,
      ''
    ]);
  });
});

describe('AuditService.exportCsv', () => {
  function repoWith(total: number, perPage: (page: number) => number): jest.Mocked<AuditRepository> {
    return {
      record: jest.fn(),
      list: jest.fn(async (_acc, _filter, page) => ({
        items: Array.from({ length: perPage(page.page) }, (_, i) => record({ id: i })),
        page: page.page,
        pageSize: page.pageSize,
        total
      }))
    };
  }

  it('pages through results until a short page', async () => {
    const repo = repoWith(150, (p) => (p === 1 ? 100 : 50));
    const csv = await new AuditService(repo).exportCsv(adminCtx(), {});
    expect(repo.list).toHaveBeenCalledTimes(2);
    expect(csv.body.trim().split('\r\n')).toHaveLength(151);
    expect(csv.filename).toMatch(/^audit-ACC-10000001-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('refuses exports beyond the row cap', async () => {
    const repo = repoWith(9_999, () => 100);
    await expect(new AuditService(repo).exportCsv(adminCtx(), {})).rejects.toThrow(BusinessRuleError);
  });
});
```

## apps/gokinetic-business/api/src/modules/audit/audit.service.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/audit/audit.service.ts`.

```typescript
import { AuthContext } from '../../auth/permissions';
import { BusinessRuleError } from '../../lib/errors';
import { Page, PageRequest, mapPage } from '../../lib/pagination';
import { AuditRecord, AuditRepository } from './audit.repository';

export interface AuditView extends AuditRecord {
  summary: string;
}

export interface AuditFilter {
  entity?: string;
  actorId?: string;
}

/** CSV exports are capped to keep the request inside the statement timeout. */
export const MAX_EXPORT_ROWS = 5_000;
const EXPORT_PAGE_SIZE = 100;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/**
 * Human-readable one-liners for the portal's activity log. Unknown actions fall back to
 * the raw action name so new events are visible before a description is added here.
 */
const DESCRIBERS: Record<string, (d: Record<string, unknown>) => string> = {
  'user.invited': (d) => `Invited a user as ${str(d.role)}`,
  'user.reinvited': (d) => `Re-invited a previously deactivated user as ${str(d.role)}`,
  'user.role_changed': (d) => {
    const from = d.from as { role?: string } | undefined;
    const to = d.to as { role?: string } | undefined;
    return `Changed a user's role from ${str(from?.role)} to ${str(to?.role)}`;
  },
  'user.suspended': () => 'Suspended a user',
  'user.reactivated': () => 'Reactivated a user',
  'user.deactivated': () => 'Deactivated a user',
  'user.invitation_resent': () => 'Re-sent a user invitation',
  'site.created': (d) => `Created site ${str(d.code)}`,
  'site.updated': () => 'Updated site details',
  'site.decommissioned': () => 'Decommissioned a site',
  'order.created': (d) => `Created ${str(d.type)} order ${str(d.reference)}`,
  'order.bulk_created': (d) => `Created bulk order ${str(d.reference)} with ${str(d.itemCount)} item(s)`,
  'invoice.disputed': (d) => `Disputed invoice ${str(d.number)}`,
  'cost_centre.created': (d) => `Created cost centre ${str(d.code)}`,
  'cost_centre.updated': () => 'Updated a cost centre',
  'cost_centre.split_updated': () => 'Changed a site cost split',
  'ticket.created': (d) => `Raised ${str(d.priority)} ${str(d.category)} ticket ${str(d.reference)}`,
  'ticket.escalated': (d) => `Escalated a ticket to level ${str(d.level)}`,
  'ticket.reprioritised': (d) => `Changed ticket priority from ${str(d.from)} to ${str(d.to)}`,
  'account.approval_threshold_changed': () => 'Changed the order approval threshold',
  'payment_method.added': (d) => `Added a ${str(d.kind) === 'CARD' ? 'card' : 'Direct Debit'} ending ${str(d.last4)}`,
  'payment_method.removed': (d) => `Removed a payment method ending ${str(d.last4)}`,
  'payment_method.default_changed': (d) => `Made the payment method ending ${str(d.last4)} the default`
};

export function describeAuditEntry(record: Pick<AuditRecord, 'action' | 'details'>): string {
  const describer = DESCRIBERS[record.action];
  if (describer) return describer(record.details ?? {});
  const [entity, verb] = record.action.split('.');
  if (entity === 'order' && verb) return `Moved an order to ${verb.toUpperCase()}`;
  if (entity === 'ticket' && verb) return `Moved a ticket to ${verb.toUpperCase().replace(/_/g, ' ')}`;
  return record.action;
}

/** RFC 4180 field escaping, plus a guard against spreadsheet formula injection. */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function auditToCsv(rows: AuditView[]): string {
  const header = ['timestamp', 'actor_id', 'action', 'entity', 'entity_id', 'summary', 'correlation_id'];
  const lines = rows.map((r) =>
    [r.createdAt, r.actorId ?? '', r.action, r.entity, r.entityId, r.summary, r.correlationId ?? ''].map(csvField).join(',')
  );
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async list(ctx: AuthContext, filter: AuditFilter, page: PageRequest): Promise<Page<AuditView>> {
    const result = await this.repo.list(ctx.accountId, filter, page);
    return mapPage(result, (r) => ({ ...r, summary: describeAuditEntry(r) }));
  }

  async exportCsv(ctx: AuthContext, filter: AuditFilter): Promise<{ filename: string; body: string }> {
    const rows: AuditView[] = [];
    for (let page = 1; rows.length < MAX_EXPORT_ROWS; page++) {
      const result = await this.list(ctx, filter, { page, pageSize: EXPORT_PAGE_SIZE });
      rows.push(...result.items);
      if (page === 1 && result.total > MAX_EXPORT_ROWS) {
        throw new BusinessRuleError('export-too-large', `Narrow the filter: exports are limited to ${MAX_EXPORT_ROWS} rows`, {
          total: result.total
        });
      }
      if (result.items.length < EXPORT_PAGE_SIZE) break;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `audit-${ctx.accountId}-${stamp}.csv`, body: auditToCsv(rows) };
  }
}
```

## apps/gokinetic-business/api/src/modules/billing/billing.repository.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/billing/billing.repository.ts`.

```typescript
import { Db, WhereBuilder } from '../../db/query';
import { Page, PageRequest, pageOf, toLimitOffset } from '../../lib/pagination';
import { CostCentre, Invoice, InvoiceLine, InvoiceStatus, SiteSplitRule } from './billing.types';

interface InvoiceRow {
  id: string;
  account_id: string;
  number: string;
  period: string;
  issue_date: Date;
  due_date: Date;
  status: InvoiceStatus;
  subtotal_minor: string;
  tax_minor: string;
  total_minor: string;
  currency: string;
  total?: string;
}

interface LineRow {
  id: string;
  invoice_id: string;
  service_id: string | null;
  site_id: string | null;
  description: string;
  category: string;
  amount_minor: string;
  cost_centre_id: string | null;
}

interface CostCentreRow {
  id: string;
  account_id: string;
  code: string;
  name: string;
  monthly_budget_minor: string | null;
  active: boolean;
}

const toInvoice = (r: InvoiceRow): Invoice => ({
  id: r.id,
  accountId: r.account_id,
  number: r.number,
  period: r.period,
  issueDate: r.issue_date.toISOString(),
  dueDate: r.due_date.toISOString(),
  status: r.status,
  subtotalMinor: Number(r.subtotal_minor),
  taxMinor: Number(r.tax_minor),
  totalMinor: Number(r.total_minor),
  currency: r.currency
});

const toLine = (r: LineRow): InvoiceLine => ({
  id: r.id,
  invoiceId: r.invoice_id,
  serviceId: r.service_id,
  siteId: r.site_id,
  description: r.description,
  category: r.category,
  amountMinor: Number(r.amount_minor),
  costCentreId: r.cost_centre_id
});

const toCostCentre = (r: CostCentreRow): CostCentre => ({
  id: r.id,
  accountId: r.account_id,
  code: r.code,
  name: r.name,
  monthlyBudgetMinor: r.monthly_budget_minor === null ? null : Number(r.monthly_budget_minor),
  active: r.active
});

export interface InvoiceFilter {
  status?: InvoiceStatus;
  fromPeriod?: string;
  toPeriod?: string;
}

export interface BillingRepository {
  listInvoices(accountId: string, filter: InvoiceFilter, page: PageRequest): Promise<Page<Invoice>>;
  findInvoice(accountId: string, invoiceId: string, db?: Db): Promise<Invoice | null>;
  invoiceLines(invoiceId: string): Promise<InvoiceLine[]>;
  setInvoiceStatus(invoiceId: string, status: InvoiceStatus, db: Db): Promise<Invoice>;
  costCentres(accountId: string): Promise<CostCentre[]>;
  findCostCentre(accountId: string, id: string, db?: Db): Promise<CostCentre | null>;
  insertCostCentre(accountId: string, cc: Pick<CostCentre, 'code' | 'name' | 'monthlyBudgetMinor'>, db?: Db): Promise<CostCentre>;
  updateCostCentre(accountId: string, id: string, patch: Partial<Pick<CostCentre, 'name' | 'monthlyBudgetMinor' | 'active'>>, db?: Db): Promise<CostCentre>;
  costCentreUsage(accountId: string, id: string, db?: Db): Promise<{ sites: number; splitRules: number; services: number }>;
  siteCostCentres(accountId: string): Promise<Map<string, string | null>>;
  splitRules(accountId: string, siteId?: string): Promise<SiteSplitRule[]>;
  replaceSplitRules(accountId: string, siteId: string, rules: Array<Pick<SiteSplitRule, 'costCentreId' | 'shareBps'>>, db: Db): Promise<void>;
  periodSpend(accountId: string, fromPeriod: string, toPeriod: string): Promise<Array<{ period: string; totalMinor: number; taxMinor: number }>>;
}

export function createBillingRepository(defaultDb: Db): BillingRepository {
  return {
    async listInvoices(accountId, filter, page) {
      const where = new WhereBuilder()
        .add('account_id = ?', accountId)
        .add('period >= ?', filter.fromPeriod)
        .add('period <= ?', filter.toPeriod);
      if (filter.status === 'OVERDUE') {
        where.addRaw(`(status = 'OVERDUE' OR (status = 'ISSUED' AND due_date < now()))`);
      } else if (filter.status === 'ISSUED') {
        where.addRaw(`status = 'ISSUED' AND due_date >= now()`);
      } else {
        where.add('status = ?', filter.status);
      }
      const { limit, offset } = toLimitOffset(page);
      const rows = await defaultDb.many<InvoiceRow>(
        `SELECT *, count(*) OVER() AS total FROM invoices ${where.toSql()}
          ORDER BY period DESC
          LIMIT ${where.nextParam(limit)} OFFSET ${where.nextParam(offset)}`,
        where.params
      );
      return pageOf(rows.map(toInvoice), page, rows.length ? Number(rows[0].total) : 0);
    },

    async findInvoice(accountId, invoiceId, db = defaultDb) {
      const row = await db.oneOrNone<InvoiceRow>('SELECT * FROM invoices WHERE account_id = $1 AND id = $2', [accountId, invoiceId]);
      return row ? toInvoice(row) : null;
    },

    async invoiceLines(invoiceId) {
      const rows = await defaultDb.many<LineRow>('SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY site_id NULLS LAST, description', [invoiceId]);
      return rows.map(toLine);
    },

    async setInvoiceStatus(invoiceId, status, db) {
      return toInvoice(await db.one<InvoiceRow>('UPDATE invoices SET status = $2 WHERE id = $1 RETURNING *', [invoiceId, status]));
    },

    async costCentres(accountId) {
      const rows = await defaultDb.many<CostCentreRow>('SELECT * FROM cost_centres WHERE account_id = $1 ORDER BY code', [accountId]);
      return rows.map(toCostCentre);
    },

    async findCostCentre(accountId, id, db = defaultDb) {
      const row = await db.oneOrNone<CostCentreRow>('SELECT * FROM cost_centres WHERE account_id = $1 AND id = $2', [accountId, id]);
      return row ? toCostCentre(row) : null;
    },

    async insertCostCentre(accountId, cc, db = defaultDb) {
      const row = await db.one<CostCentreRow>(
        `INSERT INTO cost_centres (account_id, code, name, monthly_budget_minor) VALUES ($1, upper($2), $3, $4) RETURNING *`,
        [accountId, cc.code, cc.name, cc.monthlyBudgetMinor]
      );
      return toCostCentre(row);
    },

    async updateCostCentre(accountId, id, patch, db = defaultDb) {
      const row = await db.one<CostCentreRow>(
        `UPDATE cost_centres SET
            name = coalesce($3, name),
            monthly_budget_minor = CASE WHEN $4::boolean THEN $5::bigint ELSE monthly_budget_minor END,
            active = coalesce($6, active)
          WHERE account_id = $1 AND id = $2 RETURNING *`,
        [accountId, id, patch.name ?? null, 'monthlyBudgetMinor' in patch, patch.monthlyBudgetMinor ?? null, patch.active ?? null]
      );
      return toCostCentre(row);
    },

    async costCentreUsage(accountId, id, db = defaultDb) {
      const row = await db.one<{ sites: string; split_rules: string; services: string }>(
        `SELECT
           (SELECT count(*) FROM sites WHERE account_id = $1 AND cost_centre_id = $2 AND status <> 'DECOMMISSIONED') AS sites,
           (SELECT count(*) FROM cost_centre_split_rules WHERE account_id = $1 AND cost_centre_id = $2) AS split_rules,
           (SELECT count(*) FROM services WHERE account_id = $1 AND cost_centre_id = $2 AND status <> 'CEASED') AS services`,
        [accountId, id]
      );
      return { sites: Number(row.sites), splitRules: Number(row.split_rules), services: Number(row.services) };
    },

    async siteCostCentres(accountId) {
      const rows = await defaultDb.many<{ id: string; cost_centre_id: string | null }>(
        'SELECT id, cost_centre_id FROM sites WHERE account_id = $1',
        [accountId]
      );
      return new Map(rows.map((r) => [r.id, r.cost_centre_id]));
    },

    async splitRules(accountId, siteId) {
      const rows = await defaultDb.many<{ site_id: string; cost_centre_id: string; share_bps: number }>(
        `SELECT site_id, cost_centre_id, share_bps FROM cost_centre_split_rules
          WHERE account_id = $1 AND ($2::uuid IS NULL OR site_id = $2) ORDER BY site_id, share_bps DESC`,
        [accountId, siteId ?? null]
      );
      return rows.map((r) => ({ siteId: r.site_id, costCentreId: r.cost_centre_id, shareBps: r.share_bps }));
    },

    async replaceSplitRules(accountId, siteId, rules, db) {
      await db.exec('DELETE FROM cost_centre_split_rules WHERE account_id = $1 AND site_id = $2', [accountId, siteId]);
      for (const rule of rules) {
        await db.exec(
          'INSERT INTO cost_centre_split_rules (account_id, site_id, cost_centre_id, share_bps) VALUES ($1,$2,$3,$4)',
          [accountId, siteId, rule.costCentreId, rule.shareBps]
        );
      }
    },

    async periodSpend(accountId, fromPeriod, toPeriod) {
      const rows = await defaultDb.many<{ period: string; total_minor: string; tax_minor: string }>(
        `SELECT period, total_minor, tax_minor FROM invoices
          WHERE account_id = $1 AND period BETWEEN $2 AND $3 AND status <> 'VOID'
          ORDER BY period`,
        [accountId, fromPeriod, toPeriod]
      );
      return rows.map((r) => ({ period: r.period, totalMinor: Number(r.total_minor), taxMinor: Number(r.tax_minor) }));
    }
  };
}
```

## apps/gokinetic-business/api/src/modules/billing/billing.routes.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/billing/billing.routes.ts`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { PaginationQuery } from '../../lib/pagination';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { UuidParam, validate } from '../../middleware/validate';
import { BillingService } from './billing.service';
import { INVOICE_STATUSES } from './billing.types';

const Period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be YYYY-MM');

const InvoiceListQuery = PaginationQuery.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  fromPeriod: Period.optional(),
  toPeriod: Period.optional()
});

const TrendQuery = z.object({ fromPeriod: Period, toPeriod: Period });

const DisputeBody = z.object({ reason: z.string().trim().min(10).max(2000) });

const CostCentreBody = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{2,20}$/, 'code must be 2-20 letters, digits, - or _'),
  name: z.string().trim().min(2).max(100),
  monthlyBudgetMinor: z.number().int().nonnegative().nullable().default(null)
});

const CostCentrePatch = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    monthlyBudgetMinor: z.number().int().nonnegative().nullable().optional(),
    active: z.boolean().optional()
  })
  .refine((b) => Object.keys(b).length > 0, 'At least one field must be supplied');

const SplitBody = z.object({
  rules: z
    .array(z.object({ costCentreId: z.string().uuid(), shareBps: z.number().int().min(1).max(10_000) }))
    .max(20)
});

const SiteParam = z.object({ siteId: z.string().uuid() });

export function billingRoutes(service: BillingService): Router {
  const router = Router();

  router.get(
    '/invoices',
    requirePermission('billing:read'),
    validate({ query: InvoiceListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof InvoiceListQuery>;
      res.json(await service.listInvoices(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.get(
    '/invoices/:id',
    requirePermission('billing:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.getInvoice(requireAuth(req), req.params.id));
    })
  );

  router.post(
    '/invoices/:id/dispute',
    requirePermission('billing:manage'),
    validate({ params: UuidParam, body: DisputeBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.disputeInvoice(requireAuth(req), req.params.id, req.body.reason));
    })
  );

  router.get(
    '/invoices/:id/allocation',
    requirePermission('billing:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      const ctx = requireAuth(req);
      if (req.accepts(['application/json', 'text/csv']) === 'text/csv') {
        const csv = await service.allocationCsv(ctx, req.params.id);
        res.type('text/csv').attachment(csv.filename).send(csv.body);
        return;
      }
      res.json(await service.allocationReport(ctx, req.params.id));
    })
  );

  router.get(
    '/billing/spend-trend',
    requirePermission('billing:read'),
    validate({ query: TrendQuery }),
    asyncHandler(async (req, res) => {
      const { fromPeriod, toPeriod } = res.locals.query as z.infer<typeof TrendQuery>;
      res.json({ items: await service.spendTrend(requireAuth(req), fromPeriod, toPeriod) });
    })
  );

  router.get(
    '/cost-centres',
    requirePermission('billing:read'),
    asyncHandler(async (req, res) => {
      res.json({ items: await service.listCostCentres(requireAuth(req)) });
    })
  );

  router.post(
    '/cost-centres',
    requirePermission('billing:manage'),
    validate({ body: CostCentreBody }),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createCostCentre(requireAuth(req), req.body));
    })
  );

  router.patch(
    '/cost-centres/:id',
    requirePermission('billing:manage'),
    validate({ params: UuidParam, body: CostCentrePatch }),
    asyncHandler(async (req, res) => {
      res.json(await service.updateCostCentre(requireAuth(req), req.params.id, req.body));
    })
  );

  router.get(
    '/sites/:siteId/cost-split',
    requirePermission('billing:read'),
    validate({ params: SiteParam }),
    asyncHandler(async (req, res) => {
      res.json({ items: await service.getSplitRules(requireAuth(req), req.params.siteId) });
    })
  );

  router.put(
    '/sites/:siteId/cost-split',
    requirePermission('billing:manage'),
    validate({ params: SiteParam, body: SplitBody }),
    asyncHandler(async (req, res) => {
      res.json({ items: await service.setSplitRules(requireAuth(req), req.params.siteId, req.body.rules) });
    })
  );

  return router;
}
```

## apps/gokinetic-business/api/src/modules/billing/billing.service.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/billing/billing.service.test.ts`.

```typescript
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
```

## apps/gokinetic-business/api/src/modules/billing/billing.service.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/billing/billing.service.ts`.

```typescript
import { AuthContext } from '../../auth/permissions';
import { Db } from '../../db/query';
import { BusinessRuleError, InvalidStateTransitionError, NotFoundError } from '../../lib/errors';
import { Clock, MS_PER_DAY, systemClock } from '../../lib/dates';
import { Page, PageRequest, mapPage } from '../../lib/pagination';
import { AuditRepository } from '../audit/audit.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { BillingRepository, InvoiceFilter } from './billing.repository';
import {
  AllocationReport,
  CostCentre,
  DISPUTE_WINDOW_DAYS,
  Invoice,
  InvoiceLine,
  SiteSplitRule
} from './billing.types';
import { allocationReportToCsv, buildAllocationReport, validateSplitRules } from './cost-allocation';

export interface InvoiceDetail extends Invoice {
  lines: InvoiceLine[];
  daysOverdue: number;
}

export interface SpendTrendPoint {
  period: string;
  totalMinor: number;
  changeMinor: number | null;
  changeBps: number | null;
}

/** An unpaid invoice past its due date is reported as OVERDUE even before the nightly job flips it. */
export function effectiveStatus(invoice: Invoice, now: Date): Invoice['status'] {
  if (invoice.status === 'ISSUED' && new Date(invoice.dueDate).getTime() < now.getTime()) return 'OVERDUE';
  return invoice.status;
}

export function daysOverdue(invoice: Invoice, now: Date): number {
  const status = effectiveStatus(invoice, now);
  if (status !== 'OVERDUE') return 0;
  return Math.floor((now.getTime() - new Date(invoice.dueDate).getTime()) / MS_PER_DAY);
}

export function buildSpendTrend(points: Array<{ period: string; totalMinor: number }>): SpendTrendPoint[] {
  return points.map((p, i) => {
    if (i === 0) return { period: p.period, totalMinor: p.totalMinor, changeMinor: null, changeBps: null };
    const prev = points[i - 1].totalMinor;
    const changeMinor = p.totalMinor - prev;
    return {
      period: p.period,
      totalMinor: p.totalMinor,
      changeMinor,
      changeBps: prev === 0 ? null : Math.round((changeMinor * 10_000) / prev)
    };
  });
}

export class BillingService {
  constructor(
    private readonly db: Db,
    private readonly repo: BillingRepository,
    private readonly inventory: InventoryRepository,
    private readonly audit: AuditRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async listInvoices(ctx: AuthContext, filter: InvoiceFilter, page: PageRequest): Promise<Page<Invoice>> {
    const now = this.clock.now();
    const result = await this.repo.listInvoices(ctx.accountId, filter, page);
    return mapPage(result, (inv) => ({ ...inv, status: effectiveStatus(inv, now) }));
  }

  async getInvoice(ctx: AuthContext, invoiceId: string): Promise<InvoiceDetail> {
    const invoice = await this.requireInvoice(ctx, invoiceId);
    const now = this.clock.now();
    const lines = await this.repo.invoiceLines(invoice.id);
    return { ...invoice, status: effectiveStatus(invoice, now), lines, daysOverdue: daysOverdue(invoice, now) };
  }

  async disputeInvoice(ctx: AuthContext, invoiceId: string, reason: string): Promise<Invoice> {
    return this.db.tx(async (tx) => {
      const invoice = await this.requireInvoice(ctx, invoiceId, tx);
      const now = this.clock.now();
      const status = effectiveStatus(invoice, now);
      if (status !== 'ISSUED' && status !== 'OVERDUE') {
        throw new InvalidStateTransitionError('Invoice', status, 'DISPUTED');
      }
      const ageDays = (now.getTime() - new Date(invoice.issueDate).getTime()) / MS_PER_DAY;
      if (ageDays > DISPUTE_WINDOW_DAYS) {
        throw new BusinessRuleError('dispute-window-closed', `Invoices can only be disputed within ${DISPUTE_WINDOW_DAYS} days of issue`);
      }
      const updated = await this.repo.setInvoiceStatus(invoice.id, 'DISPUTED', tx);
      await this.audit.record(
        { accountId: ctx.accountId, actorId: ctx.userId, action: 'invoice.disputed', entity: 'invoice', entityId: invoice.id, details: { reason, number: invoice.number } },
        tx
      );
      return updated;
    });
  }

  async allocationReport(ctx: AuthContext, invoiceId: string): Promise<AllocationReport> {
    const invoice = await this.requireInvoice(ctx, invoiceId);
    const [lines, costCentres, siteCostCentres, splitRules] = await Promise.all([
      this.repo.invoiceLines(invoice.id),
      this.repo.costCentres(ctx.accountId),
      this.repo.siteCostCentres(ctx.accountId),
      this.repo.splitRules(ctx.accountId)
    ]);
    return buildAllocationReport({ invoice, lines, costCentres, siteCostCentres, splitRules });
  }

  async allocationCsv(ctx: AuthContext, invoiceId: string): Promise<{ filename: string; body: string }> {
    const report = await this.allocationReport(ctx, invoiceId);
    return { filename: `cost-allocation-${report.invoiceNumber}.csv`, body: allocationReportToCsv(report) };
  }

  async spendTrend(ctx: AuthContext, fromPeriod: string, toPeriod: string): Promise<SpendTrendPoint[]> {
    if (fromPeriod > toPeriod) {
      throw new BusinessRuleError('invalid-period-range', 'fromPeriod must not be after toPeriod');
    }
    return buildSpendTrend(await this.repo.periodSpend(ctx.accountId, fromPeriod, toPeriod));
  }

  listCostCentres(ctx: AuthContext): Promise<CostCentre[]> {
    return this.repo.costCentres(ctx.accountId);
  }

  async createCostCentre(ctx: AuthContext, input: { code: string; name: string; monthlyBudgetMinor: number | null }): Promise<CostCentre> {
    return this.db.tx(async (tx) => {
      const cc = await this.repo.insertCostCentre(ctx.accountId, input, tx);
      await this.audit.record(
        { accountId: ctx.accountId, actorId: ctx.userId, action: 'cost_centre.created', entity: 'cost_centre', entityId: cc.id, details: { code: cc.code } },
        tx
      );
      return cc;
    });
  }

  async updateCostCentre(
    ctx: AuthContext,
    id: string,
    patch: { name?: string; monthlyBudgetMinor?: number | null; active?: boolean }
  ): Promise<CostCentre> {
    return this.db.tx(async (tx) => {
      const existing = await this.repo.findCostCentre(ctx.accountId, id, tx);
      if (!existing) throw new NotFoundError('Cost centre', id);
      if (patch.active === false && existing.active) {
        const usage = await this.repo.costCentreUsage(ctx.accountId, id, tx);
        if (usage.sites + usage.splitRules + usage.services > 0) {
          throw new BusinessRuleError(
            'cost-centre-in-use',
            'Reassign sites, services and split rules before deactivating this cost centre',
            { usage }
          );
        }
      }
      const updated = await this.repo.updateCostCentre(ctx.accountId, id, patch, tx);
      await this.audit.record(
        { accountId: ctx.accountId, actorId: ctx.userId, action: 'cost_centre.updated', entity: 'cost_centre', entityId: id, details: { patch } },
        tx
      );
      return updated;
    });
  }

  async getSplitRules(ctx: AuthContext, siteId: string): Promise<SiteSplitRule[]> {
    await this.requireSite(ctx, siteId);
    return this.repo.splitRules(ctx.accountId, siteId);
  }

  /** Replaces a site's percentage split; an empty list reverts to the site default cost centre. */
  async setSplitRules(
    ctx: AuthContext,
    siteId: string,
    rules: Array<Pick<SiteSplitRule, 'costCentreId' | 'shareBps'>>
  ): Promise<SiteSplitRule[]> {
    await this.requireSite(ctx, siteId);
    const active = new Set((await this.repo.costCentres(ctx.accountId)).filter((c) => c.active).map((c) => c.id));
    validateSplitRules(rules, active);
    await this.db.tx(async (tx) => {
      await this.repo.replaceSplitRules(ctx.accountId, siteId, rules, tx);
      await this.audit.record(
        { accountId: ctx.accountId, actorId: ctx.userId, action: 'cost_centre.split_updated', entity: 'site', entityId: siteId, details: { rules } },
        tx
      );
    });
    return rules.map((r) => ({ siteId, ...r }));
  }

  private async requireInvoice(ctx: AuthContext, invoiceId: string, db?: Db): Promise<Invoice> {
    const invoice = await this.repo.findInvoice(ctx.accountId, invoiceId, db);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    return invoice;
  }

  private async requireSite(ctx: AuthContext, siteId: string): Promise<void> {
    const site = await this.inventory.findSite(ctx.accountId, siteId);
    if (!site) throw new NotFoundError('Site', siteId);
  }

  /** Port used by inventory to validate cost-centre assignments. */
  async isActiveCostCentre(accountId: string, costCentreId: string): Promise<boolean> {
    const cc = await this.repo.findCostCentre(accountId, costCentreId);
    return !!cc && cc.active;
  }
}
```

## apps/gokinetic-business/api/src/modules/billing/billing.types.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/billing/billing.types.ts`.

```typescript
export const INVOICE_STATUSES = ['ISSUED', 'PAID', 'OVERDUE', 'DISPUTED', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export interface Invoice {
  id: string;
  accountId: string;
  number: string;
  period: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  serviceId: string | null;
  siteId: string | null;
  description: string;
  category: string;
  amountMinor: number;
  costCentreId: string | null;
}

export interface CostCentre {
  id: string;
  accountId: string;
  code: string;
  name: string;
  monthlyBudgetMinor: number | null;
  active: boolean;
}

export interface SiteSplitRule {
  siteId: string;
  costCentreId: string;
  shareBps: number;
}

export const UNALLOCATED = 'UNALLOCATED';

export type AllocationSource = 'SERVICE' | 'SITE_SPLIT' | 'SITE' | 'UNALLOCATED';

export interface AllocatedLine {
  lineId: string;
  costCentreId: string;
  amountMinor: number;
  source: AllocationSource;
}

export interface CostCentreAllocation {
  costCentreId: string;
  code: string;
  name: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  lineCount: number;
  budgetMinor: number | null;
  /** Positive when spend exceeds the monthly budget. */
  overBudgetMinor: number;
  shareBps: number;
}

export interface AllocationReport {
  invoiceId: string;
  invoiceNumber: string;
  period: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  allocations: CostCentreAllocation[];
  lines: AllocatedLine[];
}

/** Customers may dispute an invoice within this many days of issue. */
export const DISPUTE_WINDOW_DAYS = 60;
```

## apps/gokinetic-business/api/src/modules/billing/cost-allocation.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/billing/cost-allocation.test.ts`.

```typescript
import { BusinessRuleError } from '../../lib/errors';
import { ACCOUNT_ID, SITE_A, SITE_B } from '../../test/fixtures';
import { CostCentre, Invoice, InvoiceLine, UNALLOCATED } from './billing.types';
import { allocationReportToCsv, buildAllocationReport, validateSplitRules } from './cost-allocation';

const CC_OPS = 'cc-ops';
const CC_SALES = 'cc-sales';
const CC_IT = 'cc-it';

const costCentres: CostCentre[] = [
  { id: CC_OPS, accountId: ACCOUNT_ID, code: 'OPS', name: 'Operations', monthlyBudgetMinor: 10_000, active: true },
  { id: CC_SALES, accountId: ACCOUNT_ID, code: 'SALES', name: 'Sales', monthlyBudgetMinor: null, active: true },
  { id: CC_IT, accountId: ACCOUNT_ID, code: 'IT', name: 'IT', monthlyBudgetMinor: 50_000, active: false }
];

function invoice(subtotal: number, tax: number): Invoice {
  return {
    id: 'inv-1',
    accountId: ACCOUNT_ID,
    number: 'INV-0001',
    period: '2024-05',
    issueDate: '2024-06-01T00:00:00.000Z',
    dueDate: '2024-06-30T00:00:00.000Z',
    status: 'ISSUED',
    subtotalMinor: subtotal,
    taxMinor: tax,
    totalMinor: subtotal + tax,
    currency: 'GBP'
  };
}

function line(id: string, amount: number, overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    id,
    invoiceId: 'inv-1',
    serviceId: null,
    siteId: SITE_A,
    description: `Line ${id}`,
    category: 'BROADBAND',
    amountMinor: amount,
    costCentreId: null,
    ...overrides
  };
}

describe('validateSplitRules', () => {
  const active = new Set([CC_OPS, CC_SALES]);

  it('accepts shares totalling 100%', () => {
    expect(() =>
      validateSplitRules(
        [
          { costCentreId: CC_OPS, shareBps: 6000 },
          { costCentreId: CC_SALES, shareBps: 4000 }
        ],
        active
      )
    ).not.toThrow();
  });

  it('rejects totals other than 100%', () => {
    expect(() => validateSplitRules([{ costCentreId: CC_OPS, shareBps: 9000 }], active)).toThrow(/90.00%/);
  });

  it('rejects duplicates and inactive cost centres', () => {
    expect(() =>
      validateSplitRules(
        [
          { costCentreId: CC_OPS, shareBps: 5000 },
          { costCentreId: CC_OPS, shareBps: 5000 }
        ],
        active
      )
    ).toThrow(BusinessRuleError);
    expect(() => validateSplitRules([{ costCentreId: CC_IT, shareBps: 10_000 }], active)).toThrow(/inactive/);
  });
});

describe('buildAllocationReport', () => {
  it('applies precedence: service tag, then site split, then site default, then unallocated', () => {
    const report = buildAllocationReport({
      invoice: invoice(10_000, 2_000),
      lines: [
        line('l1', 4_000, { costCentreId: CC_SALES }),
        line('l2', 3_000),
        line('l3', 2_000, { siteId: SITE_B }),
        line('l4', 1_000, { siteId: null })
      ],
      costCentres,
      siteCostCentres: new Map([
        [SITE_A, CC_SALES],
        [SITE_B, CC_OPS]
      ]),
      splitRules: [
        { siteId: SITE_A, costCentreId: CC_OPS, shareBps: 3333 },
        { siteId: SITE_A, costCentreId: CC_SALES, shareBps: 6667 }
      ]
    });

    const bySource = report.lines.map((l) => [l.lineId, l.source, l.costCentreId, l.amountMinor]);
    expect(bySource).toEqual([
      ['l1', 'SERVICE', CC_SALES, 4000],
      ['l2', 'SITE_SPLIT', CC_OPS, 1000],
      ['l2', 'SITE_SPLIT', CC_SALES, 2000],
      ['l3', 'SITE', CC_OPS, 2000],
      ['l4', 'UNALLOCATED', UNALLOCATED, 1000]
    ]);

    const totals = Object.fromEntries(report.allocations.map((a) => [a.code, [a.subtotalMinor, a.taxMinor]]));
    expect(totals).toEqual({ OPS: [3000, 600], SALES: [6000, 1200], UNALLOCATED: [1000, 200] });
    expect(report.allocations[report.allocations.length - 1].code).toBe(UNALLOCATED);
  });

  it('never loses a penny when apportioning tax', () => {
    const report = buildAllocationReport({
      invoice: invoice(1_000, 200),
      lines: [line('a', 333, { costCentreId: CC_OPS }), line('b', 333, { costCentreId: CC_SALES }), line('c', 334, { siteId: null })],
      costCentres,
      siteCostCentres: new Map(),
      splitRules: []
    });
    const taxSum = report.allocations.reduce((acc, a) => acc + a.taxMinor, 0);
    const totalSum = report.allocations.reduce((acc, a) => acc + a.totalMinor, 0);
    expect(taxSum).toBe(200);
    expect(totalSum).toBe(1_200);
  });

  it('ignores tags to inactive cost centres and flags over-budget spend', () => {
    const report = buildAllocationReport({
      invoice: invoice(12_000, 0),
      lines: [line('l1', 12_000, { costCentreId: CC_IT })],
      costCentres,
      siteCostCentres: new Map([[SITE_A, CC_OPS]]),
      splitRules: []
    });
    expect(report.allocations).toHaveLength(1);
    expect(report.allocations[0]).toMatchObject({ code: 'OPS', overBudgetMinor: 2_000, shareBps: 10_000 });
  });

  it('refuses invoices whose lines do not reconcile', () => {
    expect(() =>
      buildAllocationReport({ invoice: invoice(5_000, 0), lines: [line('l1', 4_000)], costCentres, siteCostCentres: new Map(), splitRules: [] })
    ).toThrow(/lines total 4000/);
  });

  it('handles credit lines', () => {
    const report = buildAllocationReport({
      invoice: invoice(500, 100),
      lines: [line('l1', 1_000, { costCentreId: CC_OPS }), line('credit', -500, { costCentreId: CC_SALES })],
      costCentres,
      siteCostCentres: new Map(),
      splitRules: []
    });
    const sales = report.allocations.find((a) => a.code === 'SALES')!;
    expect(sales.subtotalMinor).toBe(-500);
    expect(sales.taxMinor).toBe(0);
    expect(report.allocations.find((a) => a.code === 'OPS')!.taxMinor).toBe(100);
  });
});

describe('allocationReportToCsv', () => {
  it('renders money as decimals and neutralises formula injection', () => {
    const report = buildAllocationReport({
      invoice: invoice(1_050, 210),
      lines: [line('l1', 1_050, { costCentreId: 'cc-evil' })],
      costCentres: [{ id: 'cc-evil', accountId: ACCOUNT_ID, code: 'EVIL', name: '=HYPERLINK("x")', monthlyBudgetMinor: null, active: true }],
      siteCostCentres: new Map(),
      splitRules: []
    });
    const csv = allocationReportToCsv(report);
    const [, row] = csv.trim().split('\r\n');
    expect(row).toBe(`INV-0001,2024-05,EVIL,"'=HYPERLINK(""x"")",10.50,2.10,12.60,,0.00,GBP`);
  });
});
```

## apps/gokinetic-business/api/src/modules/billing/cost-allocation.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/billing/cost-allocation.ts`.

```typescript
import { BusinessRuleError } from '../../lib/errors';
import { allocateByWeights, money, CurrencyCode } from '../../lib/money';
import {
  AllocatedLine,
  AllocationReport,
  CostCentre,
  CostCentreAllocation,
  Invoice,
  InvoiceLine,
  SiteSplitRule,
  UNALLOCATED
} from './billing.types';

export const FULL_SHARE_BPS = 10_000;

export interface AllocationInputs {
  invoice: Invoice;
  lines: InvoiceLine[];
  costCentres: CostCentre[];
  /** Default cost centre per site (sites.cost_centre_id). */
  siteCostCentres: Map<string, string | null>;
  splitRules: SiteSplitRule[];
}

/**
 * Validates a set of split rules for one site: shares must be positive, unique per
 * cost centre, reference active cost centres and total exactly 100% (10,000 bps).
 */
export function validateSplitRules(rules: Array<Pick<SiteSplitRule, 'costCentreId' | 'shareBps'>>, activeCostCentreIds: Set<string>): void {
  if (rules.length === 0) return;
  const seen = new Set<string>();
  let total = 0;
  for (const rule of rules) {
    if (!Number.isInteger(rule.shareBps) || rule.shareBps <= 0 || rule.shareBps > FULL_SHARE_BPS) {
      throw new BusinessRuleError('invalid-share', 'Each share must be between 1 and 10000 basis points');
    }
    if (seen.has(rule.costCentreId)) {
      throw new BusinessRuleError('duplicate-cost-centre', 'A cost centre may appear only once in a split');
    }
    if (!activeCostCentreIds.has(rule.costCentreId)) {
      throw new BusinessRuleError('unknown-cost-centre', 'Split references an unknown or inactive cost centre', {
        costCentreId: rule.costCentreId
      });
    }
    seen.add(rule.costCentreId);
    total += rule.shareBps;
  }
  if (total !== FULL_SHARE_BPS) {
    throw new BusinessRuleError('split-total', `Split shares must total 100% (got ${(total / 100).toFixed(2)}%)`, { totalBps: total });
  }
}

/**
 * Decides where a single invoice line's cost goes. Precedence:
 *   1. the service's own cost centre (explicit tagging wins),
 *   2. the site's percentage split rules,
 *   3. the site's default cost centre,
 *   4. UNALLOCATED.
 */
export function allocateLine(
  line: InvoiceLine,
  currency: CurrencyCode,
  activeIds: Set<string>,
  splitsBySite: Map<string, SiteSplitRule[]>,
  siteCostCentres: Map<string, string | null>
): AllocatedLine[] {
  if (line.costCentreId && activeIds.has(line.costCentreId)) {
    return [{ lineId: line.id, costCentreId: line.costCentreId, amountMinor: line.amountMinor, source: 'SERVICE' }];
  }
  if (line.siteId) {
    const splits = (splitsBySite.get(line.siteId) ?? []).filter((r) => activeIds.has(r.costCentreId));
    if (splits.length > 0) {
      const parts = allocateByWeights(money(line.amountMinor, currency), splits.map((s) => s.shareBps));
      return splits.map((s, i) => ({
        lineId: line.id,
        costCentreId: s.costCentreId,
        amountMinor: parts[i].amountMinor,
        source: 'SITE_SPLIT' as const
      }));
    }
    const siteDefault = siteCostCentres.get(line.siteId);
    if (siteDefault && activeIds.has(siteDefault)) {
      return [{ lineId: line.id, costCentreId: siteDefault, amountMinor: line.amountMinor, source: 'SITE' }];
    }
  }
  return [{ lineId: line.id, costCentreId: UNALLOCATED, amountMinor: line.amountMinor, source: 'UNALLOCATED' }];
}

/**
 * Produces a cost-centre allocation for an invoice. Line amounts are allocated by rule;
 * the invoice's tax is then apportioned pro-rata to each cost centre's subtotal using the
 * largest-remainder method so every penny is accounted for exactly once.
 */
export function buildAllocationReport(inputs: AllocationInputs): AllocationReport {
  const { invoice, lines, costCentres } = inputs;
  const currency = invoice.currency as CurrencyCode;
  const lineSubtotal = lines.reduce((acc, l) => acc + l.amountMinor, 0);
  if (lineSubtotal !== invoice.subtotalMinor) {
    throw new BusinessRuleError(
      'invoice-lines-mismatch',
      `Invoice ${invoice.number} lines total ${lineSubtotal} but subtotal is ${invoice.subtotalMinor}`
    );
  }

  const activeIds = new Set(costCentres.filter((c) => c.active).map((c) => c.id));
  const splitsBySite = new Map<string, SiteSplitRule[]>();
  for (const rule of inputs.splitRules) {
    const list = splitsBySite.get(rule.siteId) ?? [];
    list.push(rule);
    splitsBySite.set(rule.siteId, list);
  }

  const allocated = lines.flatMap((l) => allocateLine(l, currency, activeIds, splitsBySite, inputs.siteCostCentres));

  const totals = new Map<string, { subtotal: number; lineIds: Set<string> }>();
  for (const a of allocated) {
    const t = totals.get(a.costCentreId) ?? { subtotal: 0, lineIds: new Set<string>() };
    t.subtotal += a.amountMinor;
    t.lineIds.add(a.lineId);
    totals.set(a.costCentreId, t);
  }

  const keys = [...totals.keys()].sort((a, b) => (a === UNALLOCATED ? 1 : b === UNALLOCATED ? -1 : a.localeCompare(b)));
  const weights = keys.map((k) => Math.max(0, totals.get(k)!.subtotal));
  const taxParts =
    weights.some((w) => w > 0) && invoice.taxMinor !== 0
      ? allocateByWeights(money(invoice.taxMinor, currency), weights).map((m) => m.amountMinor)
      : keys.map(() => 0);

  const byId = new Map(costCentres.map((c) => [c.id, c]));
  const allocations: CostCentreAllocation[] = keys.map((key, i) => {
    const cc = byId.get(key);
    const subtotalMinor = totals.get(key)!.subtotal;
    const taxMinor = taxParts[i];
    const totalMinor = subtotalMinor + taxMinor;
    const budgetMinor = cc?.monthlyBudgetMinor ?? null;
    return {
      costCentreId: key,
      code: cc?.code ?? UNALLOCATED,
      name: cc?.name ?? 'Unallocated',
      subtotalMinor,
      taxMinor,
      totalMinor,
      lineCount: totals.get(key)!.lineIds.size,
      budgetMinor,
      overBudgetMinor: budgetMinor === null ? 0 : Math.max(0, totalMinor - budgetMinor),
      shareBps: invoice.subtotalMinor === 0 ? 0 : Math.round((subtotalMinor * FULL_SHARE_BPS) / invoice.subtotalMinor)
    };
  });

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    period: invoice.period,
    currency: invoice.currency,
    subtotalMinor: invoice.subtotalMinor,
    taxMinor: invoice.taxMinor,
    totalMinor: invoice.totalMinor,
    allocations,
    lines: allocated
  };
}

function csvEscape(value: string): string {
  const isNumeric = /^-?\d+(\.\d+)?$/.test(value);
  const safe = !isNumeric && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function formatMinor(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** CSV export for finance teams; guards against spreadsheet formula injection. */
export function allocationReportToCsv(report: AllocationReport): string {
  const header = ['invoice', 'period', 'cost_centre_code', 'cost_centre_name', 'subtotal', 'tax', 'total', 'budget', 'over_budget', 'currency'];
  const rows = report.allocations.map((a) => [
    report.invoiceNumber,
    report.period,
    a.code,
    a.name,
    formatMinor(a.subtotalMinor),
    formatMinor(a.taxMinor),
    formatMinor(a.totalMinor),
    a.budgetMinor === null ? '' : formatMinor(a.budgetMinor),
    formatMinor(a.overBudgetMinor),
    report.currency
  ]);
  return [header, ...rows].map((r) => r.map((v) => csvEscape(String(v))).join(',')).join('\r\n') + '\r\n';
}
```

## apps/gokinetic-business/api/src/modules/inventory/inventory.repository.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/inventory/inventory.repository.ts`.

```typescript
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
```

## apps/gokinetic-business/api/src/modules/inventory/inventory.routes.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/inventory/inventory.routes.ts`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { PaginationQuery } from '../../lib/pagination';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { UuidParam, validate } from '../../middleware/validate';
import { InventoryService } from './inventory.service';
import { SERVICE_CATEGORIES, SERVICE_STATUSES, SITE_STATUSES } from './inventory.types';

const SiteListQuery = PaginationQuery.extend({
  status: z.enum(SITE_STATUSES).optional(),
  search: z.string().trim().min(2).max(80).optional(),
  costCentreId: z.string().uuid().optional()
});

const CreateSiteBody = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{2,20}$/, 'code must be 2-20 letters, digits or hyphens'),
  name: z.string().trim().min(2).max(120),
  addressLine1: z.string().trim().min(3).max(120),
  addressLine2: z.string().trim().max(120).nullish(),
  city: z.string().trim().min(2).max(80),
  postcode: z.string().trim().min(3).max(10),
  country: z.string().length(2).toUpperCase().default('GB'),
  costCentreId: z.string().uuid().nullish()
});

const UpdateSiteBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    costCentreId: z.string().uuid().nullable().optional()
  })
  .refine((b) => Object.keys(b).length > 0, 'At least one field must be supplied');

const ServiceListQuery = PaginationQuery.extend({
  siteId: z.string().uuid().optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  status: z.enum(SERVICE_STATUSES).optional(),
  contractId: z.string().uuid().optional()
});

export function inventoryRoutes(service: InventoryService): Router {
  const router = Router();

  router.get(
    '/inventory/summary',
    requirePermission('services:read'),
    asyncHandler(async (req, res) => {
      res.json(await service.summary(requireAuth(req)));
    })
  );

  router.get(
    '/sites',
    requirePermission('sites:read'),
    validate({ query: SiteListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof SiteListQuery>;
      res.json(await service.listSites(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.post(
    '/sites',
    requirePermission('sites:manage'),
    validate({ body: CreateSiteBody }),
    asyncHandler(async (req, res) => {
      const site = await service.createSite(requireAuth(req), req.body);
      res.status(201).location(`/api/v1/sites/${site.id}`).json(site);
    })
  );

  router.get(
    '/sites/:id',
    requirePermission('sites:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.getSite(requireAuth(req), req.params.id));
    })
  );

  router.patch(
    '/sites/:id',
    requirePermission('sites:manage'),
    validate({ params: UuidParam, body: UpdateSiteBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.updateSite(requireAuth(req), req.params.id, req.body));
    })
  );

  router.post(
    '/sites/:id/decommission',
    requirePermission('sites:manage'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.decommissionSite(requireAuth(req), req.params.id));
    })
  );

  router.get(
    '/services',
    requirePermission('services:read'),
    validate({ query: ServiceListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof ServiceListQuery>;
      res.json(await service.listServices(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.get(
    '/services/:id',
    requirePermission('services:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.getService(requireAuth(req), req.params.id));
    })
  );

  return router;
}
```

## apps/gokinetic-business/api/src/modules/inventory/inventory.service.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/inventory/inventory.service.test.ts`.

```typescript
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../lib/errors';
import {
  ACCOUNT_ID,
  SITE_A,
  SITE_B,
  adminCtx,
  makeService,
  makeSite,
  passthroughDb,
  recordingAudit,
  userCtx
} from '../../test/fixtures';
import { InventoryRepository } from './inventory.repository';
import { InventoryService, normalisePostcode, summariseServices } from './inventory.service';

function repoMock(): jest.Mocked<InventoryRepository> {
  return {
    listSites: jest.fn(),
    findSite: jest.fn(),
    findSitesByIds: jest.fn(),
    createSite: jest.fn(),
    updateSite: jest.fn(),
    listServices: jest.fn(),
    findService: jest.fn(),
    servicesForSite: jest.fn(),
    allServices: jest.fn(),
    countSites: jest.fn(),
    updateServiceStatus: jest.fn()
  };
}

function setup() {
  const repo = repoMock();
  const costCentres = { isActiveCostCentre: jest.fn(async () => true) };
  const openOrders = { countOpenOrdersForSite: jest.fn(async () => 0) };
  const audit = recordingAudit();
  const service = new InventoryService(passthroughDb(), repo, costCentres, openOrders, audit);
  return { repo, costCentres, openOrders, audit, service };
}

describe('normalisePostcode', () => {
  it.each([
    ['ec1a1bb', 'EC1A 1BB'],
    ['  M1 1AE ', 'M1 1AE'],
    ['b338th', 'B33 8TH'],
    ['CR2 6XH', 'CR2 6XH']
  ])('normalises %s to %s', (input, expected) => {
    expect(normalisePostcode(input, 'GB')).toBe(expected);
  });

  it('rejects malformed UK postcodes', () => {
    expect(() => normalisePostcode('12345', 'GB')).toThrow(BusinessRuleError);
  });

  it('leaves non-UK postcodes upper-cased but otherwise untouched', () => {
    expect(normalisePostcode('d02 x285', 'IE')).toBe('D02 X285');
  });
});

describe('summariseServices', () => {
  it('aggregates recurring charges and bandwidth excluding ceased services', () => {
    const summary = summariseServices(
      [
        makeService({ monthlyChargeMinor: 10000, bandwidthMbps: 1000 }),
        makeService({ category: 'VOICE', bandwidthMbps: null, monthlyChargeMinor: 2500 }),
        makeService({ status: 'SUSPENDED', monthlyChargeMinor: 5000, bandwidthMbps: 500 }),
        makeService({ status: 'CEASED', monthlyChargeMinor: 9999, bandwidthMbps: 2000 }),
        makeService({ status: 'PENDING', monthlyChargeMinor: 7000, bandwidthMbps: 100 })
      ],
      'GBP'
    );
    expect(summary.monthlyRecurringMinor).toBe(17500);
    expect(summary.totalBandwidthMbps).toBe(1000);
    expect(summary.serviceCount).toBe(4);
    expect(summary.byCategory.BROADBAND).toEqual({ count: 3, monthlyRecurringMinor: 15000 });
    expect(summary.byCategory.VOICE).toEqual({ count: 1, monthlyRecurringMinor: 2500 });
    expect(summary.byStatus).toEqual({ PENDING: 1, ACTIVE: 2, SUSPENDED: 1, CEASED: 1 });
  });
});

describe('InventoryService', () => {
  it('restricts site listings to a business user site scope', async () => {
    const { repo, service } = setup();
    repo.listSites.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    await service.listSites(userCtx(), {}, { page: 1, pageSize: 20 });
    expect(repo.listSites).toHaveBeenCalledWith(ACCOUNT_ID, { siteIds: [SITE_A] }, { page: 1, pageSize: 20 });
  });

  it('does not restrict admins', async () => {
    const { repo, service } = setup();
    repo.listSites.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    await service.listSites(adminCtx(), { status: 'ACTIVE' }, { page: 1, pageSize: 20 });
    expect(repo.listSites).toHaveBeenCalledWith(ACCOUNT_ID, { status: 'ACTIVE', siteIds: null }, expect.anything());
  });

  it('hides out-of-scope sites as not found', async () => {
    const { repo, service } = setup();
    repo.findSite.mockResolvedValue(makeSite({ id: SITE_B }));
    await expect(service.getSite(userCtx(), SITE_B)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('computes monthly recurring charge on site detail', async () => {
    const { repo, service } = setup();
    repo.findSite.mockResolvedValue(makeSite());
    repo.servicesForSite.mockResolvedValue([
      makeService({ monthlyChargeMinor: 1000 }),
      makeService({ status: 'CEASED', monthlyChargeMinor: 5000 })
    ]);
    const detail = await service.getSite(adminCtx(), SITE_A);
    expect(detail.monthlyRecurringMinor).toBe(1000);
    expect(detail.services).toHaveLength(2);
  });

  it('creates a site with a normalised postcode and records an audit entry', async () => {
    const { repo, service, audit } = setup();
    repo.createSite.mockImplementation(async (s) => makeSite({ code: s.code, postcode: s.postcode }));
    const site = await service.createSite(adminCtx(), {
      code: 'man-02',
      name: 'Manchester',
      addressLine1: '2 Light St',
      city: 'Manchester',
      postcode: 'm11ae',
      country: 'GB'
    });
    expect(site.postcode).toBe('M1 1AE');
    expect(site.code).toBe('MAN-02');
    expect(audit.entries[0]).toMatchObject({ action: 'site.created', entity: 'site' });
  });

  it('rejects an inactive cost centre', async () => {
    const { service, costCentres } = setup();
    costCentres.isActiveCostCentre.mockResolvedValue(false);
    await expect(
      service.createSite(adminCtx(), {
        code: 'X1',
        name: 'Site',
        addressLine1: '1 Road',
        city: 'Leeds',
        postcode: 'LS1 1UR',
        country: 'GB',
        costCentreId: '99999999-9999-4999-8999-999999999999'
      })
    ).rejects.toMatchObject({ code: 'business-rule/unknown-cost-centre' });
  });

  it('refuses to decommission a site with live services', async () => {
    const { repo, service } = setup();
    repo.findSite.mockResolvedValue(makeSite());
    repo.servicesForSite.mockResolvedValue([makeService()]);
    await expect(service.decommissionSite(adminCtx(), SITE_A)).rejects.toMatchObject({
      code: 'business-rule/site-has-live-services'
    });
  });

  it('refuses to decommission a site with open orders', async () => {
    const { repo, service, openOrders } = setup();
    repo.findSite.mockResolvedValue(makeSite());
    repo.servicesForSite.mockResolvedValue([makeService({ status: 'CEASED' })]);
    openOrders.countOpenOrdersForSite.mockResolvedValue(2);
    await expect(service.decommissionSite(adminCtx(), SITE_A)).rejects.toMatchObject({
      code: 'business-rule/site-has-open-orders'
    });
  });

  it('decommissions an empty site', async () => {
    const { repo, service, audit } = setup();
    repo.findSite.mockResolvedValue(makeSite());
    repo.servicesForSite.mockResolvedValue([]);
    repo.updateSite.mockResolvedValue(makeSite({ status: 'DECOMMISSIONED' }));
    const result = await service.decommissionSite(adminCtx(), SITE_A);
    expect(result.status).toBe('DECOMMISSIONED');
    expect(audit.entries.map((e) => e.action)).toEqual(['site.decommissioned']);
  });

  it('blocks a business user filtering services by a site outside scope', () => {
    const { service } = setup();
    expect(() => service.listServices(userCtx(), { siteId: SITE_B }, { page: 1, pageSize: 20 })).toThrow(ForbiddenError);
  });

  it('refuses edits to decommissioned sites', async () => {
    const { repo, service } = setup();
    repo.findSite.mockResolvedValue(makeSite({ status: 'DECOMMISSIONED' }));
    await expect(service.updateSite(adminCtx(), SITE_A, { name: 'New' })).rejects.toBeInstanceOf(BusinessRuleError);
  });
});
```
