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
