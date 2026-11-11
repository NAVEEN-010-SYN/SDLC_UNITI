# UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory): apps/uce/src (part 2 of 3)

- **Application:** UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory)
- **Tech stack:** React + TypeScript
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 22

## Files

- `apps/uce/src/components/ErrorBoundary.tsx` (60 lines)
- `apps/uce/src/config.ts` (106 lines)
- `apps/uce/src/consent/ConsentBanner.test.tsx` (80 lines)
- `apps/uce/src/consent/ConsentBanner.tsx` (76 lines)
- `apps/uce/src/consent/ConsentProvider.tsx` (99 lines)
- `apps/uce/src/consent/consentModel.test.ts` (76 lines)
- `apps/uce/src/consent/consentModel.ts` (115 lines)
- `apps/uce/src/flags/featureFlags.test.tsx` (79 lines)
- `apps/uce/src/flags/featureFlags.tsx` (106 lines)
- `apps/uce/src/lib/money.ts` (24 lines)
- `apps/uce/src/lib/scriptLoader.ts` (44 lines)
- `apps/uce/src/lib/storage.ts` (40 lines)
- `apps/uce/src/main.tsx` (22 lines)
- `apps/uce/src/notifications/NotificationCentre.tsx` (88 lines)
- `apps/uce/src/notifications/notifications.test.tsx` (75 lines)
- `apps/uce/src/notifications/notifications.ts` (82 lines)
- `apps/uce/src/pages/pages.tsx` (69 lines)
- `apps/uce/src/referrals/ReferralPage.tsx` (156 lines)
- `apps/uce/src/referrals/referralService.test.ts` (129 lines)
- `apps/uce/src/referrals/referralService.ts` (201 lines)
- `apps/uce/src/search/GlobalSearch.test.tsx` (83 lines)
- `apps/uce/src/search/GlobalSearch.tsx` (139 lines)

## apps/uce/src/components/ErrorBoundary.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/components/ErrorBoundary.tsx`.

```tsx
import { Component, ErrorInfo, ReactNode } from 'react';
import { ApiError } from '../api/problem';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Called once per caught error, e.g. to log or track a non-PII "ui_error" event. */
  onError?: (report: { name: string; reference: string; componentStack?: string }) => void;
  /** Changing this value (e.g. the route path) clears the error. */
  resetKey?: unknown;
  fallback?: (props: { reference: string; reset: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
  error?: Error;
  reference?: string;
}

/**
 * Contains render failures to the area that failed (a portal frame, a widget)
 * instead of blanking the shell. The reference shown to the customer is the
 * API correlation id when available, so support can find the matching logs.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const reference = error instanceof ApiError ? error.correlationId : `ui-${crypto.randomUUID().slice(0, 8)}`;
    return { error, reference };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const reference = this.state.reference ?? 'unknown';
    console.error(JSON.stringify({ level: 'error', message: 'ui render failure', name: error.name, reference }));
    this.props.onError?.({ name: error.name, reference, componentStack: info.componentStack ?? undefined });
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.reset();
  }

  reset = (): void => {
    this.setState({ error: undefined, reference: undefined });
  };

  render(): ReactNode {
    const { error, reference } = this.state;
    if (!error || !reference) return this.props.children;
    if (this.props.fallback) return this.props.fallback({ reference, reset: this.reset });
    return (
      <section role="alert" className="uce-error">
        <h2>Something went wrong</h2>
        <p>This part of the page couldn't be displayed. If it keeps happening, contact support and quote reference {reference}.</p>
        <button type="button" onClick={this.reset}>
          Try again
        </button>
      </section>
    );
  }
}
```

## apps/uce/src/config.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/config.ts`.

```typescript
/**
 * Typed runtime configuration read from Vite env variables (see .env.example).
 * Fails fast on missing required values so a misconfigured build never ships
 * half-working auth.
 */

export type PortalId = 'ecom' | 'uconnect' | 'gokinetic-business' | 'partner' | 'sdwan' | 'hosted-services' | 'wholesale';

export interface UceConfig {
  apiBaseUrl: string;
  apiTimeoutMs: number;
  oidc: {
    issuer: string;
    clientId: string;
    redirectUri: string;
    postLogoutRedirectUri: string;
    scope: string;
  };
  consentPolicyVersion: string;
  analytics: {
    clarityProjectId?: string;
    fullstoryOrgId?: string;
    fullstoryHost: string;
    idSalt: string;
  };
  referrals: {
    tenantAlias?: string;
    widgetType: string;
    shareBaseUrl: string;
  };
  portalUrls: Partial<Record<PortalId, string>>;
  flagOverrides: Record<string, boolean>;
}

export class ConfigError extends Error {}

type Env = Record<string, string | boolean | undefined>;

function str(env: Env, key: string): string | undefined {
  const value = env[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** Parses "a=true,b=false" into a flag map; unknown values are rejected. */
export function parseFlagOverrides(raw: string | undefined): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (!raw) return result;
  for (const pair of raw.split(',')) {
    const [key, value] = pair.split('=').map((s) => s.trim());
    if (!key) continue;
    if (value !== 'true' && value !== 'false') throw new ConfigError(`VITE_FEATURE_FLAGS: "${key}" must be true or false`);
    result[key] = value === 'true';
  }
  return result;
}

const PORTAL_ENV: Record<PortalId, string> = {
  ecom: 'VITE_PORTAL_ECOM_URL',
  uconnect: 'VITE_PORTAL_UCONNECT_URL',
  'gokinetic-business': 'VITE_PORTAL_GOKINETIC_BUSINESS_URL',
  partner: 'VITE_PORTAL_PARTNER_URL',
  sdwan: 'VITE_PORTAL_SDWAN_URL',
  'hosted-services': 'VITE_PORTAL_HOSTED_SERVICES_URL',
  wholesale: 'VITE_PORTAL_WHOLESALE_URL',
};

export function loadConfig(env: Env = import.meta.env): UceConfig {
  const missing = ['VITE_API_BASE_URL', 'VITE_OIDC_ISSUER', 'VITE_OIDC_CLIENT_ID', 'VITE_OIDC_REDIRECT_URI'].filter((k) => !str(env, k));
  if (missing.length > 0) throw new ConfigError(`Missing required configuration: ${missing.join(', ')}`);

  const timeout = Number(str(env, 'VITE_API_TIMEOUT_MS') ?? 10_000);
  if (!Number.isInteger(timeout) || timeout <= 0) throw new ConfigError('VITE_API_TIMEOUT_MS must be a positive integer');

  const portalUrls: UceConfig['portalUrls'] = {};
  for (const [id, key] of Object.entries(PORTAL_ENV) as Array<[PortalId, string]>) {
    const url = str(env, key);
    if (url) portalUrls[id] = url;
  }

  return {
    apiBaseUrl: str(env, 'VITE_API_BASE_URL')!.replace(/\/+$/, ''),
    apiTimeoutMs: timeout,
    oidc: {
      issuer: str(env, 'VITE_OIDC_ISSUER')!.replace(/\/+$/, ''),
      clientId: str(env, 'VITE_OIDC_CLIENT_ID')!,
      redirectUri: str(env, 'VITE_OIDC_REDIRECT_URI')!,
      postLogoutRedirectUri: str(env, 'VITE_OIDC_POST_LOGOUT_REDIRECT_URI') ?? '/',
      scope: str(env, 'VITE_OIDC_SCOPE') ?? 'openid profile email',
    },
    consentPolicyVersion: str(env, 'VITE_CONSENT_POLICY_VERSION') ?? '1',
    analytics: {
      clarityProjectId: str(env, 'VITE_CLARITY_PROJECT_ID'),
      fullstoryOrgId: str(env, 'VITE_FULLSTORY_ORG_ID'),
      fullstoryHost: str(env, 'VITE_FULLSTORY_HOST') ?? 'fullstory.com',
      idSalt: str(env, 'VITE_ANALYTICS_ID_SALT') ?? 'uce',
    },
    referrals: {
      tenantAlias: str(env, 'VITE_SAASQUATCH_TENANT_ALIAS'),
      widgetType: str(env, 'VITE_SAASQUATCH_WIDGET_TYPE') ?? 'p/referral-program/w/referrerWidget',
      shareBaseUrl: str(env, 'VITE_REFERRAL_SHARE_BASE_URL') ?? 'https://www.gokinetic.example/refer',
    },
    portalUrls,
    flagOverrides: parseFlagOverrides(str(env, 'VITE_FEATURE_FLAGS')),
  };
}
```

