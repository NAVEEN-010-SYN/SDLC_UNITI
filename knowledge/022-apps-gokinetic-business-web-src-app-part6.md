# Go Kinetic Business self-care (B2B): apps/gokinetic-business/web/src/app (part 6 of 8)

- **Application:** Go Kinetic Business self-care (B2B)
- **Tech stack:** Angular 17 + Node.js/Express API
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 16

## Files

- `apps/gokinetic-business/web/src/app/app.routes.ts` (95 lines)
- `apps/gokinetic-business/web/src/app/core/api/http-params.ts` (17 lines)
- `apps/gokinetic-business/web/src/app/core/api/portal-api.ts` (206 lines)
- `apps/gokinetic-business/web/src/app/core/auth/auth.guards.ts` (39 lines)
- `apps/gokinetic-business/web/src/app/core/auth/auth.service.ts` (163 lines)
- `apps/gokinetic-business/web/src/app/core/auth/auth.spec.ts` (138 lines)
- `apps/gokinetic-business/web/src/app/core/auth/pkce.ts` (38 lines)
- `apps/gokinetic-business/web/src/app/core/http/api-problem.ts` (77 lines)
- `apps/gokinetic-business/web/src/app/core/http/http.spec.ts` (108 lines)
- `apps/gokinetic-business/web/src/app/core/http/interceptors.ts` (45 lines)
- `apps/gokinetic-business/web/src/app/core/models/api.models.ts` (395 lines)
- `apps/gokinetic-business/web/src/app/features/audit/audit-log.component.ts` (68 lines)
- `apps/gokinetic-business/web/src/app/features/auth/auth-pages.component.ts` (83 lines)
- `apps/gokinetic-business/web/src/app/features/billing/billing.components.ts` (173 lines)
- `apps/gokinetic-business/web/src/app/features/billing/payment-methods.component.ts` (207 lines)
- `apps/gokinetic-business/web/src/app/features/dashboard/dashboard.component.ts` (122 lines)

## apps/gokinetic-business/web/src/app/app.routes.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/app.routes.ts`.

```typescript
import { Routes } from '@angular/router';
import { authGuard, permissionGuard, roleGuard } from './core/auth/auth.guards';

/**
 * Feature areas are lazy-loaded. Guards mirror server-side RBAC for navigation only; the API
 * rejects any request the caller is not permitted to make.
 */
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/auth-pages.component').then((m) => m.LoginComponent) },
  { path: 'auth/callback', loadComponent: () => import('./features/auth/auth-pages.component').then((m) => m.AuthCallbackComponent) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'forbidden', loadComponent: () => import('./features/auth/auth-pages.component').then((m) => m.ForbiddenComponent) },
      {
        path: 'dashboard',
        title: 'Overview',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'inventory',
        canActivate: [permissionGuard('sites:read')],
        children: [
          { path: '', title: 'Sites', loadComponent: () => import('./features/inventory/inventory.components').then((m) => m.SitesListComponent) },
          { path: 'services', title: 'Services', loadComponent: () => import('./features/inventory/inventory.components').then((m) => m.ServicesListComponent) },
          { path: 'sites/:id', title: 'Site', loadComponent: () => import('./features/inventory/inventory.components').then((m) => m.SiteDetailComponent) }
        ]
      },
      {
        path: 'orders',
        canActivate: [permissionGuard('orders:read')],
        children: [
          { path: '', title: 'Orders', loadComponent: () => import('./features/orders/orders.components').then((m) => m.OrdersListComponent) },
          {
            path: 'new',
            title: 'New order',
            canActivate: [permissionGuard('orders:create')],
            loadComponent: () => import('./features/orders/order-wizard.component').then((m) => m.OrderWizardComponent)
          },
          { path: ':id', title: 'Order', loadComponent: () => import('./features/orders/orders.components').then((m) => m.OrderDetailComponent) }
        ]
      },
      {
        path: 'billing',
        canActivate: [permissionGuard('billing:read')],
        children: [
          { path: '', title: 'Invoices', loadComponent: () => import('./features/billing/billing.components').then((m) => m.InvoicesListComponent) },
          {
            path: 'payment-methods',
            title: 'Payment methods',
            loadComponent: () => import('./features/billing/payment-methods.component').then((m) => m.PaymentMethodsComponent)
          },
          { path: 'invoices/:id', title: 'Invoice', loadComponent: () => import('./features/billing/billing.components').then((m) => m.InvoiceDetailComponent) }
        ]
      },
      {
        path: 'tickets',
        canActivate: [permissionGuard('tickets:read')],
        children: [
          { path: '', title: 'Support', loadComponent: () => import('./features/tickets/tickets.components').then((m) => m.TicketsListComponent) },
          {
            path: 'new',
            title: 'Raise a ticket',
            canActivate: [permissionGuard('tickets:create')],
            loadComponent: () => import('./features/tickets/tickets.components').then((m) => m.NewTicketComponent)
          },
          { path: ':id', title: 'Ticket', loadComponent: () => import('./features/tickets/tickets.components').then((m) => m.TicketDetailComponent) }
        ]
      },
      {
        path: 'sla',
        title: 'SLA report',
        canActivate: [permissionGuard('sla:read')],
        loadComponent: () => import('./features/sla/sla-report.component').then((m) => m.SlaReportComponent)
      },
      {
        path: 'users',
        title: 'Users',
        canActivate: [roleGuard('BUSINESS_ADMIN')],
        loadComponent: () => import('./features/users/users.components').then((m) => m.UsersComponent)
      },
      {
        path: 'audit',
        title: 'Audit log',
        canActivate: [permissionGuard('audit:read')],
        loadComponent: () => import('./features/audit/audit-log.component').then((m) => m.AuditLogComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
```

## apps/gokinetic-business/web/src/app/core/api/http-params.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/core/api/http-params.ts`.

```typescript
import { HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type QueryValue = string | number | boolean | null | undefined;

/** Builds query params, dropping empty values so filters left blank are not sent as "". */
export function toParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query) as Array<[string, QueryValue]>) {
    if (value === null || value === undefined || value === '') continue;
    params = params.set(key, String(value));
  }
  return params;
}

export const api = (path: string): string => `${environment.apiBaseUrl}${path}`;
```

## apps/gokinetic-business/web/src/app/core/api/portal-api.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/core/api/portal-api.ts`.

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Account,
  AddPaymentMethod,
  AuditEntry,
  BusinessRole,
  BusinessUser,
  CatalogueProduct,
  Invoice,
  InvoiceDetail,
  InvoiceStatus,
  InventorySummary,
  NewTicket,
  Order,
  OrderDetail,
  OrderQuote,
  OrderRequest,
  OrderStatus,
  OrderType,
  Page,
  PageRequest,
  PaymentMethod,
  Service,
  ServiceCategory,
  ServiceStatus,
  SiteDetail,
  SiteStatus,
  SiteSummary,
  SlaReport,
  SpendTrendPoint,
  TicketCategory,
  TicketDetail,
  TicketPriority,
  TicketStatus,
  Ticket,
  UserAction,
  UserStatus
} from '../models/api.models';
import { api, toParams } from './http-params';

type Items<T> = { items: T[] };

export interface SiteFilter { status?: SiteStatus; search?: string }
export interface ServiceFilter { siteId?: string; category?: ServiceCategory; status?: ServiceStatus }
export interface OrderFilter { status?: OrderStatus; orderType?: OrderType; siteId?: string }
export interface InvoiceFilter { status?: InvoiceStatus; fromPeriod?: string; toPeriod?: string }
export interface UserFilter { role?: BusinessRole; status?: UserStatus; search?: string }
export interface TicketFilter { status?: TicketStatus; priority?: TicketPriority; category?: TicketCategory; search?: string; activeOnly?: boolean }
export interface AuditFilter { entity?: string; actorId?: string }

