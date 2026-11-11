# iConnect Wholesale ordering: apps/iconnect-wholesale (part 6 of 7)

- **Application:** iConnect Wholesale ordering
- **Tech stack:** .NET 8 Web API + Angular
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 23

## Files

- `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Support/TestDoubles.cs` (122 lines)
- `apps/iconnect-wholesale/web/angular.json` (60 lines)
- `apps/iconnect-wholesale/web/package.json` (36 lines)
- `apps/iconnect-wholesale/web/proxy.conf.json` (4 lines)
- `apps/iconnect-wholesale/web/src/app/app.component.ts` (45 lines)
- `apps/iconnect-wholesale/web/src/app/app.config.ts` (13 lines)
- `apps/iconnect-wholesale/web/src/app/app.routes.ts` (62 lines)
- `apps/iconnect-wholesale/web/src/app/core/api-problem.ts` (47 lines)
- `apps/iconnect-wholesale/web/src/app/core/api.models.ts` (228 lines)
- `apps/iconnect-wholesale/web/src/app/core/auth.service.ts` (135 lines)
- `apps/iconnect-wholesale/web/src/app/core/core.spec.ts` (172 lines)
- `apps/iconnect-wholesale/web/src/app/core/http.interceptors.ts` (47 lines)
- `apps/iconnect-wholesale/web/src/app/core/role.guard.ts` (27 lines)
- `apps/iconnect-wholesale/web/src/app/core/wholesale-api.ts` (197 lines)
- `apps/iconnect-wholesale/web/src/app/features/api-keys.page.ts` (100 lines)
- `apps/iconnect-wholesale/web/src/app/features/availability.page.ts` (97 lines)
- `apps/iconnect-wholesale/web/src/app/features/bulk-upload.page.ts` (115 lines)
- `apps/iconnect-wholesale/web/src/app/features/catalogue.page.ts` (49 lines)
- `apps/iconnect-wholesale/web/src/app/features/csv-precheck.ts` (53 lines)
- `apps/iconnect-wholesale/web/src/app/features/fault-detail.page.ts` (74 lines)
- `apps/iconnect-wholesale/web/src/app/features/faults.page.ts` (86 lines)
- `apps/iconnect-wholesale/web/src/app/features/features.spec.ts` (62 lines)
- `apps/iconnect-wholesale/web/src/app/features/invoices.page.ts` (121 lines)

## apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Support/TestDoubles.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Support/TestDoubles.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Partners;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Tests.Support;

internal static class Calendars
{
    /// <summary>Mon-Fri 08:00-18:00 UTC; deterministic regardless of the host time zone.</summary>
    public static WorkingCalendar Business(params DateOnly[] holidays) => WorkingCalendar.StandardBusinessHours(TimeZoneInfo.Utc, holidays);

    public static WorkingCalendar AlwaysOn() => WorkingCalendar.AlwaysOn(TimeZoneInfo.Utc);

    public static DateTimeOffset Utc(int year, int month, int day, int hour = 0, int minute = 0) =>
        new(year, month, day, hour, minute, 0, TimeSpan.Zero);
}

internal sealed class FixedClock : IClock
{
    public FixedClock(DateTimeOffset now)
    {
        UtcNow = now;
    }

    public DateTimeOffset UtcNow { get; set; }

    public void Advance(TimeSpan by) => UtcNow += by;
}

internal sealed class FakeCaller : ICurrentCaller
{
    public Guid PartnerId { get; set; }

    public string ActorId { get; set; } = "user-1";

    public bool IsSupportAgent { get; set; }

    public bool IsApiKey { get; set; }
}

internal sealed class CountingUnitOfWork : IUnitOfWork
{
    public int Saves { get; private set; }

    public Task SaveChangesAsync(CancellationToken ct)
    {
        Saves++;
        return Task.CompletedTask;
    }
}

internal sealed class InMemoryPartnerRepository : IPartnerRepository
{
    private readonly List<Partner> _partners = new();

    public Partner Add(Partner partner)
    {
        _partners.Add(partner);
        return partner;
    }

    public Task<Partner?> GetAsync(Guid id, CancellationToken ct) => Task.FromResult(_partners.FirstOrDefault(p => p.Id == id));

    public Task<IReadOnlyList<Partner>> ListActiveAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<Partner>>(_partners.Where(p => p.CanTrade).ToList());
}

internal sealed class InMemoryApiKeyRepository : IApiKeyRepository
{
    public List<ApiKey> Keys { get; } = new();

    public Task<ApiKey?> GetAsync(Guid id, CancellationToken ct) => Task.FromResult(Keys.FirstOrDefault(k => k.Id == id));

    public Task<ApiKey?> GetByPrefixAsync(string prefix, CancellationToken ct) => Task.FromResult(Keys.FirstOrDefault(k => k.Prefix == prefix));

    public Task<IReadOnlyList<ApiKey>> ListForPartnerAsync(Guid partnerId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<ApiKey>>(Keys.Where(k => k.PartnerId == partnerId).ToList());

    public Task AddAsync(ApiKey key, CancellationToken ct)
    {
        Keys.Add(key);
        return Task.CompletedTask;
    }
}

/// <summary>Builds orders in a given lifecycle state through the real aggregate API.</summary>
internal static class Orders
{
    public static readonly DateTimeOffset PlacedAt = Calendars.Utc(2024, 1, 8, 9);

    public static Order Draft(OrderType type = OrderType.Provide, DateOnly? requested = null, CareLevel care = CareLevel.Standard)
    {
        var needsService = type is OrderType.Cease or OrderType.Modify;
        return Order.CreateDraft(
            "ORD-00000001",
            Guid.NewGuid(),
            "PARTNER-REF-1",
            type,
            "100012345678",
            type == OrderType.Cease ? null : "FTTP500",
            care,
            needsService ? Guid.NewGuid() : null,
            type == OrderType.Migrate ? "ABC123456" : null,
            requested ?? new DateOnly(2024, 1, 10),
            PlacedAt);
    }

    public static Order Validated(OrderType type = OrderType.Provide, DateOnly? requested = null, long oneOffMinor = 6_000)
    {
        var order = Draft(type, requested);
        if (type != OrderType.Cease)
        {
            order.Price(Domain.Common.Money.Gbp(2_500), Domain.Common.Money.Gbp(oneOffMinor));
        }

        order.Submit(PlacedAt, "partner");
        order.Validate(PlacedAt, Calendars.Business(), SlaPolicy.Default().OrderLeadTimeWorkingDays(type), "system");
        return order;
    }
}
```

## apps/iconnect-wholesale/web/angular.json

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: json. Path: `apps/iconnect-wholesale/web/angular.json`.

```json
{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "newProjectRoot": "projects",
  "projects": {
    "iconnect-wholesale": {
      "projectType": "application",
      "root": "",
      "sourceRoot": "src",
      "prefix": "icw",
      "architect": {
        "build": {
          "builder": "@angular-devkit/build-angular:application",
          "options": {
            "outputPath": "dist/iconnect-wholesale",
            "index": "src/index.html",
            "browser": "src/main.ts",
            "polyfills": ["zone.js"],
            "tsConfig": "tsconfig.app.json",
            "inlineStyleLanguage": "scss",
            "styles": ["src/styles.scss"]
          },
          "configurations": {
            "production": {
              "budgets": [{ "type": "initial", "maximumWarning": "500kb", "maximumError": "1mb" }],
              "outputHashing": "all"
            },
            "development": {
              "optimization": false,
              "extractLicenses": false,
              "sourceMap": true,
              "fileReplacements": [
                { "replace": "src/environments/environment.ts", "with": "src/environments/environment.development.ts" }
              ]
            }
          },
          "defaultConfiguration": "production"
        },
        "serve": {
          "builder": "@angular-devkit/build-angular:dev-server",
          "configurations": {
            "production": { "buildTarget": "iconnect-wholesale:build:production" },
            "development": { "buildTarget": "iconnect-wholesale:build:development" }
          },
          "defaultConfiguration": "development"
        },
        "test": {
          "builder": "@angular-devkit/build-angular:karma",
          "options": {
            "polyfills": ["zone.js", "zone.js/testing"],
            "tsConfig": "tsconfig.spec.json",
            "inlineStyleLanguage": "scss",
            "styles": ["src/styles.scss"]
          }
        }
      }
    }
  }
}
```

## apps/iconnect-wholesale/web/package.json

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: json. Path: `apps/iconnect-wholesale/web/package.json`.

```json
{
  "name": "iconnect-wholesale-web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "ng serve --proxy-config proxy.conf.json",
    "build": "ng build",
    "test": "ng test",
    "test:ci": "ng test --watch=false --browsers=ChromeHeadless"
  },
  "dependencies": {
    "@angular/common": "^17.3.12",
    "@angular/compiler": "^17.3.12",
    "@angular/core": "^17.3.12",
    "@angular/forms": "^17.3.12",
    "@angular/platform-browser": "^17.3.12",
    "@angular/router": "^17.3.12",
    "rxjs": "~7.8.1",
    "tslib": "^2.6.3",
    "zone.js": "~0.14.10"
  },
  "devDependencies": {
    "@angular-devkit/build-angular": "^17.3.11",
    "@angular/cli": "^17.3.11",
    "@angular/compiler-cli": "^17.3.12",
    "@types/jasmine": "~5.1.4",
    "jasmine-core": "~5.1.2",
    "karma": "~6.4.4",
    "karma-chrome-launcher": "~3.2.0",
    "karma-coverage": "~2.2.1",
    "karma-jasmine": "~5.1.0",
    "karma-jasmine-html-reporter": "~2.1.0",
    "typescript": "~5.4.5"
  }
}
```

## apps/iconnect-wholesale/web/proxy.conf.json

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: json. Path: `apps/iconnect-wholesale/web/proxy.conf.json`.

```json
{
  "/api": { "target": "https://localhost:5001", "secure": false, "changeOrigin": true }
}
```

## apps/iconnect-wholesale/web/src/app/app.component.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/app.component.ts`.

