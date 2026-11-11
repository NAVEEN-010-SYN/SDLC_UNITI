import { describe, expect, it } from 'vitest';
import { fakeToken } from '../test/utils';
import { canApprove, canRequestChanges, decodeSession, tokenFromFragment } from './token';

describe('decodeSession', () => {
  it('reads roles from both claim layouts and ignores unknown roles', () => {
    const t = fakeToken({ sub: 'u1', roles: ['BUSINESS_USER', 'SOMETHING_ELSE' as never], accountId: 'ACC-10000001' });
    expect(decodeSession(t)).toMatchObject({ userId: 'u1', roles: ['BUSINESS_USER'], accountId: 'ACC-10000001' });
  });

  it('rejects expired, role-less and malformed tokens', () => {
    expect(decodeSession(fakeToken({ sub: 'u1', roles: ['BUSINESS_USER'], exp: 1 }))).toBeNull();
    expect(decodeSession(fakeToken({ sub: 'u1', roles: [] }))).toBeNull();
    expect(decodeSession('not.a.jwt')).toBeNull();
    expect(decodeSession('abc')).toBeNull();
  });

  it('gates approval to admins and support agents', () => {
    const user = decodeSession(fakeToken({ sub: 'u', roles: ['BUSINESS_USER'], accountId: 'ACC-10000001' }));
    const admin = decodeSession(fakeToken({ sub: 'a', roles: ['BUSINESS_ADMIN'], accountId: 'ACC-10000001' }));
    const partner = decodeSession(fakeToken({ sub: 'p', roles: ['PARTNER_AGENT'] }));
    expect([canApprove(user), canApprove(admin), canApprove(partner)]).toEqual([false, true, false]);
    expect([canRequestChanges(user), canRequestChanges(partner)]).toEqual([true, false]);
  });
});

describe('tokenFromFragment', () => {
  it('extracts access_token from an OIDC redirect', () => {
    expect(tokenFromFragment('#access_token=abc.def.ghi&token_type=Bearer')).toBe('abc.def.ghi');
    expect(tokenFromFragment('')).toBeNull();
  });
});