@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly http = inject(HttpClient);

  summary(): Observable<InventorySummary> {
    return this.http.get<InventorySummary>(api('/inventory/summary'));
  }
  sites(filter: SiteFilter, page: PageRequest): Observable<Page<SiteSummary>> {
    return this.http.get<Page<SiteSummary>>(api('/sites'), { params: toParams({ ...filter, ...page }) });
  }
  site(id: string): Observable<SiteDetail> {
    return this.http.get<SiteDetail>(api(`/sites/${id}`));
  }
  services(filter: ServiceFilter, page: PageRequest): Observable<Page<Service>> {
    return this.http.get<Page<Service>>(api('/services'), { params: toParams({ ...filter, ...page }) });
  }
  /** All active services for pickers; the API caps pages at 100 which covers a site comfortably. */
  servicesForSite(siteId: string): Observable<Service[]> {
    return this.services({ siteId }, { page: 1, pageSize: 100 }).pipe(map((p) => p.items.filter((s) => s.status !== 'CEASED')));
  }
}

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly http = inject(HttpClient);

  products(): Observable<CatalogueProduct[]> {
    return this.http.get<Items<CatalogueProduct>>(api('/catalogue/products')).pipe(map((r) => r.items));
  }
  list(filter: OrderFilter, page: PageRequest): Observable<Page<Order>> {
    return this.http.get<Page<Order>>(api('/orders'), { params: toParams({ ...filter, ...page }) });
  }
  get(id: string): Observable<OrderDetail> {
    return this.http.get<OrderDetail>(api(`/orders/${id}`));
  }
  quote(request: OrderRequest): Observable<OrderQuote> {
    return this.http.post<OrderQuote>(api('/orders/quote'), request);
  }
  create(request: OrderRequest, submit: boolean): Observable<Order> {
    return this.http.post<Order>(api('/orders'), { ...request, submit });
  }
  submit(id: string): Observable<Order> {
    return this.http.post<Order>(api(`/orders/${id}/submit`), {});
  }
  approve(id: string): Observable<Order> {
    return this.http.post<Order>(api(`/orders/${id}/approve`), {});
  }
  reject(id: string, reason: string): Observable<Order> {
    return this.http.post<Order>(api(`/orders/${id}/reject`), { reason });
  }
  cancel(id: string, reason: string): Observable<Order> {
    return this.http.post<Order>(api(`/orders/${id}/cancel`), { reason });
  }
}

@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);

  invoices(filter: InvoiceFilter, page: PageRequest): Observable<Page<Invoice>> {
    return this.http.get<Page<Invoice>>(api('/invoices'), { params: toParams({ ...filter, ...page }) });
  }
  invoice(id: string): Observable<InvoiceDetail> {
    return this.http.get<InvoiceDetail>(api(`/invoices/${id}`));
  }
  dispute(id: string, reason: string): Observable<Invoice> {
    return this.http.post<Invoice>(api(`/invoices/${id}/dispute`), { reason });
  }
  allocationCsv(id: string): Observable<Blob> {
    return this.http.get(api(`/invoices/${id}/allocation`), { headers: { Accept: 'text/csv' }, responseType: 'blob' });
  }
  spendTrend(fromPeriod: string, toPeriod: string): Observable<SpendTrendPoint[]> {
    return this.http.get<Items<SpendTrendPoint>>(api('/billing/spend-trend'), { params: toParams({ fromPeriod, toPeriod }) }).pipe(map((r) => r.items));
  }
  paymentMethods(): Observable<PaymentMethod[]> {
    return this.http.get<Items<PaymentMethod>>(api('/payment-methods')).pipe(map((r) => r.items));
  }
  addPaymentMethod(input: AddPaymentMethod): Observable<PaymentMethod> {
    return this.http.post<PaymentMethod>(api('/payment-methods'), input);
  }
  makeDefault(id: string): Observable<PaymentMethod[]> {
    return this.http.post<Items<PaymentMethod>>(api(`/payment-methods/${id}/default`), {}).pipe(map((r) => r.items));
  }
  removePaymentMethod(id: string): Observable<void> {
    return this.http.delete<void>(api(`/payment-methods/${id}`));
  }
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  list(filter: UserFilter, page: PageRequest): Observable<Page<BusinessUser>> {
    return this.http.get<Page<BusinessUser>>(api('/users'), { params: toParams({ ...filter, ...page }) });
  }
  invite(input: { email: string; firstName: string; lastName: string; role: BusinessRole; siteScope: string[] | null }): Observable<BusinessUser> {
    return this.http.post<BusinessUser>(api('/users'), input);
  }
  changeRole(user: BusinessUser, role: BusinessRole, siteScope: string[] | null): Observable<BusinessUser> {
    return this.http.put<BusinessUser>(api(`/users/${user.id}/role`), { role, siteScope, version: user.version });
  }
  transition(user: BusinessUser, action: UserAction): Observable<BusinessUser> {
    return this.http.post<BusinessUser>(api(`/users/${user.id}/${action}`), { version: user.version });
  }
  resendInvitation(id: string): Observable<void> {
    return this.http.post<void>(api(`/users/${id}/resend-invitation`), {});
  }
}

@Injectable({ providedIn: 'root' })
export class TicketsApi {
  private readonly http = inject(HttpClient);

  list(filter: TicketFilter, page: PageRequest): Observable<Page<Ticket>> {
    return this.http.get<Page<Ticket>>(api('/tickets'), { params: toParams({ ...filter, ...page }) });
  }
  get(id: string): Observable<TicketDetail> {
    return this.http.get<TicketDetail>(api(`/tickets/${id}`));
  }
  create(input: NewTicket): Observable<Ticket> {
    return this.http.post<Ticket>(api('/tickets'), input);
  }
  comment(ticket: Ticket, body: string): Observable<Ticket> {
    return this.http.post<Ticket>(api(`/tickets/${ticket.id}/comments`), { body, internal: false, version: ticket.version });
  }
  changeStatus(ticket: Ticket, status: TicketStatus, reason?: string): Observable<Ticket> {
    return this.http.post<Ticket>(api(`/tickets/${ticket.id}/status`), { status, reason, version: ticket.version });
  }
  escalate(ticket: Ticket, reason: string): Observable<Ticket> {
    return this.http.post<Ticket>(api(`/tickets/${ticket.id}/escalate`), { reason, version: ticket.version });
  }
}

@Injectable({ providedIn: 'root' })
export class AccountApi {
  private readonly http = inject(HttpClient);

  account(): Observable<Account> {
    return this.http.get<Account>(api('/account'));
  }
  setApprovalThreshold(approvalThresholdMinor: number): Observable<Account> {
    return this.http.put<Account>(api('/account/approval-threshold'), { approvalThresholdMinor });
  }
  slaReport(period: string): Observable<SlaReport> {
    return this.http.get<SlaReport>(api(`/sla/reports/${period}`));
  }
  auditLog(filter: AuditFilter, page: PageRequest): Observable<Page<AuditEntry>> {
    return this.http.get<Page<AuditEntry>>(api('/audit-log'), { params: toParams({ ...filter, ...page }) });
  }
  auditCsv(filter: AuditFilter): Observable<Blob> {
    return this.http.get(api('/audit-log/export'), { params: toParams({ ...filter }), responseType: 'blob' });
  }
}
```

## apps/gokinetic-business/web/src/app/core/auth/auth.guards.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/core/auth/auth.guards.ts`.

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Permission, Role } from '../models/api.models';
import { AuthService } from './auth.service';

/** Requires a valid session; otherwise starts sign-in, returning to the requested URL. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  const me = await auth.loadSession();
  return me ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Restricts a route to the given roles. This only shapes navigation; the API enforces the
 * same rules server-side on every request.
 */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return async () => {
    // inject() must run before the first await: the injection context does not survive it.
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.loadSession();
    return auth.hasRole(...roles) ? true : router.createUrlTree(['/forbidden']);
  };
}

export function permissionGuard(permission: Permission): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.loadSession();
    return auth.can(permission) ? true : router.createUrlTree(['/forbidden']);
  };
}
```

## apps/gokinetic-business/web/src/app/core/auth/auth.service.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/core/auth/auth.service.ts`.

