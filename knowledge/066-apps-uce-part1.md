# UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory): apps/uce (part 1 of 3)

- **Application:** UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory)
- **Tech stack:** React + TypeScript
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 24

## Files

- `apps/uce/.env.example` (40 lines)
- `apps/uce/index.html` (13 lines)
- `apps/uce/package.json` (39 lines)
- `apps/uce/src/App.tsx` (96 lines)
- `apps/uce/src/accounts/AccountSwitcher.test.tsx` (65 lines)
- `apps/uce/src/accounts/AccountSwitcher.tsx` (40 lines)
- `apps/uce/src/analytics/AnalyticsProvider.tsx` (82 lines)
- `apps/uce/src/analytics/analyticsService.test.ts` (136 lines)
- `apps/uce/src/analytics/analyticsService.ts` (109 lines)
- `apps/uce/src/analytics/clarityAdapter.test.ts` (89 lines)
- `apps/uce/src/analytics/clarityAdapter.ts` (102 lines)
- `apps/uce/src/analytics/fullstoryAdapter.test.ts` (73 lines)
- `apps/uce/src/analytics/fullstoryAdapter.ts` (123 lines)
- `apps/uce/src/analytics/pii.ts` (70 lines)
- `apps/uce/src/analytics/types.ts` (35 lines)
- `apps/uce/src/api/ApiProvider.tsx` (39 lines)
- `apps/uce/src/api/apiClient.test.ts` (99 lines)
- `apps/uce/src/api/apiClient.ts` (162 lines)
- `apps/uce/src/api/problem.ts` (79 lines)
- `apps/uce/src/auth/AuthProvider.tsx` (170 lines)
- `apps/uce/src/auth/RequireAuth.tsx` (41 lines)
- `apps/uce/src/auth/oidc.ts` (191 lines)
- `apps/uce/src/auth/roles.ts` (36 lines)
- `apps/uce/src/components/ErrorBoundary.test.tsx` (65 lines)

## apps/uce/.env.example

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: bash. Path: `apps/uce/.env.example`.

```bash
# Backend-for-frontend base URL (all calls go to /api/v1 on this origin)
VITE_API_BASE_URL=/api/v1
# Dev server proxy target for /api
VITE_API_PROXY_TARGET=http://localhost:8080
VITE_API_TIMEOUT_MS=10000

# OIDC (authorization code + PKCE, public client - no client secret in the browser)
VITE_OIDC_ISSUER=https://login.uniti.example/realms/selfcare
VITE_OIDC_CLIENT_ID=uniti-uce
VITE_OIDC_REDIRECT_URI=http://localhost:5173/auth/callback
VITE_OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:5173/
VITE_OIDC_SCOPE=openid profile email offline_access

# Consent: bump when the cookie policy changes to re-prompt every visitor
VITE_CONSENT_POLICY_VERSION=2026-11

# Analytics (loaded only after the visitor grants the "analytics" category)
VITE_CLARITY_PROJECT_ID=
VITE_FULLSTORY_ORG_ID=
VITE_FULLSTORY_HOST=fullstory.com
# Salt for hashing user ids before they are sent to analytics vendors
VITE_ANALYTICS_ID_SALT=change-me

# SaaSquatch referral programme (loaded only after the "functional" category is granted)
VITE_SAASQUATCH_TENANT_ALIAS=
VITE_SAASQUATCH_WIDGET_TYPE=p/referral-program/w/referrerWidget
VITE_REFERRAL_SHARE_BASE_URL=https://www.gokinetic.example/refer

# Portals hosted or linked by the shell
VITE_PORTAL_ECOM_URL=http://localhost:3001
VITE_PORTAL_UCONNECT_URL=http://localhost:5001
VITE_PORTAL_GOKINETIC_BUSINESS_URL=http://localhost:4200
VITE_PORTAL_PARTNER_URL=http://localhost:3002
VITE_PORTAL_SDWAN_URL=http://localhost:3003
VITE_PORTAL_HOSTED_SERVICES_URL=http://localhost:8000
VITE_PORTAL_WHOLESALE_URL=http://localhost:4300

# Local feature flag overrides, e.g. "referrals=true,global-search=false"
VITE_FEATURE_FLAGS=
```

## apps/uce/index.html

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: html. Path: `apps/uce/index.html`.

```html
<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Uniti - My Account</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## apps/uce/package.json

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: json. Path: `apps/uce/package.json`.

```json
{
  "name": "@uniti/uce",
  "version": "1.0.0",
  "private": true,
  "description": "UCE - Unified Customer Experience shell hosting the Uniti self-care portals",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint \"src/**/*.{ts,tsx}\""
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "@vitest/coverage-v8": "^2.1.1",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.6",
    "vitest": "^2.1.1"
  }
}
```

## apps/uce/src/App.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/App.tsx`.

```tsx
import { useCallback, useMemo } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AnalyticsProvider } from './analytics/AnalyticsProvider';
import { ApiProvider, useApi } from './api/ApiProvider';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { OidcClient } from './auth/oidc';
import { RequireAuth } from './auth/RequireAuth';
import { UceConfig } from './config';
import { ConsentProvider } from './consent/ConsentProvider';
import { ConsentRecord } from './consent/consentModel';
import { FeatureFlagProvider, useFeatureFlag } from './flags/featureFlags';
import { CallbackPage, HomePage, NotFoundPage } from './pages/pages';
import { ReferralPage } from './referrals/ReferralPage';
import { ReferralService } from './referrals/referralService';
import { AppShell } from './shell/AppShell';
import { PortalPage } from './shell/PortalPage';

/** Provider order matters: auth -> api -> consent (audited via api) -> flags -> analytics. */
export function App({ config }: { config: UceConfig }) {
  const oidc = useMemo(() => new OidcClient(config.oidc), [config.oidc]);
  return (
    <BrowserRouter>
      <AuthProvider client={oidc}>
        <ApiProvider baseUrl={config.apiBaseUrl} timeoutMs={config.apiTimeoutMs}>
          <ConsentedApp config={config} />
        </ApiProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function ConsentedApp({ config }: { config: UceConfig }) {
  const api = useApi();
  const { status } = useAuth();
  const audit = useCallback(
    async (record: ConsentRecord) => {
      // Anonymous decisions stay local; signed-in decisions are recorded server-side as evidence.
      if (status === 'authenticated') await api.post('/consents', record);
    },
    [api, status],
  );
  return (
    <ConsentProvider policyVersion={config.consentPolicyVersion} onDecision={audit}>
      <FeatureFlagProvider api={api} overrides={config.flagOverrides}>
        <AnalyticsProvider config={config.analytics}>
          <AppRoutes config={config} />
        </AnalyticsProvider>
      </FeatureFlagProvider>
    </ConsentProvider>
  );
}

function AppRoutes({ config }: { config: UceConfig }) {
  const api = useApi();
  const referralsEnabled = useFeatureFlag('referrals');
  const referrals = useMemo(
    () => new ReferralService({ api, tenantAlias: config.referrals.tenantAlias, widgetType: config.referrals.widgetType }),
    [api, config.referrals.tenantAlias, config.referrals.widgetType],
  );

  return (
    <Routes>
      <Route path="/auth/callback" element={<CallbackPage />} />
      <Route element={<AppShell portalUrls={config.portalUrls} />}>
        <Route
          index
          element={
            <RequireAuth>
              <HomePage portalUrls={config.portalUrls} />
            </RequireAuth>
          }
        />
        <Route
          path="portals/:portalId/*"
          element={
            <RequireAuth>
              <PortalPage portalUrls={config.portalUrls} />
            </RequireAuth>
          }
        />
        {referralsEnabled && (
          <Route
            path="referrals"
            element={
              <RequireAuth roles={['CONSUMER', 'BUSINESS_ADMIN']}>
                <ReferralPage service={referrals} shareBaseUrl={config.referrals.shareBaseUrl} />
              </RequireAuth>
            }
          />
        )}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

## apps/uce/src/accounts/AccountSwitcher.test.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/accounts/AccountSwitcher.test.tsx`.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeAuth, Providers, testUser } from '../test/fakes';
import { AccountSwitcher } from './AccountSwitcher';