## apps/uce/src/consent/ConsentBanner.test.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/consent/ConsentBanner.test.tsx`.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { acceptAll } from './consentModel';
import { ConsentBanner } from './ConsentBanner';
import { CONSENT_STORAGE_KEY, ConsentProvider, useConsent } from './ConsentProvider';

const POLICY = '2026-11';
const clock = () => new Date('2026-11-11T10:00:00Z');

function GrantProbe() {
  const consent = useConsent();
  return <output data-testid="analytics">{String(consent.isGranted('analytics'))}</output>;
}

function renderBanner(onDecision = vi.fn(), gpc = false) {
  render(
    <ConsentProvider policyVersion={POLICY} onDecision={onDecision} storage={localStorage} clock={clock} gpc={gpc}>
      <ConsentBanner />
      <GrantProbe />
    </ConsentProvider>,
  );
  return onDecision;
}

describe('ConsentBanner', () => {
  it('shows accept and reject with equal prominence and grants nothing before a choice', () => {
    renderBanner();
    expect(screen.getByRole('region', { name: 'Cookie consent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept all' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject non-essential' })).toBeInTheDocument();
    expect(screen.getByTestId('analytics')).toHaveTextContent('false');
  });

  it('records accept all, persists it, audits it and hides the banner', async () => {
    const onDecision = renderBanner();
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }));
    expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
    expect(screen.getByTestId('analytics')).toHaveTextContent('true');
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!).source).toBe('banner_accept_all');
    expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({ policyVersion: POLICY }));
  });

  it('lets the visitor choose categories, with necessary locked on and nothing pre-ticked', async () => {
    renderBanner();
    await userEvent.click(screen.getByRole('button', { name: 'Manage preferences' }));
    const necessary = screen.getByRole('checkbox', { name: /Strictly necessary/ });
    expect(necessary).toBeChecked();
    expect(necessary).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Analytics/ })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Analytics/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    const stored = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!);
    expect(stored.choices).toEqual({ necessary: true, functional: false, analytics: true, marketing: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays hidden for a returning visitor with a current decision', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(acceptAll(POLICY, clock())));
    renderBanner();
    expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
    expect(screen.getByTestId('analytics')).toHaveTextContent('true');
  });

  it('ignores corrupt stored consent and asks again', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, '{not-json');
    renderBanner();
    expect(screen.getByRole('region', { name: 'Cookie consent' })).toBeInTheDocument();
  });

  it('does not block the visitor when the audit call fails', async () => {
    renderBanner(vi.fn().mockRejectedValue(new Error('offline')));
    await userEvent.click(screen.getByRole('button', { name: 'Reject non-essential' }));
    expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
    expect(screen.getByTestId('analytics')).toHaveTextContent('false');
  });
});
```

## apps/uce/src/consent/ConsentBanner.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/consent/ConsentBanner.tsx`.

```tsx
import { FormEvent, useEffect, useState } from 'react';
import { CATEGORY_INFO, CONSENT_CATEGORIES, ConsentChoices, deniedChoices } from './consentModel';
import { useConsent } from './ConsentProvider';

/**
 * Cookie banner + preferences dialog. "Reject" is as prominent as "Accept"
 * (no dark patterns), and nothing optional is pre-ticked.
 */
export function ConsentBanner() {
  const consent = useConsent();
  const [choices, setChoices] = useState<ConsentChoices>(() => consent.record?.choices ?? deniedChoices());

  useEffect(() => {
    if (consent.preferencesOpen) setChoices(consent.record?.choices ?? deniedChoices());
  }, [consent.preferencesOpen, consent.record]);

  if (consent.preferencesOpen) {
    const submit = (event: FormEvent) => {
      event.preventDefault();
      consent.save(choices);
    };
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="consent-prefs-title" className="uce-consent uce-consent--dialog">
        <form onSubmit={submit}>
          <h2 id="consent-prefs-title">Cookie preferences</h2>
          {CONSENT_CATEGORIES.map((category) => (
            <label key={category} className="uce-consent__category">
              <input
                type="checkbox"
                name={category}
                checked={category === 'necessary' ? true : choices[category]}
                disabled={category === 'necessary'}
                onChange={(e) => setChoices((prev) => ({ ...prev, [category]: e.target.checked }))}
              />
              <span>
                <strong>{CATEGORY_INFO[category].label}</strong>
                <small>{CATEGORY_INFO[category].description}</small>
              </span>
            </label>
          ))}
          <div className="uce-consent__actions">
            <button type="submit">Save preferences</button>
            {!consent.needsDecision && (
              <button type="button" onClick={consent.closePreferences}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  if (!consent.needsDecision) return null;

  return (
    <section role="region" aria-label="Cookie consent" className="uce-consent">
      <p>
        We use strictly necessary cookies to run your account. With your permission we'd also like to use analytics and
        functional cookies to improve the service. You can change your mind at any time from "Cookie settings".
      </p>
      <div className="uce-consent__actions">
        <button type="button" onClick={consent.acceptAll}>
          Accept all
        </button>
        <button type="button" onClick={consent.rejectAll}>
          Reject non-essential
        </button>
        <button type="button" onClick={consent.openPreferences}>
          Manage preferences
        </button>
      </div>
    </section>
  );
}
```

## apps/uce/src/consent/ConsentProvider.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/consent/ConsentProvider.tsx`.

