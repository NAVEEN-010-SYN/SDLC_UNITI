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
