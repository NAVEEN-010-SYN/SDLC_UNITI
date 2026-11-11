# Go Kinetic Business self-care (B2B): apps/gokinetic-business/web/src/app (part 7 of 8)

- **Application:** Go Kinetic Business self-care (B2B)
- **Tech stack:** Angular 17 + Node.js/Express API
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 14

## Files

- `apps/gokinetic-business/web/src/app/features/features.spec.ts` (96 lines)
- `apps/gokinetic-business/web/src/app/features/inventory/inventory.components.ts` (188 lines)
- `apps/gokinetic-business/web/src/app/features/orders/order-wizard.component.ts` (324 lines)
- `apps/gokinetic-business/web/src/app/features/orders/orders.components.ts` (186 lines)
- `apps/gokinetic-business/web/src/app/features/orders/orders.spec.ts` (119 lines)
- `apps/gokinetic-business/web/src/app/features/sla/sla-report.component.ts` (101 lines)
- `apps/gokinetic-business/web/src/app/features/tickets/tickets.components.ts` (345 lines)
- `apps/gokinetic-business/web/src/app/features/users/users.components.ts` (216 lines)
- `apps/gokinetic-business/web/src/app/layout/shell.component.ts` (59 lines)
- `apps/gokinetic-business/web/src/app/shared/components.spec.ts` (146 lines)
- `apps/gokinetic-business/web/src/app/shared/data-table.component.ts` (129 lines)
- `apps/gokinetic-business/web/src/app/shared/download.ts` (10 lines)
- `apps/gokinetic-business/web/src/app/shared/form-errors.ts` (29 lines)
- `apps/gokinetic-business/web/src/app/shared/money.pipe.ts` (46 lines)

## apps/gokinetic-business/web/src/app/features/features.spec.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/features.spec.ts`.

```typescript
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
```

## apps/gokinetic-business/web/src/app/features/inventory/inventory.components.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/inventory/inventory.components.ts`.

```typescript
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { InventoryApi, ServiceFilter, SiteFilter } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/http/api-problem';
import { Service, ServiceCategory, ServiceStatus, SiteDetail, SiteStatus, SiteSummary } from '../../core/models/api.models';
import { CellDirective, Column, DataTableComponent } from '../../shared/data-table.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { pagedQuery } from '../../shared/paged-query';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

const SITE_STATUSES: SiteStatus[] = ['PENDING', 'ACTIVE', 'DECOMMISSIONED'];
const SERVICE_STATUSES: ServiceStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'CEASED'];
const CATEGORIES: ServiceCategory[] = ['BROADBAND', 'VOICE', 'SDWAN', 'HOSTED'];

export function formatBandwidth(mbps: number | null): string {
  if (!mbps) return '—';
  return mbps >= 1000 ? `${mbps / 1000} Gbps` : `${mbps} Mbps`;
}

@Component({
  selector: 'gkb-sites-list',
  standalone: true,
  imports: [DataTableComponent, CellDirective, StatusBadgeComponent, MoneyPipe, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Sites</h1>
      <a routerLink="/inventory/services">All services</a>
    </header>
    <form class="filters" (submit)="$event.preventDefault()">
      <label>Search <input type="search" placeholder="Name, code or postcode" (input)="search($any($event.target).value)" /></label>
      <label>Status
        <select (change)="sites.setFilter({ status: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </label>
    </form>
    <gkb-problem-alert [problem]="sites.error()" />
    <gkb-data-table caption="Sites" [columns]="columns" [rows]="sites.items()" [total]="sites.total()" [page]="sites.page()"
      [pageSize]="sites.pageSize()" [loading]="sites.loading()" [rowClickable]="true"
      (rowClick)="open($event)" (pageChange)="sites.setPage($event.page, $event.pageSize)">
      <ng-template gkbCell="status" let-row><gkb-status-badge [status]="row.status" /></ng-template>
      <ng-template gkbCell="mrc" let-row>{{ row.monthlyRecurringMinor | money }}</ng-template>
    </gkb-data-table>
  `
})
export class SitesListComponent {
  private readonly router = inject(Router);
  private readonly api = inject(InventoryApi);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  readonly statuses = SITE_STATUSES;
  readonly sites = pagedQuery<SiteFilter, SiteSummary>((f, p) => this.api.sites(f, p), {});
  readonly columns: Column<SiteSummary>[] = [
    { key: 'code', header: 'Code', value: (s) => s.code },
    { key: 'name', header: 'Name', value: (s) => s.name },
    { key: 'address', header: 'Address', value: (s) => `${s.addressLine1}, ${s.city} ${s.postcode}` },
    { key: 'status', header: 'Status' },
    { key: 'services', header: 'Active services', value: (s) => s.activeServiceCount, align: 'end' },
    { key: 'bandwidth', header: 'Bandwidth', value: (s) => formatBandwidth(s.totalBandwidthMbps), align: 'end' },
    { key: 'mrc', header: 'Monthly', align: 'end' }
  ];

  /** Debounced so each keystroke does not fire a request; the API needs at least 2 characters. */
  search(term: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      const trimmed = term.trim();
      this.sites.setFilter({ search: trimmed.length >= 2 ? trimmed : undefined });
    }, 300);
  }

  open(site: SiteSummary): void {
    void this.router.navigate(['/inventory/sites', site.id]);
  }
}