```tsx
import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { readJson, safeStorage, writeJson } from '../lib/storage';
import {
  acceptAll,
  ConsentCategory,
  ConsentChoices,
  ConsentRecord,
  customise,
  globalPrivacyControl,
  isGranted,
  needsDecision,
  parseConsentRecord,
  rejectAll,
} from './consentModel';

/**
 * Holds the visitor's consent decision, persists it locally (first-party,
 * strictly necessary storage) and reports each decision to the backend audit
 * log so the business can evidence consent (GDPR Art. 7(1)).
 */

export interface ConsentContextValue {
  record?: ConsentRecord;
  policyVersion: string;
  needsDecision: boolean;
  preferencesOpen: boolean;
  isGranted(category: ConsentCategory): boolean;
  acceptAll(): void;
  rejectAll(): void;
  save(choices: Partial<ConsentChoices>): void;
  openPreferences(): void;
  closePreferences(): void;
}

export const ConsentContext = createContext<ConsentContextValue | undefined>(undefined);

export const CONSENT_STORAGE_KEY = 'uce.consent';

interface ConsentProviderProps {
  policyVersion: string;
  children: ReactNode;
  /** Best-effort audit sink; failures never block the visitor. */
  onDecision?: (record: ConsentRecord) => Promise<void> | void;
  storage?: Storage;
  clock?: () => Date;
  gpc?: boolean;
}

const isRecord = (v: unknown): v is ConsentRecord => parseConsentRecord(v) !== undefined;

export function ConsentProvider({
  policyVersion,
  children,
  onDecision,
  storage = safeStorage('localStorage'),
  clock = () => new Date(),
  gpc = globalPrivacyControl(),
}: ConsentProviderProps) {
  const [record, setRecord] = useState<ConsentRecord | undefined>(() => {
    const stored = readJson(storage, CONSENT_STORAGE_KEY, isRecord);
    return stored ? parseConsentRecord(stored) : undefined;
  });
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const commit = useCallback(
    (next: ConsentRecord) => {
      writeJson(storage, CONSENT_STORAGE_KEY, next);
      setRecord(next);
      setPreferencesOpen(false);
      Promise.resolve(onDecision?.(next)).catch(() => undefined);
    },
    [onDecision, storage],
  );

  const value = useMemo<ConsentContextValue>(() => {
    const now = clock();
    return {
      record,
      policyVersion,
      needsDecision: needsDecision(record, policyVersion, now),
      preferencesOpen,
      isGranted: (category) => isGranted(record, category, policyVersion, clock()),
      acceptAll: () => commit(acceptAll(policyVersion, clock(), gpc)),
      rejectAll: () => commit(rejectAll(policyVersion, clock(), gpc)),
      save: (choices) => commit(customise(choices, policyVersion, clock(), gpc)),
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
    };
  }, [clock, commit, gpc, policyVersion, preferencesOpen, record]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used inside <ConsentProvider>');
  return ctx;
}
```

## apps/uce/src/consent/consentModel.test.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/consent/consentModel.test.ts`.

```typescript
import { describe, expect, it } from 'vitest';
import {
  acceptAll,
  CONSENT_MAX_AGE_MS,
  customise,
  diffGrants,
  isGranted,
  needsDecision,
  parseConsentRecord,
  rejectAll,
} from './consentModel';

const POLICY = '2026-11';
const NOW = new Date('2026-11-11T10:00:00Z');

describe('consent model', () => {
  it('requires a decision when nothing has been recorded and grants only necessary meanwhile', () => {
    expect(needsDecision(undefined, POLICY, NOW)).toBe(true);
    expect(isGranted(undefined, 'necessary', POLICY, NOW)).toBe(true);
    expect(isGranted(undefined, 'analytics', POLICY, NOW)).toBe(false);
  });

  it('accept all grants every category and reject all only necessary', () => {
    const accepted = acceptAll(POLICY, NOW);
    expect(accepted.choices).toEqual({ necessary: true, functional: true, analytics: true, marketing: true });
    expect(accepted.decidedAt).toBe('2026-11-11T10:00:00.000Z');
    expect(rejectAll(POLICY, NOW).choices).toEqual({ necessary: true, functional: false, analytics: false, marketing: false });
  });

  it('never allows necessary to be switched off and defaults unspecified categories to denied', () => {
    const record = customise({ necessary: false, analytics: true }, POLICY, NOW);
    expect(record.choices).toEqual({ necessary: true, functional: false, analytics: true, marketing: false });
    expect(record.source).toBe('preferences');
  });

  it('forces marketing off under Global Privacy Control, even on accept all', () => {
    const record = acceptAll(POLICY, NOW, true);
    expect(record.choices.marketing).toBe(false);
    expect(record.choices.analytics).toBe(true);
    expect(record.gpc).toBe(true);
  });

  it('expires a decision after 13 months', () => {
    const record = acceptAll(POLICY, NOW);
    const justValid = new Date(NOW.getTime() + CONSENT_MAX_AGE_MS);
    const expired = new Date(NOW.getTime() + CONSENT_MAX_AGE_MS + 1);
    expect(needsDecision(record, POLICY, justValid)).toBe(false);
    expect(needsDecision(record, POLICY, expired)).toBe(true);
    expect(isGranted(record, 'analytics', POLICY, expired)).toBe(false);
  });

  it('re-prompts and suspends integrations when the policy version changes', () => {
    const record = acceptAll('2025-01', NOW);
    expect(needsDecision(record, POLICY, NOW)).toBe(true);
    expect(isGranted(record, 'functional', POLICY, NOW)).toBe(false);
  });

  it('reports which categories were granted and revoked between decisions', () => {
    const before = acceptAll(POLICY, NOW);
    const after = customise({ functional: true }, POLICY, NOW);
    const grant = (r: typeof before) => (c: Parameters<typeof isGranted>[1]) => isGranted(r, c, POLICY, NOW);
    expect(diffGrants(grant(before), grant(after))).toEqual({ granted: [], revoked: ['analytics', 'marketing'] });
    expect(diffGrants(grant(after), grant(before))).toEqual({ granted: ['analytics', 'marketing'], revoked: [] });
  });

  it('round-trips through storage and rejects tampered or legacy records', () => {
    const record = customise({ analytics: true }, POLICY, NOW);
    expect(parseConsentRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(parseConsentRecord({ ...record, schema: 0 })).toBeUndefined();
    expect(parseConsentRecord({ ...record, choices: { analytics: 'yes' } })).toBeUndefined();
    expect(parseConsentRecord({ ...record, source: 'implied' })).toBeUndefined();
    expect(parseConsentRecord({ ...record, choices: { ...record.choices, necessary: false } })?.choices.necessary).toBe(true);
    expect(parseConsentRecord('accepted')).toBeUndefined();
  });
});
```

## apps/uce/src/consent/consentModel.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/consent/consentModel.ts`.