const businessUser = testUser({
  roles: ['BUSINESS_ADMIN'],
  defaultAccountId: 'ACC-00000002',
  accounts: [
    { accountId: 'ACC-00000002', name: 'Northern Depot' },
    { accountId: 'ACC-00000001', name: 'Head Office' },
    { accountId: 'ACC-00000003', name: 'ACC-00000003' },
  ],
});

describe('AccountSwitcher', () => {
  it('is hidden for single-account users', () => {
    render(
      <Providers>
        <AccountSwitcher />
      </Providers>,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('is hidden for consumers even if the token lists several accounts', () => {
    const auth = fakeAuth({ user: { ...businessUser, roles: ['CONSUMER'] } });
    render(
      <Providers auth={auth}>
        <AccountSwitcher />
      </Providers>,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('lists accounts alphabetically with the active one selected', () => {
    render(
      <Providers auth={fakeAuth({ user: businessUser })}>
        <AccountSwitcher />
      </Providers>,
    );
    const select = screen.getByRole('combobox', { name: /Account/ });
    expect(select).toHaveValue('ACC-00000002');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'ACC-00000003',
      'Head Office (ACC-00000001)',
      'Northern Depot (ACC-00000002)',
    ]);
  });

  it('switches the active account and reports it', async () => {
    const auth = fakeAuth({ user: businessUser });
    const onSwitch = vi.fn();
    render(
      <Providers auth={auth}>
        <AccountSwitcher onSwitch={onSwitch} />
      </Providers>,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'ACC-00000001');
    expect(auth.setActiveAccount).toHaveBeenCalledWith('ACC-00000001');
    expect(onSwitch).toHaveBeenCalledWith('ACC-00000001');
  });
});
```

## apps/uce/src/accounts/AccountSwitcher.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/accounts/AccountSwitcher.tsx`.

```tsx
import { ChangeEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { hasAnyRole, MULTI_ACCOUNT_ROLES } from '../auth/roles';

interface AccountSwitcherProps {
  onSwitch?: (accountId: string) => void;
}

/**
 * Lets multi-account business, partner and support users choose which billing
 * account the shell (and every API call, via X-Account-Id) acts on.
 * Hidden for single-account users.
 */
export function AccountSwitcher({ onSwitch }: AccountSwitcherProps) {
  const { user, activeAccountId, setActiveAccount } = useAuth();
  if (!user || user.accounts.length < 2 || !hasAnyRole(user.roles, MULTI_ACCOUNT_ROLES)) return null;

  const accounts = [...user.accounts].sort((a, b) => a.name.localeCompare(b.name));

  const change = (event: ChangeEvent<HTMLSelectElement>) => {
    const accountId = event.target.value;
    if (accountId === activeAccountId) return;
    setActiveAccount(accountId);
    onSwitch?.(accountId);
  };

  return (
    <label className="uce-account-switcher">
      <span>Account</span>
      <select value={activeAccountId} onChange={change}>
        {accounts.map((a) => (
          <option key={a.accountId} value={a.accountId}>
            {a.name === a.accountId ? a.accountId : `${a.name} (${a.accountId})`}
          </option>
        ))}
      </select>
    </label>
  );
}
```

## apps/uce/src/analytics/AnalyticsProvider.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/analytics/AnalyticsProvider.tsx`.

```tsx
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { segmentOf } from '../auth/roles';
import { UceConfig } from '../config';
import { useConsent } from '../consent/ConsentProvider';
import { AnalyticsService, pageTypeFor } from './analyticsService';
import { ClarityAdapter } from './clarityAdapter';
import { FullStoryAdapter } from './fullstoryAdapter';
import { hashIdentifier } from './pii';
import { AnalyticsAdapter } from './types';

export const AnalyticsContext = createContext<AnalyticsService | undefined>(undefined);

export function buildAdapters(config: UceConfig['analytics']): AnalyticsAdapter[] {
  const adapters: AnalyticsAdapter[] = [];
  if (config.clarityProjectId) adapters.push(new ClarityAdapter({ projectId: config.clarityProjectId }));
  if (config.fullstoryOrgId) adapters.push(new FullStoryAdapter({ orgId: config.fullstoryOrgId, host: config.fullstoryHost }));
  return adapters;
}

interface AnalyticsProviderProps {
  config: UceConfig['analytics'];
  adapters?: AnalyticsAdapter[];
  children: ReactNode;
}

/** Wires the analytics service to consent, the signed-in user and route changes. */
export function AnalyticsProvider({ config, adapters, children }: AnalyticsProviderProps) {
  const consent = useConsent();
  const { user, activeAccountId } = useAuth();
  const location = useLocation();
  const isGranted = useRef(consent.isGranted);
  isGranted.current = consent.isGranted;

  const service = useMemo(
    () =>
      new AnalyticsService(adapters ?? buildAdapters(config), {
        isGranted: (category) => isGranted.current(category),
        onAdapterError: (adapter, error) => console.warn(JSON.stringify({ level: 'warn', message: 'analytics adapter error', adapter, error: String(error) })),
      }),
    [adapters, config],
  );

  useEffect(() => {
    void service.syncConsent();
  }, [service, consent.record]);

  const hadUser = useRef(false);
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      if (hadUser.current) service.reset();
      hadUser.current = false;
      return undefined;
    }
    hadUser.current = true;
    void Promise.all([
      hashIdentifier(user.userId, config.idSalt),
      activeAccountId ? hashIdentifier(activeAccountId, config.idSalt) : Promise.resolve(undefined),
    ]).then(([userKey, accountKey]) => {
      if (!cancelled) service.identify({ userKey, accountKey, segment: segmentOf(user.roles), roles: user.roles });
    });
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, config.idSalt, service, user]);

  useEffect(() => {
    const portal = /^\/portals\/([^/]+)/.exec(location.pathname)?.[1];
    service.page({ path: location.pathname, pageType: pageTypeFor(location.pathname), portal });
  }, [location.pathname, service]);

  return <AnalyticsContext.Provider value={service}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsService {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) throw new Error('useAnalytics must be used inside <AnalyticsProvider>');
  return ctx;
}
```

## apps/uce/src/analytics/analyticsService.test.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/analytics/analyticsService.test.ts`.

```typescript
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
```

## apps/uce/src/analytics/analyticsService.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/analytics/analyticsService.ts`.

```typescript
import { ConsentCategory } from '../consent/consentModel';
import { sanitizeProps } from './pii';
import { AnalyticsAdapter, AnalyticsIdentity, AnalyticsProps, PageProperties } from './types';

/**
 * Fans analytics calls out to vendor adapters, gated by consent.
 *
 * Events raised before consent are dropped, not queued: replaying behaviour
 * captured before an opt-in would defeat the purpose of asking. Only the
 * current identity and page context (needed to make later data usable) are
 * replayed to an adapter at the moment it is enabled.
 */

export interface AnalyticsServiceOptions {
  isGranted: (category: ConsentCategory) => boolean;
  onAdapterError?: (adapter: string, error: unknown) => void;
}

export class AnalyticsService {
  private readonly active = new Set<AnalyticsAdapter>();
  private identity?: AnalyticsIdentity;
  private currentPage?: PageProperties;
  private syncing: Promise<void> = Promise.resolve();

  constructor(
    private readonly adapters: AnalyticsAdapter[],
    private readonly options: AnalyticsServiceOptions,
  ) {}

  /** Enables/disables adapters to match current consent. Serialised to avoid double loads. */
  syncConsent(): Promise<void> {
    this.syncing = this.syncing.then(() => this.applyConsent());
    return this.syncing;
  }

  private async applyConsent(): Promise<void> {
    await Promise.all(
      this.adapters.map(async (adapter) => {
        const granted = this.options.isGranted(adapter.category);
        if (granted && !this.active.has(adapter)) {
          try {
            await adapter.enable();
            this.active.add(adapter);
            if (this.identity) adapter.identify(this.identity);
            if (this.currentPage) adapter.page(this.currentPage);
          } catch (error) {
            adapter.disable();
            this.options.onAdapterError?.(adapter.name, error);
          }
        } else if (!granted && this.active.has(adapter)) {
          this.active.delete(adapter);
          adapter.disable();
        }
      }),
    );
  }

  identify(identity: AnalyticsIdentity): void {
    this.identity = identity;
    this.forEachActive((a) => a.identify(identity));
  }

  /** Forgets the identity on logout; vendors start a fresh anonymous session. */
  reset(): void {
    this.identity = undefined;
    const wasActive = [...this.active];
    wasActive.forEach((a) => a.disable());
    this.active.clear();
    void this.syncConsent();
  }

  track(event: string, props: AnalyticsProps = {}): void {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(event)) {
      this.options.onAdapterError?.('analytics', new Error(`Invalid event name "${event}"`));
      return;
    }
    const clean = sanitizeProps(props);
    this.forEachActive((a) => a.track(event, clean));
  }

  page(props: PageProperties): void {
    this.currentPage = props;
    this.forEachActive((a) => a.page(props));
  }

  get activeAdapters(): string[] {
    return [...this.active].map((a) => a.name);
  }

  private forEachActive(fn: (adapter: AnalyticsAdapter) => void): void {
    for (const adapter of this.active) {
      try {
        fn(adapter);
      } catch (error) {
        this.options.onAdapterError?.(adapter.name, error);
      }
    }
  }
}

/** Derives a stable page type from a path, stripping identifiers so they never reach vendors. */
export function pageTypeFor(path: string): string {
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((s) => (/^(ACC|INV|TKT|ORD)-\d+$/i.test(s) || /^[0-9a-f-]{16,}$/i.test(s) || /^\d+$/.test(s) ? ':id' : s.toLowerCase()));
  return segments.length === 0 ? 'home' : segments.join('/');
}
```

## apps/uce/src/analytics/clarityAdapter.test.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/analytics/clarityAdapter.test.ts`.

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClarityAdapter } from './clarityAdapter';

const identity = { userKey: 'a1b2c3', segment: 'BUSINESS' as const, roles: ['BUSINESS_ADMIN' as const] };

function setup() {
  const loader = vi.fn(async () => undefined);
  const adapter = new ClarityAdapter({ projectId: 'abc123xyz', loader });
  const calls = () => window.clarity?.q ?? [];
  return { adapter, loader, calls };
}

describe('ClarityAdapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input type="email" id="email" /><span data-pii id="name">Jane</span><p id="plain">Plan</p>';
  });

  it('is completely inert before enable: no global, no script, calls ignored', () => {
    const { adapter, loader } = setup();
    adapter.identify(identity);
    adapter.track('plan_viewed', {});
    expect(window.clarity).toBeUndefined();
    expect(loader).not.toHaveBeenCalled();
  });

  it('installs the queue stub, grants analytics storage only, and loads the project tag', async () => {
    const { adapter, loader, calls } = setup();
    await adapter.enable();
    expect(calls()[0]).toEqual(['consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }]);
    expect(loader).toHaveBeenCalledWith('https://www.clarity.ms/tag/abc123xyz', expect.objectContaining({ id: 'uce-clarity' }));
  });

  it('masks PII elements present now and added later', async () => {
    const { adapter } = setup();
    await adapter.enable();
    expect(document.getElementById('email')).toHaveAttribute('data-clarity-mask', 'true');
    expect(document.getElementById('name')).toHaveAttribute('data-clarity-mask', 'true');
    expect(document.getElementById('plain')).not.toHaveAttribute('data-clarity-mask');

    const late = document.createElement('div');
    late.innerHTML = '<input type="tel" id="phone" />';
    document.body.appendChild(late);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById('phone')).toHaveAttribute('data-clarity-mask', 'true');
  });

  it('identifies with the hashed key only and sets segment tags', async () => {
    const { adapter, calls } = setup();
    await adapter.enable();
    adapter.identify(identity);
    expect(calls()).toContainEqual(['identify', 'a1b2c3']);
    expect(calls()).toContainEqual(['set', 'segment', 'BUSINESS']);
    expect(calls().find((c) => c[0] === 'identify')).toHaveLength(2);
  });

  it('sends events with sanitised properties as custom tags', async () => {
    const { adapter, calls } = setup();
    await adapter.enable();
    adapter.track('ticket_raised', { priority: 'P3', email: 'jane@example.com', note: 'call 07700 900123' });
    expect(calls()).toContainEqual(['event', 'ticket_raised']);
    expect(calls()).toContainEqual(['set', 'ticket_raised.priority', 'P3']);
    expect(calls()).toContainEqual(['set', 'ticket_raised.note', 'call [PHONE]']);
    expect(JSON.stringify(calls())).not.toContain('jane@example.com');
  });

  it('denies storage on disable and stops forwarding', async () => {
    const { adapter, calls } = setup();
    await adapter.enable();
    adapter.disable();
    const count = calls().length;
    expect(calls()[count - 1]).toEqual(['consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' }]);
    adapter.track('plan_viewed', {});
    expect(calls()).toHaveLength(count);
  });

  it('reuses an existing clarity global instead of replacing it', async () => {
    const existing = vi.fn();
    window.clarity = existing;
    const { adapter } = setup();
    await adapter.enable();
    expect(window.clarity).toBe(existing);
    expect(existing).toHaveBeenCalledWith('consentv2', expect.anything());
  });

  it('rejects malformed project ids to avoid script injection', () => {
    expect(() => new ClarityAdapter({ projectId: 'abc"/><script>' })).toThrow('Invalid Clarity project id');
  });
});
```

## apps/uce/src/analytics/clarityAdapter.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/analytics/clarityAdapter.ts`.