@Component({
  selector: 'gkb-site-detail',
  standalone: true,
  imports: [StatusBadgeComponent, MoneyPipe, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/inventory">← Sites</a>
    <gkb-problem-alert [problem]="problem()" />
    @if (site(); as s) {
      <header class="page-header">
        <h1>{{ s.name }} <small>{{ s.code }}</small></h1>
        <gkb-status-badge [status]="s.status" />
      </header>
      <p>{{ s.addressLine1 }}@if (s.addressLine2) {, {{ s.addressLine2 }}}, {{ s.city }} {{ s.postcode }}</p>
      <p>Monthly recurring: <strong>{{ s.monthlyRecurringMinor | money }}</strong></p>
      <div class="actions">
        @if (canOrder() && s.status !== 'DECOMMISSIONED') {
          <a class="button" routerLink="/orders/new" [queryParams]="{ siteId: s.id }">Order for this site</a>
        }
        <a class="button secondary" routerLink="/tickets/new" [queryParams]="{ siteId: s.id }">Report a problem</a>
      </div>
      <h2>Services</h2>
      <table class="table">
        <thead><tr><th>Product</th><th>Category</th><th class="num">Bandwidth</th><th>SLA</th><th>Status</th><th class="num">Monthly</th></tr></thead>
        <tbody>
          @for (svc of s.services; track svc.id) {
            <tr>
              <td>{{ svc.productName }}</td><td>{{ svc.category }}</td><td class="num">{{ bandwidth(svc.bandwidthMbps) }}</td>
              <td>{{ svc.slaTier }}</td><td><gkb-status-badge [status]="svc.status" /></td>
              <td class="num">{{ svc.monthlyChargeMinor | money: svc.currency }}</td>
            </tr>
          } @empty { <tr><td colspan="6" class="empty">No services at this site.</td></tr> }
        </tbody>
      </table>
    }
  `
})
export class SiteDetailComponent {
  private readonly api = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  readonly id = input.required<string>();
  readonly canOrder = computed(() => this.auth.can('orders:create'));
  readonly bandwidth = formatBandwidth;

  private readonly state = toSignal(
    toObservable(this.id).pipe(
      switchMap((id) =>
        this.api.site(id).pipe(
          map((site) => ({ site: site as SiteDetail | null, problem: null as ApiProblem | null })),
          catchError((problem: ApiProblem) => of({ site: null as SiteDetail | null, problem }))
        )
      )
    )
  );
  readonly site = computed(() => this.state()?.site ?? null);
  readonly problem = computed(() => this.state()?.problem ?? null);
}

@Component({
  selector: 'gkb-services-list',
  standalone: true,
  imports: [DataTableComponent, CellDirective, StatusBadgeComponent, MoneyPipe, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/inventory">← Sites</a>
    <h1>Services</h1>
    <form class="filters">
      <label>Category
        <select (change)="services.setFilter({ category: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
        </select>
      </label>
      <label>Status
        <select (change)="services.setFilter({ status: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </label>
    </form>
    <gkb-problem-alert [problem]="services.error()" />
    <gkb-data-table caption="Services" [columns]="columns" [rows]="services.items()" [total]="services.total()"
      [page]="services.page()" [pageSize]="services.pageSize()" [loading]="services.loading()"
      (pageChange)="services.setPage($event.page, $event.pageSize)">
      <ng-template gkbCell="status" let-row><gkb-status-badge [status]="row.status" /></ng-template>
      <ng-template gkbCell="site" let-row><a [routerLink]="['/inventory/sites', row.siteId]">View site</a></ng-template>
      <ng-template gkbCell="charge" let-row>{{ row.monthlyChargeMinor | money: row.currency }}</ng-template>
    </gkb-data-table>
  `
})
export class ServicesListComponent {
  private readonly api = inject(InventoryApi);
  readonly categories = CATEGORIES;
  readonly statuses = SERVICE_STATUSES;
  readonly services = pagedQuery<ServiceFilter, Service>((f, p) => this.api.services(f, p), {});
  readonly columns: Column<Service>[] = [
    { key: 'product', header: 'Product', value: (s) => s.productName },
    { key: 'category', header: 'Category', value: (s) => s.category },
    { key: 'bandwidth', header: 'Bandwidth', value: (s) => formatBandwidth(s.bandwidthMbps), align: 'end' },
    { key: 'sla', header: 'SLA', value: (s) => s.slaTier },
    { key: 'status', header: 'Status' },
    { key: 'site', header: 'Site' },
    { key: 'charge', header: 'Monthly', align: 'end' }
  ];
}
```

## apps/gokinetic-business/web/src/app/features/orders/order-wizard.component.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/orders/order-wizard.component.ts`.

```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith } from 'rxjs';
import { InventoryApi, OrdersApi } from '../../core/api/portal-api';
import { ApiProblem } from '../../core/http/api-problem';
import { CatalogueProduct, OrderQuote, OrderRequest, OrderType, Service } from '../../core/models/api.models';
import { applyProblemToForm, revealErrors } from '../../shared/form-errors';
import { MoneyPipe } from '../../shared/money.pipe';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { errorMessage, leadTimeDate } from '../../shared/validators';

export const ORDER_TYPES: Array<{ value: OrderType; label: string; hint: string }> = [
  { value: 'PROVIDE', label: 'New connection', hint: 'Install fibre connectivity at a site' },
  { value: 'ADD', label: 'Add a service', hint: 'Voice, SD-WAN or hosted services on an existing site' },
  { value: 'CHANGE', label: 'Change speed', hint: 'Upgrade or downgrade an existing service' },
  { value: 'MOVE', label: 'Move a service', hint: 'Relocate a service to another of your sites' },
  { value: 'CEASE', label: 'Cease a service', hint: 'Stop a service at the end of its notice period' }
];

export interface OrderFields {
  service: boolean;
  product: boolean;
  targetSite: boolean;
  minLeadDays: number;
}

/** Which inputs each order type needs, mirroring the API's order-planner rules. */
export function fieldsFor(type: OrderType): OrderFields {
  switch (type) {
    case 'PROVIDE':
      return { service: false, product: true, targetSite: false, minLeadDays: 10 };
    case 'ADD':
      return { service: false, product: true, targetSite: false, minLeadDays: 1 };
    case 'CHANGE':
      return { service: true, product: true, targetSite: false, minLeadDays: 1 };
    case 'MOVE':
      return { service: true, product: false, targetSite: true, minLeadDays: 10 };
    case 'CEASE':
      return { service: true, product: false, targetSite: false, minLeadDays: 30 };
  }
}

/** Products offered for an order type: PROVIDE/CHANGE are connectivity, ADD is add-ons. */
export function productsFor(type: OrderType, products: CatalogueProduct[], current?: Service): CatalogueProduct[] {
  if (type === 'PROVIDE') return products.filter((p) => p.category === 'BROADBAND');
  if (type === 'ADD') return products.filter((p) => p.category !== 'BROADBAND');
  if (type === 'CHANGE' && current) {
    return products.filter((p) => p.category === current.category && p.code !== current.productCode);
  }
  return [];
}

type WizardField = 'orderType' | 'siteId' | 'serviceId' | 'productCode' | 'targetSiteId' | 'requestedDate' | 'notes';

const MAX_LEAD_DAYS = 180;
const STEPS = ['Order type', 'Service details', 'Schedule', 'Review'] as const;

@Component({
  selector: 'gkb-order-wizard',
  standalone: true,
  imports: [ReactiveFormsModule, MoneyPipe, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/orders">← Orders</a>
    <h1>New order</h1>
    <ol class="stepper">
      @for (label of steps; track label; let i = $index) {
        <li [class.current]="i === step()" [class.done]="i < step()" [attr.aria-current]="i === step() ? 'step' : null">{{ label }}</li>
      }
    </ol>
    <gkb-problem-alert [problem]="problem()" [extra]="unmatched()" />

    <form [formGroup]="form" (ngSubmit)="next()" novalidate>
      @switch (step()) {
        @case (0) {
          <fieldset>
            <legend>What would you like to do?</legend>
            @for (t of orderTypes; track t.value) {
              <label class="radio-card">
                <input type="radio" formControlName="orderType" [value]="t.value" />
                <strong>{{ t.label }}</strong><span>{{ t.hint }}</span>
              </label>
            }
          </fieldset>
          <label>Site
            <select formControlName="siteId">
              <option value="">Choose a site</option>
              @for (s of sites(); track s.id) { <option [value]="s.id">{{ s.code }} – {{ s.name }}</option> }
            </select>
          </label>
          @if (err('siteId'); as e) { <p class="field-error">{{ e }}</p> }
        }
        @case (1) {
          @if (fields().service) {
            <label>Service
              <select formControlName="serviceId">
                <option value="">Choose a service</option>
                @for (svc of services(); track svc.id) { <option [value]="svc.id">{{ svc.productName }} ({{ svc.status }})</option> }
              </select>
            </label>
            @if (err('serviceId'); as e) { <p class="field-error">{{ e }}</p> }
          }
          @if (fields().product) {
            <label>Product
              <select formControlName="productCode">
                <option value="">Choose a product</option>
                @for (p of availableProducts(); track p.code) {
                  <option [value]="p.code">{{ p.name }} – {{ p.monthlyPriceMinor | money }}/month</option>
                }
              </select>
            </label>
            @if (err('productCode'); as e) { <p class="field-error">{{ e }}</p> }
          }
          @if (fields().targetSite) {
            <label>Move to site
              <select formControlName="targetSiteId">
                <option value="">Choose the destination</option>
                @for (s of targetSites(); track s.id) { <option [value]="s.id">{{ s.code }} – {{ s.name }}</option> }
              </select>
            </label>
            @if (err('targetSiteId'); as e) { <p class="field-error">{{ e }}</p> }
          }
        }
        @case (2) {
          <label>Requested date
            <input type="date" formControlName="requestedDate" />
          </label>
          <p class="hint">At least {{ fields().minLeadDays }} days from today, on a weekday.</p>
          @if (err('requestedDate'); as e) { <p class="field-error">{{ e }}</p> }
          <label>Notes for the installation team
            <textarea formControlName="notes" rows="4" maxlength="1000"></textarea>
          </label>
        }
        @case (3) {
          @if (quote(); as q) {
            <dl class="summary">
              <dt>Order</dt><dd>{{ typeLabel() }}</dd>
              @if (q.productCode) { <dt>Product</dt><dd>{{ q.productCode }}</dd> }
              <dt>Monthly change</dt><dd>{{ q.monthlyDeltaMinor | money: 'GBP' : true }}</dd>
              <dt>One-off charge</dt><dd>{{ q.oneOffChargeMinor | money }}</dd>
            </dl>
            @if (q.requiresApproval) {
              <p class="alert alert--info">This order exceeds your account's approval threshold and will be sent to a business admin for approval.</p>
            }
          } @else if (quoting()) { <p>Calculating charges…</p> }
        }
      }

      <div class="actions">
        @if (step() > 0) { <button type="button" class="secondary" (click)="back()">Back</button> }
        @if (step() < 3) {
          <button type="submit" class="primary">Continue</button>
        } @else {
          <button type="button" class="secondary" (click)="place(false)" [disabled]="busy() || !quote()">Save as draft</button>
          <button type="button" class="primary" (click)="place(true)" [disabled]="busy() || !quote()">Submit order</button>
        }
      </div>
    </form>
  `
})
export class OrderWizardComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly ordersApi = inject(OrdersApi);
  private readonly inventoryApi = inject(InventoryApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Optional pre-selected site from `?siteId=`. */
  readonly siteId = input<string | undefined>(undefined);

  readonly steps = STEPS;
  readonly orderTypes = ORDER_TYPES;
  readonly step = signal(0);
  readonly quote = signal<OrderQuote | null>(null);
  readonly quoting = signal(false);
  readonly busy = signal(false);
  readonly problem = signal<ApiProblem | null>(null);
  readonly unmatched = signal<string[]>([]);
  readonly services = signal<Service[]>([]);

  readonly form = this.fb.nonNullable.group({
    orderType: this.fb.nonNullable.control<OrderType>('PROVIDE', Validators.required),
    siteId: ['', Validators.required],
    serviceId: [''],
    productCode: [''],
    targetSiteId: [''],
    requestedDate: [''],
    notes: ['', Validators.maxLength(1000)]
  });

  private readonly orderType = toSignal(this.form.controls.orderType.valueChanges.pipe(startWith(this.form.controls.orderType.value)), {
    requireSync: true
  });
  private readonly selectedSite = toSignal(this.form.controls.siteId.valueChanges, { initialValue: '' });
  private readonly selectedService = toSignal(this.form.controls.serviceId.valueChanges, { initialValue: '' });

  readonly fields = computed(() => fieldsFor(this.orderType()));
  readonly typeLabel = computed(() => ORDER_TYPES.find((t) => t.value === this.orderType())?.label ?? '');

  private readonly products = toSignal(this.ordersApi.products().pipe(catchError(() => of([] as CatalogueProduct[]))), { initialValue: [] });
  readonly sites = toSignal(
    this.inventoryApi.sites({ status: 'ACTIVE' }, { page: 1, pageSize: 100 }).pipe(
      map((p) => p.items),
      catchError(() => of([]))
    ),
    { initialValue: [] }
  );
  readonly targetSites = computed(() => this.sites().filter((s) => s.id !== this.selectedSite()));
  readonly availableProducts = computed(() =>
    productsFor(this.orderType(), this.products(), this.services().find((s) => s.id === this.selectedService()))
  );

  ngOnInit(): void {
    const preselected = this.siteId();
    if (preselected) this.form.controls.siteId.setValue(preselected);
    this.form.controls.orderType.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.applyTypeRules());
    this.form.controls.siteId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((siteId) => this.loadServices(siteId));
    this.applyTypeRules();
    if (preselected) this.loadServices(preselected);
  }

  err(name: WizardField): string | null {
    const control = this.form.controls[name];
    return control.touched ? errorMessage(control.errors) : null;
  }

  next(): void {
    const controls = this.controlsForStep(this.step());
    controls.forEach((c) => revealErrors(c));
    if (controls.some((c) => c.invalid)) return;
    this.step.update((s) => s + 1);
    if (this.step() === 3) this.requestQuote();
  }

  back(): void {
    this.problem.set(null);
    this.step.update((s) => Math.max(0, s - 1));
  }

  /** Builds the API request, omitting fields the chosen order type does not use. */
  toRequest(): OrderRequest {
    const v = this.form.getRawValue();
    const f = fieldsFor(v.orderType);
    return {
      orderType: v.orderType,
      siteId: v.siteId,
      serviceId: f.service ? v.serviceId : null,
      productCode: f.product ? v.productCode : null,
      targetSiteId: f.targetSite ? v.targetSiteId : null,
      requestedDate: v.requestedDate || null,
      notes: v.notes.trim() || null
    };
  }

  place(submit: boolean): void {
    this.busy.set(true);
    this.problem.set(null);
    this.ordersApi.create(this.toRequest(), submit).subscribe({
      next: (order) => void this.router.navigate(['/orders', order.id]),
      error: (problem: ApiProblem) => this.fail(problem)
    });
  }

  private requestQuote(): void {
    this.quote.set(null);
    this.quoting.set(true);
    this.ordersApi.quote(this.toRequest()).subscribe({
      next: (q) => {
        this.quote.set(q);
        this.quoting.set(false);
      },
      error: (problem: ApiProblem) => {
        this.quoting.set(false);
        this.fail(problem);
      }
    });
  }

  /** Server-side field errors send the user back to the step that owns the field. */
  private fail(problem: ApiProblem): void {
    this.busy.set(false);
    this.problem.set(problem);
    this.unmatched.set(applyProblemToForm(this.form, problem));
    const fieldStep: Record<string, number> = { orderType: 0, siteId: 0, serviceId: 1, productCode: 1, targetSiteId: 1, requestedDate: 2, notes: 2 };
    const steps = problem.fieldErrors.map((e) => fieldStep[e.field.replace(/^body\./, '')]).filter((s): s is number => s !== undefined);
    if (steps.length) this.step.set(Math.min(...steps));
  }

  private applyTypeRules(): void {
    const f = fieldsFor(this.form.controls.orderType.value);
    const { serviceId, productCode, targetSiteId, requestedDate } = this.form.controls;
    const set = (control: typeof serviceId, required: boolean, extra: ValidatorFn[] = []) => {
      control.setValidators(required ? [Validators.required, ...extra] : extra);
      if (!required) control.setValue('');
      control.updateValueAndValidity({ emitEvent: false });
    };
    set(serviceId, f.service);
    set(productCode, f.product);
    set(targetSiteId, f.targetSite);
    requestedDate.setValidators(leadTimeDate({ minLeadDays: f.minLeadDays, maxLeadDays: MAX_LEAD_DAYS, weekdaysOnly: true }));
    requestedDate.updateValueAndValidity({ emitEvent: false });
    this.quote.set(null);
  }

  private loadServices(siteId: string): void {
    this.form.controls.serviceId.setValue('');
    if (!siteId) {
      this.services.set([]);
      return;
    }
    this.inventoryApi
      .servicesForSite(siteId)
      .pipe(catchError(() => of([] as Service[])), takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.services.set(list));
  }

  private controlsForStep(step: number) {
    const c = this.form.controls;
    return [[c.orderType, c.siteId], [c.serviceId, c.productCode, c.targetSiteId], [c.requestedDate, c.notes], []][step] ?? [];
  }
}
```

## apps/gokinetic-business/web/src/app/features/orders/orders.components.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/orders/orders.components.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subject, catchError, map, merge, of, startWith, switchMap } from 'rxjs';
import { OrderFilter, OrdersApi } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/http/api-problem';
import { Order, OrderDetail, OrderStatus, OrderType } from '../../core/models/api.models';
import { CellDirective, Column, DataTableComponent } from '../../shared/data-table.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { pagedQuery } from '../../shared/paged-query';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

const STATUSES: OrderStatus[] = ['DRAFT', 'SUBMITTED', 'VALIDATED', 'PROVISIONING', 'ACTIVE', 'CANCELLED', 'FAILED'];
const TYPES: OrderType[] = ['PROVIDE', 'ADD', 'CHANGE', 'MOVE', 'CEASE'];

export type OrderAction = 'submit' | 'approve' | 'reject' | 'cancel';

/**
 * Actions the current user may take, following the API's state machine and separation of
 * duties (no self-approval; only the creator or an admin may submit or cancel).
 */
export function availableActions(order: Order, userId: string, isAdmin: boolean, canApprove: boolean): OrderAction[] {
  const owner = order.createdBy === userId || isAdmin;
  const actions: OrderAction[] = [];
  if (order.status === 'DRAFT' && owner) actions.push('submit');
  if (order.status === 'SUBMITTED' && order.requiresApproval && canApprove && order.createdBy !== userId) {
    actions.push('approve', 'reject');
  }
  if (['DRAFT', 'SUBMITTED', 'VALIDATED'].includes(order.status) && owner) actions.push('cancel');
  return actions;
}

@Component({
  selector: 'gkb-orders-list',
  standalone: true,
  imports: [DataTableComponent, CellDirective, StatusBadgeComponent, MoneyPipe, DatePipe, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Orders</h1>
      @if (canCreate()) { <a class="button primary" routerLink="/orders/new">New order</a> }
    </header>
    <form class="filters">
      <label>Status
        <select (change)="orders.setFilter({ status: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </label>
      <label>Type
        <select (change)="orders.setFilter({ orderType: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
        </select>
      </label>
    </form>
    <gkb-problem-alert [problem]="orders.error()" />
    <gkb-data-table caption="Orders" [columns]="columns" [rows]="orders.items()" [total]="orders.total()" [page]="orders.page()"
      [pageSize]="orders.pageSize()" [loading]="orders.loading()" [rowClickable]="true"
      (rowClick)="open($event)" (pageChange)="orders.setPage($event.page, $event.pageSize)">
      <ng-template gkbCell="status" let-row>
        <gkb-status-badge [status]="row.status" />
        @if (row.requiresApproval && row.status === 'SUBMITTED') { <small>Awaiting approval</small> }
      </ng-template>
      <ng-template gkbCell="monthly" let-row>{{ row.monthlyDeltaMinor | money: row.currency : true }}</ng-template>
      <ng-template gkbCell="created" let-row>{{ row.createdAt | date: 'd MMM y' }}</ng-template>
    </gkb-data-table>
  `
})
export class OrdersListComponent {
  private readonly api = inject(OrdersApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly canCreate = computed(() => this.auth.can('orders:create'));
  readonly statuses = STATUSES;
  readonly types = TYPES;
  readonly orders = pagedQuery<OrderFilter, Order>((f, p) => this.api.list(f, p), {});
  readonly columns: Column<Order>[] = [
    { key: 'reference', header: 'Reference', value: (o) => o.reference },
    { key: 'type', header: 'Type', value: (o) => o.orderType },
    { key: 'product', header: 'Product', value: (o) => o.productCode },
    { key: 'status', header: 'Status' },
    { key: 'monthly', header: 'Monthly change', align: 'end' },
    { key: 'created', header: 'Created' }
  ];

  open(order: Order): void {
    void this.router.navigate(['/orders', order.id]);
  }
}

@Component({
  selector: 'gkb-order-detail',
  standalone: true,
  imports: [StatusBadgeComponent, MoneyPipe, DatePipe, ProblemAlertComponent, RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/orders">← Orders</a>
    <gkb-problem-alert [problem]="problem()" />
    @if (order(); as o) {
      <header class="page-header">
        <h1>{{ o.reference }}</h1>
        <gkb-status-badge [status]="o.status" />
      </header>
      <dl class="summary">
        <dt>Type</dt><dd>{{ o.orderType }}</dd>
        @if (o.productCode) { <dt>Product</dt><dd>{{ o.productCode }}</dd> }
        <dt>Monthly change</dt><dd>{{ o.monthlyDeltaMinor | money: o.currency : true }}</dd>
        <dt>One-off charge</dt><dd>{{ o.oneOffChargeMinor | money: o.currency }}</dd>
        <dt>Requested date</dt><dd>{{ o.requestedDate ?? 'As soon as possible' }}</dd>
        @if (o.failureReason) { <dt>Reason</dt><dd>{{ o.failureReason }}</dd> }
        @if (o.notes) { <dt>Notes</dt><dd>{{ o.notes }}</dd> }
      </dl>

      @if (actions().length) {
        <div class="actions">
          @if (actions().includes('submit')) { <button class="primary" (click)="run('submit')" [disabled]="busy()">Submit</button> }
          @if (actions().includes('approve')) { <button class="primary" (click)="run('approve')" [disabled]="busy()">Approve</button> }
          @if (actions().includes('reject') || actions().includes('cancel')) {
            <label>Reason <input [formControl]="reason" maxlength="500" /></label>
            @if (actions().includes('reject')) { <button class="danger" (click)="run('reject')" [disabled]="busy() || reason.invalid">Reject</button> }
            @if (actions().includes('cancel')) { <button class="secondary" (click)="run('cancel')" [disabled]="busy() || reason.invalid">Cancel order</button> }
          }
        </div>
      }

      <h2>History</h2>
      <ol class="timeline">
        @for (h of o.history; track h.changedAt + h.toStatus) {
          <li><time>{{ h.changedAt | date: 'd MMM y, HH:mm' }}</time> <gkb-status-badge [status]="h.toStatus" /> @if (h.reason) { – {{ h.reason }} }</li>
        }
      </ol>
    }
  `
})
export class OrderDetailComponent {
  private readonly api = inject(OrdersApi);
  private readonly auth = inject(AuthService);
  readonly id = input.required<string>();
  readonly busy = signal(false);
  readonly problem = signal<ApiProblem | null>(null);
  readonly reason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] });

  private readonly refresh = new Subject<void>();
  readonly order = toSignal(
    merge(toObservable(this.id), this.refresh.pipe(map(() => this.id()))).pipe(
      switchMap((id) => this.api.get(id).pipe(catchError((p: ApiProblem) => (this.problem.set(p), of(null))))),
      startWith(null)
    )
  );

  readonly actions = computed(() => {
    const o = this.order();
    const me = this.auth.session();
    if (!o || !me) return [];
    return availableActions(o, me.userId, this.auth.isAdmin(), this.auth.can('orders:approve'));
  });

  run(action: OrderAction): void {
    const o = this.order() as OrderDetail;
    const calls: Record<OrderAction, () => Observable<Order>> = {
      submit: () => this.api.submit(o.id),
      approve: () => this.api.approve(o.id),
      reject: () => this.api.reject(o.id, this.reason.value),
      cancel: () => this.api.cancel(o.id, this.reason.value)
    };
    this.busy.set(true);
    this.problem.set(null);
    calls[action]().subscribe({
      next: () => {
        this.busy.set(false);
        this.reason.reset();
        this.refresh.next();
      },
      error: (p: ApiProblem) => {
        this.busy.set(false);
        this.problem.set(p);
      }
    });
  }
}
```

## apps/gokinetic-business/web/src/app/features/orders/orders.spec.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/orders/orders.spec.ts`.

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { InventoryApi, OrdersApi } from '../../core/api/portal-api';
import { ApiProblem } from '../../core/http/api-problem';
import { CatalogueProduct, Order, Service, SiteSummary } from '../../core/models/api.models';
import { OrderWizardComponent, fieldsFor, productsFor } from './order-wizard.component';
import { availableActions } from './orders.components';

const PRODUCTS: CatalogueProduct[] = [
  { code: 'FTTP-500', name: 'Business Fibre 500 Mbps', category: 'BROADBAND', bandwidthMbps: 500, monthlyPriceMinor: 5500, installChargeMinor: 9900, requiresConnectivity: false },
  { code: 'FTTP-1000', name: 'Business Fibre 1 Gbps', category: 'BROADBAND', bandwidthMbps: 1000, monthlyPriceMinor: 7500, installChargeMinor: 9900, requiresConnectivity: false },
  { code: 'VOICE-SIP-4', name: 'SIP Voice (4 channels)', category: 'VOICE', bandwidthMbps: null, monthlyPriceMinor: 2400, installChargeMinor: 0, requiresConnectivity: true }
];

const SERVICE = { id: 'svc-1', siteId: 'site-1', productCode: 'FTTP-500', productName: 'Business Fibre 500 Mbps', category: 'BROADBAND', status: 'ACTIVE' } as Service;
const SITE = { id: 'site-1', code: 'LDN-01', name: 'London HQ', status: 'ACTIVE' } as SiteSummary;

function order(overrides: Partial<Order> = {}): Order {
  return { id: 'o1', status: 'DRAFT', createdBy: 'me', requiresApproval: false, ...overrides } as Order;
}

describe('order rules', () => {
  it('requires the right fields per order type', () => {
    expect(fieldsFor('PROVIDE')).toEqual({ service: false, product: true, targetSite: false, minLeadDays: 10 });
    expect(fieldsFor('MOVE').targetSite).toBeTrue();
    expect(fieldsFor('CEASE')).toEqual(jasmine.objectContaining({ service: true, product: false }));
  });

  it('offers connectivity for PROVIDE, add-ons for ADD and alternatives for CHANGE', () => {
    expect(productsFor('PROVIDE', PRODUCTS).map((p) => p.code)).toEqual(['FTTP-500', 'FTTP-1000']);
    expect(productsFor('ADD', PRODUCTS).map((p) => p.code)).toEqual(['VOICE-SIP-4']);
    expect(productsFor('CHANGE', PRODUCTS, SERVICE).map((p) => p.code)).toEqual(['FTTP-1000']);
    expect(productsFor('CHANGE', PRODUCTS)).toEqual([]);
  });

  it('enforces separation of duties for approvals', () => {
    const submitted = order({ status: 'SUBMITTED', requiresApproval: true, createdBy: 'someone' });
    expect(availableActions(submitted, 'admin', true, true)).toEqual(['approve', 'reject', 'cancel']);
    expect(availableActions({ ...submitted, createdBy: 'admin' }, 'admin', true, true)).toEqual(['cancel']);
  });

  it('limits submit and cancel to the creator or an admin', () => {
    expect(availableActions(order(), 'me', false, false)).toEqual(['submit', 'cancel']);
    expect(availableActions(order(), 'other', false, false)).toEqual([]);
    expect(availableActions(order({ status: 'PROVISIONING' }), 'me', true, true)).toEqual([]);
  });
});

describe('OrderWizardComponent', () => {
  let fixture: ComponentFixture<OrderWizardComponent>;
  let wizard: OrderWizardComponent;
  let ordersApi: jasmine.SpyObj<OrdersApi>;

  beforeEach(() => {
    ordersApi = jasmine.createSpyObj<OrdersApi>('OrdersApi', ['products', 'quote', 'create']);
    ordersApi.products.and.returnValue(of(PRODUCTS));
    ordersApi.quote.and.returnValue(of({ productCode: 'FTTP-1000', bandwidthMbps: 1000, monthlyDeltaMinor: 2000, oneOffChargeMinor: 0, requiresApproval: true }));
    const inventoryApi = jasmine.createSpyObj<InventoryApi>('InventoryApi', ['sites', 'servicesForSite']);
    inventoryApi.sites.and.returnValue(of({ items: [SITE], page: 1, pageSize: 100, total: 1 }));
    inventoryApi.servicesForSite.and.returnValue(of([SERVICE]));

    TestBed.configureTestingModule({
      imports: [OrderWizardComponent],
      providers: [provideRouter([]), { provide: OrdersApi, useValue: ordersApi }, { provide: InventoryApi, useValue: inventoryApi }]
    });
    fixture = TestBed.createComponent(OrderWizardComponent);
    wizard = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('does not advance until the site is chosen', () => {
    wizard.next();
    expect(wizard.step()).toBe(0);
    expect(wizard.err('siteId')).toBe('This field is required');
  });

  it('switches required fields when the order type changes', () => {
    const { serviceId, productCode, targetSiteId } = wizard.form.controls;
    wizard.form.controls.orderType.setValue('MOVE');
    serviceId.setValue('');
    targetSiteId.setValue('');
    expect(serviceId.invalid).toBeTrue();
    expect(targetSiteId.invalid).toBeTrue();
    expect(productCode.valid).toBeTrue();
  });

  it('quotes on reaching review and submits a request without unused fields', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    ordersApi.create.and.returnValue(of({ id: 'new-order' } as Order));
    wizard.form.patchValue({ orderType: 'CHANGE', siteId: 'site-1' });
    wizard.next();
    wizard.form.patchValue({ serviceId: 'svc-1', productCode: 'FTTP-1000', targetSiteId: 'ignored' });
    wizard.next();
    wizard.next();
    expect(wizard.step()).toBe(3);
    expect(wizard.quote()?.requiresApproval).toBeTrue();

    wizard.place(true);
    const [request, submit] = ordersApi.create.calls.mostRecent().args;
    expect(submit).toBeTrue();
    expect(request).toEqual(jasmine.objectContaining({ orderType: 'CHANGE', serviceId: 'svc-1', productCode: 'FTTP-1000', targetSiteId: null }));
    expect(navigate).toHaveBeenCalledWith(['/orders', 'new-order']);
  });

  it('returns to the step owning a server-side field error', () => {
    ordersApi.quote.and.returnValue(
      throwError(() => new ApiProblem(400, 'Invalid request', '', 'validation-error', [{ field: 'body.productCode', message: 'Unknown product' }]))
    );
    wizard.form.patchValue({ orderType: 'PROVIDE', siteId: 'site-1' });
    wizard.next();
    wizard.form.patchValue({ productCode: 'FTTP-500' });
    wizard.next();
    wizard.next();
    expect(wizard.step()).toBe(1);
    expect(wizard.form.controls.productCode.errors).toEqual({ server: { message: 'Unknown product' } });
  });
});
```

## apps/gokinetic-business/web/src/app/features/sla/sla-report.component.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/sla/sla-report.component.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { AccountApi } from '../../core/api/portal-api';
import { ApiProblem } from '../../core/http/api-problem';
import { SlaReport } from '../../core/models/api.models';
import { MoneyPipe, PercentPipe } from '../../shared/money.pipe';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';

/** The most recent `count` periods (YYYY-MM), newest first, including the current month. */
export function selectablePeriods(now: Date, count = 24): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

type ReportState = { report: SlaReport | null; problem: ApiProblem | null; loading: boolean };

@Component({
  selector: 'gkb-sla-report',
  standalone: true,
  imports: [MoneyPipe, PercentPipe, DatePipe, ProblemAlertComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>SLA report</h1>
      <label>Period
        <select [value]="period()" (change)="period.set($any($event.target).value)">
          @for (p of periods; track p) { <option [value]="p">{{ p }}</option> }
        </select>
      </label>
    </header>
    <gkb-problem-alert [problem]="state().problem" />
    @if (state().loading) { <p>Loading report…</p> }
    @if (state().report; as r) {
      @if (r.provisional) { <p class="alert alert--info">This month is still in progress; figures are provisional until month end.</p> }
      <div class="tiles">
        <div class="tile"><span class="tile__label">Overall availability</span><span class="tile__value">{{ r.overallAvailabilityMilliPct | pct }}</span></div>
        <div class="tile"><span class="tile__label">Services measured</span><span class="tile__value">{{ r.servicesMeasured }}</span></div>
        <div class="tile" [class.tile--alert]="r.servicesBreached > 0"><span class="tile__label">Below target</span><span class="tile__value">{{ r.servicesBreached }}</span></div>
        <div class="tile"><span class="tile__label">Service credits due</span><span class="tile__value">{{ r.totalCredit.amountMinor | money: r.totalCredit.currency }}</span></div>
      </div>

      <h2>Availability by service</h2>
      <table class="table">
        <thead><tr><th>Service</th><th>Tier</th><th class="num">Availability</th><th class="num">Target</th><th class="num">Downtime</th><th class="num">Planned</th><th class="num">Credit</th></tr></thead>
        <tbody>
          @for (s of r.services; track s.serviceId) {
            <tr [class.row--alert]="!s.met">
              <td>{{ s.productName }}</td><td>{{ s.slaTier }}</td>
              <td class="num">{{ s.availabilityMilliPct | pct }}</td><td class="num">{{ s.targetMilliPct | pct }}</td>
              <td class="num">{{ duration(s.downtimeMinutes) }} ({{ s.outageCount }})</td><td class="num">{{ duration(s.plannedMinutes) }}</td>
              <td class="num">{{ s.creditBps ? (s.credit.amountMinor | money: s.credit.currency) : '—' }}</td>
            </tr>
          } @empty { <tr><td colspan="7" class="empty">No services were active in this period.</td></tr> }
        </tbody>
      </table>

      <h2>Ticket response and resolution</h2>
      <table class="table">
        <thead><tr><th>Priority</th><th class="num">Resolved</th><th class="num">Response met</th><th class="num">Resolution met</th></tr></thead>
        <tbody>
          @for (t of r.tickets; track t.priority) {
            <tr><td>{{ t.priority }}</td><td class="num">{{ t.resolvedCount }}</td><td class="num">{{ t.responseMetBps | pct: 'bps' }}</td><td class="num">{{ t.resolutionMetBps | pct: 'bps' }}</td></tr>
          } @empty { <tr><td colspan="4" class="empty">No tickets were resolved in this period.</td></tr> }
        </tbody>
      </table>
      <p class="hint">Generated {{ r.generatedAt | date: 'd MMM y, HH:mm' }}. Planned maintenance is excluded from availability.</p>
    }
  `
})
export class SlaReportComponent {
  private readonly api = inject(AccountApi);
  readonly periods = selectablePeriods(new Date());
  /** Default to the last complete month, which is what customers usually review. */
  readonly period = signal(this.periods[1]);
  readonly duration = formatDuration;

  readonly state = toSignal(
    toObservable(this.period).pipe(
      switchMap((period) =>
        this.api.slaReport(period).pipe(
          map((report): ReportState => ({ report, problem: null, loading: false })),
          catchError((problem: ApiProblem) => of<ReportState>({ report: null, problem, loading: false })),
          startWith<ReportState>({ report: null, problem: null, loading: true })
        )
      )
    ),
    { initialValue: { report: null, problem: null, loading: true } as ReportState }
  );
}
```

## apps/gokinetic-business/web/src/app/features/tickets/tickets.components.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/tickets/tickets.components.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subject, catchError, map, merge, of, switchMap } from 'rxjs';
import { InventoryApi, TicketFilter, TicketsApi } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/http/api-problem';
import { Service, Ticket, TicketCategory, TicketDetail, TicketPriority, TicketStatus } from '../../core/models/api.models';
import { CellDirective, Column, DataTableComponent } from '../../shared/data-table.component';
import { applyProblemToForm, revealErrors } from '../../shared/form-errors';
import { pagedQuery } from '../../shared/paged-query';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { StatusBadgeComponent, humanise } from '../../shared/status-badge.component';
import { errorMessage, phoneNumber } from '../../shared/validators';

const CATEGORIES: TicketCategory[] = ['FAULT', 'SERVICE_REQUEST', 'BILLING', 'GENERAL'];
const PRIORITIES: TicketPriority[] = ['P1', 'P2', 'P3', 'P4'];

/** Priorities a customer may pick, mirroring the API's ticket-shape rules. */
export function allowedPriorities(category: TicketCategory, service: Service | undefined): TicketPriority[] {
  if (category === 'BILLING') return ['P3', 'P4'];
  if (category === 'FAULT' && service?.status === 'ACTIVE') return PRIORITIES;
  return ['P2', 'P3', 'P4'];
}

/** Customer-facing label for a status transition button. */
export function transitionLabel(from: TicketStatus, to: TicketStatus): string {
  if (to === 'CLOSED') return from === 'RESOLVED' ? 'Confirm resolved' : 'Withdraw ticket';
  if (from === 'RESOLVED' && to === 'IN_PROGRESS') return 'Reopen';
  return `Mark ${humanise(to).toLowerCase()}`;
}

@Component({
  selector: 'gkb-tickets-list',
  standalone: true,
  imports: [DataTableComponent, CellDirective, StatusBadgeComponent, DatePipe, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Support tickets</h1>
      @if (canCreate()) { <a class="button primary" routerLink="/tickets/new">Raise a ticket</a> }
    </header>
    <form class="filters">
      <label class="checkbox"><input type="checkbox" checked (change)="tickets.setFilter({ activeOnly: $any($event.target).checked || undefined })" /> Open only</label>
      <label>Priority
        <select (change)="tickets.setFilter({ priority: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
        </select>
      </label>
      <label>Category
        <select (change)="tickets.setFilter({ category: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
        </select>
      </label>
    </form>
    <gkb-problem-alert [problem]="tickets.error()" />
    <gkb-data-table caption="Tickets" [columns]="columns" [rows]="tickets.items()" [total]="tickets.total()"
      [page]="tickets.page()" [pageSize]="tickets.pageSize()" [loading]="tickets.loading()" [rowClickable]="true"
      (rowClick)="open($event)" (pageChange)="tickets.setPage($event.page, $event.pageSize)">
      <ng-template gkbCell="priority" let-row><gkb-status-badge [status]="row.priority" /></ng-template>
      <ng-template gkbCell="status" let-row><gkb-status-badge [status]="row.status" /></ng-template>
      <ng-template gkbCell="sla" let-row>
        <gkb-status-badge [status]="row.sla.resolution.state" />
        <small>due {{ row.sla.resolution.dueAt | date: 'd MMM HH:mm' }}</small>
      </ng-template>
    </gkb-data-table>
  `
})
export class TicketsListComponent {
  private readonly api = inject(TicketsApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly canCreate = computed(() => this.auth.can('tickets:create'));
  readonly categories = CATEGORIES;
  readonly priorities = PRIORITIES;
  readonly tickets = pagedQuery<TicketFilter, Ticket>((f, p) => this.api.list(f, p), { activeOnly: true });
  readonly columns: Column<Ticket>[] = [
    { key: 'reference', header: 'Reference', value: (t) => t.reference },
    { key: 'subject', header: 'Subject', value: (t) => t.subject },
    { key: 'priority', header: 'Priority' },
    { key: 'status', header: 'Status' },
    { key: 'sla', header: 'Resolution SLA' }
  ];

  open(t: Ticket): void {
    void this.router.navigate(['/tickets', t.id]);
  }
}

@Component({
  selector: 'gkb-new-ticket',
  standalone: true,
  imports: [ReactiveFormsModule, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/tickets">← Tickets</a>
    <h1>Raise a support ticket</h1>
    <gkb-problem-alert [problem]="problem()" [extra]="unmatched()" />
    @if (duplicate(); as d) {
      <p class="alert alert--info">A fault is already open for this service: <a [routerLink]="['/tickets', d.id]">{{ d.reference }}</a>. Please add details there instead.</p>
    }
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <label>Category
        <select formControlName="category">
          @for (c of categories; track c) { <option [value]="c">{{ label(c) }}</option> }
        </select>
      </label>
      <label>Site
        <select formControlName="siteId">
          <option value="">Not site specific</option>
          @for (s of sites(); track s.id) { <option [value]="s.id">{{ s.code }} – {{ s.name }}</option> }
        </select>
      </label>
      <label>Service
        <select formControlName="serviceId">
          <option value="">Not service specific</option>
          @for (svc of services(); track svc.id) { <option [value]="svc.id">{{ svc.productName }}</option> }
        </select>
      </label>
      @if (err('serviceId'); as e) { <p class="field-error">{{ e }}</p> }
      <label>Priority
        <select formControlName="priority">
          @for (p of priorities(); track p) { <option [value]="p">{{ p }}</option> }
        </select>
      </label>
      <p class="hint">P1 is for a complete loss of an active service.</p>
      <label>Subject <input formControlName="subject" maxlength="140" /></label>
      @if (err('subject'); as e) { <p class="field-error">{{ e }}</p> }
      <label>Description <textarea formControlName="description" rows="6" maxlength="5000"></textarea></label>
      @if (err('description'); as e) { <p class="field-error">{{ e }}</p> }
      <label>Contact phone <input formControlName="contactPhone" type="tel" autocomplete="tel" /></label>
      @if (err('contactPhone'); as e) { <p class="field-error">{{ e }}</p> }
      <button type="submit" class="primary" [disabled]="busy()">Submit ticket</button>
    </form>
  `
})
export class NewTicketComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(TicketsApi);
  private readonly inventory = inject(InventoryApi);
  private readonly router = inject(Router);
  readonly siteId = input<string | undefined>(undefined);

  readonly categories = CATEGORIES;
  readonly label = humanise;
  readonly busy = signal(false);
  readonly problem = signal<ApiProblem | null>(null);
  readonly unmatched = signal<string[]>([]);
  readonly duplicate = signal<{ id: string; reference: string } | null>(null);
  readonly services = signal<Service[]>([]);

  readonly form = this.fb.nonNullable.group({
    category: this.fb.nonNullable.control<TicketCategory>('FAULT'),
    siteId: [''],
    serviceId: [''],
    priority: this.fb.nonNullable.control<TicketPriority>('P3'),
    subject: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(140)]],
    description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(5000)]],
    contactPhone: ['', phoneNumber()]
  });

  readonly sites = toSignal(
    this.inventory.sites({ status: 'ACTIVE' }, { page: 1, pageSize: 100 }).pipe(map((p) => p.items), catchError(() => of([]))),
    { initialValue: [] }
  );
  private readonly category = toSignal(this.form.controls.category.valueChanges, { initialValue: this.form.controls.category.value });
  private readonly serviceId = toSignal(this.form.controls.serviceId.valueChanges, { initialValue: '' });
  readonly priorities = computed(() => allowedPriorities(this.category(), this.services().find((s) => s.id === this.serviceId())));

  ngOnInit(): void {
    this.form.controls.siteId.valueChanges.subscribe((id) => this.loadServices(id));
    this.form.controls.category.valueChanges.subscribe(() => this.syncRules());
    this.form.controls.serviceId.valueChanges.subscribe(() => this.syncRules());
    const preselected = this.siteId();
    if (preselected) this.form.controls.siteId.setValue(preselected);
    this.syncRules();
  }

  err(name: 'serviceId' | 'subject' | 'description' | 'contactPhone'): string | null {
    const c = this.form.controls[name];
    return c.touched ? errorMessage(c.errors) : null;
  }

  submit(): void {
    revealErrors(this.form);
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.problem.set(null);
    this.duplicate.set(null);
    this.api
      .create({
        category: v.category,
        priority: v.priority,
        siteId: v.siteId || null,
        serviceId: v.serviceId || null,
        subject: v.subject.trim(),
        description: v.description.trim(),
        contactPhone: v.contactPhone.trim() || null
      })
      .subscribe({
        next: (t) => void this.router.navigate(['/tickets', t.id]),
        error: (p: ApiProblem) => {
          this.busy.set(false);
          if (p.isConflict && typeof p.extensions['ticketId'] === 'string') {
            this.duplicate.set({ id: p.extensions['ticketId'] as string, reference: String(p.extensions['reference'] ?? '') });
            return;
          }
          this.problem.set(p);
          this.unmatched.set(applyProblemToForm(this.form, p));
        }
      });
  }

  /** Faults need a service; the selected priority must stay within what the category allows. */
  private syncRules(): void {
    const { category, serviceId, priority } = this.form.controls;
    serviceId.setValidators(category.value === 'FAULT' ? Validators.required : null);
    serviceId.updateValueAndValidity({ emitEvent: false });
    const allowed = allowedPriorities(category.value, this.services().find((s) => s.id === serviceId.value));
    if (!allowed.includes(priority.value)) priority.setValue(allowed.includes('P3') ? 'P3' : allowed[0]);
  }

  private loadServices(siteId: string): void {
    this.form.controls.serviceId.setValue('');
    if (!siteId) return this.services.set([]);
    this.inventory.servicesForSite(siteId).pipe(catchError(() => of([] as Service[]))).subscribe((list) => this.services.set(list));
  }
}

@Component({
  selector: 'gkb-ticket-detail',
  standalone: true,
  imports: [StatusBadgeComponent, DatePipe, ProblemAlertComponent, RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/tickets">← Tickets</a>
    <gkb-problem-alert [problem]="problem()" />
    @if (ticket(); as t) {
      <header class="page-header">
        <h1>{{ t.reference }} – {{ t.subject }}</h1>
        <gkb-status-badge [status]="t.priority" /> <gkb-status-badge [status]="t.status" />
        @if (t.escalationLevel > 0) { <span class="badge badge--danger">Escalation level {{ t.escalationLevel }}</span> }
      </header>
      <dl class="summary">
        <dt>First response</dt><dd><gkb-status-badge [status]="t.sla.response.state" /> due {{ t.sla.response.dueAt | date: 'd MMM y, HH:mm' }}</dd>
        <dt>Resolution</dt><dd><gkb-status-badge [status]="t.sla.resolution.state" /> due {{ t.sla.resolution.dueAt | date: 'd MMM y, HH:mm' }}</dd>
      </dl>
      <p class="description">{{ t.description }}</p>

      <div class="actions">
        @for (s of t.allowedStatuses; track s) {
          <button type="button" class="secondary" (click)="act(api.changeStatus(t, s))" [disabled]="busy()">{{ transition(t.status, s) }}</button>
        }
        @if (canEscalate()) {
          <button type="button" class="danger" (click)="escalating.set(!escalating())">Escalate</button>
        }
      </div>
      @if (escalating()) {
        <form class="card" (ngSubmit)="escalate(t)">
          <label>Why does this need escalating? <textarea [formControl]="escalationReason" rows="3"></textarea></label>
          <button type="submit" class="danger" [disabled]="busy() || escalationReason.invalid">Confirm escalation</button>
        </form>
      }

      <h2>Updates</h2>
      <ol class="timeline">
        @for (e of t.events; track e.id) {
          <li>
            <time>{{ e.createdAt | date: 'd MMM y, HH:mm' }}</time>
            @switch (e.kind) {
              @case ('COMMENT') { <p>{{ e.body }}</p> }
              @case ('STATUS_CHANGE') { <p>Status changed to <gkb-status-badge [status]="e.toValue ?? ''" /> @if (e.body) { – {{ e.body }} }</p> }
              @case ('ESCALATION') { <p>Escalated to level {{ e.toValue }}: {{ e.body }}</p> }
              @case ('PRIORITY_CHANGE') { <p>Priority changed from {{ e.fromValue }} to {{ e.toValue }}</p> }
            }
          </li>
        } @empty { <li>No updates yet.</li> }
      </ol>
      @if (t.status !== 'CLOSED') {
        <form (ngSubmit)="reply(t)">
          <label>Add an update <textarea [formControl]="comment" rows="4" maxlength="5000"></textarea></label>
          <button type="submit" class="primary" [disabled]="busy() || comment.invalid">Send</button>
        </form>
      }
    }
  `
})
export class TicketDetailComponent {
  readonly api = inject(TicketsApi);
  private readonly auth = inject(AuthService);
  readonly id = input.required<string>();
  readonly busy = signal(false);
  readonly escalating = signal(false);
  readonly problem = signal<ApiProblem | null>(null);
  readonly transition = transitionLabel;
  readonly comment = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(5000)] });
  readonly escalationReason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(10)] });

  private readonly refresh = new Subject<void>();
  readonly ticket = toSignal(
    merge(toObservable(this.id), this.refresh.pipe(map(() => this.id()))).pipe(
      switchMap((id) => this.api.get(id).pipe(catchError((p: ApiProblem) => (this.problem.set(p), of(null)))))
    ),
    { initialValue: null as TicketDetail | null }
  );
  readonly canEscalate = computed(() => {
    const t = this.ticket();
    return !!t && this.auth.can('tickets:escalate') && t.escalationLevel < 3 && !['RESOLVED', 'CLOSED'].includes(t.status);
  });

  reply(t: Ticket): void {
    this.act(this.api.comment(t, this.comment.value.trim()), () => this.comment.reset());
  }

  escalate(t: Ticket): void {
    this.act(this.api.escalate(t, this.escalationReason.value.trim()), () => {
      this.escalationReason.reset();
      this.escalating.set(false);
    });
  }

  /** All mutations carry the ticket version; a 409 means someone else updated it, so reload. */
  act(call: Observable<Ticket>, onSuccess?: () => void): void {
    this.busy.set(true);
    this.problem.set(null);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        onSuccess?.();
        this.refresh.next();
      },
      error: (p: ApiProblem) => {
        this.busy.set(false);
        this.problem.set(p);
        if (p.isConflict) this.refresh.next();
      }
    });
  }
}
```

## apps/gokinetic-business/web/src/app/features/users/users.components.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/users/users.components.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, catchError, map, of } from 'rxjs';
import { InventoryApi, UserFilter, UsersApi } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/http/api-problem';
import { BusinessRole, BusinessUser, UserAction, UserStatus } from '../../core/models/api.models';
import { CellDirective, Column, DataTableComponent } from '../../shared/data-table.component';
import { applyProblemToForm, revealErrors } from '../../shared/form-errors';
import { pagedQuery } from '../../shared/paged-query';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { errorMessage } from '../../shared/validators';

const STATUSES: UserStatus[] = ['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'];

/** Lifecycle actions offered for a user; the current admin cannot act on themselves. */
export function userActions(user: BusinessUser, currentUserId: string): UserAction[] {
  if (user.id === currentUserId) return [];
  switch (user.status) {
    case 'ACTIVE':
      return ['suspend', 'deactivate'];
    case 'SUSPENDED':
      return ['reactivate', 'deactivate'];
    case 'INVITED':
      return ['deactivate'];
    case 'DEACTIVATED':
      return [];
  }
}

@Component({
  selector: 'gkb-users',
  standalone: true,
  imports: [DataTableComponent, CellDirective, StatusBadgeComponent, DatePipe, ProblemAlertComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Portal users</h1>
      <button type="button" class="primary" (click)="inviting.set(!inviting())">Invite user</button>
    </header>
    <gkb-problem-alert [problem]="problem() ?? users.error()" [extra]="unmatched()" />

    @if (inviting()) {
      <form class="card" [formGroup]="invite" (ngSubmit)="sendInvite()" novalidate>
        <h2>Invite a colleague</h2>
        <label>Email <input type="email" formControlName="email" autocomplete="off" /></label>
        @if (err('email'); as e) { <p class="field-error">{{ e }}</p> }
        <label>First name <input formControlName="firstName" /></label>
        @if (err('firstName'); as e) { <p class="field-error">{{ e }}</p> }
        <label>Last name <input formControlName="lastName" /></label>
        @if (err('lastName'); as e) { <p class="field-error">{{ e }}</p> }
        <fieldset>
          <legend>Role</legend>
          <label class="radio"><input type="radio" formControlName="role" value="BUSINESS_USER" /> User – view services, place orders, raise tickets</label>
          <label class="radio"><input type="radio" formControlName="role" value="BUSINESS_ADMIN" /> Admin – also manage users, billing and approvals</label>
        </fieldset>
        @if (invite.controls.role.value === 'BUSINESS_USER') {
          <fieldset>
            <legend>Site access</legend>
            <label class="checkbox"><input type="checkbox" formControlName="allSites" /> All sites</label>
            @if (!invite.controls.allSites.value) {
              @for (s of sites(); track s.id) {
                <label class="checkbox"><input type="checkbox" [checked]="scope().has(s.id)" (change)="toggleSite(s.id)" /> {{ s.code }} – {{ s.name }}</label>
              }
              @if (scopeError()) { <p class="field-error">Choose at least one site.</p> }
            }
          </fieldset>
        }
        <button type="submit" class="primary" [disabled]="busy()">Send invitation</button>
      </form>
    }

    <form class="filters">
      <label>Search <input type="search" (change)="users.setFilter({ search: $any($event.target).value.trim() || undefined })" /></label>
      <label>Status
        <select (change)="users.setFilter({ status: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </label>
    </form>

    <gkb-data-table caption="Users" [columns]="columns" [rows]="users.items()" [total]="users.total()" [page]="users.page()"
      [pageSize]="users.pageSize()" [loading]="users.loading()" (pageChange)="users.setPage($event.page, $event.pageSize)">
      <ng-template gkbCell="status" let-row><gkb-status-badge [status]="row.status" /></ng-template>
      <ng-template gkbCell="lastLogin" let-row>{{ row.lastLoginAt ? (row.lastLoginAt | date: 'd MMM y') : 'Never' }}</ng-template>
      <ng-template gkbCell="actions" let-row>
        @if (row.id !== me()) {
          @if (row.status !== 'DEACTIVATED') {
            <button type="button" class="link" (click)="toggleRole(row)" [disabled]="busy()">
              Make {{ row.role === 'BUSINESS_ADMIN' ? 'user' : 'admin' }}
            </button>
          }
          @for (a of actionsFor(row); track a) {
            <button type="button" class="link" [class.danger]="a === 'deactivate'" (click)="transition(row, a)" [disabled]="busy()">{{ a }}</button>
          }
          @if (row.status === 'INVITED') { <button type="button" class="link" (click)="resend(row)" [disabled]="busy()">Resend invite</button> }
        }
      </ng-template>
    </gkb-data-table>
  `
})
export class UsersComponent {
  private readonly api = inject(UsersApi);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly statuses = STATUSES;
  readonly me = computed(() => this.auth.session()?.userId ?? '');
  readonly inviting = signal(false);
  readonly busy = signal(false);
  readonly problem = signal<ApiProblem | null>(null);
  readonly unmatched = signal<string[]>([]);
  readonly scope = signal(new Set<string>());
  readonly scopeError = signal(false);

