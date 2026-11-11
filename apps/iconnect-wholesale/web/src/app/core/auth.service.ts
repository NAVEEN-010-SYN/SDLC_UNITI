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

interface PendingLogin {
  verifier: string;
  state: string;
  returnUrl: string;
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
    const pending = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? 'null') as PendingLogin | null;
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

const PKCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = '';
  for (const b of bytes) {
    result += PKCE_ALPHABET[b % 66];
  }
  return result;
}

/** S256 code challenge: base64url(sha256(verifier)) without padding. */
async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  let binary = '';
  for (const b of new Uint8Array(digest)) {
    binary += String.fromCharCode(b);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
