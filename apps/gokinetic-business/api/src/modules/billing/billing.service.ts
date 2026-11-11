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
