import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeApi, fakeAuth, Providers, testUser } from '../test/fakes';
import { bucketOf, evaluateFlag, Feature, FeatureFlagProvider, parseFlags } from './featureFlags';

describe('evaluateFlag', () => {
  const consumer = { userId: 'user-1', roles: ['CONSUMER' as const] };

  it('honours local overrides above everything else', () => {
    expect(evaluateFlag(undefined, consumer, true)).toBe(true);
    expect(evaluateFlag({ key: 'x', enabled: true }, consumer, false)).toBe(false);
  });

  it('is off for unknown or disabled flags', () => {
    expect(evaluateFlag(undefined, consumer)).toBe(false);
    expect(evaluateFlag({ key: 'x', enabled: false, rolloutPercent: 100 }, consumer)).toBe(false);
  });

  it('targets roles', () => {
    const flag = { key: 'sdwan-v2', enabled: true, roles: ['BUSINESS_ADMIN' as const] };
    expect(evaluateFlag(flag, consumer)).toBe(false);
    expect(evaluateFlag(flag, { userId: 'u', roles: ['BUSINESS_ADMIN'] })).toBe(true);
  });

  it('rolls out to a stable, roughly proportional share of users', () => {
    const flag = { key: 'new-billing', enabled: true, rolloutPercent: 30 };
    const users = Array.from({ length: 2000 }, (_, i) => `user-${i}`);
    const enabled = users.filter((userId) => evaluateFlag(flag, { userId, roles: ['CONSUMER'] })).length;
    expect(enabled / users.length).toBeGreaterThan(0.25);
    expect(enabled / users.length).toBeLessThan(0.35);
    expect(bucketOf('new-billing', 'user-7')).toBe(bucketOf('new-billing', 'user-7'));
  });

  it('excludes anonymous users from partial rollouts', () => {
    expect(evaluateFlag({ key: 'x', enabled: true, rolloutPercent: 50 }, { roles: [] })).toBe(false);
  });

  it('parses only well-formed flag definitions', () => {
    expect(parseFlags({ items: [{ key: 'a', enabled: true }, { key: 'b' }, null, { enabled: true }] })).toEqual({
      a: { key: 'a', enabled: true, rolloutPercent: undefined, roles: undefined },
    });
    expect(parseFlags('nope')).toEqual({});
  });
});

describe('FeatureFlagProvider', () => {
  it('renders gated content once flags load and fails closed when the flag service errors', async () => {
    const api = fakeApi({ '/feature-flags': { items: [{ key: 'referrals', enabled: true }] } });
    render(
      <Providers auth={fakeAuth({ user: testUser() })}>
        <FeatureFlagProvider api={api} overrides={{}}>
          <Feature flag="referrals">Refer a friend</Feature>
          <Feature flag="global-search" fallback="no search">
            search
          </Feature>
        </FeatureFlagProvider>
      </Providers>,
    );
    expect(await screen.findByText('Refer a friend')).toBeInTheDocument();
    expect(screen.getByText('no search')).toBeInTheDocument();
  });

  it('keeps features off when flags cannot be loaded', async () => {
    const api = fakeApi({ '/feature-flags': new Error('down') });
    render(
      <Providers>
        <FeatureFlagProvider api={api} overrides={{ 'global-search': true }}>
          <Feature flag="referrals" fallback="off">
            on
          </Feature>
          <Feature flag="global-search">search via override</Feature>
        </FeatureFlagProvider>
      </Providers>,
    );
    expect(await screen.findByText('off')).toBeInTheDocument();
    expect(screen.getByText('search via override')).toBeInTheDocument();
  });
});