```typescript
import { loadScript, ScriptLoader } from '../lib/scriptLoader';
import { DEFAULT_PII_SELECTORS, observeMarking, sanitizeProps } from './pii';
import { AnalyticsAdapter, AnalyticsIdentity, AnalyticsProps, PageProperties } from './types';

/**
 * Microsoft Clarity adapter.
 *  - Installs the standard queueing stub so calls made before the tag loads are kept.
 *  - Signals consent through the Consent API v2 (analytics granted, ads denied).
 *  - Identifies with a hashed key only; Clarity's friendly name is never set.
 *  - Masks PII elements with data-clarity-mask, on top of Clarity's default masking.
 */

export type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

export interface ClarityAdapterOptions {
  projectId: string;
  maskSelectors?: string[];
  win?: Window;
  loader?: ScriptLoader;
  nonce?: string;
}

const SCRIPT_ID = 'uce-clarity';
const MAX_TAG_LENGTH = 255;

export class ClarityAdapter implements AnalyticsAdapter {
  readonly name = 'clarity';
  readonly category = 'analytics' as const;
  private active = false;
  private stopMasking?: () => void;
  private readonly win: Window;
  private readonly loader: ScriptLoader;

  constructor(private readonly options: ClarityAdapterOptions) {
    if (!/^[a-z0-9]+$/i.test(options.projectId)) throw new Error('Invalid Clarity project id');
    this.win = options.win ?? window;
    this.loader = options.loader ?? loadScript;
  }

  async enable(): Promise<void> {
    if (this.active) return;
    this.installStub();
    this.call('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
    this.stopMasking = observeMarking(this.win.document.body, this.options.maskSelectors ?? DEFAULT_PII_SELECTORS, (el) =>
      el.setAttribute('data-clarity-mask', 'true'),
    );
    this.active = true;
    await this.loader(`https://www.clarity.ms/tag/${this.options.projectId}`, { id: SCRIPT_ID, nonce: this.options.nonce });
  }

  disable(): void {
    if (!this.active) return;
    // Denying analytics storage makes Clarity delete its cookies and stop recording.
    this.call('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    this.stopMasking?.();
    this.active = false;
  }

  identify(identity: AnalyticsIdentity): void {
    if (!this.active) return;
    this.call('identify', identity.userKey);
    this.setTag('segment', identity.segment);
    this.setTag('roles', identity.roles.join(','));
  }

  track(event: string, props: AnalyticsProps): void {
    if (!this.active) return;
    this.call('event', event);
    for (const [key, value] of Object.entries(sanitizeProps(props))) {
      if (value !== null && value !== undefined) this.setTag(`${event}.${key}`, String(value));
    }
  }

  page(props: PageProperties): void {
    if (!this.active) return;
    this.setTag('page_type', props.pageType);
    if (props.portal) this.setTag('portal', props.portal);
  }

  private setTag(key: string, value: string): void {
    this.call('set', key.slice(0, MAX_TAG_LENGTH), value.slice(0, MAX_TAG_LENGTH));
  }

  private installStub(): void {
    if (this.win.clarity) return;
    const stub: ClarityFn = (...args: unknown[]) => {
      (stub.q = stub.q ?? []).push(args);
    };
    this.win.clarity = stub;
  }

  private call(...args: unknown[]): void {
    this.win.clarity?.(...args);
  }
}
```

## apps/uce/src/analytics/fullstoryAdapter.test.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/analytics/fullstoryAdapter.test.ts`.

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FullStoryAdapter } from './fullstoryAdapter';