  readonly users = pagedQuery<UserFilter, BusinessUser>((f, p) => this.api.list(f, p), {});
  readonly sites = toSignal(
    inject(InventoryApi).sites({ status: 'ACTIVE' }, { page: 1, pageSize: 100 }).pipe(map((p) => p.items), catchError(() => of([]))),
    { initialValue: [] }
  );
  readonly columns: Column<BusinessUser>[] = [
    { key: 'name', header: 'Name', value: (u) => `${u.firstName} ${u.lastName}` },
    { key: 'email', header: 'Email', value: (u) => u.email },
    { key: 'role', header: 'Role', value: (u) => (u.role === 'BUSINESS_ADMIN' ? 'Admin' : 'User') },
    { key: 'scope', header: 'Sites', value: (u) => (u.siteScope ? `${u.siteScope.length} site(s)` : 'All') },
    { key: 'status', header: 'Status' },
    { key: 'lastLogin', header: 'Last sign-in' },
    { key: 'actions', header: '' }
  ];

  readonly invite = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    firstName: ['', [Validators.required, Validators.maxLength(60)]],
    lastName: ['', [Validators.required, Validators.maxLength(60)]],
    role: this.fb.nonNullable.control<BusinessRole>('BUSINESS_USER'),
    allSites: [true]
  });

  actionsFor(user: BusinessUser): UserAction[] {
    return userActions(user, this.me());
  }

  err(name: 'email' | 'firstName' | 'lastName'): string | null {
    const c = this.invite.controls[name];
    return c.touched ? errorMessage(c.errors) : null;
  }

  toggleSite(id: string): void {
    this.scope.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  sendInvite(): void {
    revealErrors(this.invite);
    const v = this.invite.getRawValue();
    const restricted = v.role === 'BUSINESS_USER' && !v.allSites;
    this.scopeError.set(restricted && this.scope().size === 0);
    if (this.invite.invalid || this.scopeError()) return;
    this.run(
      this.api.invite({
        email: v.email.trim().toLowerCase(),
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        role: v.role,
        siteScope: restricted ? [...this.scope()] : null
      }),
      () => {
        this.invite.reset();
        this.scope.set(new Set());
        this.inviting.set(false);
      }
    );
  }

  toggleRole(user: BusinessUser): void {
    const role: BusinessRole = user.role === 'BUSINESS_ADMIN' ? 'BUSINESS_USER' : 'BUSINESS_ADMIN';
    // Admins see every site; a demoted admin keeps all-site access until restricted explicitly.
    this.run(this.api.changeRole(user, role, null));
  }

  transition(user: BusinessUser, action: UserAction): void {
    if (action === 'deactivate' && !confirm(`Deactivate ${user.email}? They will lose access immediately.`)) return;
    this.run(this.api.transition(user, action));
  }

  resend(user: BusinessUser): void {
    this.run(this.api.resendInvitation(user.id));
  }

  private run(call: Observable<unknown>, onSuccess?: () => void): void {
    this.busy.set(true);
    this.problem.set(null);
    this.unmatched.set([]);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        onSuccess?.();
        this.users.reload();
      },
      error: (p: ApiProblem) => {
        this.busy.set(false);
        this.problem.set(p);
        this.unmatched.set(applyProblemToForm(this.invite, p));
        if (p.isConflict) this.users.reload();
      }
    });
  }
}
```

## apps/gokinetic-business/web/src/app/layout/shell.component.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/layout/shell.component.ts`.