```typescript
import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'icw-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header>
      <strong>iConnect Wholesale</strong>
      @if (auth.user(); as user) {
        <nav>
          @for (link of links; track link.path) {
            <a [routerLink]="link.path" routerLinkActive="active">{{ link.label }}</a>
          }
        </nav>
        <span class="who">{{ user.name }} <button class="secondary" (click)="auth.logout()">Sign out</button></span>
      }
    </header>
    <main><router-outlet /></main>
  `,
  styles: [`
    header { display: flex; gap: 1.5rem; align-items: center; padding: 0.75rem 1.5rem; background: var(--icw-primary); color: #fff; }
    nav { display: flex; gap: 1rem; flex: 1; flex-wrap: wrap; }
    nav a { color: #e8e0f7; text-decoration: none; }
    nav a.active { color: #fff; font-weight: 700; }
    .who { display: flex; gap: 0.5rem; align-items: center; }
    main { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }
  `],
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly links = [
    { path: '/availability', label: 'Availability' },
    { path: '/catalogue', label: 'Catalogue' },
    { path: '/orders', label: 'Orders' },
    { path: '/orders/bulk', label: 'Bulk upload' },
    { path: '/faults', label: 'Faults' },
    { path: '/invoices', label: 'Invoices' },
    { path: '/sla', label: 'SLA' },
    { path: '/api-keys', label: 'API keys' },
  ];
}
```

## apps/iconnect-wholesale/web/src/app/app.config.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/app.config.ts`.

```typescript
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor, correlationIdInterceptor, problemInterceptor } from './core/http.interceptors';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([correlationIdInterceptor, authInterceptor, problemInterceptor])),
  ],
};
```

## apps/iconnect-wholesale/web/src/app/app.routes.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/app.routes.ts`.

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, Routes } from '@angular/router';
import { AuthService } from './core/auth.service';
import { roleGuard } from './core/role.guard';

@Component({
  standalone: true,
  template: `<div class="card">{{ message }}</div>`,
})
export class AuthCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  message = 'Signing you in…';

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    try {
      const returnUrl = await this.auth.completeLogin(params.get('code') ?? '', params.get('state') ?? '');
      await this.router.navigateByUrl(returnUrl);
    } catch (e) {
      this.message = e instanceof Error ? e.message : 'Sign-in failed.';
    }
  }
}

@Component({
  standalone: true,
  template: `<div class="card"><h1>{{ title }}</h1><p>{{ text }}</p><button (click)="signIn()">Sign in</button></div>`,
})
export class GateComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  readonly title = this.route.snapshot.data['title'] as string;
  readonly text = this.route.snapshot.data['text'] as string;

  signIn(): void {
    void this.auth.login(this.route.snapshot.queryParamMap.get('returnUrl') ?? '/');
  }
}

const guarded = { canMatch: [roleGuard] };

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'orders' },
  { path: 'auth/callback', component: AuthCallbackComponent },
  { path: 'signed-out', component: GateComponent, data: { title: 'Session ended', text: 'Your session has expired. Sign in to continue.' } },
  { path: 'forbidden', component: GateComponent, data: { title: 'No access', text: 'Your account does not have wholesale ordering access.' } },
  { path: 'availability', ...guarded, loadComponent: () => import('./features/availability.page').then((m) => m.AvailabilityPage) },
  { path: 'catalogue', ...guarded, loadComponent: () => import('./features/catalogue.page').then((m) => m.CataloguePage) },
  { path: 'orders', ...guarded, loadComponent: () => import('./features/orders-list.page').then((m) => m.OrdersListPage) },
  { path: 'orders/new', ...guarded, loadComponent: () => import('./features/order-new.page').then((m) => m.OrderNewPage) },
  { path: 'orders/bulk', ...guarded, loadComponent: () => import('./features/bulk-upload.page').then((m) => m.BulkUploadPage) },
  { path: 'orders/:id', ...guarded, loadComponent: () => import('./features/order-detail.page').then((m) => m.OrderDetailPage) },
  { path: 'faults', ...guarded, loadComponent: () => import('./features/faults.page').then((m) => m.FaultsPage) },
  { path: 'faults/:id', ...guarded, loadComponent: () => import('./features/fault-detail.page').then((m) => m.FaultDetailPage) },
  { path: 'invoices', ...guarded, loadComponent: () => import('./features/invoices.page').then((m) => m.InvoicesPage) },
  { path: 'sla', ...guarded, loadComponent: () => import('./features/sla.page').then((m) => m.SlaPage) },
  { path: 'api-keys', ...guarded, loadComponent: () => import('./features/api-keys.page').then((m) => m.ApiKeysPage) },
  { path: '**', redirectTo: 'orders' },
];
```

## apps/iconnect-wholesale/web/src/app/core/api-problem.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/core/api-problem.ts`.

```typescript
import { HttpErrorResponse } from '@angular/common/http';

/** An RFC 7807 problem returned by the API, normalised so every page can render it the same way. */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly detail: string | null,
    readonly fieldErrors: Record<string, string[]>,
    readonly correlationId: string | null,
  ) {
    super(detail ?? title);
    this.name = 'ApiProblem';
  }

  /** First error for a form field, matching the camelCase keys the API emits. */
  fieldError(field: string): string | null {
    return this.fieldErrors[field]?.[0] ?? null;
  }

  static from(error: HttpErrorResponse): ApiProblem {
    const correlationId = error.headers?.get('X-Correlation-Id') ?? null;
    const body = error.error;
    if (body && typeof body === 'object' && typeof body.title === 'string') {
      return new ApiProblem(
        body.status ?? error.status,
        typeof body.code === 'string' ? body.code : 'http.error',
        body.title,
        typeof body.detail === 'string' ? body.detail : null,
        isErrorMap(body.errors) ? body.errors : {},
        typeof body.correlationId === 'string' ? body.correlationId : correlationId,
      );
    }

    if (error.status === 0) {
      return new ApiProblem(0, 'network.unreachable', 'The service could not be reached', 'Check your connection and try again.', {}, null);
    }

    return new ApiProblem(error.status, 'http.error', error.statusText || 'Request failed', null, {}, correlationId);
  }
}

function isErrorMap(value: unknown): value is Record<string, string[]> {
  return !!value && typeof value === 'object' && Object.values(value).every((v) => Array.isArray(v));
}
```

## apps/iconnect-wholesale/web/src/app/core/api.models.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/core/api.models.ts`.

