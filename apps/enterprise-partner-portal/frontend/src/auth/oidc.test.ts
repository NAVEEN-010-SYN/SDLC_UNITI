import { describe, expect, it } from 'vitest';
import { base64UrlEncode, extractRoles, isExpired, loadTokens, pkceChallenge, saveTokens, userFromToken } from './oidc';

function fakeJwt(claims: Record<string, unknown>): string {
  const enc = (o: object) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(o)));
  return `${enc({ alg: 'none' })}.${enc(claims)}.sig`;
}

describe('oidc helpers', () => {
  it('computes the RFC 7636 S256 challenge', async () => {
    // Test vector from RFC 7636 appendix B.
    await expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('extracts roles from arrays or delimited strings like the API does', () => {
    expect(extractRoles({ roles: ['partner_admin', 'PARTNER_AGENT'] }, 'roles')).toEqual(['PARTNER_ADMIN', 'PARTNER_AGENT']);
    expect(extractRoles({ roles: 'partner_agent, channel_manager' }, 'roles')).toEqual(['PARTNER_AGENT', 'CHANNEL_MANAGER']);
    expect(extractRoles({}, 'roles')).toEqual([]);
  });

  it('builds the session user from configurable claims', () => {
    const token = fakeJwt({ sub: 's-1', name: 'Zoë Ålund', email: 'z@p.example', org: 'p-9', groups: ['PARTNER_ADMIN'] });

    expect(userFromToken(token, 'groups', 'org')).toEqual({
      subject: 's-1', name: 'Zoë Ålund', email: 'z@p.example', partnerId: 'p-9', roles: ['PARTNER_ADMIN'],
    });
  });

  it('treats tokens about to expire as expired and does not load them', () => {
    const now = 1_000_000;
    expect(isExpired({ accessToken: 'a', expiresAt: now + 10_000 }, now)).toBe(true);
    expect(isExpired({ accessToken: 'a', expiresAt: now + 120_000 }, now)).toBe(false);

    saveTokens({ accessToken: 'old', expiresAt: Date.now() - 1 });
    expect(loadTokens()).toBeUndefined();
    saveTokens({ accessToken: 'fresh', expiresAt: Date.now() + 3_600_000 });
    expect(loadTokens()?.accessToken).toBe('fresh');
  });
});