```typescript
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { Permission } from '../core/models/api.models';

interface NavItem {
  label: string;
  path: string;
  permission: Permission;
}

/** Navigation is filtered by the permissions returned from /me; routes are guarded independently. */
const NAV: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', permission: 'services:read' },
  { label: 'Sites & services', path: '/inventory', permission: 'sites:read' },
  { label: 'Orders', path: '/orders', permission: 'orders:read' },
  { label: 'Billing', path: '/billing', permission: 'billing:read' },
  { label: 'Support', path: '/tickets', permission: 'tickets:read' },
  { label: 'SLA reports', path: '/sla', permission: 'sla:read' },
  { label: 'Users', path: '/users', permission: 'users:manage' },
  { label: 'Audit log', path: '/audit', permission: 'audit:read' }
];

@Component({
  selector: 'gkb-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="topbar">
      <span class="brand">Go Kinetic <strong>Business</strong></span>
      @if (auth.session(); as me) {
        <span class="account">{{ me.account.name }} · {{ me.account.id }}</span>
        @if (me.account.status !== 'ACTIVE') {
          <span class="badge badge--warning">Account {{ me.account.status.toLowerCase() }}</span>
        }
        <span class="user">{{ me.email }}</span>
      }
      <button type="button" class="link" (click)="auth.logout()">Sign out</button>
    </header>
    <div class="layout">
      <nav class="sidenav" aria-label="Main">
        @for (item of nav(); track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active">{{ item.label }}</a>
        }
      </nav>
      <main id="main" tabindex="-1"><router-outlet /></main>
    </div>
  `
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly nav = computed(() => {
    this.auth.session();
    return NAV.filter((item) => this.auth.can(item.permission));
  });
}
```

## apps/gokinetic-business/web/src/app/shared/components.spec.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/shared/components.spec.ts`.