```typescript
/** Wire contracts of the iConnect Wholesale API (/api/v1). Money is integer minor units; instants are ISO-8601 UTC. */

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Product {
  code: string;
  name: string;
  downstreamMbps: number;
  upstreamMbps: number;
  careLevels: string[];
  isActive: boolean;
}

export interface PriceBookEntry {
  productCode: string;
  careLevel: string;
  monthlyRentalMinor: number;
  connectionChargeMinor: number;
  migrationChargeMinor: number;
  modifyChargeMinor: number;
}

export interface PriceBook {
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
  entries: PriceBookEntry[];
  tiers: { minimumActiveLines: number; discountBps: number }[];
}

export interface AddressMatch {
  uprn: string;
  address: string;
  postcode: string;
  buildStatus: string;
}

export interface Availability {
  uprn: string;
  address: string;
  exchangeCode: string;
  buildStatus: string;
  maxDownstreamMbps: number;
  readyForServiceDate: string | null;
  hasActiveService: boolean;
  hasOpenOrder: boolean;
  recommendedOrderType: string;
  earliestCompletionDate: string;
  products: { product: Product; orderable: boolean; reason: string | null }[];
}

export type OrderType = 'PROVIDE' | 'CEASE' | 'MODIFY' | 'MIGRATE';

export interface PlaceOrderRequest {
  partnerReference: string;
  orderType: OrderType;
  uprn: string;
  productCode: string | null;
  careLevel: string | null;
  existingServiceId: string | null;
  migrationAuthCode: string | null;
  requestedDate: string;
}

export interface OrderSummary {
  id: string;
  reference: string;
  partnerReference: string;
  type: OrderType;
  status: string;
  uprn: string;
  productCode: string | null;
  requestedDate: string;
  committedDate: string | null;
  onHold: boolean;
  slaStatus: string | null;
  createdAt: string;
}

export interface OrderDetail extends OrderSummary {
  careLevel: string;
  existingServiceId: string | null;
  resultingServiceId: string | null;
  completedDate: string | null;
  appointmentSlotId: string | null;
  monthlyRentalMinor: number | null;
  oneOffChargeMinor: number | null;
  cancellationChargeMinor: number | null;
  currency: string;
  failureReason: string | null;
  holdReason: string | null;
  sla: { status: string; elapsedWorkingHours: number; targetWorkingHours: number; dueAt: string | null; workingDaysLate: number } | null;
  allowedActions: string[];
  history: { from: string | null; to: string; at: string; note: string; actor: string | null }[];
}

export interface AppointmentSlot {
  id: string;
  date: string;
  band: string;
  remaining: number;
  meetsCommittedDate: boolean;
}

export interface BulkRowError {
  row: number;
  column: string;
  code: string;
  message: string;
}

export interface BulkUploadResult {
  uploadId: string | null;
  fileName: string;
  status: string;
  rowCount: number;
  validRows: number;
  ordersCreated: number;
  ordersRejected: number;
  errors: BulkRowError[];
  orders: { line: number; partnerReference: string; orderReference: string | null; status: string; reason: string | null }[];
}

export interface FaultSummary {
  id: string;
  reference: string;
  serviceUprn: string;
  priority: string;
  status: string;
  category: string;
  slaStatus: string;
  dueAt: string | null;
  createdAt: string;
}

export interface FaultDetail {
  id: string;
  reference: string;
  serviceId: string;
  uprn: string;
  priority: string;
  category: string;
  careLevel: string;
  status: string;
  description: string;
  sla: { status: string; elapsedWorkingHours: number; targetWorkingHours: number; dueAt: string | null; calendar: string };
  resolvedAt: string | null;
  resolutionCode: string | null;
  serviceCreditMinor: number | null;
  serviceCreditBasis: string | null;
  allowedActions: string[];
  notes: { at: string; author: string; text: string }[];
  createdAt: string;
}

export interface StatementSummary {
  id: string;
  reference: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalMinor: number;
  currency: string;
  dueDate: string | null;
}

export interface Dispute {
  id: string;
  reference: string;
  statementId: string;
  lineIds: string[];
  reason: string;
  claimedMinor: number;
  status: string;
  awardedMinor: number | null;
  outcome: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface StatementDetail extends Omit<StatementSummary, 'totalMinor'> {
  chargesMinor: number;
  creditsMinor: number;
  totalMinor: number;
  issuedAt: string | null;
  lines: { id: string; lineNumber: number; type: string; description: string; quantity: number; amountMinor: number; sourceReference: string | null }[];
  disputes: Dispute[];
}

export interface SlaSummary {
  periodStart: string;
  asOf: string;
  openOrders: number;
  ordersAtRisk: number;
  ordersBreached: number;
  openFaults: number;
  faultsAtRisk: number;
  faultsBreached: number;
  faultCreditsMinor: number;
  lateDeliveryCreditsMinor: number;
  currency: string;
  attention: { id: string; kind: 'ORDER' | 'FAULT'; reference: string; status: string; slaStatus: string; dueAt: string | null; remainingWorkingHours: number }[];
}

export interface SlaPolicy {
  repairTargets: { careLevel: string; priority: string; calendar: string; targetHours: number }[];
  orderLeadTimeWorkingDays: Record<string, number>;
  creditTerms: { careLevel: string; faultCreditBpsPerBreachDay: number; faultCreditCapBps: number; lateDeliveryPerDayMinor: number; lateDeliveryMaxDays: number; missedAppointmentMinor: number }[];
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'REVOKED';
}
```

## apps/iconnect-wholesale/web/src/app/core/auth.service.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/core/auth.service.ts`.

```typescript
import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../environments/environment';

export interface Session {
  accessToken: string;
  expiresAt: number;
  subject: string;
  name: string;
  roles: string[];
  partnerId: string | null;
}

const SESSION_KEY = 'icw.session';
const PKCE_KEY = 'icw.pkce';

/**
 * OIDC authorization-code + PKCE login. The access token lives in sessionStorage only (never
 * localStorage) and is discarded when it expires; the API enforces roles regardless of what the UI shows.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly session = signal<Session | null>(this.restore());

  readonly user = computed(() => this.session());
  readonly isAuthenticated = computed(() => this.session() !== null);

  accessToken(now = Date.now()): string | null {
    const s = this.session();
    if (!s || s.expiresAt <= now) {
      return null;
    }
    return s.accessToken;
  }

  hasAnyRole(roles: readonly string[]): boolean {
    const s = this.session();
    return !!s && roles.some((r) => s.roles.includes(r));
  }

  async login(returnUrl: string): Promise<void> {
    const verifier = randomString(64);
    const state = randomString(24);
    sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnUrl }));
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: environment.oidc.clientId,
      redirect_uri: `${location.origin}/auth/callback`,
      scope: environment.oidc.scope,
      state,
      code_challenge: await challengeFor(verifier),
      code_challenge_method: 'S256',
    });
    location.assign(`${environment.oidc.authority}/protocol/openid-connect/auth?${params}`);
  }

  /** Exchanges the authorization code; returns the URL the user originally asked for. */
  async completeLogin(code: string, state: string): Promise<string> {
    const pending = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? 'null') as { verifier: string; state: string; returnUrl: string } | null;
    sessionStorage.removeItem(PKCE_KEY);
    if (!pending || pending.state !== state) {
      throw new Error('Login state mismatch; please sign in again.');
    }

    const response = await fetch(`${environment.oidc.authority}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: environment.oidc.clientId,
        code,
        redirect_uri: `${location.origin}/auth/callback`,
        code_verifier: pending.verifier,
      }),
    });
    if (!response.ok) {
      throw new Error(`Token exchange failed (${response.status}).`);
    }

    const token = (await response.json()) as { access_token: string };
    this.setToken(token.access_token);
    return pending.returnUrl || '/';
  }

  setToken(accessToken: string): void {
    const session = AuthService.parse(accessToken);
    this.session.set(session);
    sessionStorage.setItem(SESSION_KEY, accessToken);
  }

  logout(): void {
    this.session.set(null);
    sessionStorage.removeItem(SESSION_KEY);
  }

  static parse(accessToken: string): Session {
    const [, payload] = accessToken.split('.');
    if (!payload) {
      throw new Error('Malformed access token.');
    }
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    const roles = Array.isArray(claims['roles']) ? (claims['roles'] as string[]) : [];
    return {
      accessToken,
      expiresAt: Number(claims['exp'] ?? 0) * 1000,
      subject: String(claims['sub'] ?? ''),
      name: String(claims['name'] ?? claims['preferred_username'] ?? ''),
      roles,
      partnerId: typeof claims['partner_id'] === 'string' ? claims['partner_id'] : null,
    };
  }

  private restore(): Session | null {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) {
      return null;
    }
    try {
      const session = AuthService.parse(token);
      return session.expiresAt > Date.now() ? session : null;
    } catch {
      return null;
    }
  }
}

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[b % 66]).join('');
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

## apps/iconnect-wholesale/web/src/app/core/core.spec.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/core/core.spec.ts`.

```typescript
import { HttpClient, HttpErrorResponse, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Route, Router, UrlTree, provideRouter } from '@angular/router';
import { ApiProblem } from './api-problem';
import { AuthService } from './auth.service';
import { CORRELATION_HEADER, authInterceptor, correlationIdInterceptor, problemInterceptor } from './http.interceptors';
import { Roles, roleGuard } from './role.guard';
import { OrdersApi } from './wholesale-api';

function token(claims: Record<string, unknown>): string {
  const encode = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'none' })}.${encode(claims)}.sig`;
}

const inOneHour = () => Math.floor(Date.now() / 1000) + 3600;

describe('AuthService', () => {
  beforeEach(() => sessionStorage.clear());

  it('parses roles, partner and expiry from the access token', () => {
    const session = AuthService.parse(token({ sub: 'u1', name: 'Ana', roles: [Roles.WholesaleBuyer], partner_id: 'p-1', exp: 2000000000 }));
    expect(session.roles).toEqual([Roles.WholesaleBuyer]);
    expect(session.partnerId).toBe('p-1');
    expect(session.expiresAt).toBe(2000000000000);
  });

  it('withholds an expired token', () => {
    const auth = TestBed.inject(AuthService);
    auth.setToken(token({ sub: 'u1', roles: [], exp: 100 }));
    expect(auth.accessToken()).toBeNull();
  });

  it('checks roles against the session', () => {
    const auth = TestBed.inject(AuthService);
    auth.setToken(token({ sub: 'u1', roles: [Roles.SupportAgent], exp: inOneHour() }));
    expect(auth.hasAnyRole([Roles.WholesaleBuyer, Roles.SupportAgent])).toBeTrue();
    expect(auth.hasAnyRole([Roles.WholesaleBuyer])).toBeFalse();
  });
});