```typescript
/**
 * GDPR / PECR consent model. Pure functions only, so the rules are unit-tested
 * independently of storage and UI.
 *
 * Rules:
 *  - "necessary" is always granted and cannot be switched off.
 *  - Everything else defaults to denied until an explicit choice is recorded.
 *  - A decision expires after 13 months or when the cookie policy version changes.
 *  - A Global Privacy Control signal forces "marketing" off regardless of choice.
 */

export const CONSENT_CATEGORIES = ['necessary', 'functional', 'analytics', 'marketing'] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];
export type ConsentChoices = Record<ConsentCategory, boolean>;
export type ConsentSource = 'banner_accept_all' | 'banner_reject_all' | 'preferences';

export interface ConsentRecord {
  schema: 1;
  policyVersion: string;
  /** ISO-8601 UTC. */
  decidedAt: string;
  source: ConsentSource;
  choices: ConsentChoices;
  gpc: boolean;
}

export const CATEGORY_INFO: Record<ConsentCategory, { label: string; description: string }> = {
  necessary: {
    label: 'Strictly necessary',
    description: 'Sign-in, security and remembering these choices. Always on.',
  },
  functional: {
    label: 'Functional',
    description: 'Embedded services such as the referral programme widget and saved preferences.',
  },
  analytics: {
    label: 'Analytics',
    description: 'Session insights (Microsoft Clarity, FullStory) that help us fix problems. Personal details are masked.',
  },
  marketing: {
    label: 'Marketing',
    description: 'Measuring referral and offer campaigns.',
  },
};

/** 13 months, the ICO/CNIL guidance ceiling for consent validity. */
export const CONSENT_MAX_AGE_MS = 395 * 24 * 60 * 60 * 1000;

export function deniedChoices(): ConsentChoices {
  return { necessary: true, functional: false, analytics: false, marketing: false };
}

function record(choices: ConsentChoices, source: ConsentSource, policyVersion: string, now: Date, gpc: boolean): ConsentRecord {
  return {
    schema: 1,
    policyVersion,
    decidedAt: now.toISOString(),
    source,
    gpc,
    choices: { ...choices, necessary: true, marketing: choices.marketing && !gpc },
  };
}

export function acceptAll(policyVersion: string, now: Date, gpc = false): ConsentRecord {
  return record({ necessary: true, functional: true, analytics: true, marketing: true }, 'banner_accept_all', policyVersion, now, gpc);
}

export function rejectAll(policyVersion: string, now: Date, gpc = false): ConsentRecord {
  return record(deniedChoices(), 'banner_reject_all', policyVersion, now, gpc);
}

export function customise(choices: Partial<ConsentChoices>, policyVersion: string, now: Date, gpc = false): ConsentRecord {
  return record({ ...deniedChoices(), ...choices }, 'preferences', policyVersion, now, gpc);
}

export function needsDecision(current: ConsentRecord | undefined, policyVersion: string, now: Date): boolean {
  if (!current) return true;
  if (current.policyVersion !== policyVersion) return true;
  const decided = Date.parse(current.decidedAt);
  return Number.isNaN(decided) || now.getTime() - decided > CONSENT_MAX_AGE_MS;
}

/**
 * Whether a category may be used right now. A stale or outdated record counts
 * as no consent: integrations stop until the visitor decides again.
 */
export function isGranted(current: ConsentRecord | undefined, category: ConsentCategory, policyVersion: string, now: Date): boolean {
  if (category === 'necessary') return true;
  if (!current || needsDecision(current, policyVersion, now)) return false;
  return current.choices[category] === true;
}

export function diffGrants(
  before: (category: ConsentCategory) => boolean,
  after: (category: ConsentCategory) => boolean,
): { granted: ConsentCategory[]; revoked: ConsentCategory[] } {
  const granted = CONSENT_CATEGORIES.filter((c) => !before(c) && after(c));
  const revoked = CONSENT_CATEGORIES.filter((c) => before(c) && !after(c));
  return { granted, revoked };
}

export function parseConsentRecord(value: unknown): ConsentRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Partial<ConsentRecord>;
  if (v.schema !== 1 || typeof v.policyVersion !== 'string' || typeof v.decidedAt !== 'string' || !v.choices) return undefined;
  const choices = v.choices as Partial<ConsentChoices>;
  if (!CONSENT_CATEGORIES.every((c) => typeof choices[c] === 'boolean')) return undefined;
  if (v.source !== 'banner_accept_all' && v.source !== 'banner_reject_all' && v.source !== 'preferences') return undefined;
  return { schema: 1, policyVersion: v.policyVersion, decidedAt: v.decidedAt, source: v.source, gpc: v.gpc === true, choices: { ...(choices as ConsentChoices), necessary: true } };
}

export function globalPrivacyControl(nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  return (nav as (Navigator & { globalPrivacyControl?: boolean }) | undefined)?.globalPrivacyControl === true;
}
```

## apps/uce/src/flags/featureFlags.test.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/flags/featureFlags.test.tsx`.

```tsx
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
```

## apps/uce/src/flags/featureFlags.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/flags/featureFlags.tsx`.

```tsx
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../api/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { hasAnyRole, Role } from '../auth/roles';

/**
 * Feature flags served by GET /feature-flags, evaluated client-side:
 *   local override > disabled > role targeting > percentage rollout.
 * Rollout bucketing hashes (flag key, user id) so a user stays in the same
 * bucket across sessions and different flags get independent populations.
 */

export interface FlagDefinition {
  key: string;
  enabled: boolean;
  /** 0-100; omitted means everyone who passes targeting. */
  rolloutPercent?: number;
  roles?: Role[];
}

export interface FlagContext {
  userId?: string;
  roles: Role[];
}

/** FNV-1a 32-bit; deterministic and fast enough to run on every render. */
export function bucketOf(flagKey: string, userId: string): number {
  let hash = 0x811c9dc5;
  const input = `${flagKey}:${userId}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function evaluateFlag(definition: FlagDefinition | undefined, ctx: FlagContext, override?: boolean): boolean {
  if (override !== undefined) return override;
  if (!definition || !definition.enabled) return false;
  if (definition.roles && definition.roles.length > 0 && !hasAnyRole(ctx.roles, definition.roles)) return false;
  const percent = definition.rolloutPercent ?? 100;
  if (percent >= 100) return true;
  if (percent <= 0 || !ctx.userId) return false;
  return bucketOf(definition.key, ctx.userId) < percent;
}

export function parseFlags(payload: unknown): Record<string, FlagDefinition> {
  const items = (payload as { items?: unknown })?.items;
  const result: Record<string, FlagDefinition> = {};
  if (!Array.isArray(items)) return result;
  for (const item of items as Array<Partial<FlagDefinition>>) {
    if (typeof item?.key === 'string' && typeof item.enabled === 'boolean') {
      result[item.key] = { key: item.key, enabled: item.enabled, rolloutPercent: item.rolloutPercent, roles: item.roles };
    }
  }
  return result;
}

interface FlagsValue {
  isEnabled(key: string): boolean;
  ready: boolean;
}

const FlagsContext = createContext<FlagsValue>({ isEnabled: () => false, ready: false });

interface FeatureFlagProviderProps {
  api: ApiClient;
  overrides: Record<string, boolean>;
  children: ReactNode;
}

export function FeatureFlagProvider({ api, overrides, children }: FeatureFlagProviderProps) {
  const { user, status } = useAuth();
  const [definitions, setDefinitions] = useState<Record<string, FlagDefinition>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (status === 'loading') return undefined;
    let cancelled = false;
    api
      .get<unknown>('/feature-flags')
      .then((payload) => !cancelled && setDefinitions(parseFlags(payload)))
      // Flags fail closed: if the service is down, new features stay off.
      .catch(() => !cancelled && setDefinitions({}))
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [api, status, user?.userId]);

  const value = useMemo<FlagsValue>(() => {
    const ctx: FlagContext = { userId: user?.userId, roles: user?.roles ?? [] };
    return { ready, isEnabled: (key) => evaluateFlag(definitions[key], ctx, overrides[key]) };
  }, [definitions, overrides, ready, user]);

  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>;
}

export function useFeatureFlag(key: string): boolean {
  return useContext(FlagsContext).isEnabled(key);
}

export function Feature({ flag, children, fallback = null }: { flag: string; children: ReactNode; fallback?: ReactNode }) {
  return <>{useFeatureFlag(flag) ? children : fallback}</>;
}
```

## apps/uce/src/lib/money.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/lib/money.ts`.

```typescript
/** Money in integer minor units + ISO currency, per CONVENTIONS.md. */
export interface Money {
  amountMinor: number;
  currency: string;
}

export function formatMoney(money: Money, locale = 'en-GB'): string {
  if (!Number.isInteger(money.amountMinor)) throw new TypeError(`amountMinor must be an integer, got ${money.amountMinor}`);
  // Intl takes a number in major units; dividing an integer by 100 is exact for display at 2 dp.
  return new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency }).format(money.amountMinor / 100);
}

/** Sums amounts per currency without mixing currencies or touching floats. */
export function sumByCurrency(amounts: Money[]): Money[] {
  const totals = new Map<string, number>();
  for (const { amountMinor, currency } of amounts) totals.set(currency, (totals.get(currency) ?? 0) + amountMinor);
  return [...totals.entries()].map(([currency, amountMinor]) => ({ currency, amountMinor })).sort((a, b) => a.currency.localeCompare(b.currency));
}

export function formatDate(iso: string, locale = 'en-GB'): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
```