```typescript
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Observable, Subject, of } from 'rxjs';
import { ApiProblem } from '../core/http/api-problem';
import { Page, PageRequest } from '../core/models/api.models';
import { CellDirective, Column, DataTableComponent, PageEvent, pageCount, rangeLabel } from './data-table.component';
import { pagedQuery } from './paged-query';
import { StatusBadgeComponent } from './status-badge.component';

interface Row {
  id: string;
  name: string;
  status: string;
}

@Component({
  standalone: true,
  imports: [DataTableComponent, CellDirective, StatusBadgeComponent],
  template: `
    <gkb-data-table [columns]="columns" [rows]="rows()" [total]="total()" [page]="page()" [pageSize]="10"
      [rowClickable]="true" (rowClick)="clicked = $event" (pageChange)="pageEvent = $event">
      <ng-template gkbCell="status" let-row><gkb-status-badge [status]="row.status" /></ng-template>
    </gkb-data-table>
  `
})
class HostComponent {
  columns: Column<Row>[] = [
    { key: 'name', header: 'Name', value: (r) => r.name },
    { key: 'status', header: 'Status' }
  ];
  rows = signal<Row[]>([
    { id: '1', name: 'London HQ', status: 'ACTIVE' },
    { id: '2', name: 'Leeds', status: 'PENDING' }
  ]);
  total = signal(25);
  page = signal(1);
  clicked: Row | null = null;
  pageEvent: PageEvent | null = null;
}

describe('data table helpers', () => {
  it('computes page counts and range labels', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(41, 20)).toBe(3);
    expect(rangeLabel(2, 20, 41)).toBe('21–40 of 41');
    expect(rangeLabel(3, 20, 41)).toBe('41–41 of 41');
    expect(rangeLabel(1, 20, 0)).toBe('0 results');
  });
});

describe('DataTableComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders text cells and custom cell templates', () => {
    const cells = fixture.debugElement.queryAll(By.css('tbody td'));
    expect(cells[0].nativeElement.textContent.trim()).toBe('London HQ');
    expect(cells[1].query(By.css('.badge--success'))).not.toBeNull();
  });

  it('emits row clicks', () => {
    fixture.debugElement.queryAll(By.css('tbody tr'))[1].nativeElement.click();
    expect(host.clicked?.id).toBe('2');
  });

  it('pages forward and disables previous on the first page', () => {
    const [prev, next] = fixture.debugElement.queryAll(By.css('.pager button')).map((b) => b.nativeElement as HTMLButtonElement);
    expect(prev.disabled).toBeTrue();
    next.click();
    expect(host.pageEvent).toEqual({ page: 2, pageSize: 10 });
  });

  it('resets to page one when the page size changes', () => {
    host.page.set(3);
    fixture.detectChanges();
    const select = fixture.debugElement.query(By.css('.pager select')).nativeElement as HTMLSelectElement;
    select.value = '50';
    select.dispatchEvent(new Event('change'));
    expect(host.pageEvent).toEqual({ page: 1, pageSize: 50 });
  });

  it('shows the empty state', () => {
    host.rows.set([]);
    host.total.set(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.empty').textContent).toContain('Nothing to show');
    expect(fixture.nativeElement.querySelector('.pager')).toBeNull();
  });
});

describe('pagedQuery', () => {
  type Filter = { search?: string; status?: string };
  const page = (items: string[], total = items.length): Page<string> => ({ items, page: 1, pageSize: 20, total });

  function create(fetch: (f: Filter, p: PageRequest) => Observable<Page<string>>) {
    return TestBed.runInInjectionContext(() => pagedQuery<Filter, string>(fetch, { status: 'ACTIVE' }));
  }

  it('loads immediately with the initial filter', () => {
    const fetch = jasmine.createSpy('fetch').and.returnValue(of(page(['a', 'b'], 7)));
    const q = create(fetch);
    expect(fetch).toHaveBeenCalledWith({ status: 'ACTIVE' }, { page: 1, pageSize: 20 });
    expect(q.items()).toEqual(['a', 'b']);
    expect(q.total()).toBe(7);
    expect(q.loading()).toBeFalse();
  });

  it('merges filter patches and resets to page 1', () => {
    const fetch = jasmine.createSpy('fetch').and.returnValue(of(page([])));
    const q = create(fetch);
    q.setPage(3);
    q.setFilter({ search: 'leeds' });
    expect(fetch.calls.mostRecent().args).toEqual([{ status: 'ACTIVE', search: 'leeds' }, { page: 1, pageSize: 20 }]);
    expect(q.page()).toBe(1);
  });

  it('ignores responses to superseded requests', fakeAsync(() => {
    const first = new Subject<Page<string>>();
    const second = new Subject<Page<string>>();
    const responses = [first, second];
    const q = create(() => responses.shift()!);
    q.setFilter({ search: 'new' });
    second.next(page(['fresh']));
    first.next(page(['stale']));
    tick();
    expect(q.items()).toEqual(['fresh']);
  }));

  it('exposes API problems and keeps the previous rows', () => {
    let fail = false;
    const q = create(() => (fail ? new Observable<Page<string>>((s) => s.error(new ApiProblem(500, 'Boom', '', 'internal'))) : of(page(['kept']))));
    fail = true;
    q.reload();
    expect(q.error()?.title).toBe('Boom');
    expect(q.items()).toEqual(['kept']);
    expect(q.loading()).toBeFalse();
  });
});
```

