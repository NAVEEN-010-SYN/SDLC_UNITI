import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { BillingApi, InventoryApi, OrdersApi, TicketsApi } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { InventorySummary, Order, SpendTrendPoint, Ticket } from '../../core/models/api.models';
import { MoneyPipe, PercentPipe } from '../../shared/money.pipe';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

/** The last `count` billing periods ending with the previous month, as YYYY-MM. */
export function recentPeriods(now: Date, count: number): { from: string; to: string } {
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (count - 1), 1));
  return { from: fmt(from), to: fmt(to) };
}

export function categoryBreakdown(summary: InventorySummary | undefined) {
  if (!summary) return [];
  return Object.entries(summary.byCategory)
    .filter(([, v]) => v.count > 0)
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.monthlyRecurringMinor - a.monthlyRecurringMinor);
}

@Component({
  selector: 'gkb-dashboard',
  standalone: true,
  imports: [RouterLink, MoneyPipe, PercentPipe, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Overview</h1>
    @if (summary(); as s) {
      <div class="tiles">
        <div class="tile"><span class="tile__label">Active sites</span><span class="tile__value">{{ s.activeSiteCount }} / {{ s.siteCount }}</span></div>
        <div class="tile"><span class="tile__label">Services</span><span class="tile__value">{{ s.serviceCount }}</span></div>
        <div class="tile"><span class="tile__label">Monthly recurring</span><span class="tile__value">{{ s.monthlyRecurringMinor | money: s.currency }}</span></div>
        <div class="tile"><span class="tile__label">Total bandwidth</span><span class="tile__value">{{ s.totalBandwidthMbps / 1000 }} Gbps</span></div>
      </div>
      <section>
        <h2>Spend by product</h2>
        <table class="table">
          <thead><tr><th>Category</th><th class="num">Services</th><th class="num">Monthly</th></tr></thead>
          <tbody>
            @for (row of breakdown(); track row.category) {
              <tr><td>{{ row.category }}</td><td class="num">{{ row.count }}</td><td class="num">{{ row.monthlyRecurringMinor | money: s.currency }}</td></tr>
            }
          </tbody>
        </table>
      </section>
    }

    <div class="grid-2">
      <section>
        <h2>Open support tickets</h2>
        @for (t of openTickets(); track t.id) {
          <a class="list-row" [routerLink]="['/tickets', t.id]">
            <gkb-status-badge [status]="t.priority" /> {{ t.reference }} – {{ t.subject }}
            <gkb-status-badge [status]="t.sla.resolution.state" />
          </a>
        } @empty { <p>No open tickets.</p> }
      </section>
      <section>
        <h2>Orders in flight</h2>
        @for (o of openOrders(); track o.id) {
          <a class="list-row" [routerLink]="['/orders', o.id]">{{ o.reference }} · {{ o.orderType }} <gkb-status-badge [status]="o.status" /></a>
        } @empty { <p>No orders in progress.</p> }
      </section>
    </div>

    @if (canSeeBilling()) {
      <section>
        <h2>Spend trend</h2>
        <table class="table">
          <thead><tr><th>Period</th><th class="num">Total</th><th class="num">Change</th></tr></thead>
          <tbody>
            @for (p of trend(); track p.period) {
              <tr>
                <td>{{ p.period }}</td>
                <td class="num">{{ p.totalMinor | money }}</td>
                <td class="num">{{ p.changeMinor === null ? '—' : (p.changeMinor | money: 'GBP' : true) }} @if (p.changeBps !== null) { ({{ p.changeBps | pct: 'bps' }}) }</td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }
  `
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  readonly canSeeBilling = computed(() => this.auth.can('billing:read'));

  readonly summary = toSignal(inject(InventoryApi).summary().pipe(catchError(() => of(undefined))));
  readonly breakdown = computed(() => categoryBreakdown(this.summary()));

  private readonly ticketsPage = toSignal(
    inject(TicketsApi).list({ activeOnly: true }, { page: 1, pageSize: 5 }).pipe(catchError(() => of({ items: [] as Ticket[] }))),
    { initialValue: { items: [] as Ticket[] } }
  );
  readonly openTickets = computed(() => this.ticketsPage().items);

  private readonly ordersPage = toSignal(
    inject(OrdersApi).list({}, { page: 1, pageSize: 20 }).pipe(catchError(() => of({ items: [] as Order[] }))),
    { initialValue: { items: [] as Order[] } }
  );
  readonly openOrders = computed(() =>
    this.ordersPage()
      .items.filter((o) => !['ACTIVE', 'CANCELLED', 'FAILED'].includes(o.status))
      .slice(0, 5)
  );

  readonly trend = toSignal(this.loadTrend(), { initialValue: [] as SpendTrendPoint[] });

  private loadTrend() {
    if (!this.auth.can('billing:read')) return of([] as SpendTrendPoint[]);
    const { from, to } = recentPeriods(new Date(), 6);
    return inject(BillingApi).spendTrend(from, to).pipe(catchError(() => of([] as SpendTrendPoint[])));
  }
}