describe('HTTP interceptors', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([correlationIdInterceptor, authInterceptor, problemInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => backend.verify());

  it('adds bearer token and correlation id to API calls only', () => {
    auth.setToken(token({ sub: 'u1', roles: [], exp: inOneHour() }));
    http.get('/api/v1/orders').subscribe();
    http.get('https://cdn.example.org/logo.svg').subscribe();

    const api = backend.expectOne('/api/v1/orders');
    expect(api.request.headers.get('Authorization')).toMatch(/^Bearer /);
    expect(api.request.headers.get(CORRELATION_HEADER)).toMatch(/^web-/);
    const external = backend.expectOne('https://cdn.example.org/logo.svg');
    expect(external.request.headers.has('Authorization')).toBeFalse();
    expect(external.request.headers.has(CORRELATION_HEADER)).toBeFalse();
    api.flush({});
    external.flush('');
  });

  it('turns problem+json into ApiProblem with field errors', (done) => {
    http.post('/api/v1/orders', {}).subscribe({
      error: (p: ApiProblem) => {
        expect(p instanceof ApiProblem).toBeTrue();
        expect(p.code).toBe('validation.failed');
        expect(p.fieldError('uprn')).toBe('UPRN must be 1 to 12 digits.');
        expect(p.correlationId).toBe('abc-12345678');
        done();
      },
    });
    backend.expectOne('/api/v1/orders').flush(
      { title: 'One or more fields are invalid', status: 400, code: 'validation.failed', errors: { uprn: ['UPRN must be 1 to 12 digits.'] }, correlationId: 'abc-12345678' },
      { status: 400, statusText: 'Bad Request' });
  });

  it('ends the session and routes to sign-in on 401', () => {
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    auth.setToken(token({ sub: 'u1', roles: [], exp: inOneHour() }));

    http.get('/api/v1/sla/summary').subscribe({ error: () => undefined });
    backend.expectOne('/api/v1/sla/summary').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.isAuthenticated()).toBeFalse();
    expect(navigate).toHaveBeenCalledWith(['/signed-out'], jasmine.any(Object));
  });

  it('maps network failures to a readable problem', () => {
    const problem = ApiProblem.from(new HttpErrorResponse({ status: 0, headers: new HttpHeaders() }));
    expect(problem.code).toBe('network.unreachable');
  });
});

describe('roleGuard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  const run = (route: Route) => TestBed.runInInjectionContext(() => roleGuard(route, []));

  it('starts login when signed out', () => {
    const login = spyOn(TestBed.inject(AuthService), 'login').and.resolveTo();
    expect(run({})).toBeFalse();
    expect(login).toHaveBeenCalled();
  });

  it('allows wholesale buyers and redirects other roles', () => {
    const auth = TestBed.inject(AuthService);
    auth.setToken(token({ sub: 'u1', roles: [Roles.WholesaleBuyer], exp: inOneHour() }));
    expect(run({})).toBeTrue();

    auth.setToken(token({ sub: 'u2', roles: ['CONSUMER'], exp: inOneHour() }));
    const result = run({});
    expect(result instanceof UrlTree).toBeTrue();
    expect(String(result)).toBe('/forbidden');
  });

  it('honours route-specific roles', () => {
    TestBed.inject(AuthService).setToken(token({ sub: 'u1', roles: [Roles.WholesaleBuyer], exp: inOneHour() }));
    expect(run({ data: { roles: [Roles.SupportAgent] } }) instanceof UrlTree).toBeTrue();
  });
});

describe('OrdersApi', () => {
  let api: OrdersApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(OrdersApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('omits empty filters from the query string', () => {
    api.list({ status: 'ACTIVE', type: '', search: undefined, page: 2, pageSize: 25 }).subscribe();
    const req = backend.expectOne((r) => r.url === '/api/v1/orders');
    expect(req.request.params.keys().sort()).toEqual(['page', 'pageSize', 'status']);
    req.flush({ items: [], page: 2, pageSize: 25, total: 0 });
  });

  it('distinguishes a new order from an idempotent replay', () => {
    const outcomes: boolean[] = [];
    const request = { partnerReference: 'R1', orderType: 'PROVIDE' as const, uprn: '1', productCode: 'FTTP500', careLevel: null,
      existingServiceId: null, migrationAuthCode: null, requestedDate: '2030-01-01' };
    api.place(request).subscribe((r) => outcomes.push(r.created));
    backend.expectOne('/api/v1/orders').flush({ id: 'o1' }, { status: 201, statusText: 'Created' });
    api.place(request).subscribe((r) => outcomes.push(r.created));
    backend.expectOne('/api/v1/orders').flush({ id: 'o1' }, { status: 200, statusText: 'OK' });
    expect(outcomes).toEqual([true, false]);
  });
});
```

## apps/iconnect-wholesale/web/src/app/core/http.interceptors.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/core/http.interceptors.ts`.

```typescript
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiProblem } from './api-problem';
import { AuthService } from './auth.service';

export const CORRELATION_HEADER = 'X-Correlation-Id';

const isApiCall = (url: string) => url.startsWith(environment.apiBaseUrl);

/** Attaches the bearer token to API calls only, so it never leaks to third-party hosts. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).accessToken();
  if (!token || !isApiCall(req.url)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

/** Gives every API call its own correlation id so support can trace a UI action through the logs. */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiCall(req.url) || req.headers.has(CORRELATION_HEADER)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { [CORRELATION_HEADER]: `web-${crypto.randomUUID()}` } }));
};

/** Converts API failures into {@link ApiProblem}; an expired session sends the user back through login. */
export const problemInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || !isApiCall(req.url)) {
        return throwError(() => error);
      }
      if (error.status === 401) {
        auth.logout();
        void router.navigate(['/signed-out'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => ApiProblem.from(error));
    }),
  );
};
```

## apps/iconnect-wholesale/web/src/app/core/role.guard.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/core/role.guard.ts`.

```typescript
import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const Roles = {
  WholesaleBuyer: 'WHOLESALE_BUYER',
  SupportAgent: 'SUPPORT_AGENT',
} as const;

export const PORTAL_ROLES = [Roles.WholesaleBuyer, Roles.SupportAgent];

/**
 * Lazy routes only match for signed-in users holding one of the route's roles
 * (route data `roles`, default: any portal role). This is a UX gate; the API enforces authorisation.
 */
export const roleGuard: CanMatchFn = (route, segments) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    const returnUrl = '/' + segments.map((s) => s.path).join('/');
    void auth.login(returnUrl);
    return false;
  }
  const roles = (route.data?.['roles'] as string[] | undefined) ?? PORTAL_ROLES;
  return auth.hasAnyRole(roles) ? true : router.createUrlTree(['/forbidden']);
};
```

## apps/iconnect-wholesale/web/src/app/core/wholesale-api.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/core/wholesale-api.ts`.

```typescript
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AddressMatch, ApiKey, AppointmentSlot, Availability, BulkUploadResult, Dispute, FaultDetail, FaultSummary, OrderDetail,
  OrderSummary, Paged, PlaceOrderRequest, PriceBook, Product, SlaPolicy, SlaSummary, StatementDetail, StatementSummary,
} from './api.models';

const base = environment.apiBaseUrl;

/** Builds query params, dropping empty filters so the API applies its own defaults. */
export function toParams(query: Record<string, string | number | boolean | null | undefined>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class AvailabilityApi {
  private readonly http = inject(HttpClient);

  searchAddresses(postcode: string): Observable<AddressMatch[]> {
    return this.http.get<AddressMatch[]>(`${base}/availability/addresses`, { params: toParams({ postcode }) });
  }

  check(uprn: string): Observable<Availability> {
    return this.http.get<Availability>(`${base}/availability/${encodeURIComponent(uprn)}`);
  }
}

@Injectable({ providedIn: 'root' })
export class CatalogueApi {
  private readonly http = inject(HttpClient);

  products(includeWithdrawn = false): Observable<Product[]> {
    return this.http.get<Product[]>(`${base}/catalogue/products`, { params: toParams({ includeWithdrawn }) });
  }

  priceBook(onDate?: string): Observable<PriceBook> {
    return this.http.get<PriceBook>(`${base}/catalogue/price-book`, { params: toParams({ onDate }) });
  }
}

export interface OrderFilter {
  status?: string;
  type?: string;
  search?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly http = inject(HttpClient);

  /** Resolves to the order and whether it was newly created (false = idempotent replay of the same partner reference). */
  place(request: PlaceOrderRequest): Observable<{ order: OrderDetail; created: boolean }> {
    return this.http
      .post<OrderDetail>(`${base}/orders`, request, { observe: 'response' })
      .pipe(map((res) => ({ order: res.body as OrderDetail, created: res.status === 201 })));
  }

  list(filter: OrderFilter): Observable<Paged<OrderSummary>> {
    return this.http.get<Paged<OrderSummary>>(`${base}/orders`, { params: toParams({ ...filter }) });
  }

  get(id: string): Observable<OrderDetail> {
    return this.http.get<OrderDetail>(`${base}/orders/${id}`);
  }

  /** Partner actions: cancel (reason) and amend (requestedDate). */
  act(id: string, action: 'cancel' | 'amend', body: object): Observable<OrderDetail> {
    return this.http.post<OrderDetail>(`${base}/orders/${id}/${action}`, body);
  }

  appointmentSlots(id: string, from?: string): Observable<AppointmentSlot[]> {
    return this.http.get<AppointmentSlot[]>(`${base}/orders/${id}/appointment-slots`, { params: toParams({ from }) });
  }

  bookAppointment(id: string, slotId: string): Observable<{ slotId: string; date: string; holdExpiresAt: string; committedDate: string | null }> {
    return this.http.put<{ slotId: string; date: string; holdExpiresAt: string; committedDate: string | null }>(
      `${base}/orders/${id}/appointment`, { slotId });
  }
}

@Injectable({ providedIn: 'root' })
export class BulkOrdersApi {
  private readonly http = inject(HttpClient);

  upload(file: File, dryRun: boolean): Observable<BulkUploadResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<BulkUploadResult>(`${base}/bulk-orders`, form, { params: toParams({ dryRun }) });
  }

  template(): Observable<Blob> {
    return this.http.get(`${base}/bulk-orders/template`, { responseType: 'blob' });
  }
}

@Injectable({ providedIn: 'root' })
export class FaultsApi {
  private readonly http = inject(HttpClient);

  raise(body: { serviceId: string; priority: string; category: string; description: string }): Observable<FaultDetail> {
    return this.http.post<FaultDetail>(`${base}/faults`, body);
  }

  list(filter: { status?: string; priority?: string; page: number; pageSize: number }): Observable<Paged<FaultSummary>> {
    return this.http.get<Paged<FaultSummary>>(`${base}/faults`, { params: toParams({ ...filter }) });
  }

  get(id: string): Observable<FaultDetail> {
    return this.http.get<FaultDetail>(`${base}/faults/${id}`);
  }

  addNote(id: string, text: string): Observable<FaultDetail> {
    return this.http.post<FaultDetail>(`${base}/faults/${id}/notes`, { text });
  }

  transition(id: string, action: string, note?: string): Observable<FaultDetail> {
    return this.http.post<FaultDetail>(`${base}/faults/${id}/transitions`, { action, note: note ?? null, resolutionCode: null });
  }
}

@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);

  statements(page: number, pageSize: number): Observable<Paged<StatementSummary>> {
    return this.http.get<Paged<StatementSummary>>(`${base}/billing/statements`, { params: toParams({ page, pageSize }) });
  }

  statement(id: string): Observable<StatementDetail> {
    return this.http.get<StatementDetail>(`${base}/billing/statements/${id}`);
  }

  exportCsv(id: string): Observable<Blob> {
    return this.http.get(`${base}/billing/statements/${id}/export`, { responseType: 'blob' });
  }

  raiseDispute(statementId: string, body: { lineIds: string[]; reason: string; claimedMinor: number }): Observable<Dispute> {
    return this.http.post<Dispute>(`${base}/billing/statements/${statementId}/disputes`, body);
  }
}

@Injectable({ providedIn: 'root' })
export class SlaApi {
  private readonly http = inject(HttpClient);

  summary(): Observable<SlaSummary> {
    return this.http.get<SlaSummary>(`${base}/sla/summary`);
  }

  policy(): Observable<SlaPolicy> {
    return this.http.get<SlaPolicy>(`${base}/sla/policy`);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiKeysApi {
  private readonly http = inject(HttpClient);

  list(): Observable<ApiKey[]> {
    return this.http.get<ApiKey[]>(`${base}/api-keys`);
  }

  scopes(): Observable<string[]> {
    return this.http.get<string[]>(`${base}/api-keys/scopes`);
  }

  create(body: { name: string; scopes: string[]; validForDays: number }): Observable<{ key: ApiKey; secret: string }> {
    return this.http.post<{ key: ApiKey; secret: string }>(`${base}/api-keys`, body);
  }

  revoke(id: string): Observable<void> {
    return this.http.delete<void>(`${base}/api-keys/${id}`);
  }
}

/** Saves a blob response (CSV exports, templates) under the given file name. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
```

## apps/iconnect-wholesale/web/src/app/features/api-keys.page.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/api-keys.page.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiProblem } from '../core/api-problem';
import { ApiKey } from '../core/api.models';
import { ApiKeysApi } from '../core/wholesale-api';
import { ProblemComponent, StatusLabelPipe } from '../shared/shared';

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, ProblemComponent, StatusLabelPipe],
  template: `
    <h1>API keys</h1>
    <p class="muted">Keys let your systems call the wholesale API with the <code>X-Api-Key</code> header. Up to 5 active keys.</p>
    <div class="card">
      <div class="row">
        <label>Name <input [(ngModel)]="name" name="name" maxlength="60" /></label>
        <label>Valid for (days) <input type="number" [(ngModel)]="days" name="days" min="1" max="365" /></label>
      </div>
      <div class="row scopes">
        @for (s of scopes(); track s) {
          <label class="scope"><input type="checkbox" [checked]="chosen.has(s)" (change)="toggle(s)" /> {{ s }}</label>
        }
      </div>
      <button [disabled]="!name.trim() || chosen.size === 0 || days < 1 || days > 365" (click)="create()">Create key</button>
    </div>
    @if (secret()) {
      <div class="card secret" role="status">
        <strong>Copy this key now. It will not be shown again.</strong>
        <code>{{ secret() }}</code>
        <button class="secondary" (click)="copy()">Copy</button>
      </div>
    }
    <icw-problem [problem]="problem()" />
    <table>
      <thead><tr><th>Name</th><th>Prefix</th><th>Scopes</th><th>Status</th><th>Expires</th><th>Last used</th><th></th></tr></thead>
      <tbody>
        @for (k of keys(); track k.id) {
          <tr><td>{{ k.name }}</td><td><code>{{ k.prefix }}</code></td><td>{{ k.scopes.join(', ') }}</td>
            <td><span class="badge {{ k.status }}">{{ k.status | statusLabel }}</span></td>
            <td>{{ k.expiresAt | date: 'd MMM y' }}</td><td>{{ (k.lastUsedAt | date: 'd MMM y, HH:mm') ?? 'never' }}</td>
            <td>@if (k.status === 'ACTIVE' || k.status === 'EXPIRING') { <button class="danger" (click)="revoke(k)">Revoke</button> }</td></tr>
        } @empty { <tr><td colspan="7" class="muted">No keys yet.</td></tr> }
      </tbody>
    </table>
  `,
  styles: ['.scope { flex-direction: row; font-weight: 400; } .secret { border-color: var(--icw-warn); display: flex; gap: 1rem; align-items: center; } .secret code { word-break: break-all; }'],
})
export class ApiKeysPage implements OnInit {
  private readonly api = inject(ApiKeysApi);
  readonly keys = signal<ApiKey[]>([]);
  readonly scopes = signal<string[]>([]);
  readonly secret = signal<string | null>(null);
  readonly problem = signal<ApiProblem | null>(null);
  readonly chosen = new Set<string>();
  name = '';
  days = 180;