## apps/gokinetic-business/web/src/app/shared/data-table.component.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/shared/data-table.component.ts`.

```typescript
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChildren,
  inject,
  input,
  output
} from '@angular/core';

export interface Column<T> {
  key: string;
  header: string;
  /** Plain-text cell value; ignored when an `appCell` template exists for the key. */
  value?: (row: T) => string | number | null;
  align?: 'start' | 'end';
}

/** Custom cell template: `<ng-template gkbCell="status" let-row>...</ng-template>` */
@Directive({ selector: 'ng-template[gkbCell]', standalone: true })
export class CellDirective {
  readonly key = input.required<string>({ alias: 'gkbCell' });
  readonly template = inject(TemplateRef);
}

export interface PageEvent {
  page: number;
  pageSize: number;
}

export const PAGE_SIZES = [10, 20, 50, 100];

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** "21–40 of 132" for the current page window. */
export function rangeLabel(page: number, pageSize: number, total: number): string {
  if (total === 0) return '0 results';
  const start = (page - 1) * pageSize + 1;
  return `${start}–${Math.min(page * pageSize, total)} of ${total}`;
}

@Component({
  selector: 'gkb-data-table',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table-wrap" [attr.aria-busy]="loading()">
      <table class="table">
        <caption class="sr-only">{{ caption() }}</caption>
        <thead>
          <tr>
            @for (col of columns(); track col.key) {
              <th scope="col" [class.num]="col.align === 'end'">{{ col.header }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track trackBy()(row)) {
            <tr [class.clickable]="rowClickable()" (click)="rowClickable() && rowClick.emit(row)"
                (keydown.enter)="rowClickable() && rowClick.emit(row)" [attr.tabindex]="rowClickable() ? 0 : null">
              @for (col of columns(); track col.key) {
                <td [class.num]="col.align === 'end'">
                  @if (templates()[col.key]; as tpl) {
                    <ng-container *ngTemplateOutlet="tpl; context: { $implicit: row }" />
                  } @else {
                    {{ col.value ? col.value(row) ?? '—' : '' }}
                  }
                </td>
              }
            </tr>
          } @empty {
            <tr><td class="empty" [attr.colspan]="columns().length">{{ loading() ? 'Loading…' : emptyText() }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    @if (total() > 0) {
      <nav class="pager" aria-label="Pagination">
        <span>{{ range() }}</span>
        <label>Rows
          <select [value]="pageSize()" (change)="changeSize($any($event.target).value)">
            @for (size of pageSizes; track size) { <option [value]="size">{{ size }}</option> }
          </select>
        </label>
        <button type="button" (click)="go(page() - 1)" [disabled]="page() <= 1">Previous</button>
        <span>Page {{ page() }} of {{ pages() }}</span>
        <button type="button" (click)="go(page() + 1)" [disabled]="page() >= pages()">Next</button>
      </nav>
    }
  `
})
export class DataTableComponent<T> {
  readonly columns = input.required<Column<T>[]>();
  readonly rows = input.required<T[]>();
  readonly total = input(0);
  readonly page = input(1);
  readonly pageSize = input(20);
  readonly loading = input(false);
  readonly caption = input('Results');
  readonly emptyText = input('Nothing to show yet.');
  readonly rowClickable = input(false);
  readonly trackBy = input<(row: T) => unknown>((row: T) => (row as { id?: unknown }).id ?? row);