## apps/uce/src/lib/scriptLoader.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/lib/scriptLoader.ts`.

```typescript
/**
 * Injects a third-party script once per id. Concurrent callers share the same
 * promise; a failed load removes the tag so a later call can retry.
 */

const pending = new Map<string, Promise<void>>();

export interface ScriptOptions {
  id: string;
  nonce?: string;
  attributes?: Record<string, string>;
}

export type ScriptLoader = (src: string, options: ScriptOptions) => Promise<void>;

export const loadScript: ScriptLoader = (src, { id, nonce, attributes = {} }) => {
  const existing = pending.get(id);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    if (nonce) script.nonce = nonce;
    for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      pending.delete(id);
      reject(new Error(`Failed to load script ${src}`));
    };
    document.head.appendChild(script);
  });
  pending.set(id, promise);
  return promise;
};

export function removeScript(id: string): void {
  pending.delete(id);
  document.getElementById(id)?.remove();
}
```

## apps/uce/src/lib/storage.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/lib/storage.ts`.

```typescript
/**
 * Storage helpers that tolerate disabled storage (Safari private mode, blocked
 * third-party contexts) and corrupt JSON, so the shell never crashes on load.
 */

export function readJson<T>(storage: Storage | undefined, key: string, validate: (value: unknown) => value is T): T | undefined {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeJson(storage: Storage | undefined, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled: the value simply won't persist.
  }
}

export function remove(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // ignore
  }
}

export function safeStorage(kind: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window[kind];
  } catch {
    return undefined;
  }
}
```

## apps/uce/src/main.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/main.tsx`.

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ConfigError, loadConfig } from './config';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

try {
  const config = loadConfig();
  root.render(
    <StrictMode>
      <App config={config} />
    </StrictMode>,
  );
} catch (error) {
  console.error(JSON.stringify({ level: 'error', message: 'uce startup failed', error: String(error) }));
  root.render(
    <p role="alert">{error instanceof ConfigError ? 'This site is misconfigured. Please try again later.' : 'Something went wrong while starting.'}</p>,
  );
}
```

## apps/uce/src/notifications/NotificationCentre.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/notifications/NotificationCentre.tsx`.

```tsx
import { useCallback, useEffect, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '../lib/money';
import { AppNotification, notificationsReducer, NotificationService, safeLink } from './notifications';

interface NotificationCentreProps {
  service: NotificationService;
  pollIntervalMs?: number;
  now?: () => Date;
}

/** Bell with unread badge and a dropdown list; polls only while the tab is visible. */
export function NotificationCentre({ service, pollIntervalMs = 60_000, now = () => new Date() }: NotificationCentreProps) {
  const [state, dispatch] = useReducer(notificationsReducer, { items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      dispatch({ type: 'loaded', ...(await service.load()) });
    } catch {
      // Keep showing the last known list; the next poll retries.
    }
  }, [service]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, pollIntervalMs);
    return () => clearInterval(timer);
  }, [pollIntervalMs, refresh]);

  const select = (notification: AppNotification) => {
    if (!notification.readAt) {
      dispatch({ type: 'read', id: notification.id, at: now().toISOString() });
      service.markRead(notification.id).catch(() => void refresh());
    }
    const link = safeLink(notification.link);
    if (link) {
      setOpen(false);
      navigate(link);
    }
  };

  const markAll = () => {
    dispatch({ type: 'allRead', at: now().toISOString() });
    service.markAllRead().catch(() => void refresh());
  };

  return (
    <div className="uce-notifications">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        Notifications
        {state.unread > 0 && (
          <span className="uce-badge" aria-label={`${state.unread} unread`}>
            {state.unread > 99 ? '99+' : state.unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="uce-notifications__panel">
          {state.unread > 0 && (
            <button type="button" onClick={markAll}>
              Mark all as read
            </button>
          )}
          {state.items.length === 0 ? (
            <p>You're all caught up.</p>
          ) : (
            <ul>
              {state.items.map((n) => (
                <li key={n.id} className={n.readAt ? 'is-read' : 'is-unread'} data-severity={n.severity}>
                  <button type="button" onClick={() => select(n)}>
                    <strong>{n.title}</strong>
                    <span>{n.body}</span>
                    <time dateTime={n.createdAt}>{formatDate(n.createdAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

## apps/uce/src/notifications/notifications.test.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/notifications/notifications.test.tsx`.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '../test/fakes';
import { NotificationCentre } from './NotificationCentre';
import { AppNotification, notificationsReducer, NotificationService, safeLink, sortNotifications } from './notifications';

const n = (id: string, overrides: Partial<AppNotification> = {}): AppNotification => ({
  id,
  category: 'BILLING',
  severity: 'INFO',
  title: `Title ${id}`,
  body: 'Body',
  createdAt: `2026-11-0${id}T10:00:00Z`,
  ...overrides,
});

describe('notification state', () => {
  it('puts unread critical items first, then newest', () => {
    const sorted = sortNotifications([n('1'), n('3'), n('2', { severity: 'CRITICAL', category: 'OUTAGE' }), n('4', { severity: 'CRITICAL', readAt: 'x' })]);
    expect(sorted.map((x) => x.id)).toEqual(['2', '4', '3', '1']);
  });

  it('marks one read idempotently and never goes below zero', () => {
    const start = notificationsReducer({ items: [], unread: 0 }, { type: 'loaded', items: [n('1'), n('2')], unread: 1 });
    const once = notificationsReducer(start, { type: 'read', id: '1', at: 'now' });
    expect(once.unread).toBe(0);
    expect(notificationsReducer(once, { type: 'read', id: '1', at: 'later' })).toBe(once);
    expect(notificationsReducer(once, { type: 'read', id: '2', at: 'now' }).unread).toBe(0);
  });

  it('marks all read', () => {
    const state = notificationsReducer({ items: [n('1'), n('2', { readAt: 'old' })], unread: 1 }, { type: 'allRead', at: 'now' });
    expect(state.unread).toBe(0);
    expect(state.items.map((x) => x.readAt)).toEqual(['now', 'old']);
  });

  it('only follows in-shell links', () => {
    expect(safeLink('/portals/uconnect/tickets/TKT-1')).toBe('/portals/uconnect/tickets/TKT-1');
    expect(safeLink('//evil.example/x')).toBeUndefined();
    expect(safeLink('javascript:alert(1)')).toBeUndefined();
  });
});

function Where() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