  ngOnInit(): void {
    this.api.scopes().subscribe((s) => this.scopes.set(s));
    this.refresh();
  }

  toggle(scope: string): void {
    if (!this.chosen.delete(scope)) {
      this.chosen.add(scope);
    }
  }

  create(): void {
    this.problem.set(null);
    this.api.create({ name: this.name.trim(), scopes: [...this.chosen], validForDays: this.days }).subscribe({
      next: (created) => {
        this.secret.set(created.secret);
        this.name = '';
        this.chosen.clear();
        this.refresh();
      },
      error: (p: ApiProblem) => this.problem.set(p),
    });
  }

  revoke(key: ApiKey): void {
    if (confirm(`Revoke "${key.name}"? Integrations using it will stop working immediately.`)) {
      this.api.revoke(key.id).subscribe({ next: () => this.refresh(), error: (p: ApiProblem) => this.problem.set(p) });
    }
  }

  copy(): void {
    const secret = this.secret();
    if (secret) {
      void navigator.clipboard.writeText(secret);
    }
  }

  private refresh(): void {
    this.api.list().subscribe({ next: (k) => this.keys.set(k), error: (p: ApiProblem) => this.problem.set(p) });
  }
}
```

## apps/iconnect-wholesale/web/src/app/features/availability.page.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/availability.page.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiProblem } from '../core/api-problem';
import { AddressMatch, Availability } from '../core/api.models';
import { AvailabilityApi } from '../core/wholesale-api';
import { ProblemComponent, StatusLabelPipe } from '../shared/shared';

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, ProblemComponent, StatusLabelPipe],
  template: `
    <h1>Check availability</h1>
    <div class="card row">
      <label>Postcode <input [(ngModel)]="postcode" name="postcode" placeholder="SW1A 1AA" (keyup.enter)="search()" /></label>
      <button (click)="search()" [disabled]="!postcode.trim()">Find addresses</button>
      <span class="muted">or</span>
      <label>UPRN <input [(ngModel)]="uprn" name="uprn" inputmode="numeric" (keyup.enter)="check(uprn)" /></label>
      <button class="secondary" (click)="check(uprn)" [disabled]="!uprn.trim()">Check UPRN</button>
    </div>
    <icw-problem [problem]="problem()" />

    @if (addresses().length) {
      <table>
        <thead><tr><th>Address</th><th>UPRN</th><th>Build status</th><th></th></tr></thead>
        <tbody>
          @for (a of addresses(); track a.uprn) {
            <tr><td>{{ a.address }}</td><td>{{ a.uprn }}</td><td>{{ a.buildStatus | statusLabel }}</td>
              <td><button class="secondary" (click)="check(a.uprn)">Check</button></td></tr>
          }
        </tbody>
      </table>
    }

    @if (result(); as r) {
      <div class="card">
        <h2>{{ r.address }}</h2>
        <p>UPRN {{ r.uprn }} · Exchange {{ r.exchangeCode }} · {{ r.buildStatus | statusLabel }} · up to {{ r.maxDownstreamMbps }} Mbps</p>
        @if (r.readyForServiceDate) { <p>Ready for service from {{ r.readyForServiceDate | date: 'd MMM y' }}</p> }
        <p>Recommended order: <strong>{{ r.recommendedOrderType | statusLabel }}</strong>,
          earliest completion <strong>{{ r.earliestCompletionDate | date: 'd MMM y' }}</strong></p>
        @if (r.hasOpenOrder) { <p class="badge AtRisk">An order is already in flight for this premise</p> }
        <table>
          <thead><tr><th>Product</th><th class="num">Down/Up Mbps</th><th>Care levels</th><th></th></tr></thead>
          <tbody>
            @for (p of r.products; track p.product.code) {
              <tr>
                <td>{{ p.product.name }} <span class="muted">{{ p.product.code }}</span></td>
                <td class="num">{{ p.product.downstreamMbps }}/{{ p.product.upstreamMbps }}</td>
                <td>{{ p.product.careLevels.join(', ') }}</td>
                <td>
                  @if (p.orderable) {
                    <a [routerLink]="['/orders/new']" [queryParams]="{ uprn: r.uprn, productCode: p.product.code, orderType: r.recommendedOrderType.toUpperCase() }">Order</a>
                  } @else { <span class="muted">{{ p.reason }}</span> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AvailabilityPage {
  private readonly api = inject(AvailabilityApi);
  postcode = '';
  uprn = '';
  readonly addresses = signal<AddressMatch[]>([]);
  readonly result = signal<Availability | null>(null);
  readonly problem = signal<ApiProblem | null>(null);

  search(): void {
    this.reset();
    this.api.searchAddresses(this.postcode).subscribe({
      next: (list) => {
        this.addresses.set(list);
        if (list.length === 0) {
          this.problem.set(new ApiProblem(404, 'address.none', 'No network premises found at this postcode', null, {}, null));
        }
      },
      error: (p: ApiProblem) => this.problem.set(p),
    });
  }

  check(uprn: string): void {
    this.problem.set(null);
    this.api.check(uprn.trim()).subscribe({ next: (r) => this.result.set(r), error: (p: ApiProblem) => this.problem.set(p) });
  }

  private reset(): void {
    this.problem.set(null);
    this.result.set(null);
    this.addresses.set([]);
  }
}
```

## apps/iconnect-wholesale/web/src/app/features/bulk-upload.page.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/bulk-upload.page.ts`.

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiProblem } from '../core/api-problem';
import { BulkRowError, BulkUploadResult } from '../core/api.models';
import { BulkOrdersApi, saveBlob } from '../core/wholesale-api';
import { ProblemComponent, StatusLabelPipe } from '../shared/shared';
import { groupByRow, precheckCsv } from './csv-precheck';

@Component({
  standalone: true,
  imports: [RouterLink, ProblemComponent, StatusLabelPipe],
  template: `
    <h1>Bulk order upload</h1>
    <div class="card">
      <p>Upload a UTF-8 CSV of up to 2,000 orders. Validate first: the file is only accepted when every row is valid.
        <button class="secondary" (click)="downloadTemplate()">Download template</button></p>
      <div class="row">
        <input type="file" accept=".csv,text/csv" (change)="pick($event)" />
        <button class="secondary" [disabled]="!file() || busy()" (click)="send(true)">Validate</button>
        <button [disabled]="!canSubmit() || busy()" (click)="send(false)">Submit orders</button>
      </div>
    </div>
    <icw-problem [problem]="problem()" />

    @if (result(); as r) {
      <div class="card">
        <p><span class="badge {{ r.status }}">{{ r.status | statusLabel }}</span>
          {{ r.rowCount }} rows · {{ r.validRows }} valid
          @if (r.uploadId) { · {{ r.ordersCreated }} accepted, {{ r.ordersRejected }} rejected by inventory checks }</p>
      </div>
      @if (r.orders.length) {
        <table>
          <thead><tr><th>Line</th><th>Your ref</th><th>Order</th><th>Status</th><th>Reason</th></tr></thead>
          <tbody>
            @for (o of r.orders; track o.line) {
              <tr><td>{{ o.line }}</td><td>{{ o.partnerReference }}</td><td>{{ o.orderReference }}</td>
                <td><span class="badge {{ o.status }}">{{ o.status | statusLabel }}</span></td><td>{{ o.reason }}</td></tr>
            }
          </tbody>
        </table>
        <p><a routerLink="/orders">Go to orders</a></p>
      }
    }

    @if (grouped().length) {
      <h2>{{ errors().length }} problem(s) to fix</h2>
      <table>
        <thead><tr><th>Line</th><th>Column</th><th>Problem</th></tr></thead>
        <tbody>
          @for (g of grouped(); track g.row) {
            @for (e of g.errors; track $index; let first = $first) {
              <tr><td>{{ first ? (g.row || 'File') : '' }}</td><td>{{ e.column }}</td><td>{{ e.message }}</td></tr>
            }
          }
        </tbody>
      </table>
    }
  `,
})
export class BulkUploadPage {
  private readonly api = inject(BulkOrdersApi);
  readonly file = signal<File | null>(null);
  readonly result = signal<BulkUploadResult | null>(null);
  readonly errors = signal<BulkRowError[]>([]);
  readonly problem = signal<ApiProblem | null>(null);
  readonly busy = signal(false);
  private readonly validatedName = signal<string | null>(null);

  readonly grouped = computed(() => groupByRow(this.errors()));
  /** Submission is offered only after a clean dry run of the currently selected file. */
  readonly canSubmit = computed(() => !!this.file() && this.validatedName() === this.file()?.name);

  async pick(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(null);
    this.result.set(null);
    this.validatedName.set(null);
    this.problem.set(null);
    if (!file) {
      this.errors.set([]);
      return;
    }
    const local = precheckCsv(file.name, file.size, await file.text());
    this.errors.set(local);
    if (local.length === 0) {
      this.file.set(file);
    }
  }

  send(dryRun: boolean): void {
    const file = this.file();
    if (!file) {
      return;
    }
    this.busy.set(true);
    this.problem.set(null);
    this.api.upload(file, dryRun).subscribe({
      next: (r) => {
        this.result.set(r);
        this.errors.set(r.errors);
        this.validatedName.set(dryRun && r.status === 'VALID' ? file.name : null);
        this.busy.set(false);
      },
      error: (p: ApiProblem) => {
        this.problem.set(p);
        this.busy.set(false);
      },
    });
  }

  downloadTemplate(): void {
    this.api.template().subscribe((blob) => saveBlob(blob, 'bulk-order-template.csv'));
  }
}
```

## apps/iconnect-wholesale/web/src/app/features/catalogue.page.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/catalogue.page.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ApiProblem } from '../core/api-problem';
import { PriceBook } from '../core/api.models';
import { CatalogueApi } from '../core/wholesale-api';
import { MoneyPipe, ProblemComponent } from '../shared/shared';

@Component({
  standalone: true,
  imports: [DatePipe, MoneyPipe, ProblemComponent],
  template: `
    <h1>Catalogue and prices</h1>
    <icw-problem [problem]="problem()" />
    @if (book(); as b) {
      <p class="muted">Price book {{ b.version }}, effective {{ b.effectiveFrom | date: 'd MMM y' }}
        @if (b.effectiveTo) { to {{ b.effectiveTo | date: 'd MMM y' }} }. Prices exclude VAT.</p>
      <table>
        <thead><tr><th>Product</th><th>Care</th><th class="num">Monthly</th><th class="num">Connection</th><th class="num">Migration</th><th class="num">Modify</th></tr></thead>
        <tbody>
          @for (e of b.entries; track e.productCode + e.careLevel) {
            <tr><td>{{ productName(e.productCode) }}</td><td>{{ e.careLevel }}</td>
              <td class="num">{{ e.monthlyRentalMinor | money: b.currency }}</td>
              <td class="num">{{ e.connectionChargeMinor | money: b.currency }}</td>
              <td class="num">{{ e.migrationChargeMinor | money: b.currency }}</td>
              <td class="num">{{ e.modifyChargeMinor | money: b.currency }}</td></tr>
          }
        </tbody>
      </table>
      @if (b.tiers.length) {
        <h2>Volume discounts on monthly rental</h2>
        <ul>@for (t of b.tiers; track t.minimumActiveLines) { <li>{{ t.minimumActiveLines }}+ active lines: {{ t.discountBps / 100 }}%</li> }</ul>
      }
    }
  `,
})
export class CataloguePage {
  private readonly api = inject(CatalogueApi);
  readonly problem = signal<ApiProblem | null>(null);
  private readonly products = toSignal(this.api.products().pipe(catchError((p: ApiProblem) => (this.problem.set(p), of([])))), { initialValue: [] });
  readonly book = toSignal<PriceBook | null>(this.api.priceBook().pipe(catchError((p: ApiProblem) => (this.problem.set(p), of(null)))), { initialValue: null });
  private readonly names = computed(() => new Map(this.products().map((p) => [p.code, p.name])));

  productName(code: string): string {
    return this.names().get(code) ?? code;
  }
}
```

## apps/iconnect-wholesale/web/src/app/features/csv-precheck.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/csv-precheck.ts`.

```typescript
import { BulkRowError } from '../core/api.models';

export const REQUIRED_COLUMNS = ['partner_reference', 'order_type', 'uprn', 'requested_date'];
export const OPTIONAL_COLUMNS = ['product_code', 'care_level', 'existing_service_id', 'migration_auth_code'];
export const MAX_ROWS = 2000;
export const MAX_BYTES = 1_048_576;

/**
 * Cheap client-side checks run before upload so obvious mistakes (wrong file, renamed header,
 * too many rows) are caught instantly. The server remains the authority on row validation.
 */
export function precheckCsv(fileName: string, sizeBytes: number, text: string): BulkRowError[] {
  const errors: BulkRowError[] = [];
  if (!fileName.toLowerCase().endsWith('.csv')) {
    errors.push(fileError('file_type', 'Only .csv files are accepted.'));
  }
  if (sizeBytes > MAX_BYTES) {
    errors.push(fileError('too_large', `The file exceeds the ${MAX_BYTES / 1024} KB limit.`));
  }

  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return [...errors, fileError('empty', 'The file is empty.')];
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/ /g, '_'));
  const known = new Set([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
  header.filter((h) => !known.has(h)).forEach((h) => errors.push({ row: 1, column: h, code: 'unknown_column', message: `Unknown column '${h}'.` }));
  REQUIRED_COLUMNS.filter((c) => !header.includes(c))
    .forEach((c) => errors.push({ row: 1, column: c, code: 'missing_column', message: `Required column '${c}' is missing.` }));

  const dataRows = lines.length - 1;
  if (dataRows === 0) {
    errors.push(fileError('no_rows', 'The file has a header but no order rows.'));
  } else if (dataRows > MAX_ROWS) {
    errors.push(fileError('too_many_rows', `A bulk upload may contain at most ${MAX_ROWS} rows; split the file.`));
  }
  return errors;
}

/** Groups row errors by line for display, file-level errors (row 0/1 with column "*") first. */
export function groupByRow(errors: BulkRowError[]): { row: number; errors: BulkRowError[] }[] {
  const byRow = new Map<number, BulkRowError[]>();
  for (const e of [...errors].sort((a, b) => a.row - b.row || a.column.localeCompare(b.column))) {
    byRow.set(e.row, [...(byRow.get(e.row) ?? []), e]);
  }
  return [...byRow.entries()].map(([row, rowErrors]) => ({ row, errors: rowErrors }));
}

function fileError(code: string, message: string): BulkRowError {
  return { row: 0, column: '*', code, message };
}
```

## apps/iconnect-wholesale/web/src/app/features/fault-detail.page.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/fault-detail.page.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApiProblem } from '../core/api-problem';
import { FaultDetail } from '../core/api.models';
import { FaultsApi } from '../core/wholesale-api';
import { MoneyPipe, ProblemComponent, StatusLabelPipe } from '../shared/shared';

/** Partner-side actions; support-only actions are never offered here even if the API lists them. */
const PARTNER_ACTIONS: Record<string, { label: string; needsNote: boolean }> = {
  respond: { label: 'Send response', needsNote: true },
  reopen: { label: 'Reopen fault', needsNote: true },
  close: { label: 'Confirm fixed and close', needsNote: false },
};

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, MoneyPipe, ProblemComponent, StatusLabelPipe],
  template: `
    <icw-problem [problem]="problem()" />
    @if (fault(); as f) {
      <h1>{{ f.reference }} <span class="badge">{{ f.status | statusLabel }}</span></h1>
      <div class="card">
        <p>{{ f.priority }} · {{ f.category | statusLabel }} · {{ f.careLevel }} care · UPRN {{ f.uprn }}</p>
        <p>{{ f.description }}</p>
        <p>Repair SLA <span class="badge {{ f.sla.status }}">{{ f.sla.status | statusLabel }}</span>
          {{ f.sla.elapsedWorkingHours }} of {{ f.sla.targetWorkingHours }} h ({{ f.sla.calendar }} calendar)
          @if (f.sla.dueAt) { · due {{ f.sla.dueAt | date: 'd MMM y, HH:mm' }} }</p>
        @if (f.serviceCreditMinor) { <p>Service credit {{ f.serviceCreditMinor | money }}: {{ f.serviceCreditBasis }}</p> }
      </div>
      <div class="card row">
        <label style="flex:1">Note <textarea [(ngModel)]="note" name="note" rows="2"></textarea></label>
        <button class="secondary" [disabled]="note.trim().length === 0" (click)="run(api.addNote(f.id, note.trim()))">Add note</button>
        @for (a of actionsFor(f); track a.key) {
          <button [disabled]="a.needsNote && note.trim().length < 5" (click)="run(api.transition(f.id, a.key, note.trim()))">{{ a.label }}</button>
        }
      </div>
      <h2>Timeline</h2>
      <ul class="timeline">
        @for (n of f.notes; track $index) { <li><span class="muted">{{ n.at | date: 'd MMM y, HH:mm' }} · {{ n.author }}</span><br />{{ n.text }}</li> }
      </ul>
    }
  `,
  styles: ['.timeline { list-style: none; padding: 0; } .timeline li { padding: 0.5rem 0; border-bottom: 1px solid var(--icw-border); }'],
})
export class FaultDetailPage implements OnInit {
  readonly api = inject(FaultsApi);
  readonly fault = signal<FaultDetail | null>(null);
  readonly problem = signal<ApiProblem | null>(null);
  note = '';

