import { describe, expect, it, vi } from 'vitest';
import { ConsentCategory } from '../consent/consentModel';
import { AnalyticsService, pageTypeFor } from './analyticsService';
import { hashIdentifier, sanitizeProps } from './pii';
import { AnalyticsAdapter } from './types';

function fakeAdapter(name: string, category: ConsentCategory = 'analytics', enable = vi.fn(async () => undefined)): AnalyticsAdapter & Record<string, ReturnType<typeof vi.fn>> {
  return { name, category, enable, disable: vi.fn(), identify: vi.fn(), track: vi.fn(), page: vi.fn() } as never;
}

function setup(adapters: AnalyticsAdapter[]) {
  const granted = new Set<ConsentCategory>();
  const onAdapterError = vi.fn();
  const service = new AnalyticsService(adapters, { isGranted: (c) => granted.has(c), onAdapterError });
  return { service, granted, onAdapterError };
}

const identity = { userKey: 'k', segment: 'CONSUMER' as const, roles: ['CONSUMER' as const] };

describe('AnalyticsService', () => {
  it('drops events raised before consent instead of queuing them', async () => {
    const clarity = fakeAdapter('clarity');
    const { service, granted } = setup([clarity]);
    service.track('plan_viewed', { tier: '1000' });
    await service.syncConsent();
    expect(clarity.enable).not.toHaveBeenCalled();

    granted.add('analytics');
    await service.syncConsent();
    expect(clarity.enable).toHaveBeenCalledTimes(1);
    expect(clarity.track).not.toHaveBeenCalled();
  });

  it('replays identity and current page to an adapter when it is enabled', async () => {
    const fs = fakeAdapter('fullstory');
    const { service, granted } = setup([fs]);
    service.identify(identity);
    service.page({ path: '/referrals', pageType: 'referrals' });
    granted.add('analytics');
    await service.syncConsent();
    expect(fs.identify).toHaveBeenCalledWith(identity);
    expect(fs.page).toHaveBeenCalledWith({ path: '/referrals', pageType: 'referrals' });
  });

  it('gates each adapter on its own category', async () => {
    const analytics = fakeAdapter('clarity', 'analytics');
    const marketing = fakeAdapter('ads', 'marketing');
    const { service, granted } = setup([analytics, marketing]);
    granted.add('analytics');
    await service.syncConsent();
    expect(service.activeAdapters).toEqual(['clarity']);
    expect(marketing.enable).not.toHaveBeenCalled();
  });

  it('disables adapters as soon as consent is revoked', async () => {
    const clarity = fakeAdapter('clarity');
    const { service, granted } = setup([clarity]);
    granted.add('analytics');
    await service.syncConsent();
    granted.delete('analytics');
    await service.syncConsent();
    expect(clarity.disable).toHaveBeenCalledTimes(1);
    service.track('plan_viewed');
    expect(clarity.track).not.toHaveBeenCalled();
  });

  it('isolates a failing adapter from the others', async () => {
    const broken = fakeAdapter('broken', 'analytics', vi.fn(async () => Promise.reject(new Error('blocked by extension'))));
    const healthy = fakeAdapter('healthy');
    const { service, granted, onAdapterError } = setup([broken, healthy]);
    granted.add('analytics');
    await service.syncConsent();
    expect(service.activeAdapters).toEqual(['healthy']);
    expect(onAdapterError).toHaveBeenCalledWith('broken', expect.any(Error));
    healthy.track.mockImplementationOnce(() => {
      throw new Error('vendor bug');
    });
    expect(() => service.track('plan_viewed')).not.toThrow();
  });

  it('does not enable an adapter twice when consent syncs overlap', async () => {
    const clarity = fakeAdapter('clarity');
    const { service, granted } = setup([clarity]);
    granted.add('analytics');
    await Promise.all([service.syncConsent(), service.syncConsent()]);
    expect(clarity.enable).toHaveBeenCalledTimes(1);
  });

  it('sanitises properties and rejects malformed event names', async () => {
    const clarity = fakeAdapter('clarity');
    const { service, granted, onAdapterError } = setup([clarity]);
    granted.add('analytics');
    await service.syncConsent();
    service.track('invoice_viewed', { invoice: 'INV-00123456', email: 'a@b.com' });
    expect(clarity.track).toHaveBeenCalledWith('invoice_viewed', { invoice: '[ID]' });
    service.track('Bad Event!', {});
    expect(clarity.track).toHaveBeenCalledTimes(1);
    expect(onAdapterError).toHaveBeenCalled();
  });

  it('forgets identity on reset and re-enables per consent', async () => {
    const clarity = fakeAdapter('clarity');
    const { service, granted } = setup([clarity]);
    granted.add('analytics');
    await service.syncConsent();
    service.identify(identity);
    service.reset();
    await service.syncConsent();
    expect(clarity.disable).toHaveBeenCalledTimes(1);
    expect(clarity.enable).toHaveBeenCalledTimes(2);
    expect(clarity.identify).toHaveBeenCalledTimes(1);
  });
});

describe('PII helpers', () => {
  it('derives page types without identifiers', () => {
    expect(pageTypeFor('/')).toBe('home');
    expect(pageTypeFor('/portals/uconnect/invoices/INV-00123456')).toBe('portals/uconnect/invoices/:id');
    expect(pageTypeFor('/accounts/ACC-12345678/users/42')).toBe('accounts/:id/users/:id');
  });

  it('drops sensitive keys and redacts values', () => {
    expect(sanitizeProps({ postcode: 'SW1A 1AA', query: 'outage at SW1A 1AA', card_last4: '1111', count: 2, skip: undefined })).toEqual({
      query: 'outage at [POSTCODE]',
      count: 2,
    });
  });

  it('hashes identifiers deterministically with a salt', async () => {
    const a = await hashIdentifier('user-1', 'salt');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIdentifier('user-1', 'salt')).toBe(a);
    expect(await hashIdentifier('user-1', 'other')).not.toBe(a);
  });
});