function setup() {
  const loader = vi.fn(async () => undefined);
  const adapter = new FullStoryAdapter({ orgId: 'o-ABC123-na1', loader });
  const queue = () => window.FS?.q ?? [];
  return { adapter, loader, queue };
}

describe('FullStoryAdapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input type="email" id="email" /><textarea id="notes"></textarea><div data-account-number id="acc">ACC-1</div>';
    delete window._fs_org;
  });

  it('does not touch globals or load the snippet until enabled', () => {
    const { adapter, loader } = setup();
    adapter.track('plan_viewed', {});
    expect(window.FS).toBeUndefined();
    expect(window._fs_org).toBeUndefined();
    expect(loader).not.toHaveBeenCalled();
  });

  it('configures the snippet globals and loads fs.js on enable', async () => {
    const { adapter, loader } = setup();
    await adapter.enable();
    expect(window._fs_org).toBe('o-ABC123-na1');
    expect(window._fs_namespace).toBe('FS');
    expect(window._fs_host).toBe('fullstory.com');
    expect(loader).toHaveBeenCalledWith('https://edge.fullstory.com/s/fs.js', expect.objectContaining({ id: 'uce-fullstory' }));
  });

  it('applies privacy exclusions and masks', async () => {
    const { adapter } = setup();
    await adapter.enable();
    expect(document.getElementById('email')).toHaveClass('fs-exclude');
    expect(document.getElementById('acc')).toHaveClass('fs-exclude');
    expect(document.getElementById('notes')).toHaveClass('fs-mask');
  });

  it('uses the v2 API for identity, events and page properties', async () => {
    const { adapter, queue } = setup();
    await adapter.enable();
    adapter.identify({ userKey: 'hash-1', accountKey: 'hash-acc', segment: 'CONSUMER', roles: ['CONSUMER'] });
    adapter.track('referral_shared', { channel: 'email', 'bad-key': 1, phone: '07700900123', empty: null });
    adapter.page({ path: '/portals/uconnect', pageType: 'portals/uconnect', portal: 'uconnect' });

    expect(queue()).toEqual([
      ['setIdentity', { uid: 'hash-1', properties: { segment: 'CONSUMER', roles: 'CONSUMER', accountKey: 'hash-acc' } }],
      ['trackEvent', { name: 'referral_shared', properties: { channel: 'email', bad_key: 1 } }],
      ['setProperties', { type: 'page', properties: { pageName: 'portals/uconnect', portal: 'uconnect' } }],
    ]);
  });

  it('shuts down on revoke and restarts on re-grant without reloading the script', async () => {
    const { adapter, loader, queue } = setup();
    await adapter.enable();
    adapter.disable();
    expect(queue().at(-1)).toEqual(['shutdown', undefined]);
    adapter.track('ignored_event', {});
    expect(queue().some((c) => c[0] === 'trackEvent')).toBe(false);

    await adapter.enable();
    expect(queue().at(-1)).toEqual(['restart', undefined]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed org ids', () => {
    expect(() => new FullStoryAdapter({ orgId: 'x"; alert(1)' })).toThrow('Invalid FullStory org id');
  });
});
```

## apps/uce/src/analytics/fullstoryAdapter.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/analytics/fullstoryAdapter.ts`.

