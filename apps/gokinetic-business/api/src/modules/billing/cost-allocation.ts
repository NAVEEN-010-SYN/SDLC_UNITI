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
