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