  readonly pageChange = output<PageEvent>();
  readonly rowClick = output<T>();

  private readonly cells = contentChildren(CellDirective);
  readonly templates = computed(() => Object.fromEntries(this.cells().map((c) => [c.key(), c.template])) as Record<string, TemplateRef<unknown>>);
  readonly pages = computed(() => pageCount(this.total(), this.pageSize()));
  readonly range = computed(() => rangeLabel(this.page(), this.pageSize(), this.total()));
  readonly pageSizes = PAGE_SIZES;

  go(page: number): void {
    if (page < 1 || page > this.pages() || page === this.page()) return;
    this.pageChange.emit({ page, pageSize: this.pageSize() });
  }

  changeSize(value: string): void {
    // Reset to the first page so the user never lands beyond the new last page.
    this.pageChange.emit({ page: 1, pageSize: Number(value) });
  }
}
```

## apps/gokinetic-business/web/src/app/shared/download.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/shared/download.ts`.

```typescript
/** Saves a Blob returned by the API (CSV exports) using a temporary object URL. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

## apps/gokinetic-business/web/src/app/shared/form-errors.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/shared/form-errors.ts`.

```typescript
import { AbstractControl, FormGroup } from '@angular/forms';
import { ApiProblem } from '../core/http/api-problem';

/**
 * Pushes server-side field errors (e.g. "body.email") onto matching form controls as
 * `{ server: { message } }`. Returns the errors that matched no control so the caller can
 * show them in a summary instead of losing them.
 */
export function applyProblemToForm(form: FormGroup, problem: ApiProblem): string[] {
  const unmatched: string[] = [];
  for (const { field, message } of problem.fieldErrors) {
    const path = field.replace(/^(body|query|params)\./, '');
    const control: AbstractControl | null = form.get(path);
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), server: { message } });
      control.markAsTouched();
    } else {
      unmatched.push(`${path}: ${message}`);
    }
  }
  return unmatched;
}

/** Marks every control touched so validation messages appear when a user submits early. */
export function revealErrors(form: AbstractControl): void {
  form.markAllAsTouched();
  form.updateValueAndValidity();
}
```