```typescript
import { loadScript, ScriptLoader } from '../lib/scriptLoader';
import { DEFAULT_PII_SELECTORS, observeMarking, sanitizeProps } from './pii';
import { AnalyticsAdapter, AnalyticsIdentity, AnalyticsProps, PageProperties } from './types';

/**
 * FullStory (Browser API v2) adapter.
 *  - Sets the _fs_* globals and a queueing FS() stub exactly as the official snippet does.
 *  - Privacy exclusions: PII elements get .fs-exclude (never captured), and
 *    free-text inputs get .fs-mask (structure captured, text masked).
 *  - On revoke calls FS('shutdown'); a later re-grant calls FS('restart').
 */

export type FsFn = ((operation: string, payload?: unknown) => unknown) & { q?: unknown[][] };

declare global {
  interface Window {
    FS?: FsFn;
    _fs_host?: string;
    _fs_script?: string;
    _fs_org?: string;
    _fs_namespace?: string;
  }
}

export interface FullStoryAdapterOptions {
  orgId: string;
  host?: string;
  excludeSelectors?: string[];
  maskSelectors?: string[];
  win?: Window;
  loader?: ScriptLoader;
  nonce?: string;
}

const SCRIPT_ID = 'uce-fullstory';
const DEFAULT_MASK_SELECTORS = ['textarea', 'input[type="text"]', '[data-free-text]'];

/** FullStory custom properties must be flat scalars; null/undefined are dropped. */
function toFsProperties(props: AnalyticsProps): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(sanitizeProps(props))) {
    if (value !== null && value !== undefined) out[key.replace(/[^A-Za-z0-9_]/g, '_')] = value;
  }
  return out;
}

export class FullStoryAdapter implements AnalyticsAdapter {
  readonly name = 'fullstory';
  readonly category = 'analytics' as const;
  private active = false;
  private everStarted = false;
  private cleanups: Array<() => void> = [];
  private readonly win: Window;
  private readonly loader: ScriptLoader;

  constructor(private readonly options: FullStoryAdapterOptions) {
    if (!/^[A-Za-z0-9-]+$/.test(options.orgId)) throw new Error('Invalid FullStory org id');
    this.win = options.win ?? window;
    this.loader = options.loader ?? loadScript;
  }

  async enable(): Promise<void> {
    if (this.active) return;
    this.applyPrivacyClasses();
    this.active = true;
    if (this.everStarted && this.win.FS) {
      this.win.FS('restart');
      return;
    }
    const host = this.options.host ?? 'fullstory.com';
    this.win._fs_host = host;
    this.win._fs_script = 'edge.fullstory.com/s/fs.js';
    this.win._fs_org = this.options.orgId;
    this.win._fs_namespace = 'FS';
    if (!this.win.FS) {
      const stub: FsFn = (operation, payload) => {
        (stub.q = stub.q ?? []).push([operation, payload]);
        return undefined;
      };
      this.win.FS = stub;
    }
    this.everStarted = true;
    await this.loader(`https://${this.win._fs_script}`, { id: SCRIPT_ID, nonce: this.options.nonce, attributes: { 'data-org': this.options.orgId } });
  }

  disable(): void {
    if (!this.active) return;
    this.win.FS?.('shutdown');
    this.cleanups.forEach((stop) => stop());
    this.cleanups = [];
    this.active = false;
  }

  identify(identity: AnalyticsIdentity): void {
    if (!this.active) return;
    this.win.FS?.('setIdentity', {
      uid: identity.userKey,
      properties: { segment: identity.segment, roles: identity.roles.join(','), ...(identity.accountKey ? { accountKey: identity.accountKey } : {}) },
    });
  }

  track(event: string, props: AnalyticsProps): void {
    if (!this.active) return;
    this.win.FS?.('trackEvent', { name: event, properties: toFsProperties(props) });
  }

  page(props: PageProperties): void {
    if (!this.active) return;
    this.win.FS?.('setProperties', {
      type: 'page',
      properties: { pageName: props.pageType, ...(props.portal ? { portal: props.portal } : {}) },
    });
  }

  private applyPrivacyClasses(): void {
    const body = this.win.document.body;
    this.cleanups.push(
      observeMarking(body, this.options.excludeSelectors ?? DEFAULT_PII_SELECTORS, (el) => el.classList.add('fs-exclude')),
      observeMarking(body, this.options.maskSelectors ?? DEFAULT_MASK_SELECTORS, (el) => el.classList.add('fs-mask')),
    );
  }
}
```

## apps/uce/src/analytics/pii.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/analytics/pii.ts`.

```typescript
import { AnalyticsProps } from './types';

/**
 * PII guards applied before anything reaches a third-party analytics vendor:
 * sensitive keys are dropped, sensitive values are redacted, identifiers are
 * replaced with salted SHA-256 hashes, and DOM elements holding personal data
 * are tagged so session replay masks or excludes them.
 */

const SENSITIVE_KEY = /(e-?mail|phone|mobile|name|address|postcode|zip|password|token|secret|iban|card|sort.?code|dob|birth)/i;

const VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]'],
  [/\b(?:\d[ -]?){12,18}\d\b/g, '[NUMBER]'],
  [/(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\b/g, '[PHONE]'],
  [/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, '[POSTCODE]'],
  [/\b(?:ACC|INV|TKT|ORD)-\d{6,10}\b/gi, '[ID]'],
];

export function redactValue(value: string): string {
  return VALUE_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

export function sanitizeProps(props: AnalyticsProps): AnalyticsProps {
  const clean: AnalyticsProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (SENSITIVE_KEY.test(key) || value === undefined) continue;
    clean[key] = typeof value === 'string' ? redactValue(value).slice(0, 255) : value;
  }
  return clean;
}

export async function hashIdentifier(value: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${value}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Elements that always hold personal data in Uniti portals. */
export const DEFAULT_PII_SELECTORS = [
  '[data-pii]',
  'input[type="email"]',
  'input[type="tel"]',
  'input[type="password"]',
  'input[autocomplete^="cc-"]',
  '[data-account-number]',
];

/**
 * Applies a marker to every element matching the selectors now and as the DOM
 * changes (portals render asynchronously). Returns a disconnect function.
 */
export function observeMarking(root: ParentNode & Node, selectors: string[], mark: (el: Element) => void): () => void {
  const selector = selectors.join(',');
  if (!selector) return () => undefined;
  const apply = (scope: ParentNode) => scope.querySelectorAll(selector).forEach(mark);
  apply(root);
  if (typeof MutationObserver === 'undefined') return () => undefined;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches(selector)) mark(node);
        apply(node);
      });
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
```

## apps/uce/src/analytics/types.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/analytics/types.ts`.