  @Input({ required: true }) id!: string;

  ngOnInit(): void {
    this.run(this.api.get(this.id));
  }

  actionsFor(f: FaultDetail): { key: string; label: string; needsNote: boolean }[] {
    return f.allowedActions.filter((a) => a in PARTNER_ACTIONS).map((key) => ({ key, ...PARTNER_ACTIONS[key] }));
  }

  run(request: Observable<FaultDetail>): void {
    this.problem.set(null);
    request.subscribe({
      next: (f) => {
        this.fault.set(f);
        this.note = '';
      },
      error: (p: ApiProblem) => this.problem.set(p),
    });
  }
}
```

## apps/iconnect-wholesale/web/src/app/features/faults.page.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/faults.page.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiProblem } from '../core/api-problem';
import { FaultSummary, Paged } from '../core/api.models';
import { FaultsApi } from '../core/wholesale-api';
import { PaginatorComponent, ProblemComponent, StatusLabelPipe } from '../shared/shared';

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, RouterLink, DatePipe, PaginatorComponent, ProblemComponent, StatusLabelPipe],
  template: `
    <h1>Faults</h1>
    <details class="card">
      <summary>Raise a fault</summary>
      <form [formGroup]="form" (ngSubmit)="raise()" class="row">
        <label>Service id <input formControlName="serviceId" /></label>
        <label>Priority <select formControlName="priority">
          @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
        </select></label>
        <label>Category <select formControlName="category">
          @for (c of categories; track c) { <option [value]="c">{{ c | statusLabel }}</option> }
        </select></label>
        <label style="flex:1">Description <textarea formControlName="description" rows="2"></textarea></label>
        <button type="submit" [disabled]="form.invalid">Raise</button>
      </form>
    </details>
    <div class="row">
      <label>Status <select [(ngModel)]="status" (ngModelChange)="load(1)" name="status">
        <option value="">Any</option>
        @for (s of statuses; track s) { <option [value]="s">{{ s | statusLabel }}</option> }
      </select></label>
    </div>
    <icw-problem [problem]="problem()" />
    @if (result(); as r) {
      <table>
        <thead><tr><th>Reference</th><th>UPRN</th><th>Priority</th><th>Category</th><th>Status</th><th>SLA</th><th>Due</th></tr></thead>
        <tbody>
          @for (f of r.items; track f.id) {
            <tr><td><a [routerLink]="['/faults', f.id]">{{ f.reference }}</a></td><td>{{ f.serviceUprn }}</td><td>{{ f.priority }}</td>
              <td>{{ f.category | statusLabel }}</td><td>{{ f.status | statusLabel }}</td>
              <td><span class="badge {{ f.slaStatus }}">{{ f.slaStatus | statusLabel }}</span></td>
              <td>{{ f.dueAt | date: 'd MMM, HH:mm' }}</td></tr>
          } @empty { <tr><td colspan="7" class="muted">No faults.</td></tr> }
        </tbody>
      </table>
      <icw-paginator [page]="r.page" [pageSize]="r.pageSize" [total]="r.total" (pageChange)="load($event)" />
    }
  `,
})
export class FaultsPage implements OnInit {
  private readonly api = inject(FaultsApi);
  private readonly router = inject(Router);
  readonly priorities = ['P1', 'P2', 'P3', 'P4'];
  readonly categories = ['TOTAL_LOSS_OF_SERVICE', 'INTERMITTENT_SERVICE', 'SPEED_DEGRADATION', 'ONT', 'OTHER'];
  readonly statuses = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED'];
  status = '';
  readonly result = signal<Paged<FaultSummary> | null>(null);
  readonly problem = signal<ApiProblem | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    serviceId: ['', [Validators.required, Validators.pattern(/^[0-9a-fA-F-]{36}$/)]],
    priority: ['P3', Validators.required],
    category: ['INTERMITTENT_SERVICE', Validators.required],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
  });

  ngOnInit(): void {
    this.load(1);
  }

  load(page: number): void {
    this.api.list({ status: this.status, page, pageSize: 25 })
      .subscribe({ next: (r) => this.result.set(r), error: (p: ApiProblem) => this.problem.set(p) });
  }

  raise(): void {
    this.problem.set(null);
    this.api.raise(this.form.getRawValue()).subscribe({
      next: (f) => void this.router.navigate(['/faults', f.id]),
      error: (p: ApiProblem) => this.problem.set(p),
    });
  }
}
```

