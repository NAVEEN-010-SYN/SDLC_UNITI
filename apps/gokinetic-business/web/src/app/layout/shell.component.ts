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
        <span class="account">{{ me.account.name }} \u00B7 {{ me.account.id }}</span>
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