```typescript
import { Role, Segment } from '../auth/roles';
import { ConsentCategory } from '../consent/consentModel';

export type AnalyticsValue = string | number | boolean | null | undefined;
export type AnalyticsProps = Record<string, AnalyticsValue>;

/** Pseudonymous identity: never a raw user id, email or account number. */
export interface AnalyticsIdentity {
  userKey: string;
  accountKey?: string;
  segment: Segment;
  roles: Role[];
}

export interface PageProperties {
  path: string;
  pageType: string;
  portal?: string;
}

/**
 * Contract every vendor adapter implements. Adapters must be inert (no network,
 * no cookies, no globals) until enable() is called, which only happens once the
 * consent category they declare is granted.
 */
export interface AnalyticsAdapter {
  readonly name: string;
  readonly category: ConsentCategory;
  enable(): Promise<void>;
  disable(): void;
  identify(identity: AnalyticsIdentity): void;
  track(event: string, props: AnalyticsProps): void;
  page(props: PageProperties): void;
}
```

## apps/uce/src/api/ApiProvider.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/api/ApiProvider.tsx`.

```tsx
import { createContext, ReactNode, useContext, useMemo, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { ApiClient } from './apiClient';

export const ApiContext = createContext<ApiClient | undefined>(undefined);

interface ApiProviderProps {
  baseUrl: string;
  timeoutMs: number;
  children: ReactNode;
}

/** One ApiClient for the whole shell, always using the current token and active account. */
export function ApiProvider({ baseUrl, timeoutMs, children }: ApiProviderProps) {
  const auth = useAuth();
  const authRef = useRef(auth);
  authRef.current = auth;

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl,
        timeoutMs,
        getAccessToken: () => authRef.current.getAccessToken(),
        getAccountId: () => authRef.current.activeAccountId,
        onUnauthorized: () => void authRef.current.login(),
      }),
    [baseUrl, timeoutMs],
  );

  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used inside <ApiProvider>');
  return ctx;
}
```

## apps/uce/src/api/apiClient.test.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/api/apiClient.test.ts`.

```typescript
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../test/fakes';
import { ApiClient, buildUrl } from './apiClient';
import { ApiError, userMessage } from './problem';

function client(fetchImpl: typeof fetch, overrides: Partial<ConstructorParameters<typeof ApiClient>[0]> = {}) {
  return new ApiClient({
    baseUrl: '/api/v1',
    timeoutMs: 1000,
    getAccessToken: async () => 'tok-1',
    getAccountId: () => 'ACC-12345678',
    fetchImpl,
    sleep: async () => undefined,
    ...overrides,
  });
}

describe('ApiClient', () => {
  it('sends auth, account and correlation headers and parses JSON', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }));
    const result = await client(fetchImpl).get('/notifications', { query: { page: 1, pageSize: 20, unreadOnly: undefined } });

    expect(result).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/notifications?page=1&pageSize=20');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-1');
    expect(headers['X-Account-Id']).toBe('ACC-12345678');
    expect(headers['X-Correlation-Id']).toMatch(/^uce-[0-9a-f-]{36}$/);
  });

  it('surfaces RFC 7807 problems with field errors and the server correlation id', async () => {
    const problem = { type: 'https://errors.uniti.example/x/validation-failed', title: 'Request validation failed', status: 400, errors: [{ field: 'text', message: 'must not be empty' }] };
    const fetchImpl = vi.fn(async () => jsonResponse(problem, { status: 400, contentType: 'application/problem+json', headers: { 'X-Correlation-Id': 'srv-123' } }));

    const error = await client(fetchImpl).post('/consents', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.correlationId).toBe('srv-123');
    expect(apiError.fieldErrors()).toEqual({ text: 'must not be empty' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('wraps non-problem error bodies (e.g. proxy HTML) into a synthetic problem', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 404, headers: { 'Content-Type': 'text/html' } }));
    const error = (await client(fetchImpl).get('/search').catch((e: unknown) => e)) as ApiError;
    expect(error.problem).toMatchObject({ type: 'about:blank', status: 404, instance: '/search' });
  });

  it('retries idempotent requests on 503 with the same correlation id', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ title: 'Service unavailable', status: 503 }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(client(fetchImpl).get('/feature-flags')).resolves.toEqual({ ok: true });
    const ids = fetchImpl.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers['X-Correlation-Id']);
    expect(ids[0]).toBe(ids[1]);
  });

  it('does not retry non-idempotent POSTs unless an idempotency key is supplied', async () => {
    const unavailable = () => jsonResponse({ title: 'Service unavailable', status: 503 }, { status: 503 });
    const plain = vi.fn(async () => unavailable());
    await expect(client(plain).post('/referrals/token')).rejects.toBeInstanceOf(ApiError);
    expect(plain).toHaveBeenCalledTimes(1);

    const keyed = vi.fn(async () => unavailable());
    await expect(client(keyed).post('/orders', {}, { idempotencyKey: 'k-1' })).rejects.toBeInstanceOf(ApiError);
    expect(keyed).toHaveBeenCalledTimes(3);
    expect((keyed.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }])[1].headers['Idempotency-Key']).toBe('k-1');
  });

  it('notifies on 401 so the shell can re-authenticate', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse({ title: 'Unauthorized', status: 401 }, { status: 401 }));
    await expect(client(fetchImpl, { onUnauthorized }).get('/notifications')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('maps network failures to status 0 and keeps the message user-safe', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await client(fetchImpl, { retries: 0 }).get('/search').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0 });
    expect(userMessage(error)).toBe('We could not reach Uniti. Check your connection and try again.');
  });

  it('omits the Authorization header for anonymous calls and handles 204', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(client(fetchImpl, { getAccessToken: async () => undefined }).post('/notifications/read-all')).resolves.toBeUndefined();
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }])[1].headers.Authorization).toBeUndefined();
  });

  it('builds URLs without double slashes', () => {
    expect(buildUrl('/api/v1', 'search', { q: 'a b' })).toBe('/api/v1/search?q=a+b');
  });
});
```

## apps/uce/src/api/apiClient.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/api/apiClient.ts`.

```typescript
import { ApiError, toProblem } from './problem';

/**
 * Browser API client for the Uniti /api/v1 surface.
 *  - Bearer token from the auth session on every call (refreshed by the provider).
 *  - X-Correlation-Id minted per logical request and reused across retries, so
 *    Kibana/Dynatrace can join the browser call with downstream service logs.
 *  - X-Account-Id carries the active account for multi-account business users.
 *  - Errors always surface as ApiError carrying RFC 7807 problem details.
 *  - Idempotent methods are retried on 502/503/504 and network failures.
 */

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Idempotency-Key for POSTs that create resources. */
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiClientOptions {
  baseUrl: string;
  timeoutMs: number;
  getAccessToken: () => Promise<string | undefined>;
  getAccountId?: () => string | undefined;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const IDEMPOTENT = new Set(['GET', 'PUT', 'DELETE']);

export function newCorrelationId(): string {
  return `uce-${crypto.randomUUID()}`;
}

export function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.append(key, String(value));
  }
  const qs = params.toString();
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}${qs ? `?${qs}` : ''}`;
}