```typescript
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Me, Permission, Role } from '../models/api.models';
import { AccessTokenClaims, codeChallenge, decodeJwt, randomString } from './pkce';

const TOKEN_KEY = 'gkb.accessToken';
const FLOW_KEY = 'gkb.authFlow';
/** Treat tokens as expired slightly early so requests never race the expiry. */
const EXPIRY_SKEW_SECONDS = 30;

interface PendingFlow {
  state: string;
  verifier: string;
  returnUrl: string;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  expires_in: number;
}

export class AuthFlowError extends Error {}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly storage: Storage = sessionStorage;

  private readonly token = signal<string | null>(this.storage.getItem(TOKEN_KEY));
  private readonly sessionState = signal<Me | null>(null);
  private sessionLoad: Promise<Me | null> | null = null;

  readonly claims = computed<AccessTokenClaims | null>(() => {
    const t = this.token();
    return t ? decodeJwt(t) : null;
  });
  readonly session = this.sessionState.asReadonly();
  readonly roles = computed<Role[]>(() => this.sessionState()?.roles ?? ((this.claims()?.roles ?? []) as Role[]));
  readonly isAdmin = computed(() => this.roles().includes('BUSINESS_ADMIN'));

  accessToken(): string | null {
    const claims = this.claims();
    if (!claims || claims.exp - EXPIRY_SKEW_SECONDS <= Date.now() / 1000) return null;
    return this.token();
  }

  isAuthenticated(): boolean {
    return this.accessToken() !== null;
  }

  hasRole(...roles: Role[]): boolean {
    return roles.some((r) => this.roles().includes(r));
  }

  /** Permissions come from the API's /me so the server stays the single source of RBAC truth. */
  can(permission: Permission): boolean {
    return this.sessionState()?.permissions.includes(permission) ?? false;
  }

  /** Loads /me once per token; concurrent guards share the same request. */
  loadSession(): Promise<Me | null> {
    if (!this.isAuthenticated()) return Promise.resolve(null);
    if (this.sessionState()) return Promise.resolve(this.sessionState());
    this.sessionLoad ??= firstValueFrom(this.http.get<Me>(`${environment.apiBaseUrl}/me`))
      .then((me) => {
        this.sessionState.set(me);
        return me;
      })
      .catch(() => null)
      .finally(() => (this.sessionLoad = null));
    return this.sessionLoad;
  }

  async login(returnUrl = '/'): Promise<void> {
    const flow: PendingFlow = { state: randomString(16), verifier: randomString(48), returnUrl: sanitiseReturnUrl(returnUrl) };
    this.storage.setItem(FLOW_KEY, JSON.stringify(flow));
    const params = new HttpParams({
      fromObject: {
        response_type: 'code',
        client_id: environment.oidc.clientId,
        redirect_uri: redirectUri(),
        scope: environment.oidc.scope,
        audience: environment.oidc.audience,
        state: flow.state,
        code_challenge: await codeChallenge(flow.verifier),
        code_challenge_method: 'S256'
      }
    });
    this.navigate(`${environment.oidc.authorizationEndpoint}?${params.toString()}`);
  }

  /** Completes the redirect leg: validates state, redeems the code and returns where the user started. */
  async completeLogin(code: string | null, state: string | null): Promise<string> {
    const raw = this.storage.getItem(FLOW_KEY);
    this.storage.removeItem(FLOW_KEY);
    const flow = raw ? (JSON.parse(raw) as PendingFlow) : null;
    if (!flow || !code || !state || state !== flow.state) {
      throw new AuthFlowError('The sign-in response could not be verified. Please sign in again.');
    }
    const body = new HttpParams({
      fromObject: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(),
        client_id: environment.oidc.clientId,
        code_verifier: flow.verifier
      }
    });
    const tokens = await firstValueFrom(
      this.http.post<TokenResponse>(environment.oidc.tokenEndpoint, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
    );
    this.setToken(tokens.access_token);
    return flow.returnUrl;
  }

  logout(): void {
    this.clear();
    const params = new HttpParams({ fromObject: { client_id: environment.oidc.clientId, post_logout_redirect_uri: location.origin } });
    this.navigate(`${environment.oidc.endSessionEndpoint}?${params.toString()}`);
  }

  /** Called by the HTTP layer on a 401: drop the session and restart sign-in from the current page. */
  handleSessionExpired(): void {
    if (!this.token()) return;
    this.clear();
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url, expired: 1 } });
  }

  private setToken(token: string): void {
    this.storage.setItem(TOKEN_KEY, token);
    this.sessionState.set(null);
    this.token.set(token);
  }

  private clear(): void {
    this.storage.removeItem(TOKEN_KEY);
    this.token.set(null);
    this.sessionState.set(null);
  }

  /** Separated so tests can intercept full-page navigations. */
  protected navigate(url: string): void {
    location.assign(url);
  }
}

function redirectUri(): string {
  return `${location.origin}/auth/callback`;
}

/** Only same-app relative paths are honoured, preventing open redirects via returnUrl. */
export function sanitiseReturnUrl(url: string | null | undefined): string {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return '/';
  return url;
}
```

## apps/gokinetic-business/web/src/app/core/auth/auth.spec.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/core/auth/auth.spec.ts`.

```typescript
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Me } from '../models/api.models';
import { authGuard, permissionGuard, roleGuard } from './auth.guards';
import { AuthFlowError, AuthService, sanitiseReturnUrl } from './auth.service';
import { codeChallenge, decodeJwt } from './pkce';

function fakeJwt(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${enc({ alg: 'none' })}.${enc(claims)}.sig`;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const ME: Me = {
  userId: 'u1',
  email: 'admin@acme.example',
  roles: ['BUSINESS_ADMIN'],
  accountId: 'ACC-10000001',
  siteScope: null,
  permissions: ['users:manage', 'orders:read'],
  account: { id: 'ACC-10000001', name: 'Acme', status: 'ACTIVE', slaTier: 'ENHANCED', currency: 'GBP' }
};