describe('NotificationCentre', () => {
  it('shows the unread badge, marks an item read and navigates to its link', async () => {
    const service = {
      load: vi.fn(async () => ({ items: [n('1', { link: '/portals/uconnect/invoices/INV-00000001' })], unread: 1 })),
      markRead: vi.fn(async () => undefined),
      markAllRead: vi.fn(async () => undefined),
    } as unknown as NotificationService;

    render(
      <Providers>
        <NotificationCentre service={service} />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </Providers>,
    );
    expect(await screen.findByLabelText('1 unread')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await userEvent.click(screen.getByRole('button', { name: /Title 1/ }));

    expect(service.markRead).toHaveBeenCalledWith('1');
    expect(screen.queryByLabelText('1 unread')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/portals/uconnect/invoices/INV-00000001');
  });
});
```

## apps/uce/src/notifications/notifications.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/notifications/notifications.ts`.

```typescript
import { ApiClient, Page } from '../api/apiClient';

export type NotificationCategory = 'BILLING' | 'ORDER' | 'TICKET' | 'OUTAGE' | 'REFERRAL' | 'SYSTEM';

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
  /** Relative in-shell path, e.g. /portals/uconnect/tickets/TKT-0001234. */
  link?: string;
}

export interface NotificationState {
  items: AppNotification[];
  unread: number;
}

export type NotificationAction =
  | { type: 'loaded'; items: AppNotification[]; unread: number }
  | { type: 'read'; id: string; at: string }
  | { type: 'allRead'; at: string };

/** Pure reducer; optimistic read-marking keeps the badge responsive. */
export function notificationsReducer(state: NotificationState, action: NotificationAction): NotificationState {
  switch (action.type) {
    case 'loaded':
      return { items: sortNotifications(action.items), unread: action.unread };
    case 'read': {
      const target = state.items.find((n) => n.id === action.id);
      if (!target || target.readAt) return state;
      return {
        items: state.items.map((n) => (n.id === action.id ? { ...n, readAt: action.at } : n)),
        unread: Math.max(0, state.unread - 1),
      };
    }
    case 'allRead':
      return { items: state.items.map((n) => (n.readAt ? n : { ...n, readAt: action.at })), unread: 0 };
    default:
      return state;
  }
}

const SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;

/** Unread critical items first (e.g. outages), then newest first. */
export function sortNotifications(items: AppNotification[]): AppNotification[] {
  return [...items].sort((a, b) => {
    const aUrgent = !a.readAt && a.severity === 'CRITICAL' ? 0 : 1;
    const bUrgent = !b.readAt && b.severity === 'CRITICAL' ? 0 : 1;
    return aUrgent - bUrgent || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.createdAt.localeCompare(a.createdAt);
  });
}

/** Only in-shell relative links are followed, never arbitrary URLs from payloads. */
export function safeLink(link: string | undefined): string | undefined {
  return link && link.startsWith('/') && !link.startsWith('//') ? link : undefined;
}

export class NotificationService {
  constructor(private readonly api: ApiClient) {}

  async load(pageSize = 20): Promise<{ items: AppNotification[]; unread: number }> {
    const [page, count] = await Promise.all([
      this.api.get<Page<AppNotification>>('/notifications', { query: { page: 1, pageSize } }),
      this.api.get<{ unread: number }>('/notifications/unread-count'),
    ]);
    return { items: page.items, unread: count.unread };
  }

  markRead(id: string): Promise<void> {
    return this.api.post<void>(`/notifications/${encodeURIComponent(id)}/read`);
  }

  markAllRead(): Promise<void> {
    return this.api.post<void>('/notifications/read-all');
  }
}
```

## apps/uce/src/pages/pages.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/pages/pages.tsx`.

```tsx
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { UceConfig } from '../config';
import { portalsFor } from '../shell/portals';

export function HomePage({ portalUrls }: { portalUrls: UceConfig['portalUrls'] }) {
  const { user } = useAuth();
  if (!user) return null;
  const portals = portalsFor(user.roles, portalUrls);
  const firstName = user.name?.split(' ')[0];
  return (
    <section aria-labelledby="home-title">
      <h1 id="home-title">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h1>
      {portals.length === 0 ? (
        <p>No services are available for your role yet. Contact your account administrator.</p>
      ) : (
        <ul className="uce-tiles">
          {portals.map((p) => (
            <li key={p.id}>
              <Link to={`/portals/${p.id}`}>
                <strong>{p.name}</strong>
                <span>{p.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** OIDC redirect target. Runs the code exchange exactly once even under StrictMode. */
export function CallbackPage() {
  const { completeLogin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeLogin(location.search)
      .then((returnTo) => navigate(returnTo, { replace: true }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Sign-in failed'));
  }, [completeLogin, location.search, navigate]);

  if (error) {
    return (
      <section role="alert">
        <h1>We couldn't sign you in</h1>
        <p>{error}</p>
        <Link to="/">Back to start</Link>
      </section>
    );
  }
  return <p role="status">Completing sign-in...</p>;
}

export function NotFoundPage() {
  return (
    <section>
      <h1>Page not found</h1>
      <Link to="/">Go to your dashboard</Link>
    </section>
  );
}
```

## apps/uce/src/referrals/ReferralPage.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/referrals/ReferralPage.tsx`.

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { userMessage } from '../api/problem';
import { useAnalytics } from '../analytics/AnalyticsProvider';
import { useConsent } from '../consent/ConsentProvider';
import { formatDate, formatMoney } from '../lib/money';
import {
  buildShareLinks,
  countInProgress,
  Referral,
  REFERRAL_STATUS_LABELS,
  ReferralService,
  Reward,
  summariseRewards,
} from './referralService';

interface ReferralPageProps {
  service: ReferralService;
  shareBaseUrl: string;
}

type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

export function ReferralPage({ service, shareBaseUrl }: ReferralPageProps) {
  const consent = useConsent();
  const analytics = useAnalytics();
  const widgetRef = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState<string>();
  const [widgetError, setWidgetError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<Load<{ rewards: Reward[]; referrals: Referral[] }>>({ state: 'loading' });
  const widgetAllowed = consent.isGranted('functional') && service.widgetAvailable;

  useEffect(() => {
    let cancelled = false;
    Promise.all([service.listRewards(), service.listReferrals(), service.getToken()])
      .then(([rewards, referrals, token]) => {
        if (cancelled) return;
        setHistory({ state: 'ready', data: { rewards: rewards.items, referrals: referrals.items } });
        setCode((current) => current ?? token.referralCode);
      })
      .catch((error) => !cancelled && setHistory({ state: 'error', message: userMessage(error) }));
    return () => {
      cancelled = true;
    };
  }, [service]);

  useEffect(() => {
    if (!widgetAllowed || !widgetRef.current) return;
    service
      .mountWidget(widgetRef.current)
      .then((result) => setCode(result.referralCode))
      .catch(() => setWidgetError('The referral widget could not be loaded. You can still share your code below.'));
  }, [service, widgetAllowed]);

  const links = useMemo(() => (code ? buildShareLinks(code, shareBaseUrl) : undefined), [code, shareBaseUrl]);

  const copy = async () => {
    if (!links) return;
    await navigator.clipboard.writeText(links.url);
    setCopied(true);
    analytics.track('referral_link_copied', { channel: 'copy' });
  };

  return (
    <main className="uce-referrals" aria-labelledby="referrals-title">
      <h1 id="referrals-title">Refer a friend</h1>

      <section aria-label="Share your code">
        {code ? (
          <>
            <p>
              Your referral code: <strong data-testid="referral-code">{code}</strong>
            </p>
            <button type="button" onClick={copy}>
              {copied ? 'Link copied' : 'Copy link'}
            </button>
            <a href={links!.email} onClick={() => analytics.track('referral_shared', { channel: 'email' })}>
              Email
            </a>
            <a href={links!.whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => analytics.track('referral_shared', { channel: 'whatsapp' })}>
              WhatsApp
            </a>
          </>
        ) : (
          history.state === 'loading' && <p role="status">Loading your referral code...</p>
        )}
      </section>

      {service.widgetAvailable && !consent.isGranted('functional') && (
        <p className="uce-notice">
          The interactive referral widget needs functional cookies.{' '}
          <button type="button" onClick={consent.openPreferences}>
            Cookie settings
          </button>
        </p>
      )}
      {widgetError && <p role="alert">{widgetError}</p>}
      {widgetAllowed && <div ref={widgetRef} className="uce-referrals__widget" data-testid="squatch-container" />}

      {history.state === 'error' && <p role="alert">{history.message}</p>}
      {history.state === 'ready' && <ReferralHistory rewards={history.data.rewards} referrals={history.data.referrals} />}
    </main>
  );
}

function ReferralHistory({ rewards, referrals }: { rewards: Reward[]; referrals: Referral[] }) {
  const summary = summariseRewards(rewards);
  return (
    <>
      <section aria-labelledby="rewards-title">
        <h2 id="rewards-title">Your rewards</h2>
        <p>
          Available: {summary.available.length ? summary.available.map((m) => formatMoney(m)).join(' + ') : formatMoney({ amountMinor: 0, currency: 'GBP' })}
          {summary.pendingCount > 0 && ` - ${summary.pendingCount} pending`}
        </p>
        {rewards.length === 0 ? (
          <p>No rewards yet. You'll earn one when a friend's service is installed.</p>
        ) : (
          <ul>
            {rewards.map((r) => (
              <li key={r.id}>
                {formatMoney(r.amount)} {r.type === 'ACCOUNT_CREDIT' ? 'bill credit' : 'gift card'} - {r.status.toLowerCase()} ({formatDate(r.earnedAt)})
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="status-title">
        <h2 id="status-title">Referral status ({countInProgress(referrals)} in progress)</h2>
        {referrals.length === 0 ? (
          <p>You haven't referred anyone yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Friend</th>
                <th scope="col">Status</th>
                <th scope="col">Since</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id}>
                  <td>{r.refereeDisplayName}</td>
                  <td>{REFERRAL_STATUS_LABELS[r.status]}</td>
                  <td>{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
```

## apps/uce/src/referrals/referralService.test.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/referrals/referralService.test.ts`.

```typescript
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
```

## apps/uce/src/referrals/referralService.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/referrals/referralService.ts`.

```typescript
import { ApiClient, Page } from '../api/apiClient';
import { loadScript, ScriptLoader } from '../lib/scriptLoader';
import { Money, sumByCurrency } from '../lib/money';

/**
 * SaaSquatch referral programme integration.
 *
 * The browser never holds the tenant API key: the backend upserts the
 * participant and returns a signed user JWT (POST /referrals/token). The
 * widget is then rendered with squatch.js using that JWT. Rewards and referral
 * status come from our own API (which mirrors SaaSquatch webhooks), so they
 * work even when the widget is blocked or consent for it is withheld.
 */

export interface SquatchUser {
  id: string;
  accountId: string;
  firstName?: string;
  locale?: string;
}

export interface ReferralToken {
  jwt: string;
  user: SquatchUser;
  referralCode: string;
  /** Epoch seconds when the JWT expires. */
  expiresAt: number;
}

export type RewardStatus = 'PENDING' | 'AVAILABLE' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';

export interface Reward {
  id: string;
  type: 'ACCOUNT_CREDIT' | 'GIFT_CARD';
  amount: Money;
  status: RewardStatus;
  earnedAt: string;
  expiresAt?: string;
  referralId: string;
}

export type ReferralStatus = 'INVITED' | 'SIGNED_UP' | 'INSTALLED' | 'REWARDED' | 'EXPIRED' | 'CANCELLED';

export interface Referral {
  id: string;
  /** Masked by the backend, e.g. "J. S.". */
  refereeDisplayName: string;
  status: ReferralStatus;
  createdAt: string;
  updatedAt: string;
}

interface SquatchWidgetsApi {
  upsertUser(params: {
    user: SquatchUser;
    jwt: string;
    engagementMedium: 'EMBED' | 'POPUP';
    widgetType: string;
    container: HTMLElement | string;
  }): Promise<{ widget: unknown; user: { referralCode?: string } }>;
}

export interface SquatchGlobal {
  ready(callback: () => void): void;
  init(config: { tenantAlias: string }): void;
  widgets(): SquatchWidgetsApi;
}

declare global {
  interface Window {
    squatch?: SquatchGlobal;
  }
}

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  INVITED: 'Invited',
  SIGNED_UP: 'Ordered - awaiting installation',
  INSTALLED: 'Installed - reward on its way',
  REWARDED: 'Rewarded',
  EXPIRED: 'Expired',
  CANCELLED: 'Order cancelled',
};

/** Statuses that still count towards the customer's "in progress" referrals. */
const IN_PROGRESS: ReferralStatus[] = ['INVITED', 'SIGNED_UP', 'INSTALLED'];

export interface RewardSummary {
  available: Money[];
  redeemed: Money[];
  pendingCount: number;
}

export function summariseRewards(rewards: Reward[]): RewardSummary {
  return {
    available: sumByCurrency(rewards.filter((r) => r.status === 'AVAILABLE').map((r) => r.amount)),
    redeemed: sumByCurrency(rewards.filter((r) => r.status === 'REDEEMED').map((r) => r.amount)),
    pendingCount: rewards.filter((r) => r.status === 'PENDING').length,
  };
}

export function countInProgress(referrals: Referral[]): number {
  return referrals.filter((r) => IN_PROGRESS.includes(r.status)).length;
}

export interface ShareLinks {
  url: string;
  email: string;
  whatsapp: string;
  sms: string;
}

export function buildShareLinks(referralCode: string, shareBaseUrl: string): ShareLinks {
  if (!/^[A-Z0-9-]{4,32}$/i.test(referralCode)) throw new Error('Invalid referral code');
  const url = `${shareBaseUrl}?code=${encodeURIComponent(referralCode)}&utm_source=uce&utm_medium=referral`;
  const message = `I'm on Uniti full fibre - use my code ${referralCode} when you order and we both get a reward: ${url}`;
  return {
    url,
    email: `mailto:?subject=${encodeURIComponent('Get full fibre with Uniti')}&body=${encodeURIComponent(message)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    sms: `sms:?&body=${encodeURIComponent(message)}`,
  };
}

export interface ReferralServiceOptions {
  api: ApiClient;
  tenantAlias?: string;
  widgetType: string;
  loader?: ScriptLoader;
  win?: Window;
  readyTimeoutMs?: number;
  nowSeconds?: () => number;
}

export class ReferralService {
  private token?: ReferralToken;
  private initialised = false;
  private readonly loader: ScriptLoader;
  private readonly win: Window;
  private readonly nowSeconds: () => number;

  constructor(private readonly options: ReferralServiceOptions) {
    this.loader = options.loader ?? loadScript;
    this.win = options.win ?? window;
    this.nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  get widgetAvailable(): boolean {
    return Boolean(this.options.tenantAlias);
  }

  /** Cached until 60 s before expiry, so remounting the page doesn't re-mint tokens. */
  async getToken(): Promise<ReferralToken> {
    if (this.token && this.token.expiresAt - 60 > this.nowSeconds()) return this.token;
    this.token = await this.options.api.post<ReferralToken>('/referrals/token');
    return this.token;
  }

  async mountWidget(container: HTMLElement): Promise<{ referralCode: string }> {
    const tenantAlias = this.options.tenantAlias;
    if (!tenantAlias) throw new Error('Referral widget is not configured');
    const token = await this.getToken();
    await this.loader('https://fast.ssqt.io/squatch-js@2', { id: 'uce-saasquatch' });
    const squatch = await this.whenReady();
    if (!this.initialised) {
      squatch.init({ tenantAlias });
      this.initialised = true;
    }
    const result = await squatch.widgets().upsertUser({
      user: token.user,
      jwt: token.jwt,
      engagementMedium: 'EMBED',
      widgetType: this.options.widgetType,
      container,
    });
    return { referralCode: result.user.referralCode ?? token.referralCode };
  }

  listRewards(page = 1, pageSize = 20): Promise<Page<Reward>> {
    return this.options.api.get<Page<Reward>>('/referrals/rewards', { query: { page, pageSize } });
  }

  listReferrals(page = 1, pageSize = 20): Promise<Page<Referral>> {
    return this.options.api.get<Page<Referral>>('/referrals', { query: { page, pageSize } });
  }

  private whenReady(): Promise<SquatchGlobal> {
    return new Promise((resolve, reject) => {
      const squatch = this.win.squatch;
      if (!squatch) {
        reject(new Error('squatch.js did not initialise'));
        return;
      }
      const timer = setTimeout(() => reject(new Error('squatch.js ready timeout')), this.options.readyTimeoutMs ?? 10_000);
      squatch.ready(() => {
        clearTimeout(timer);
        resolve(squatch);
      });
    });
  }
}
```

## apps/uce/src/search/GlobalSearch.test.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/search/GlobalSearch.test.tsx`.

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '../test/fakes';
import { GlobalSearch } from './GlobalSearch';
import { detectIdentifier, SearchResult, SearchService } from './searchService';

function Where() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderSearch(search: (q: string, signal?: AbortSignal) => Promise<SearchResult[]>, debounceMs = 5) {
  const service = { search: vi.fn(search) } as unknown as SearchService & { search: ReturnType<typeof vi.fn> };
  render(
    <Providers>
      <GlobalSearch service={service} debounceMs={debounceMs} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </Providers>,
  );
  return service;
}

const results: SearchResult[] = [
  { type: 'HELP', id: 'h1', title: 'Fixing slow wifi', path: '/help/slow-wifi' },
  { type: 'TICKET', id: 'TKT-0001234', title: 'Slow broadband ticket', path: '/portals/uconnect/tickets/TKT-0001234' },
];

describe('detectIdentifier', () => {
  it('normalises typed identifiers into direct links', () => {
    expect(detectIdentifier(' inv00123456 ')).toMatchObject({ type: 'INVOICE', id: 'INV-00123456', path: '/portals/uconnect/invoices/INV-00123456' });
    expect(detectIdentifier('ACC-12345678')?.path).toBe('/accounts/ACC-12345678');
    expect(detectIdentifier('slow wifi')).toBeUndefined();
  });
});

describe('GlobalSearch', () => {
  it('jumps straight to a typed ticket number without querying the search API', async () => {
    // A long debounce proves the jump happens without waiting for any search round-trip.
    const service = renderSearch(async () => [], 10_000);
    await userEvent.type(screen.getByRole('combobox'), 'TKT-1234567{Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent('/portals/uconnect/tickets/TKT-1234567');
    expect(service.search).not.toHaveBeenCalled();
  });

  it('shows grouped results and supports keyboard selection in display order', async () => {
    renderSearch(async () => results);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'slow');
    expect(await screen.findByRole('group', { name: 'Support tickets' })).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    // Tickets are listed before help articles regardless of API order.
    expect(options.map((o) => o.textContent)).toEqual(['Slow broadband ticket', 'Fixing slow wifi']);

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent('/help/slow-wifi');
  });

  it('does not search below the minimum length and aborts superseded requests', async () => {
    const signals: AbortSignal[] = [];
    const service = renderSearch(
      (_q, signal) =>
        new Promise((resolve) => {
          signals.push(signal!);
          setTimeout(() => resolve(results), 20);
        }),
    );
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 's');
    expect(service.search).not.toHaveBeenCalled();

    await userEvent.type(input, 'lo');
    await waitFor(() => expect(service.search).toHaveBeenCalled());
    await userEvent.type(input, 'w');
    await waitFor(() => expect(signals.length).toBeGreaterThanOrEqual(2));
    expect(signals[0].aborted).toBe(true);
  });
});
```

## apps/uce/src/search/GlobalSearch.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/search/GlobalSearch.tsx`.

```tsx
import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { detectIdentifier, groupResults, MIN_QUERY_LENGTH, SearchResult, SearchService } from './searchService';

interface GlobalSearchProps {
  service: SearchService;
  debounceMs?: number;
  onSearch?: (resultCount: number) => void;
}

const GROUP_LABELS: Record<SearchResult['type'], string> = {
  ACCOUNT: 'Accounts',
  SERVICE: 'Services',
  ORDER: 'Orders',
  INVOICE: 'Invoices',
  TICKET: 'Support tickets',
  HELP: 'Help articles',
};

/**
 * Debounced global search across portals. Each keystroke aborts the in-flight
 * request so stale results never overwrite newer ones. Supports keyboard
 * navigation following the ARIA combobox pattern.
 */
export function GlobalSearch({ service, debounceMs = 250, onSearch }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const direct = useMemo(() => detectIdentifier(query), [query]);

  useEffect(() => {
    setActive(-1);
    if (direct || query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      service
        .search(query, controller.signal)
        .then((items) => {
          // Stored in display (grouped) order so keyboard positions match what is shown.
          setResults(groupResults(items).flatMap((g) => g.items));
          onSearch?.(items.length);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [debounceMs, direct, onSearch, query, service]);

  const options = useMemo(
    () => (direct ? [{ path: direct.path, label: direct.label }] : results.map((r) => ({ path: r.path, label: r.title }))),
    [direct, results],
  );

  const go = (path: string) => {
    setQuery('');
    setResults([]);
    navigate(path);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (event.key === 'Enter') {
      const choice = options[active] ?? (direct ? options[0] : undefined);
      if (choice) go(choice.path);
    } else if (event.key === 'Escape') {
      setQuery('');
    }
  };

  const listOpen = options.length > 0;
  return (
    <div className="uce-search" role="search">
      <input
        type="search"
        role="combobox"
        aria-label="Search accounts, invoices, tickets and help"
        aria-expanded={listOpen}
        aria-controls="uce-search-results"
        aria-activedescendant={active >= 0 ? `uce-search-option-${active}` : undefined}
        placeholder="Search or enter ACC-, INV-, TKT- number"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {busy && <span role="status">Searching...</span>}
      {listOpen && (
        <ul id="uce-search-results" role="listbox">
          {direct ? (
            <li id="uce-search-option-0" role="option" aria-selected={active === 0} onClick={() => go(direct.path)}>
              {direct.label}
            </li>
          ) : (
            groupResults(results).map((group) => (
              <li key={group.type} role="presentation">
                <span className="uce-search__group">{GROUP_LABELS[group.type]}</span>
                <ul role="group" aria-label={GROUP_LABELS[group.type]}>
                  {group.items.map((item) => {
                    const position = results.indexOf(item);
                    return (
                      <li
                        key={`${item.type}-${item.id}`}
                        id={`uce-search-option-${position}`}
                        role="option"
                        aria-selected={active === position}
                        onClick={() => go(item.path)}
                      >
                        {item.title}
                        {item.subtitle && <small> {item.subtitle}</small>}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
```
