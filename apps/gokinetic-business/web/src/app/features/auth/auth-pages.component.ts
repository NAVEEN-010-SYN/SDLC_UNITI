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
        {{ redirecting() ? 'Redirecting\u2026' : 'Sign in' }}
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
        <p>Signing you in\u2026</p>
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
