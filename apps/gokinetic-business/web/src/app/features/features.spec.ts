import { BusinessUser, InventorySummary, Invoice, InvoiceLine, PaymentMethod, Service } from '../core/models/api.models';
import { canDispute, groupLines } from './billing/billing.components';
import { describeMethod } from './billing/payment-methods.component';
import { categoryBreakdown, recentPeriods } from './dashboard/dashboard.component';
import { formatBandwidth } from './inventory/inventory.components';
import { formatDuration, selectablePeriods } from './sla/sla-report.component';
import { allowedPriorities, transitionLabel } from './tickets/tickets.components';
import { userActions } from './users/users.components';

describe('billing helpers', () => {
  const invoice = (overrides: Partial<Invoice>) => ({ status: 'ISSUED', issueDate: '2024-06-01T00:00:00.000Z', ...overrides }) as Invoice;

  it('allows disputes only for unpaid invoices inside the window', () => {
    const now = new Date('2024-07-15T00:00:00Z');
    expect(canDispute(invoice({}), now)).toBeTrue();
    expect(canDispute(invoice({ status: 'PAID' }), now)).toBeFalse();
    expect(canDispute(invoice({ issueDate: '2024-04-01T00:00:00.000Z' }), now)).toBeFalse();
  });

  it('groups invoice lines by category, largest first', () => {
    const line = (category: string, amountMinor: number) => ({ id: `${category}${amountMinor}`, category, amountMinor }) as InvoiceLine;
    const groups = groupLines([line('VOICE', 2400), line('BROADBAND', 7500), line('VOICE', 2400)]);
    expect(groups.map((g) => [g.category, g.subtotalMinor])).toEqual([
      ['BROADBAND', 7500],
      ['VOICE', 4800]
    ]);
  });

  it('describes payment methods without exposing full numbers', () => {
    expect(describeMethod({ kind: 'CARD', cardBrand: 'VISA', last4: '4242', expiryMonth: 3, expiryYear: 2027 } as PaymentMethod)).toBe('VISA ••••4242 (expires 03/27)');
    expect(describeMethod({ kind: 'DIRECT_DEBIT', sortCodeMasked: '**-**-56', last4: '9911' } as PaymentMethod)).toBe('Direct Debit **-**-56 ••••9911');
  });
});

describe('dashboard helpers', () => {
  it('selects the previous N complete months', () => {
    expect(recentPeriods(new Date('2024-03-10T00:00:00Z'), 6)).toEqual({ from: '2023-09', to: '2024-02' });
  });

  it('orders category spend and drops empty categories', () => {
    const summary = {
      byCategory: {
        BROADBAND: { count: 3, monthlyRecurringMinor: 22500 },
        VOICE: { count: 0, monthlyRecurringMinor: 0 },
        SDWAN: { count: 1, monthlyRecurringMinor: 8900 },
        HOSTED: { count: 2, monthlyRecurringMinor: 30000 }
      }
    } as unknown as InventorySummary;
    expect(categoryBreakdown(summary).map((r) => r.category)).toEqual(['HOSTED', 'BROADBAND', 'SDWAN']);
    expect(categoryBreakdown(undefined)).toEqual([]);
  });
});

describe('inventory and SLA formatting', () => {
  it('formats bandwidth and durations', () => {
    expect(formatBandwidth(2000)).toBe('2 Gbps');
    expect(formatBandwidth(500)).toBe('500 Mbps');
    expect(formatBandwidth(null)).toBe('—');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(135)).toBe('2 h 15 min');
  });

  it('lists reporting periods newest first across a year boundary', () => {
    expect(selectablePeriods(new Date('2024-02-10T00:00:00Z'), 3)).toEqual(['2024-02', '2024-01', '2023-12']);
  });
});

describe('ticket helpers', () => {
  it('restricts priorities by category and service state', () => {
    expect(allowedPriorities('BILLING', undefined)).toEqual(['P3', 'P4']);
    expect(allowedPriorities('FAULT', { status: 'ACTIVE' } as Service)).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(allowedPriorities('FAULT', { status: 'SUSPENDED' } as Service)).toEqual(['P2', 'P3', 'P4']);
  });

  it('labels customer transitions', () => {
    expect(transitionLabel('RESOLVED', 'CLOSED')).toBe('Confirm resolved');
    expect(transitionLabel('OPEN', 'CLOSED')).toBe('Withdraw ticket');
    expect(transitionLabel('RESOLVED', 'IN_PROGRESS')).toBe('Reopen');
  });
});

describe('user lifecycle actions', () => {
  const user = (status: BusinessUser['status'], id = 'u2') => ({ id, status }) as BusinessUser;

  it('follows the user state machine', () => {
    expect(userActions(user('ACTIVE'), 'u1')).toEqual(['suspend', 'deactivate']);
    expect(userActions(user('SUSPENDED'), 'u1')).toEqual(['reactivate', 'deactivate']);
    expect(userActions(user('DEACTIVATED'), 'u1')).toEqual([]);
  });

  it('never offers actions on yourself', () => {
    expect(userActions(user('ACTIVE', 'u1'), 'u1')).toEqual([]);
  });
});
