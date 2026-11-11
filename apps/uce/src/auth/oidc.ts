import { UceConfig } from '../config';
import { parseRoles, Role } from './roles';

/**
 * OIDC authorization-code flow with PKCE for a public browser client.
 * Tokens are verified by the APIs; the browser only decodes claims to shape the UI.
 */

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export interface AccountRef {
  accountId: string;
  name: string;
}

export interface SessionUser {
  userId: string;
  name?: string;
  email?: string;
  roles: Role[];
  accounts: AccountRef[];
  defaultAccountId: string;
}

export interface Session {
  tokens: TokenSet;
  user: SessionUser;
}

export interface AuthTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
}

const ACCOUNT_ID = /^ACC-\d{8}$/;

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(byteLength = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new Error('Malformed JWT');
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
  const bytes = Uint8Array.from(json, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

/**
 * Maps access-token claims to the session user. Multi-account users carry an
 * `accounts` claim; everyone carries `account_id` (their default account).
 */
export function userFromClaims(claims: Record<string, unknown>): SessionUser {
  const userId = typeof claims.sub === 'string' ? claims.sub : undefined;
  const defaultAccountId = typeof claims.account_id === 'string' ? claims.account_id : undefined;
  if (!userId || !defaultAccountId || !ACCOUNT_ID.test(defaultAccountId)) throw new Error('Token is missing sub or a valid account_id');

  const accounts: AccountRef[] = Array.isArray(claims.accounts)
    ? (claims.accounts as Array<Record<string, unknown>>)
        .filter((a) => typeof a?.id === 'string' && ACCOUNT_ID.test(a.id as string))
        .map((a) => ({ accountId: a.id as string, name: typeof a.name === 'string' ? a.name : (a.id as string) }))
    : [];
  if (!accounts.some((a) => a.accountId === defaultAccountId)) accounts.unshift({ accountId: defaultAccountId, name: defaultAccountId });

  return {
    userId,
    name: typeof claims.name === 'string' ? claims.name : undefined,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    roles: parseRoles(claims.roles),
    accounts,
    defaultAccountId,
  };
}

export function sessionFromTokens(tokens: TokenSet): Session {
  return { tokens, user: userFromClaims(decodeJwt(tokens.accessToken)) };
}

export class OidcClient {
  private discovery?: Promise<Discovery>;

  constructor(
    private readonly config: UceConfig['oidc'],
    private readonly fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
    private readonly now: () => number = Date.now,
  ) {}

  private discover(): Promise<Discovery> {
    this.discovery ??= this.fetchImpl(`${this.config.issuer}/.well-known/openid-configuration`)
      .then((res) => {
        if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
        return res.json() as Promise<Discovery>;
      })
      .catch((error) => {
        this.discovery = undefined;
        throw error;
      });
    return this.discovery;
  }

  async beginLogin(returnTo: string): Promise<{ url: string; transaction: AuthTransaction }> {
    const { authorization_endpoint } = await this.discover();
    const transaction: AuthTransaction = { state: randomString(), nonce: randomString(), codeVerifier: randomString(48), returnTo };
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      state: transaction.state,
      nonce: transaction.nonce,
      code_challenge: await pkceChallenge(transaction.codeVerifier),
      code_challenge_method: 'S256',
    });
    return { url: `${authorization_endpoint}?${params}`, transaction };
  }

  async completeLogin(search: string, transaction: AuthTransaction | undefined): Promise<TokenSet> {
    const params = new URLSearchParams(search);
    const error = params.get('error');
    if (error) throw new Error(`Sign-in failed: ${params.get('error_description') ?? error}`);
    if (!transaction || params.get('state') !== transaction.state) throw new Error('Sign-in state mismatch; please try again');
    const code = params.get('code');
    if (!code) throw new Error('Sign-in response is missing the authorization code');

    const tokens = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: transaction.codeVerifier,
    });
    if (tokens.idToken && decodeJwt(tokens.idToken).nonce !== transaction.nonce) throw new Error('Sign-in nonce mismatch');
    return tokens;
  }

  refresh(refreshToken: string): Promise<TokenSet> {
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async logoutUrl(idToken?: string): Promise<string | undefined> {
    const { end_session_endpoint } = await this.discover();
    if (!end_session_endpoint) return undefined;
    const params = new URLSearchParams({ client_id: this.config.clientId, post_logout_redirect_uri: this.config.postLogoutRedirectUri });
    if (idToken) params.set('id_token_hint', idToken);
    return `${end_session_endpoint}?${params}`;
  }

  private async tokenRequest(form: Record<string, string>): Promise<TokenSet> {
    const { token_endpoint } = await this.discover();
    const res = await this.fetchImpl(token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.config.clientId, ...form }),
    });
    if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string; refresh_token?: string; id_token?: string; expires_in: number };
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? form.refresh_token,
      idToken: body.id_token,
      expiresAt: this.now() + body.expires_in * 1000,
    };
  }
}