## apps/iconnect-wholesale/web/src/app/features/features.spec.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/features.spec.ts`.

```typescript
import { groupByRow, precheckCsv } from './csv-precheck';
import { stageReached } from './order-detail.page';

const HEADER = 'partner_reference,order_type,uprn,product_code,care_level,requested_date';

describe('precheckCsv', () => {
  it('accepts a well-formed file', () => {
    expect(precheckCsv('orders.csv', 200, `${HEADER}\nR1,PROVIDE,123,FTTP500,,2030-01-01\n`)).toEqual([]);
  });

  it('tolerates a BOM, CRLF and header spacing', () => {
    const text = '﻿Partner Reference,Order_Type,UPRN,Requested Date\r\nR1,CEASE,1,2030-01-01\r\n';
    expect(precheckCsv('orders.CSV', 100, text)).toEqual([]);
  });

  it('reports wrong file type, unknown and missing columns', () => {
    const errors = precheckCsv('orders.xlsx', 100, 'partner_reference,order_type,uprn,requsted_date\nR1,PROVIDE,1,2030-01-01');
    expect(errors.map((e) => e.code)).toEqual(['file_type', 'unknown_column', 'missing_column']);
  });

  it('rejects empty, header-only and oversized files', () => {
    expect(precheckCsv('a.csv', 0, '').map((e) => e.code)).toEqual(['empty']);
    expect(precheckCsv('a.csv', 10, HEADER).map((e) => e.code)).toEqual(['no_rows']);
    const rows = Array.from({ length: 2001 }, (_, i) => `R${i},PROVIDE,${i + 1},FTTP500,,2030-01-01`).join('\n');
    expect(precheckCsv('a.csv', 2_000_000, `${HEADER}\n${rows}`).map((e) => e.code)).toEqual(['too_large', 'too_many_rows']);
  });
});

describe('groupByRow', () => {
  it('groups by line in order with file-level errors first', () => {
    const grouped = groupByRow([
      { row: 3, column: 'uprn', code: 'format', message: 'bad' },
      { row: 0, column: '*', code: 'too_large', message: 'big' },
      { row: 3, column: 'order_type', code: 'unknown', message: 'type' },
    ]);
    expect(grouped.map((g) => g.row)).toEqual([0, 3]);
    expect(grouped[1].errors.map((e) => e.column)).toEqual(['order_type', 'uprn']);
  });
});

describe('stageReached', () => {
  const at = '2024-01-01T00:00:00.000Z';

  it('tracks the furthest lifecycle stage', () => {
    expect(stageReached({ status: 'PROVISIONING', history: [] })).toBe(2);
  });

  it('keeps progress made before a cancellation', () => {
    const history = [
      { from: null, to: 'DRAFT', at, note: '', actor: null },
      { from: 'DRAFT', to: 'SUBMITTED', at, note: '', actor: null },
      { from: 'SUBMITTED', to: 'VALIDATED', at, note: '', actor: null },
      { from: 'VALIDATED', to: 'CANCELLED', at, note: '', actor: null },
    ];
    expect(stageReached({ status: 'CANCELLED', history })).toBe(1);
  });

  it('is -1 for drafts', () => {
    expect(stageReached({ status: 'DRAFT', history: [] })).toBe(-1);
  });
});
```