export class ApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  put<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  private async request<T>(method: string, path: string, body: unknown, options: RequestOptions): Promise<T> {
    const url = buildUrl(this.options.baseUrl, path, options.query);
    const correlationId = newCorrelationId();
    const maxAttempts = IDEMPOTENT.has(method) || options.idempotencyKey ? (this.options.retries ?? 2) + 1 : 1;

    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.once<T>(method, url, path, body, options, correlationId);
      } catch (error) {
        const retry = error instanceof ApiError && error.retryable && error.status !== 429 && attempt < maxAttempts && !options.signal?.aborted;
        if (!retry) throw error;
        await this.sleep(Math.min(2000, 200 * 2 ** (attempt - 1)));
      }
    }
  }

  private async once<T>(method: string, url: string, path: string, body: unknown, options: RequestOptions, correlationId: string): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json, application/problem+json', 'X-Correlation-Id': correlationId, ...options.headers };
    const token = await this.options.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const accountId = this.options.getAccountId?.();
    if (accountId) headers['X-Account-Id'] = accountId;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.options.timeoutMs);
    const onCallerAbort = () => timeout.abort();
    options.signal?.addEventListener('abort', onCallerAbort);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timeout.signal,
        credentials: 'same-origin',
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const timedOut = timeout.signal.aborted;
      throw new ApiError(
        { type: 'about:blank', title: timedOut ? 'Request timed out' : 'Network error', status: 0, instance: path, correlationId },
        correlationId,
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onCallerAbort);
    }

    const responseCorrelation = response.headers.get('X-Correlation-Id') ?? correlationId;
    if (response.status === 204) return undefined as T;
    const payload = await readBody(response);

    if (!response.ok) {
      if (response.status === 401) this.options.onUnauthorized?.();
      const problem = toProblem(response.status, response.statusText, payload, path);
      throw new ApiError({ ...problem, correlationId: problem.correlationId ?? responseCorrelation }, responseCorrelation);
    }
    return payload as T;
  }
}

