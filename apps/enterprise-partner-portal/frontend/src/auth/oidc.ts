/**
 * Minimal OIDC authorization-code + PKCE flow for a public SPA client. Tokens are held in
 * sessionStorage (cleared when the tab closes) and never in localStorage.
 */

export interface TokenSet {
  accessToken: string;
  idToken?: string;
  expiresAt: number;
}

export interface SessionUser {
  subject: string;
  name: string;
  email?: string;
  partnerId?: string;
  roles: string[];
}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
}

const TOKEN_KEY = 'epp.tokens';
const PKCE_KEY = 'epp.pkce';
const EXPIRY_SKEW_MS = 30_000;

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/** Decodes a JWT payload without verifying it; the API verifies signatures, the UI only reads claims. */
export function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) {
    throw new Error('Malformed token');
  }
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const paddedLength = Math.ceil(part.length / 4) * 4;
  const json = atob(base64.padEnd(paddedLength, '='));
  return JSON.parse(decodeURIComponent(escape(json))) as Record<string, unknown>;
}

/** Mirrors the API's role extraction: a JSON array or a space/comma separated string, upper-cased. */
export function extractRoles(claims: Record<string, unknown>, claim: string): string[] {
  const raw = claims[claim];
  let values: string[] = [];
  if (Array.isArray(raw)) {
    values = raw.map(String);
  } else if (typeof raw === 'string') {
    values = raw.split(/[ ,]/);
  }
  const roles: string[] = [];
  for (const v of values) {
    const role = v.trim().toUpperCase();
    if (role && !roles.includes(role)) {
      roles.push(role);
    }
  }
  return roles;
}

export function userFromToken(accessToken: string, rolesClaim: string, partnerClaim: string): SessionUser {
  const claims = decodeJwt(accessToken);
  const email = typeof claims.email === 'string' ? claims.email : undefined;
  let name = email ?? 'Unknown user';
  if (typeof claims.name === 'string') {
    name = claims.name;
  }
  const partnerValue = claims[partnerClaim];
  return {
    subject: String(claims.sub ?? ''),
    name,
    email,
    partnerId: typeof partnerValue === 'string' ? partnerValue : undefined,
    roles: extractRoles(claims, rolesClaim),
  };
}

export function isExpired(tokens: TokenSet, now = Date.now()): boolean {
  return tokens.expiresAt - EXPIRY_SKEW_MS <= now;
}

export function loadTokens(): TokenSet | undefined {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    const tokens = raw ? (JSON.parse(raw) as TokenSet) : undefined;
    return tokens && !isExpired(tokens) ? tokens : undefined;
  } catch {
    return undefined;
  }
}

export function saveTokens(tokens: TokenSet | undefined): void {
  if (tokens) {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

async function discover(authority: string): Promise<Discovery> {
  const response = await fetch(`${authority}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new Error(`OIDC discovery failed (${response.status})`);
  }
  return (await response.json()) as Discovery;
}

export async function beginLogin(authority: string, clientId: string, scope: string, returnTo: string): Promise<void> {
  const meta = await discover(authority);
  const verifier = randomString(48);
  const state = randomString(16);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnTo }));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: `${window.location.origin}/callback`,
    scope,
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });
  window.location.assign(`${meta.authorization_endpoint}?${params.toString()}`);
}

/** Exchanges the authorization code; returns the tokens and where the user was heading. */
export async function completeLogin(authority: string, clientId: string, search: string):
  Promise<{ tokens: TokenSet; returnTo: string }> {
  const params = new URLSearchParams(search);
  const pending = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? 'null') as
    { verifier: string; state: string; returnTo: string } | null;
  sessionStorage.removeItem(PKCE_KEY);
  if (params.get('error')) {
    throw new Error(params.get('error_description') ?? params.get('error') ?? 'Sign-in failed');
  }
  if (!pending || params.get('state') !== pending.state) {
    throw new Error('Sign-in response did not match the request; please try again');
  }
  const meta = await discover(authority);
  const response = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.get('code') ?? '',
      redirect_uri: `${window.location.origin}/callback`,
      client_id: clientId,
      code_verifier: pending.verifier,
    }),
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status})`);
  }
  const body = (await response.json()) as { access_token: string; id_token?: string; expires_in: number };
  return {
    tokens: { accessToken: body.access_token, idToken: body.id_token, expiresAt: Date.now() + body.expires_in * 1000 },
    returnTo: pending.returnTo || '/',
  };
}

export async function endSession(authority: string, clientId: string, idToken?: string): Promise<void> {
  saveTokens(undefined);
  const meta = await discover(authority).catch(() => undefined);
  if (!meta?.end_session_endpoint) {
    window.location.assign('/');
    return;
  }
  const params = new URLSearchParams({ client_id: clientId, post_logout_redirect_uri: window.location.origin });
  if (idToken) {
    params.set('id_token_hint', idToken);
  }
  window.location.assign(`${meta.end_session_endpoint}?${params.toString()}`);
}