describe('pkce helpers', () => {
  it('computes the RFC 7636 S256 challenge', async () => {
    // Test vector from RFC 7636 appendix B.
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('decodes JWT payloads and rejects malformed tokens', () => {
    expect(decodeJwt(fakeJwt({ sub: 'u1', exp: 10 }))?.sub).toBe('u1');
    expect(decodeJwt('not-a-jwt')).toBeNull();
    expect(decodeJwt(fakeJwt({ exp: 10 }))).toBeNull();
  });
});

describe('sanitiseReturnUrl', () => {
  it('only allows same-app relative paths', () => {
    expect(sanitiseReturnUrl('/orders/1?x=1')).toBe('/orders/1?x=1');
    expect(sanitiseReturnUrl('//evil.example')).toBe('/');
    expect(sanitiseReturnUrl('https://evil.example')).toBe('/');
    expect(sanitiseReturnUrl('/\\evil.example')).toBe('/');
    expect(sanitiseReturnUrl(null)).toBe('/');
  });
});

describe('AuthService', () => {
  let service: AuthService;
  let backend: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => sessionStorage.clear());

  it('treats expired tokens as signed out', () => {
    sessionStorage.setItem('gkb.accessToken', fakeJwt({ sub: 'u1', exp: nowSec() + 10 }));
    service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('rejects a callback whose state does not match', async () => {
    service = TestBed.inject(AuthService);
    sessionStorage.setItem('gkb.authFlow', JSON.stringify({ state: 'expected', verifier: 'v', returnUrl: '/' }));
    await expectAsync(service.completeLogin('code', 'forged')).toBeRejectedWithError(AuthFlowError);
    expect(sessionStorage.getItem('gkb.authFlow')).toBeNull();
  });

  it('redeems the code with the stored verifier and returns the saved URL', async () => {
    service = TestBed.inject(AuthService);
    sessionStorage.setItem('gkb.authFlow', JSON.stringify({ state: 's1', verifier: 'ver', returnUrl: '/orders' }));
    const pending = service.completeLogin('the-code', 's1');
    const req = backend.expectOne(environment.oidc.tokenEndpoint);
    expect(req.request.body).toContain('code_verifier=ver');
    expect(req.request.body).toContain('grant_type=authorization_code');
    req.flush({ access_token: fakeJwt({ sub: 'u1', exp: nowSec() + 3600, roles: ['BUSINESS_USER'] }), expires_in: 3600 });
    expect(await pending).toBe('/orders');
    expect(service.isAuthenticated()).toBeTrue();
    expect(service.hasRole('BUSINESS_USER')).toBeTrue();
  });

  it('loads /me once and exposes server-derived permissions', async () => {
    sessionStorage.setItem('gkb.accessToken', fakeJwt({ sub: 'u1', exp: nowSec() + 3600 }));
    service = TestBed.inject(AuthService);
    const a = service.loadSession();
    const b = service.loadSession();
    backend.expectOne(`${environment.apiBaseUrl}/me`).flush(ME);
    expect(await a).toEqual(ME);
    expect(await b).toEqual(ME);
    expect(service.can('users:manage')).toBeTrue();
    expect(service.can('audit:read')).toBeFalse();
    expect(service.isAdmin()).toBeTrue();
  });
});

describe('route guards', () => {
  let auth: jasmine.SpyObj<AuthService>;
  const state = { url: '/billing' } as RouterStateSnapshot;
  const route = {} as ActivatedRouteSnapshot;
  const run = (guard: typeof authGuard) => TestBed.runInInjectionContext(() => guard(route, state)) as Promise<boolean | UrlTree>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['isAuthenticated', 'loadSession', 'hasRole', 'can']);
    auth.loadSession.and.resolveTo(ME);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });
  });

  it('sends anonymous users to login with a return URL', async () => {
    auth.isAuthenticated.and.returnValue(false);
    const result = (await run(authGuard)) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/login?returnUrl=%2Fbilling');
  });

  it('allows authenticated users with a session', async () => {
    auth.isAuthenticated.and.returnValue(true);
    expect(await run(authGuard)).toBeTrue();
  });

  it('redirects users without the role to /forbidden', async () => {
    auth.hasRole.and.returnValue(false);
    const result = (await run(roleGuard('BUSINESS_ADMIN'))) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/forbidden');
    expect(auth.hasRole).toHaveBeenCalledWith('BUSINESS_ADMIN');
  });

  it('checks permissions after loading the session', async () => {
    auth.can.and.callFake((p) => p === 'billing:read');
    expect(await run(permissionGuard('billing:read'))).toBeTrue();
    expect(auth.loadSession).toHaveBeenCalled();
  });
});
```

## apps/gokinetic-business/web/src/app/core/auth/pkce.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/core/auth/pkce.ts`.

```typescript
/** Helpers for the OAuth 2.0 Authorization Code flow with PKCE (RFC 7636). */

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(byteLength = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export interface AccessTokenClaims {
  sub: string;
  exp: number;
  email?: string;
  roles?: string[];
  account_id?: string;
}

/** Decodes (without verifying) a JWT payload. Verification is the API's job; the SPA only reads expiry and roles. */
export function decodeJwt(token: string): AccessTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '='));
    const claims = JSON.parse(decodeURIComponent(escape(json))) as AccessTokenClaims;
    return typeof claims.sub === 'string' && typeof claims.exp === 'number' ? claims : null;
  } catch {
    return null;
  }
}
```

## apps/gokinetic-business/web/src/app/core/http/api-problem.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/core/http/api-problem.ts`.

```typescript
import { HttpErrorResponse } from '@angular/common/http';

export interface FieldError {
  field: string;
  message: string;
}

const PROBLEM_BASE = 'https://errors.uniti.example/gokinetic-business/';

/**
 * Client-side view of an RFC 7807 problem. Every failed API call surfaces as an ApiProblem so
 * components never inspect raw HttpErrorResponse objects.
 */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail: string,
    readonly code: string,
    readonly fieldErrors: FieldError[] = [],
    readonly correlationId: string | null = null,
    readonly extensions: Record<string, unknown> = {}
  ) {
    super(detail || title);
    this.name = 'ApiProblem';
  }

  get isValidation(): boolean {
    return this.status === 400 && this.fieldErrors.length > 0;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  /** e.g. "business-rule/last-admin" for a 422 rule violation. */
  isRule(rule: string): boolean {
    return this.code === `business-rule/${rule}`;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function parseFieldErrors(raw: unknown): FieldError[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(asRecord)
    .filter((e): e is Record<string, unknown> => !!e && typeof e['field'] === 'string' && typeof e['message'] === 'string')
    .map((e) => ({ field: e['field'] as string, message: e['message'] as string }));
}

/** Converts any HTTP failure (problem+json, plain JSON, network error) into an ApiProblem. */
export function toApiProblem(error: HttpErrorResponse): ApiProblem {
  const correlationId = error.headers?.get('X-Correlation-Id') ?? null;
  if (error.status === 0) {
    return new ApiProblem(0, 'Network error', 'The service could not be reached. Check your connection and try again.', 'network', [], correlationId);
  }
  const body = asRecord(error.error);
  if (!body || typeof body['title'] !== 'string') {
    return new ApiProblem(error.status, error.statusText || 'Request failed', 'An unexpected error occurred.', `http-${error.status}`, [], correlationId);
  }
  const type = typeof body['type'] === 'string' ? (body['type'] as string) : '';
  const code = type.startsWith(PROBLEM_BASE) ? type.slice(PROBLEM_BASE.length) : type || `http-${error.status}`;
  const { type: _t, title, status: _s, detail, instance: _i, correlationId: bodyCorrelation, errors, ...extensions } = body;
  return new ApiProblem(
    error.status,
    title as string,
    typeof detail === 'string' ? detail : '',
    code,
    parseFieldErrors(errors),
    typeof bodyCorrelation === 'string' ? bodyCorrelation : correlationId,
    extensions
  );
}
```

## apps/gokinetic-business/web/src/app/core/http/http.spec.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/core/http/http.spec.ts`.

```typescript
import { HttpClient, HttpErrorResponse, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { ApiProblem, toApiProblem } from './api-problem';
import { CORRELATION_HEADER, authInterceptor, correlationIdInterceptor, problemInterceptor } from './interceptors';

describe('toApiProblem', () => {
  it('parses RFC 7807 bodies including field errors and extensions', () => {
    const problem = toApiProblem(
      new HttpErrorResponse({
        status: 422,
        error: {
          type: 'https://errors.uniti.example/gokinetic-business/business-rule/last-admin',
          title: 'Business rule violated',
          status: 422,
          detail: 'The account must keep at least one active business admin',
          correlationId: 'corr-1234567',
          rule: 'last-admin',
          errors: [{ field: 'body.role', message: 'bad' }]
        }
      })
    );
    expect(problem).toEqual(jasmine.any(ApiProblem));
    expect(problem.code).toBe('business-rule/last-admin');
    expect(problem.isRule('last-admin')).toBeTrue();
    expect(problem.correlationId).toBe('corr-1234567');
    expect(problem.fieldErrors).toEqual([{ field: 'body.role', message: 'bad' }]);
    expect(problem.extensions['rule']).toBe('last-admin');
  });

  it('describes network failures', () => {
    const problem = toApiProblem(new HttpErrorResponse({ status: 0 }));
    expect(problem.code).toBe('network');
    expect(problem.detail).toContain('could not be reached');
  });

  it('falls back for non-problem bodies, keeping the header correlation id', () => {
    const problem = toApiProblem(
      new HttpErrorResponse({ status: 502, statusText: 'Bad Gateway', error: '<html>', headers: new HttpHeaders({ [CORRELATION_HEADER]: 'hdr-123456' }) })
    );
    expect(problem.title).toBe('Bad Gateway');
    expect(problem.correlationId).toBe('hdr-123456');
  });
});

describe('HTTP interceptors', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['accessToken', 'handleSessionExpired']);
    auth.accessToken.and.returnValue('token-abc');
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        provideHttpClient(withInterceptors([correlationIdInterceptor, authInterceptor, problemInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('adds bearer token and a correlation id to API calls', () => {
    http.get('/api/v1/me').subscribe();
    const req = backend.expectOne('/api/v1/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-abc');
    expect(req.request.headers.get(CORRELATION_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
    req.flush({});
  });

  it('never leaks the token to other hosts', () => {
    http.post('https://id.example-uniti.net/token', 'x').subscribe();
    const req = backend.expectOne('https://id.example-uniti.net/token');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    expect(req.request.headers.has(CORRELATION_HEADER)).toBeFalse();
    req.flush({});
  });

  it('keeps a caller-supplied correlation id', () => {
    http.get('/api/v1/orders', { headers: { [CORRELATION_HEADER]: 'fixed-id-0001' } }).subscribe();
    const req = backend.expectOne('/api/v1/orders');
    expect(req.request.headers.get(CORRELATION_HEADER)).toBe('fixed-id-0001');
    req.flush({});
  });

  it('maps errors to ApiProblem and expires the session on 401', () => {
    let error: unknown;
    http.get('/api/v1/orders').subscribe({ error: (e) => (error = e) });
    backend
      .expectOne('/api/v1/orders')
      .flush({ type: 'x', title: 'Unauthorized', status: 401, detail: 'Access token has expired' }, { status: 401, statusText: 'Unauthorized' });
    expect(error).toEqual(jasmine.any(ApiProblem));
    expect((error as ApiProblem).detail).toBe('Access token has expired');
    expect(auth.handleSessionExpired).toHaveBeenCalled();
  });

  it('does not expire the session for 403s', () => {
    http.get('/api/v1/users').subscribe({ error: () => undefined });
    backend.expectOne('/api/v1/users').flush({ title: 'Forbidden', status: 403 }, { status: 403, statusText: 'Forbidden' });
    expect(auth.handleSessionExpired).not.toHaveBeenCalled();
  });
});
```