## apps/gokinetic-business/web/src/app/shared/money.pipe.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/shared/money.pipe.ts`.

```typescript
import { Pipe, PipeTransform } from '@angular/core';

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string, locale: string, signed: boolean): Intl.NumberFormat {
  const key = `${locale}|${currency}|${signed}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, { style: 'currency', currency, signDisplay: signed ? 'exceptZero' : 'auto' });
    formatters.set(key, fmt);
  }
  return fmt;
}

/** Number of minor-unit digits for a currency (2 for GBP, 0 for JPY), per Intl data. */
export function minorDigits(currency: string): number {
  return formatterFor(currency, 'en-GB', false).resolvedOptions().maximumFractionDigits ?? 2;
}

/**
 * Formats integer minor units without floating-point accumulation: the only division happens
 * once, at display time, on an exact integer.
 */
export function formatMinor(amountMinor: number | null | undefined, currency = 'GBP', options: { signed?: boolean; locale?: string } = {}): string {
  if (amountMinor === null || amountMinor === undefined || !Number.isFinite(amountMinor)) return '—';
  const digits = minorDigits(currency);
  return formatterFor(currency, options.locale ?? 'en-GB', options.signed ?? false).format(amountMinor / 10 ** digits);
}

/** `{{ invoice.totalMinor | money: invoice.currency }}`; pass `true` as the second arg for +/- deltas. */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(amountMinor: number | null | undefined, currency = 'GBP', signed = false): string {
    return formatMinor(amountMinor, currency, { signed });
  }
}

/** Thousandths of a percent (99_950) → "99.950%"; basis points use `'bps'` (2_500 → "25.00%"). */
@Pipe({ name: 'pct', standalone: true })
export class PercentPipe implements PipeTransform {
  transform(value: number | null | undefined, unit: 'milli' | 'bps' = 'milli'): string {
    if (value === null || value === undefined) return '—';
    return unit === 'milli' ? `${(value / 1000).toFixed(3)}%` : `${(value / 100).toFixed(2)}%`;
  }
}
```
