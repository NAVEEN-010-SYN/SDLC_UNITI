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