## apps/gokinetic-business/web/src/app/core/http/interceptors.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/core/http/interceptors.ts`.

```typescript
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { toApiProblem } from './api-problem';

export const CORRELATION_HEADER = 'X-Correlation-Id';

/** Only our own API receives the bearer token and correlation id; never third-party hosts. */
export function isApiRequest(url: string): boolean {
  return url.startsWith(environment.apiBaseUrl) || url.startsWith(`${location.origin}${environment.apiBaseUrl}`);
}

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url) || req.headers.has(CORRELATION_HEADER)) return next(req);
  return next(req.clone({ setHeaders: { [CORRELATION_HEADER]: newCorrelationId() } }));
};

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).accessToken();
  if (!token || !isApiRequest(req.url)) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

/**
 * Maps failures to ApiProblem. A 401 from the API means the session is no longer valid, so the
 * user is sent back through sign-in, returning to the page they were on.
 */
export const problemInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) return throwError(() => err);
      const problem = toApiProblem(err);
      if (problem.status === 401 && isApiRequest(req.url)) auth.handleSessionExpired();
      return throwError(() => problem);
    })
  );
};
```

## apps/gokinetic-business/web/src/app/core/models/api.models.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/core/models/api.models.ts`.

```typescript
/**
 * Wire types for the Go Kinetic Business API (/api/v1). Money is integer minor units plus an
 * ISO-4217 currency; timestamps are ISO-8601 UTC strings.
 */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PageRequest {
  page: number;
  pageSize: number;
}

export type Role = 'BUSINESS_ADMIN' | 'BUSINESS_USER' | 'SUPPORT_AGENT';
export type SlaTier = 'STANDARD' | 'ENHANCED' | 'PREMIUM';

export type Permission =
  | 'sites:read'
  | 'sites:manage'
  | 'services:read'
  | 'users:read'
  | 'users:manage'
  | 'orders:read'
  | 'orders:create'
  | 'orders:approve'
  | 'orders:fulfil'
  | 'billing:read'
  | 'billing:manage'
  | 'sla:read'
  | 'tickets:read'
  | 'tickets:create'
  | 'tickets:escalate'
  | 'tickets:internal'
  | 'contracts:read'
  | 'contracts:renew'
  | 'documents:read'
  | 'audit:read';

export interface Me {
  userId: string;
  email: string;
  roles: Role[];
  accountId: string;
  siteScope: string[] | null;
  permissions: Permission[];
  account: { id: string; name: string; status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'; slaTier: SlaTier; currency: string };
}

export interface Account {
  id: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  currency: string;
  slaTier: SlaTier;
  approvalThresholdMinor: number;
}

// Inventory
export type SiteStatus = 'PENDING' | 'ACTIVE' | 'DECOMMISSIONED';
export type ServiceStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CEASED';
export type ServiceCategory = 'BROADBAND' | 'VOICE' | 'SDWAN' | 'HOSTED';

export interface Site {
  id: string;
  accountId: string;
  code: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  country: string;
  status: SiteStatus;
  costCentreId: string | null;
  createdAt: string;
}

export interface SiteSummary extends Site {
  activeServiceCount: number;
  monthlyRecurringMinor: number;
  totalBandwidthMbps: number;
}

export interface Service {
  id: string;
  accountId: string;
  siteId: string;
  contractId: string | null;
  costCentreId: string | null;
  productCode: string;
  productName: string;
  category: ServiceCategory;
  bandwidthMbps: number | null;
  status: ServiceStatus;
  slaTier: SlaTier;
  monthlyChargeMinor: number;
  currency: string;
  activatedAt: string | null;
  ceasedAt: string | null;
}

export interface SiteDetail extends Site {
  services: Service[];
  monthlyRecurringMinor: number;
}

export interface InventorySummary {
  siteCount: number;
  activeSiteCount: number;
  serviceCount: number;
  byCategory: Record<ServiceCategory, { count: number; monthlyRecurringMinor: number }>;
  byStatus: Record<ServiceStatus, number>;
  monthlyRecurringMinor: number;
  totalBandwidthMbps: number;
  currency: string;
}

// Orders
export type OrderType = 'PROVIDE' | 'MOVE' | 'ADD' | 'CHANGE' | 'CEASE';
export type OrderStatus = 'DRAFT' | 'SUBMITTED' | 'VALIDATED' | 'PROVISIONING' | 'ACTIVE' | 'CANCELLED' | 'FAILED';

export interface Order {
  id: string;
  accountId: string;
  batchId: string | null;
  reference: string;
  orderType: OrderType;
  status: OrderStatus;
  siteId: string;
  targetSiteId: string | null;
  serviceId: string | null;
  productCode: string | null;
  bandwidthMbps: number | null;
  monthlyDeltaMinor: number;
  oneOffChargeMinor: number;
  currency: string;
  requiresApproval: boolean;
  approvedBy: string | null;
  requestedDate: string | null;
  notes: string | null;
  failureReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderStatusChange {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string | null;
  reason: string | null;
  changedAt: string;
}

export interface OrderDetail extends Order {
  history: OrderStatusChange[];
}

export interface OrderRequest {
  orderType: OrderType;
  siteId: string;
  targetSiteId?: string | null;
  serviceId?: string | null;
  productCode?: string | null;
  requestedDate?: string | null;
  notes?: string | null;
}

export interface OrderQuote {
  productCode: string | null;
  bandwidthMbps: number | null;
  monthlyDeltaMinor: number;
  oneOffChargeMinor: number;
  requiresApproval: boolean;
}

export interface CatalogueProduct {
  code: string;
  name: string;
  category: ServiceCategory;
  bandwidthMbps: number | null;
  monthlyPriceMinor: number;
  installChargeMinor: number;
  requiresConnectivity: boolean;
}

// Billing
export type InvoiceStatus = 'ISSUED' | 'PAID' | 'OVERDUE' | 'DISPUTED' | 'VOID';

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

export type CardBrand = 'VISA' | 'MASTERCARD' | 'AMEX';

export interface PaymentMethod {
  id: string;
  kind: 'CARD' | 'DIRECT_DEBIT';
  holderName: string;
  cardBrand: CardBrand | null;
  last4: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  sortCodeMasked: string | null;
  isDefault: boolean;
  createdAt: string;
  expired: boolean;
  expiresSoon: boolean;
}

export type AddPaymentMethod =
  | {
      kind: 'CARD';
      providerToken: string;
      holderName: string;
      cardBrand: CardBrand;
      last4: string;
      expiryMonth: number;
      expiryYear: number;
      makeDefault: boolean;
    }
  | { kind: 'DIRECT_DEBIT'; holderName: string; sortCode: string; accountNumber: string; makeDefault: boolean };

// Users
export type BusinessRole = 'BUSINESS_ADMIN' | 'BUSINESS_USER';
export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type UserAction = 'suspend' | 'reactivate' | 'deactivate';

export interface BusinessUser {
  id: string;
  accountId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: BusinessRole;
  status: UserStatus;
  siteScope: string[] | null;
  invitedBy: string | null;
  lastLoginAt: string | null;
  version: number;
  createdAt: string;
}

// Tickets
export type TicketCategory = 'FAULT' | 'SERVICE_REQUEST' | 'BILLING' | 'GENERAL';
export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type SlaMeasureState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET' | 'PAUSED';

export interface SlaMeasure {
  dueAt: string;
  state: SlaMeasureState;
  consumedBps: number;
}

export interface Ticket {
  id: string;
  reference: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  serviceId: string | null;
  siteId: string | null;
  subject: string;
  description: string;
  raisedBy: string;
  contactPhone: string | null;
  escalationLevel: number;
  slaTier: SlaTier;
  openedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  version: number;
  sla: { response: SlaMeasure; resolution: SlaMeasure };
}

export interface TicketEvent {
  id: number;
  kind: 'COMMENT' | 'STATUS_CHANGE' | 'ESCALATION' | 'PRIORITY_CHANGE';
  authorId: string | null;
  body: string | null;
  fromValue: string | null;
  toValue: string | null;
  internal: boolean;
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  events: TicketEvent[];
  allowedStatuses: TicketStatus[];
}

export interface NewTicket {
  category: TicketCategory;
  priority: TicketPriority;
  serviceId?: string | null;
  siteId?: string | null;
  subject: string;
  description: string;
  contactPhone?: string | null;
}

// SLA
export interface Money {
  amountMinor: number;
  currency: string;
}

export interface ServiceAvailability {
  serviceId: string;
  productName: string;
  siteId: string;
  slaTier: SlaTier;
  measuredMinutes: number;
  downtimeMinutes: number;
  plannedMinutes: number;
  outageCount: number;
  availabilityMilliPct: number;
  targetMilliPct: number;
  met: boolean;
  creditBps: number;
  credit: Money;
}

export interface TicketCompliance {
  priority: TicketPriority;
  resolvedCount: number;
  responseMetCount: number;
  resolutionMetCount: number;
  responseMetBps: number | null;
  resolutionMetBps: number | null;
}

export interface SlaReport {
  period: string;
  provisional: boolean;
  generatedAt: string;
  services: ServiceAvailability[];
  servicesMeasured: number;
  servicesBreached: number;
  overallAvailabilityMilliPct: number | null;
  totalCredit: Money;
  tickets: TicketCompliance[];
}

// Audit
export interface AuditEntry {
  id: number;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  details: Record<string, unknown>;
  correlationId: string | null;
  createdAt: string;
  summary: string;
}
```