async function readBody(response: Response): Promise<unknown> {
  const type = response.headers.get('Content-Type') ?? '';
  if (!type.includes('json')) {
    const text = await response.text();
    return text === '' ? undefined : text;
  }
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
```

## apps/uce/src/api/problem.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/api/problem.ts`.

```typescript
/**
 * RFC 7807 problem details as returned by every Uniti API, plus the error type
 * the API client throws so UI code can branch on status / field errors.
 */

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  errors?: Array<{ field: string; message: string }>;
}

export class ApiError extends Error {
  constructor(
    readonly problem: ProblemDetails,
    readonly correlationId: string,
  ) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  get status(): number {
    return this.problem.status;
  }

  /** Field-level validation messages keyed by field name, for form binding. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.problem.errors ?? []).map((e) => [e.field, e.message]));
  }

  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 502;
  }
}

function isProblem(value: unknown): value is ProblemDetails {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.title === 'string' && typeof v.status === 'number';
}

/**
 * Builds problem details from any HTTP error response. Non-conforming bodies
 * (HTML error pages from a proxy, empty bodies) are wrapped into a synthetic
 * problem so callers only ever handle one shape.
 */
export function toProblem(status: number, statusText: string, body: unknown, instance: string): ProblemDetails {
  if (isProblem(body)) return { ...body, type: body.type ?? 'about:blank' };
  return {
    type: 'about:blank',
    title: statusText || httpTitle(status),
    status,
    instance,
  };
}

function httpTitle(status: number): string {
  if (status === 401) return 'Unauthorized';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not found';
  if (status === 429) return 'Too many requests';
  if (status >= 500) return 'Service unavailable';
  return 'Request failed';
}

/** A user-presentable message; never leaks internal detail for server errors. */
export function userMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'We could not reach Uniti. Check your connection and try again.';
    if (error.status >= 500) return 'Something went wrong on our side. Please try again shortly.';
    if (error.status === 429) return 'You are doing that too often. Please wait a moment and try again.';
    return error.problem.detail ?? error.problem.title;
  }
  return 'Something went wrong. Please try again.';
}
```

## apps/uce/src/auth/AuthProvider.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/auth/AuthProvider.tsx`.

```tsx
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { readJson, remove, safeStorage, writeJson } from '../lib/storage';
import { AuthTransaction, OidcClient, Session, sessionFromTokens, SessionUser } from './oidc';
import { hasAnyRole, Role } from './roles';

/**
 * Unified auth/session context for every portal hosted by the shell.
 * Tokens live in sessionStorage (cleared with the tab); refresh is single-flight
 * so concurrent API calls never race two refresh-token grants.
 */

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user?: SessionUser;
  activeAccountId?: string;
  login(returnTo?: string): Promise<void>;
  /** Completes the redirect callback; resolves to the path to return to. */
  completeLogin(search: string): Promise<string>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | undefined>;
  setActiveAccount(accountId: string): void;
  hasRole(...roles: Role[]): boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_KEY = 'uce.session';
const TX_KEY = 'uce.oidc.tx';
const ACCOUNT_KEY = 'uce.activeAccount';
/** Refresh this long before expiry to absorb clock skew and in-flight latency. */
const REFRESH_SKEW_MS = 60_000;

const isSession = (v: unknown): v is Session =>
  !!v && typeof v === 'object' && typeof (v as Session).tokens?.accessToken === 'string' && typeof (v as Session).user?.userId === 'string';
const isTransaction = (v: unknown): v is AuthTransaction => !!v && typeof (v as AuthTransaction).state === 'string';
const isString = (v: unknown): v is string => typeof v === 'string';

export function resolveActiveAccount(user: SessionUser, preferred: string | undefined): string {
  return preferred && user.accounts.some((a) => a.accountId === preferred) ? preferred : user.defaultAccountId;
}

interface AuthProviderProps {
  client: OidcClient;
  children: ReactNode;
  navigate?: (url: string) => void;
  now?: () => number;
}

export function AuthProvider({ client, children, navigate = (url) => window.location.assign(url), now = Date.now }: AuthProviderProps) {
  const storage = safeStorage('sessionStorage');
  const [session, setSession] = useState<Session | undefined>();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [activeAccountId, setActiveAccountId] = useState<string | undefined>();
  const sessionRef = useRef<Session | undefined>();
  const refreshing = useRef<Promise<string | undefined> | null>(null);

  const adopt = useCallback(
    (next: Session | undefined) => {
      sessionRef.current = next;
      setSession(next);
      if (next) {
        writeJson(storage, SESSION_KEY, next);
        setActiveAccountId(resolveActiveAccount(next.user, readJson(storage, ACCOUNT_KEY, isString)));
        setStatus('authenticated');
      } else {
        remove(storage, SESSION_KEY);
        remove(storage, ACCOUNT_KEY);
        setActiveAccountId(undefined);
        setStatus('anonymous');
      }
    },
    [storage],
  );

  useEffect(() => {
    const stored = readJson(storage, SESSION_KEY, isSession);
    const usable = stored && (stored.tokens.expiresAt > now() || stored.tokens.refreshToken);
    adopt(usable ? stored : undefined);
  }, [adopt, now, storage]);

  const getAccessToken = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return undefined;
    if (current.tokens.expiresAt - REFRESH_SKEW_MS > now()) return current.tokens.accessToken;
    if (!current.tokens.refreshToken) {
      adopt(undefined);
      return undefined;
    }
    refreshing.current ??= client
      .refresh(current.tokens.refreshToken)
      .then((tokens) => {
        const next = sessionFromTokens(tokens);
        adopt(next);
        return next.tokens.accessToken;
      })
      .catch(() => {
        adopt(undefined);
        return undefined;
      })
      .finally(() => {
        refreshing.current = null;
      });
    return refreshing.current;
  }, [adopt, client, now]);

  const login = useCallback(
    async (returnTo = `${window.location.pathname}${window.location.search}`) => {
      const { url, transaction } = await client.beginLogin(returnTo);
      writeJson(storage, TX_KEY, transaction);
      navigate(url);
    },
    [client, navigate, storage],
  );

  const completeLogin = useCallback(
    async (search: string) => {
      const transaction = readJson(storage, TX_KEY, isTransaction);
      remove(storage, TX_KEY);
      const tokens = await client.completeLogin(search, transaction);
      adopt(sessionFromTokens(tokens));
      // Only same-origin relative paths are honoured to prevent open redirects.
      const target = transaction?.returnTo ?? '/';
      return target.startsWith('/') && !target.startsWith('//') ? target : '/';
    },
    [adopt, client, storage],
  );

  const logout = useCallback(async () => {
    const idToken = sessionRef.current?.tokens.idToken;
    adopt(undefined);
    const url = await client.logoutUrl(idToken).catch(() => undefined);
    navigate(url ?? '/');
  }, [adopt, client, navigate]);

  const setActiveAccount = useCallback(
    (accountId: string) => {
      const user = sessionRef.current?.user;
      if (!user || !user.accounts.some((a) => a.accountId === accountId)) return;
      writeJson(storage, ACCOUNT_KEY, accountId);
      setActiveAccountId(accountId);
    },
    [storage],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user,
      activeAccountId,
      login,
      completeLogin,
      logout,
      getAccessToken,
      setActiveAccount,
      hasRole: (...roles) => !!session && hasAnyRole(session.user.roles, roles),
    }),
    [activeAccountId, completeLogin, getAccessToken, login, logout, session, setActiveAccount, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
```

## apps/uce/src/auth/RequireAuth.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/auth/RequireAuth.tsx`.

```tsx
import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Role } from './roles';

interface RequireAuthProps {
  roles?: Role[];
  children: ReactNode;
}

/**
 * Route guard: sends anonymous visitors to sign-in (returning to the same path)
 * and shows an explanation, not a blank page, when the role is insufficient.
 * Authorisation is still enforced by every API; this only shapes navigation.
 */
export function RequireAuth({ roles = [], children }: RequireAuthProps) {
  const { status, login, hasRole } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (status === 'anonymous') void login(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search, login, status]);

  if (status !== 'authenticated') {
    return (
      <p role="status" className="uce-loading">
        Signing you in...
      </p>
    );
  }
  if (roles.length > 0 && !hasRole(...roles)) {
    return (
      <section className="uce-forbidden" aria-labelledby="forbidden-title">
        <h1 id="forbidden-title">You don't have access to this area</h1>
        <p>Ask your account administrator to grant you access, or switch to an account where you have the right role.</p>
      </section>
    );
  }
  return <>{children}</>;
}
```

## apps/uce/src/auth/oidc.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/auth/oidc.ts`.

```typescript
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
```

## apps/uce/src/auth/roles.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/auth/roles.ts`.

```typescript
/** Platform roles from CONVENTIONS.md; enforced server-side, used here only to shape the UI. */
export const ROLES = [
  'CONSUMER',
  'BUSINESS_ADMIN',
  'BUSINESS_USER',
  'PARTNER_ADMIN',
  'PARTNER_AGENT',
  'WHOLESALE_BUYER',
  'SUPPORT_AGENT',
] as const;

export type Role = (typeof ROLES)[number];

export type Segment = 'CONSUMER' | 'BUSINESS' | 'PARTNER' | 'WHOLESALE' | 'INTERNAL';

export function parseRoles(raw: unknown): Role[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((r): r is Role => (ROLES as readonly string[]).includes(r as string)))];
}

export function hasAnyRole(roles: readonly Role[], required: readonly Role[]): boolean {
  return required.length === 0 || roles.some((r) => required.includes(r));
}

/** Coarse audience segment used for analytics and portal defaults (most privileged wins). */
export function segmentOf(roles: readonly Role[]): Segment {
  if (roles.includes('SUPPORT_AGENT')) return 'INTERNAL';
  if (roles.includes('PARTNER_ADMIN') || roles.includes('PARTNER_AGENT')) return 'PARTNER';
  if (roles.includes('WHOLESALE_BUYER')) return 'WHOLESALE';
  if (roles.includes('BUSINESS_ADMIN') || roles.includes('BUSINESS_USER')) return 'BUSINESS';
  return 'CONSUMER';
}

/** Roles that may act on more than one billing account. */
export const MULTI_ACCOUNT_ROLES: Role[] = ['BUSINESS_ADMIN', 'BUSINESS_USER', 'PARTNER_ADMIN', 'PARTNER_AGENT', 'SUPPORT_AGENT'];
```

## apps/uce/src/components/ErrorBoundary.test.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/components/ErrorBoundary.test.tsx`.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/problem';
import { ErrorBoundary } from './ErrorBoundary';

function Thrower({ error }: { error?: Error }) {
  if (error) throw error;
  return <p>Portal content</p>;
}

describe('ErrorBoundary', () => {
  it('contains a render failure and reports it without PII', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Thrower error={new TypeError('cannot read properties of undefined')} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/quote reference ui-[0-9a-f]{8}/);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: 'TypeError', reference: expect.stringMatching(/^ui-/) }));
  });

  it('uses the API correlation id as the support reference', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new ApiError({ type: 'about:blank', title: 'Service unavailable', status: 503 }, 'uce-corr-42');
    render(
      <ErrorBoundary>
        <Thrower error={error} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('uce-corr-42');
  });

  it('recovers via "Try again" once the cause is gone, and on resetKey change', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Harness() {
      const [broken, setBroken] = useState(true);
      const [key, setKey] = useState('/a');
      return (
        <>
          <button onClick={() => setBroken(false)}>fix</button>
          <button onClick={() => setKey('/b')}>navigate</button>
          <button onClick={() => setBroken(true)}>break</button>
          <ErrorBoundary resetKey={key}>
            <Thrower error={broken ? new Error('boom') : undefined} />
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByText('fix'));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Portal content')).toBeInTheDocument();

    await userEvent.click(screen.getByText('break'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByText('fix'));
    await userEvent.click(screen.getByText('navigate'));
    expect(screen.getByText('Portal content')).toBeInTheDocument();
  });
});
```
