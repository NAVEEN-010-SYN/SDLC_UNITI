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