## apps/iconnect-wholesale/web/src/app/features/invoices.page.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/invoices.page.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiProblem } from '../core/api-problem';
import { Paged, StatementDetail, StatementSummary } from '../core/api.models';
import { BillingApi, saveBlob } from '../core/wholesale-api';
import { MoneyPipe, PaginatorComponent, ProblemComponent, StatusLabelPipe, parseMajorToMinor } from '../shared/shared';

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, MoneyPipe, PaginatorComponent, ProblemComponent, StatusLabelPipe],
  template: `
    <h1>Invoices</h1>
    <icw-problem [problem]="problem()" />
    @if (list(); as l) {
      <table>
        <thead><tr><th>Statement</th><th>Period</th><th>Status</th><th class="num">Total</th><th>Due</th><th></th></tr></thead>
        <tbody>
          @for (s of l.items; track s.id) {
            <tr><td>{{ s.reference }}</td><td>{{ s.periodStart | date: 'MMM y' }}</td>
              <td><span class="badge {{ s.status }}">{{ s.status | statusLabel }}</span></td>
              <td class="num">{{ s.totalMinor | money: s.currency }}</td><td>{{ s.dueDate | date: 'd MMM y' }}</td>
              <td><button class="secondary" (click)="open(s.id)">View</button>
                <button class="secondary" (click)="exportCsv(s)">CSV</button></td></tr>
          } @empty { <tr><td colspan="6" class="muted">No statements yet.</td></tr> }
        </tbody>
      </table>
      <icw-paginator [page]="l.page" [pageSize]="l.pageSize" [total]="l.total" (pageChange)="load($event)" />
    }

    @if (detail(); as d) {
      <h2>{{ d.reference }}: {{ d.periodStart | date: 'd MMM' }} to {{ d.periodEnd | date: 'd MMM y' }}</h2>
      <table>
        <thead><tr><th></th><th>#</th><th>Type</th><th>Description</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
        <tbody>
          @for (line of d.lines; track line.id) {
            <tr><td>@if (line.amountMinor > 0) { <input type="checkbox" [checked]="selected().has(line.id)" (change)="toggle(line.id)" /> }</td>
              <td>{{ line.lineNumber }}</td><td>{{ line.type | statusLabel }}</td><td>{{ line.description }}</td>
              <td class="num">{{ line.quantity }}</td><td class="num">{{ line.amountMinor | money: d.currency }}</td></tr>
          }
        </tbody>
        <tfoot>
          <tr><td colspan="5">Charges</td><td class="num">{{ d.chargesMinor | money: d.currency }}</td></tr>
          <tr><td colspan="5">Credits</td><td class="num">{{ d.creditsMinor | money: d.currency }}</td></tr>
          <tr><th colspan="5">Total</th><th class="num">{{ d.totalMinor | money: d.currency }}</th></tr>
        </tfoot>
      </table>

      @if (selected().size) {
        <div class="card row">
          <span>Disputing {{ selected().size }} line(s), up to {{ selectedTotal() | money: d.currency }}</span>
          <label>Amount claimed <input [(ngModel)]="claim" name="claim" placeholder="0.00" /></label>
          <label style="flex:1">Reason (min. 20 characters) <input [(ngModel)]="reason" name="reason" /></label>
          <button [disabled]="!canDispute()" (click)="dispute(d)">Raise dispute</button>
        </div>
      }
      @for (x of d.disputes; track x.id) {
        <p>{{ x.reference }} <span class="badge">{{ x.status | statusLabel }}</span> claimed {{ x.claimedMinor | money: d.currency }}
          @if (x.awardedMinor !== null) { · awarded {{ x.awardedMinor | money: d.currency }}: {{ x.outcome }} }</p>
      }
    }
  `,
})
export class InvoicesPage implements OnInit {
  private readonly api = inject(BillingApi);
  readonly list = signal<Paged<StatementSummary> | null>(null);
  readonly detail = signal<StatementDetail | null>(null);
  readonly selected = signal(new Set<string>());
  readonly problem = signal<ApiProblem | null>(null);
  claim = '';
  reason = '';

  readonly selectedTotal = computed(() =>
    (this.detail()?.lines ?? []).filter((l) => this.selected().has(l.id)).reduce((sum, l) => sum + l.amountMinor, 0));

  ngOnInit(): void {
    this.load(1);
  }

  load(page: number): void {
    this.api.statements(page, 12).subscribe({ next: (l) => this.list.set(l), error: (p: ApiProblem) => this.problem.set(p) });
  }

  open(id: string): void {
    this.selected.set(new Set());
    this.api.statement(id).subscribe({ next: (d) => this.detail.set(d), error: (p: ApiProblem) => this.problem.set(p) });
  }

  toggle(lineId: string): void {
    const next = new Set(this.selected());
    if (!next.delete(lineId)) {
      next.add(lineId);
    }
    this.selected.set(next);
  }

  canDispute(): boolean {
    const claimed = parseMajorToMinor(this.claim);
    return claimed !== null && claimed > 0 && claimed <= this.selectedTotal() && this.reason.trim().length >= 20;
  }

  dispute(d: StatementDetail): void {
    const claimedMinor = parseMajorToMinor(this.claim);
    if (claimedMinor === null) {
      return;
    }
    this.api.raiseDispute(d.id, { lineIds: [...this.selected()], reason: this.reason.trim(), claimedMinor }).subscribe({
      next: () => {
        this.claim = '';
        this.reason = '';
        this.open(d.id);
      },
      error: (p: ApiProblem) => this.problem.set(p),
    });
  }

  exportCsv(s: StatementSummary): void {
    this.api.exportCsv(s.id).subscribe({ next: (blob) => saveBlob(blob, `${s.reference}.csv`), error: (p: ApiProblem) => this.problem.set(p) });
  }
}
```