## apps/gokinetic-business/web/src/app/features/audit/audit-log.component.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/audit/audit-log.component.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AccountApi, AuditFilter } from '../../core/api/portal-api';
import { ApiProblem } from '../../core/http/api-problem';
import { AuditEntry } from '../../core/models/api.models';
import { CellDirective, Column, DataTableComponent } from '../../shared/data-table.component';
import { saveBlob } from '../../shared/download';
import { pagedQuery } from '../../shared/paged-query';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';

export const AUDIT_ENTITIES = ['user', 'site', 'order', 'order_batch', 'invoice', 'cost_centre', 'ticket', 'payment_method', 'account'];

@Component({
  selector: 'gkb-audit-log',
  standalone: true,
  imports: [DataTableComponent, CellDirective, DatePipe, ProblemAlertComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Audit log</h1>
      <button type="button" class="secondary" (click)="export()" [disabled]="exporting()">Export CSV</button>
    </header>
    <form class="filters">
      <label>Area
        <select (change)="log.setFilter({ entity: $any($event.target).value || undefined })">
          <option value="">All</option>
          @for (e of entities; track e) { <option [value]="e">{{ e.replace('_', ' ') }}</option> }
        </select>
      </label>
    </form>
    <gkb-problem-alert [problem]="exportProblem() ?? log.error()" />
    <gkb-data-table caption="Audit log" [columns]="columns" [rows]="log.items()" [total]="log.total()" [page]="log.page()"
      [pageSize]="log.pageSize()" [loading]="log.loading()" (pageChange)="log.setPage($event.page, $event.pageSize)">
      <ng-template gkbCell="when" let-row>{{ row.createdAt | date: 'd MMM y, HH:mm:ss' }}</ng-template>
      <ng-template gkbCell="ref" let-row><code [title]="'Correlation id ' + row.correlationId">{{ row.correlationId?.slice(0, 8) }}</code></ng-template>
    </gkb-data-table>
  `
})
export class AuditLogComponent {
  private readonly api = inject(AccountApi);
  readonly entities = AUDIT_ENTITIES;
  readonly exporting = signal(false);
  readonly exportProblem = signal<ApiProblem | null>(null);
  readonly log = pagedQuery<AuditFilter, AuditEntry>((f, p) => this.api.auditLog(f, p), {}, 50);
  readonly columns: Column<AuditEntry>[] = [
    { key: 'when', header: 'When' },
    { key: 'summary', header: 'Activity', value: (e) => e.summary },
    { key: 'entity', header: 'Area', value: (e) => e.entity },
    { key: 'actor', header: 'By', value: (e) => e.actorId?.slice(0, 8) ?? 'System' },
    { key: 'ref', header: 'Ref' }
  ];

  export(): void {
    this.exporting.set(true);
    this.exportProblem.set(null);
    this.api.auditCsv(this.log.filter()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, `audit-${new Date().toISOString().slice(0, 10)}.csv`);
      },
      error: (p: ApiProblem) => {
        this.exporting.set(false);
        this.exportProblem.set(p);
      }
    });
  }
}
```

## apps/gokinetic-business/web/src/app/features/auth/auth-pages.component.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/auth/auth-pages.component.ts`.

```typescript
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthFlowError, AuthService, sanitiseReturnUrl } from '../../core/auth/auth.service';

@Component({
  selector: 'gkb-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="auth-card">
      <h1>Go Kinetic Business</h1>
      @if (expired()) {
        <p class="alert alert--warning" role="status">Your session has ended. Please sign in again.</p>
      }
      <p>Manage your sites, services, orders and invoices in one place.</p>
      <button type="button" class="primary" (click)="signIn()" [disabled]="redirecting()">
        {{ redirecting() ? 'Redirecting…' : 'Sign in' }}
      </button>
    </section>
  `
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  /** Bound from query params via withComponentInputBinding(). */
  readonly returnUrl = input<string>('/');
  readonly expired = input<string | undefined>(undefined);
  readonly redirecting = signal(false);

  signIn(): void {
    this.redirecting.set(true);
    void this.auth.login(sanitiseReturnUrl(this.returnUrl()));
  }
}

@Component({
  selector: 'gkb-auth-callback',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="auth-card" aria-live="polite">
      @if (error(); as message) {
        <h1>Sign-in failed</h1>
        <p>{{ message }}</p>
        <a routerLink="/login">Try again</a>
      } @else {
        <p>Signing you in…</p>
      }
    </section>
  `
})
export class AuthCallbackComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly code = input<string | null>(null);
  readonly state = input<string | null>(null);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const returnUrl = await this.auth.completeLogin(this.code(), this.state());
      await this.router.navigateByUrl(returnUrl, { replaceUrl: true });
    } catch (err) {
      this.error.set(err instanceof AuthFlowError ? err.message : 'We could not complete sign-in. Please try again.');
    }
  }
}

@Component({
  selector: 'gkb-forbidden',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="auth-card">
      <h1>Access restricted</h1>
      <p>Your role does not include access to this area. Ask a business admin on your account if you need it.</p>
      <a routerLink="/dashboard">Back to dashboard</a>
    </section>
  `
})
export class ForbiddenComponent {}
```

## apps/gokinetic-business/web/src/app/features/billing/billing.components.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/billing/billing.components.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, catchError, map, merge, of, switchMap } from 'rxjs';
import { BillingApi, InvoiceFilter } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/http/api-problem';
import { Invoice, InvoiceDetail, InvoiceLine, InvoiceStatus } from '../../core/models/api.models';
import { CellDirective, Column, DataTableComponent } from '../../shared/data-table.component';
import { saveBlob } from '../../shared/download';
import { MoneyPipe } from '../../shared/money.pipe';
import { pagedQuery } from '../../shared/paged-query';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

const STATUSES: InvoiceStatus[] = ['ISSUED', 'OVERDUE', 'PAID', 'DISPUTED', 'VOID'];
/** Must match the API's DISPUTE_WINDOW_DAYS; the server remains the authority. */
export const DISPUTE_WINDOW_DAYS = 60;

export function canDispute(invoice: Invoice, now: Date): boolean {
  if (invoice.status !== 'ISSUED' && invoice.status !== 'OVERDUE') return false;
  return now.getTime() - new Date(invoice.issueDate).getTime() <= DISPUTE_WINDOW_DAYS * 86_400_000;
}

/** Invoice lines grouped by category with subtotals, largest first. */
export function groupLines(lines: InvoiceLine[]): Array<{ category: string; lines: InvoiceLine[]; subtotalMinor: number }> {
  const groups = new Map<string, InvoiceLine[]>();
  for (const line of lines) groups.set(line.category, [...(groups.get(line.category) ?? []), line]);
  return [...groups.entries()]
    .map(([category, ls]) => ({ category, lines: ls, subtotalMinor: ls.reduce((acc, l) => acc + l.amountMinor, 0) }))
    .sort((a, b) => b.subtotalMinor - a.subtotalMinor);
}

@Component({
  selector: 'gkb-invoices-list',
  standalone: true,
  imports: [DataTableComponent, CellDirective, StatusBadgeComponent, MoneyPipe, DatePipe, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Invoices</h1>
      <a routerLink="/billing/payment-methods">Payment methods</a>
    </header>
    <form class="filters">
      <label>Status
        <select (change)="invoices.setFilter({ status: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </label>
      <label>From <input type="month" (change)="invoices.setFilter({ fromPeriod: $any($event.target).value || undefined })" /></label>
      <label>To <input type="month" (change)="invoices.setFilter({ toPeriod: $any($event.target).value || undefined })" /></label>
    </form>
    <gkb-problem-alert [problem]="invoices.error()" />
    <gkb-data-table caption="Invoices" [columns]="columns" [rows]="invoices.items()" [total]="invoices.total()"
      [page]="invoices.page()" [pageSize]="invoices.pageSize()" [loading]="invoices.loading()" [rowClickable]="true"
      (rowClick)="open($event)" (pageChange)="invoices.setPage($event.page, $event.pageSize)">
      <ng-template gkbCell="status" let-row><gkb-status-badge [status]="row.status" /></ng-template>
      <ng-template gkbCell="due" let-row>{{ row.dueDate | date: 'd MMM y' }}</ng-template>
      <ng-template gkbCell="total" let-row>{{ row.totalMinor | money: row.currency }}</ng-template>
    </gkb-data-table>
  `
})
export class InvoicesListComponent {
  private readonly api = inject(BillingApi);
  private readonly router = inject(Router);
  readonly statuses = STATUSES;
  readonly invoices = pagedQuery<InvoiceFilter, Invoice>((f, p) => this.api.invoices(f, p), {});
  readonly columns: Column<Invoice>[] = [
    { key: 'number', header: 'Number', value: (i) => i.number },
    { key: 'period', header: 'Period', value: (i) => i.period },
    { key: 'due', header: 'Due' },
    { key: 'status', header: 'Status' },
    { key: 'total', header: 'Total', align: 'end' }
  ];

