import { describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../test/fakes';
import { buildShareLinks, countInProgress, Referral, ReferralService, ReferralToken, Reward, summariseRewards } from './referralService';

const token: ReferralToken = {
  jwt: 'signed.jwt.value',
  user: { id: 'user-1', accountId: 'ACC-12345678', firstName: 'Jane' },
  referralCode: 'JANE-K7Q2',
  expiresAt: 10_000,
};

function installSquatch(referralCode?: string) {
  const upsertUser = vi.fn(async () => ({ widget: {}, user: { referralCode } }));
  const init = vi.fn();
  window.squatch = { ready: (cb) => cb(), init, widgets: () => ({ upsertUser }) };
  return { upsertUser, init };
}

function service(overrides: Partial<ConstructorParameters<typeof ReferralService>[0]> = {}) {
  const api = fakeApi({ '/referrals/token': token });
  const loader = vi.fn(async () => undefined);
  const svc = new ReferralService({ api, tenantAlias: 'test_abc', widgetType: 'p/referral-program/w/referrerWidget', loader, nowSeconds: () => 1_000, ...overrides });
  return { svc, api, loader };
}

describe('ReferralService', () => {
  it('fetches the user JWT from the backend and caches it until near expiry', async () => {
    const { svc, api } = service();
    await svc.getToken();
    await svc.getToken();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/referrals/token');
  });

  it('re-mints the token within 60 seconds of expiry', async () => {
    const { svc, api } = service({ nowSeconds: () => token.expiresAt - 30 });
    await svc.getToken();
    await svc.getToken();
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('loads squatch.js, initialises the tenant once and upserts the user with the backend JWT', async () => {
    const { svc, loader } = service();
    const { upsertUser, init } = installSquatch('JANE-K7Q2');
    const container = document.createElement('div');

    await expect(svc.mountWidget(container)).resolves.toEqual({ referralCode: 'JANE-K7Q2' });
    await svc.mountWidget(container);

    expect(loader).toHaveBeenCalledWith('https://fast.ssqt.io/squatch-js@2', { id: 'uce-saasquatch' });
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith({ tenantAlias: 'test_abc' });
    expect(upsertUser).toHaveBeenCalledWith({
      user: token.user,
      jwt: 'signed.jwt.value',
      engagementMedium: 'EMBED',
      widgetType: 'p/referral-program/w/referrerWidget',
      container,
    });
  });

  it('falls back to the backend referral code when the widget does not return one', async () => {
    const { svc } = service();
    installSquatch(undefined);
    await expect(svc.mountWidget(document.createElement('div'))).resolves.toEqual({ referralCode: 'JANE-K7Q2' });
  });

  it('fails clearly when unconfigured or when squatch.js never becomes ready', async () => {
    await expect(service({ tenantAlias: undefined }).svc.mountWidget(document.createElement('div'))).rejects.toThrow('not configured');

    window.squatch = { ready: () => undefined, init: vi.fn(), widgets: vi.fn() } as never;
    const { svc } = service({ readyTimeoutMs: 10 });
    await expect(svc.mountWidget(document.createElement('div'))).rejects.toThrow('ready timeout');
  });

  it('requests rewards and referral status with pagination', async () => {
    const api = fakeApi({ '/referrals/rewards': { items: [], page: 2, pageSize: 10, total: 0 }, '/referrals': { items: [], page: 1, pageSize: 20, total: 0 } });
    const svc = new ReferralService({ api, widgetType: 'w' });
    await svc.listRewards(2, 10);
    await svc.listReferrals();
    expect(api.get).toHaveBeenCalledWith('/referrals/rewards', { query: { page: 2, pageSize: 10 } });
    expect(api.get).toHaveBeenCalledWith('/referrals', { query: { page: 1, pageSize: 20 } });
  });
});

describe('referral helpers', () => {
  const reward = (id: string, amountMinor: number, status: Reward['status'], currency = 'GBP'): Reward => ({
    id,
    type: 'ACCOUNT_CREDIT',
    amount: { amountMinor, currency },
    status,
    earnedAt: '2026-10-01T00:00:00Z',
    referralId: `ref-${id}`,
  });

  it('totals rewards per currency in minor units and counts pending ones', () => {
    const summary = summariseRewards([
      reward('1', 5000, 'AVAILABLE'),
      reward('2', 2500, 'AVAILABLE'),
      reward('3', 3000, 'AVAILABLE', 'EUR'),
      reward('4', 5000, 'REDEEMED'),
      reward('5', 5000, 'PENDING'),
      reward('6', 5000, 'EXPIRED'),
    ]);
    expect(summary).toEqual({
      available: [
        { currency: 'EUR', amountMinor: 3000 },
        { currency: 'GBP', amountMinor: 7500 },
      ],
      redeemed: [{ currency: 'GBP', amountMinor: 5000 }],
      pendingCount: 1,
    });
  });

  it('counts only live referrals as in progress', () => {
    const statuses: Referral['status'][] = ['INVITED', 'SIGNED_UP', 'INSTALLED', 'REWARDED', 'EXPIRED', 'CANCELLED'];
    const referrals = statuses.map((status, i) => ({ id: String(i), refereeDisplayName: 'J. S.', status, createdAt: '', updatedAt: '' }));
    expect(countInProgress(referrals)).toBe(3);
  });

  it('builds encoded share links with campaign tagging', () => {
    const links = buildShareLinks('JANE-K7Q2', 'https://www.gokinetic.example/refer');
    expect(links.url).toBe('https://www.gokinetic.example/refer?code=JANE-K7Q2&utm_source=uce&utm_medium=referral');
    expect(links.email.startsWith('mailto:?subject=Get%20full%20fibre%20with%20Uniti&body=')).toBe(true);
    expect(decodeURIComponent(links.whatsapp.split('text=')[1])).toContain('use my code JANE-K7Q2');
    expect(() => buildShareLinks('<script>', 'https://x.example')).toThrow('Invalid referral code');
  });
});
