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
  /** Roles from /me when loaded, otherwise from the token claims. */
  readonly roles = computed<Role[]>(() => {
    const session = this.sessionState();
    if (session) return session.roles;
    const claimed = this.claims()?.roles ?? [];
    return claimed as Role[];
  });
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
    if (!this.sessionLoad) {
      this.sessionLoad = this.fetchSession();
    }
    return this.sessionLoad;
  }

  private async fetchSession(): Promise<Me | null> {
    try {
      const me = await firstValueFrom(this.http.get<Me>(`${environment.apiBaseUrl}/me`));
      this.sessionState.set(me);
      return me;
    } catch {
      return null;
    } finally {
      this.sessionLoad = null;
    }
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