  open(invoice: Invoice): void {
    void this.router.navigate(['/billing/invoices', invoice.id]);
  }
}

@Component({
  selector: 'gkb-invoice-detail',
  standalone: true,
  imports: [StatusBadgeComponent, MoneyPipe, DatePipe, ProblemAlertComponent, RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/billing">← Invoices</a>
    <gkb-problem-alert [problem]="problem()" />
    @if (invoice(); as inv) {
      <header class="page-header">
        <h1>Invoice {{ inv.number }}</h1>
        <gkb-status-badge [status]="inv.status" />
      </header>
      <p>Period {{ inv.period }} · issued {{ inv.issueDate | date: 'd MMM y' }} · due {{ inv.dueDate | date: 'd MMM y' }}
        @if (inv.daysOverdue > 0) { <strong class="text-danger">({{ inv.daysOverdue }} days overdue)</strong> }</p>

      @for (group of groups(); track group.category) {
        <h2>{{ group.category }} <small>{{ group.subtotalMinor | money: inv.currency }}</small></h2>
        <table class="table">
          <tbody>
            @for (line of group.lines; track line.id) {
              <tr><td>{{ line.description }}</td><td class="num">{{ line.amountMinor | money: inv.currency }}</td></tr>
            }
          </tbody>
        </table>
      }
      <dl class="summary totals">
        <dt>Subtotal</dt><dd>{{ inv.subtotalMinor | money: inv.currency }}</dd>
        <dt>VAT</dt><dd>{{ inv.taxMinor | money: inv.currency }}</dd>
        <dt>Total</dt><dd><strong>{{ inv.totalMinor | money: inv.currency }}</strong></dd>
      </dl>
      <div class="actions">
        <button type="button" class="secondary" (click)="downloadAllocation(inv)">Cost-centre allocation (CSV)</button>
      </div>
      @if (disputable()) {
        <form class="card" (ngSubmit)="dispute(inv)">
          <h2>Dispute this invoice</h2>
          <label>What is wrong? <textarea [formControl]="reason" rows="4" maxlength="2000"></textarea></label>
          @if (reason.touched && reason.invalid) { <p class="field-error">Please describe the problem in at least 10 characters.</p> }
          <button type="submit" class="danger" [disabled]="busy()">Raise dispute</button>
        </form>
      }
    }
  `
})
export class InvoiceDetailComponent {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  readonly id = input.required<string>();
  readonly problem = signal<ApiProblem | null>(null);
  readonly busy = signal(false);
  readonly reason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(10), Validators.maxLength(2000)] });

  private readonly refresh = new Subject<void>();
  readonly invoice = toSignal(
    merge(toObservable(this.id), this.refresh.pipe(map(() => this.id()))).pipe(
      switchMap((id) => this.api.invoice(id).pipe(catchError((p: ApiProblem) => (this.problem.set(p), of(null)))))
    ),
    { initialValue: null as InvoiceDetail | null }
  );
  readonly groups = computed(() => groupLines(this.invoice()?.lines ?? []));
  readonly disputable = computed(() => {
    const inv = this.invoice();
    return !!inv && this.auth.can('billing:manage') && canDispute(inv, new Date());
  });

  dispute(inv: InvoiceDetail): void {
    this.reason.markAsTouched();
    if (this.reason.invalid) return;
    this.busy.set(true);
    this.api.dispute(inv.id, this.reason.value.trim()).subscribe({
      next: () => {
        this.busy.set(false);
        this.refresh.next();
      },
      error: (p: ApiProblem) => {
        this.busy.set(false);
        this.problem.set(p);
      }
    });
  }

  downloadAllocation(inv: InvoiceDetail): void {
    this.api.allocationCsv(inv.id).subscribe({
      next: (blob) => saveBlob(blob, `cost-allocation-${inv.number}.csv`),
      error: (p: ApiProblem) => this.problem.set(p)
    });
  }
}
```

## apps/gokinetic-business/web/src/app/features/billing/payment-methods.component.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/billing/payment-methods.component.ts`.

```typescript
import { ChangeDetectionStrategy, Component, ElementRef, InjectionToken, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { BillingApi } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/http/api-problem';
import { CardBrand, PaymentMethod } from '../../core/models/api.models';
import { applyProblemToForm, revealErrors } from '../../shared/form-errors';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { bankAccountNumber, errorMessage, sortCode } from '../../shared/validators';

export interface TokenisedCard {
  token: string;
  brand: CardBrand;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

/**
 * Card numbers never touch this application: the payment provider's hosted fields are mounted
 * into a container and return a single-use token. Deployments provide an implementation that
 * wraps the provider SDK; without one, only Direct Debit can be added.
 */
export interface CardTokenizer {
  mount(container: HTMLElement): Promise<void>;
  tokenize(): Promise<TokenisedCard>;
  unmount(): void;
}

export const CARD_TOKENIZER = new InjectionToken<CardTokenizer>('CARD_TOKENIZER');

export function describeMethod(m: PaymentMethod): string {
  if (m.kind === 'DIRECT_DEBIT') return `Direct Debit ${m.sortCodeMasked} ••••${m.last4}`;
  const expiry = `${String(m.expiryMonth).padStart(2, '0')}/${String(m.expiryYear).slice(-2)}`;
  return `${m.cardBrand} ••••${m.last4} (expires ${expiry})`;
}

@Component({
  selector: 'gkb-payment-methods',
  standalone: true,
  imports: [ReactiveFormsModule, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/billing">← Invoices</a>
    <h1>Payment methods</h1>
    <gkb-problem-alert [problem]="problem()" [extra]="unmatched()" />
    <ul class="cards">
      @for (m of methods(); track m.id) {
        <li class="card">
          <span>{{ describe(m) }}</span>
          @if (m.isDefault) { <span class="badge badge--success">Default</span> }
          @if (m.expired) { <span class="badge badge--danger">Expired</span> } @else if (m.expiresSoon) { <span class="badge badge--warning">Expires soon</span> }
          @if (canManage()) {
            <span class="actions">
              @if (!m.isDefault && !m.expired) { <button type="button" class="link" (click)="makeDefault(m)" [disabled]="busy()">Make default</button> }
              <button type="button" class="link danger" (click)="remove(m)" [disabled]="busy()">Remove</button>
            </span>
          }
        </li>
      } @empty { <li>No payment methods on file.</li> }
    </ul>

    @if (canManage()) {
      <section class="card">
        <h2>Add a payment method</h2>
        <div role="radiogroup" class="segmented">
          <button type="button" [class.active]="mode() === 'DIRECT_DEBIT'" (click)="setMode('DIRECT_DEBIT')">Direct Debit</button>
          <button type="button" [class.active]="mode() === 'CARD'" (click)="setMode('CARD')" [disabled]="!tokenizer">Card</button>
        </div>
        @if (mode() === 'DIRECT_DEBIT') {
          <form [formGroup]="ddForm" (ngSubmit)="addDirectDebit()" novalidate>
            <label>Account holder <input formControlName="holderName" autocomplete="name" /></label>
            @if (err(ddForm.controls.holderName); as e) { <p class="field-error">{{ e }}</p> }
            <label>Sort code <input formControlName="sortCode" inputmode="numeric" placeholder="12-34-56" /></label>
            @if (err(ddForm.controls.sortCode); as e) { <p class="field-error">{{ e }}</p> }
            <label>Account number <input formControlName="accountNumber" inputmode="numeric" autocomplete="off" /></label>
            @if (err(ddForm.controls.accountNumber); as e) { <p class="field-error">{{ e }}</p> }
            <label class="checkbox"><input type="checkbox" formControlName="makeDefault" /> Make this the default</label>
            <label class="checkbox"><input type="checkbox" formControlName="authorised" /> I am authorised to set up Direct Debits on this account</label>
            @if (err(ddForm.controls.authorised); as e) { <p class="field-error">Please confirm you are authorised.</p> }
            <button type="submit" class="primary" [disabled]="busy()">Set up Direct Debit</button>
          </form>
        } @else {
          <div #cardHost class="card-host"></div>
          <label class="checkbox"><input type="checkbox" #cardDefault /> Make this the default</label>
          <button type="button" class="primary" (click)="addCard(cardDefault.checked)" [disabled]="busy()">Save card</button>
        }
      </section>
    }
  `
})
export class PaymentMethodsComponent {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  readonly tokenizer = inject(CARD_TOKENIZER, { optional: true });
  private readonly cardHost = viewChild<ElementRef<HTMLElement>>('cardHost');

  readonly methods = signal<PaymentMethod[]>([]);
  readonly mode = signal<'DIRECT_DEBIT' | 'CARD'>('DIRECT_DEBIT');
  readonly busy = signal(false);
  readonly problem = signal<ApiProblem | null>(null);
  readonly unmatched = signal<string[]>([]);
  readonly canManage = computed(() => this.auth.can('billing:manage'));
  readonly describe = describeMethod;
  readonly err = (c: { touched: boolean; errors: Record<string, unknown> | null }) => (c.touched ? errorMessage(c.errors) : null);

  readonly ddForm = this.fb.nonNullable.group({
    holderName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(70)]],
    sortCode: ['', [Validators.required, sortCode()]],
    accountNumber: ['', [Validators.required, bankAccountNumber()]],
    makeDefault: [false],
    authorised: [false, Validators.requiredTrue]
  });

  constructor() {
    this.load();
  }

  setMode(mode: 'DIRECT_DEBIT' | 'CARD'): void {
    this.mode.set(mode);
    if (mode === 'CARD' && this.tokenizer) {
      // The host element renders on the next change-detection pass.
      queueMicrotask(() => {
        const host = this.cardHost()?.nativeElement;
        if (host) void this.tokenizer!.mount(host);
      });
    } else {
      this.tokenizer?.unmount();
    }
  }

  addDirectDebit(): void {
    revealErrors(this.ddForm);
    if (this.ddForm.invalid) return;
    const { holderName, sortCode: sc, accountNumber, makeDefault } = this.ddForm.getRawValue();
    this.mutate(this.api.addPaymentMethod({ kind: 'DIRECT_DEBIT', holderName: holderName.trim(), sortCode: sc, accountNumber, makeDefault }), () =>
      this.ddForm.reset()
    );
  }

  async addCard(makeDefault: boolean): Promise<void> {
    if (!this.tokenizer) return;
    this.busy.set(true);
    try {
      const card = await this.tokenizer.tokenize();
      const holderName = this.auth.session()?.account.name ?? 'Account holder';
      this.mutate(
        this.api.addPaymentMethod({
          kind: 'CARD',
          providerToken: card.token,
          holderName,
          cardBrand: card.brand,
          last4: card.last4,
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          makeDefault
        })
      );
    } catch {
      this.busy.set(false);
      this.problem.set(new ApiProblem(422, 'Card not accepted', 'Please check the card details and try again.', 'card-tokenize'));
    }
  }

  makeDefault(m: PaymentMethod): void {
    this.mutate(this.api.makeDefault(m.id));
  }

  remove(m: PaymentMethod): void {
    if (!confirm(`Remove ${describeMethod(m)}?`)) return;
    this.mutate(this.api.removePaymentMethod(m.id));
  }

  private mutate(call: Observable<unknown>, onSuccess?: () => void): void {
    this.busy.set(true);
    this.problem.set(null);
    this.unmatched.set([]);
    call.subscribe({
      next: () => {
        onSuccess?.();
        this.load();
      },
      error: (p: ApiProblem) => {
        this.busy.set(false);
        this.problem.set(p);
        this.unmatched.set(applyProblemToForm(this.ddForm, p));
      }
    });
  }

  private load(): void {
    this.api.paymentMethods().subscribe({
      next: (items) => {
        this.methods.set(items);
        this.busy.set(false);
      },
      error: (p: ApiProblem) => {
        this.busy.set(false);
        this.problem.set(p);
      }
    });
  }
}
```

## apps/gokinetic-business/web/src/app/features/dashboard/dashboard.component.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/features/dashboard/dashboard.component.ts`.

```typescript
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
```
