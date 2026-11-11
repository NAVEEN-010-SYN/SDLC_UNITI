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
