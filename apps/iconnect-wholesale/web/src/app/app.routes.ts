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
