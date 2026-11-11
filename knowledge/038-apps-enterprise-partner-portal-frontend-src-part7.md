# Enterprise Partner Portal: apps/enterprise-partner-portal/frontend/src (part 7 of 8)

- **Application:** Enterprise Partner Portal
- **Tech stack:** Java Spring Boot 3 + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 27

## Files

- `apps/enterprise-partner-portal/frontend/src/api/types.ts` (256 lines)
- `apps/enterprise-partner-portal/frontend/src/auth/AuthContext.tsx` (108 lines)
- `apps/enterprise-partner-portal/frontend/src/auth/RequireRole.test.tsx` (37 lines)
- `apps/enterprise-partner-portal/frontend/src/auth/RequireRole.tsx` (29 lines)
- `apps/enterprise-partner-portal/frontend/src/auth/oidc.test.ts` (41 lines)
- `apps/enterprise-partner-portal/frontend/src/auth/oidc.ts` (171 lines)
- `apps/enterprise-partner-portal/frontend/src/components/ErrorBanner.tsx` (22 lines)
- `apps/enterprise-partner-portal/frontend/src/components/FormField.tsx` (54 lines)
- `apps/enterprise-partner-portal/frontend/src/components/Layout.tsx` (46 lines)
- `apps/enterprise-partner-portal/frontend/src/components/Money.tsx` (18 lines)
- `apps/enterprise-partner-portal/frontend/src/components/PaginatedTable.test.tsx` (45 lines)
- `apps/enterprise-partner-portal/frontend/src/components/PaginatedTable.tsx` (79 lines)
- `apps/enterprise-partner-portal/frontend/src/components/StatusBadge.tsx` (20 lines)
- `apps/enterprise-partner-portal/frontend/src/config.ts` (33 lines)
- `apps/enterprise-partner-portal/frontend/src/hooks/useAsync.ts` (67 lines)
- `apps/enterprise-partner-portal/frontend/src/hooks/usePageParams.ts` (35 lines)
- `apps/enterprise-partner-portal/frontend/src/lib/format.ts` (29 lines)
- `apps/enterprise-partner-portal/frontend/src/lib/money.test.ts` (43 lines)
- `apps/enterprise-partner-portal/frontend/src/lib/money.ts` (57 lines)
- `apps/enterprise-partner-portal/frontend/src/main.tsx` (11 lines)
- `apps/enterprise-partner-portal/frontend/src/pages/CatalogPage.tsx` (55 lines)
- `apps/enterprise-partner-portal/frontend/src/pages/CommissionsPage.tsx` (110 lines)
- `apps/enterprise-partner-portal/frontend/src/pages/DashboardPage.tsx` (84 lines)
- `apps/enterprise-partner-portal/frontend/src/pages/DealsPage.tsx` (94 lines)
- `apps/enterprise-partner-portal/frontend/src/pages/LeadsPage.test.tsx` (61 lines)
- `apps/enterprise-partner-portal/frontend/src/pages/LeadsPage.tsx` (211 lines)
- `apps/enterprise-partner-portal/frontend/src/pages/QuoteBuilderPage.test.tsx` (107 lines)

## apps/enterprise-partner-portal/frontend/src/api/types.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/api/types.ts`.

```typescript
/** Wire types mirroring the API DTOs. Money is always integer minor units + ISO currency. */

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type Role = 'PARTNER_ADMIN' | 'PARTNER_AGENT' | 'CHANNEL_MANAGER' | 'SUPPORT_AGENT';

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'DISQUALIFIED';
export type LeadSource = 'REFERRAL' | 'EVENT' | 'WEBSITE' | 'OUTBOUND' | 'UNITI_SHARED' | 'OTHER';

export interface Lead {
  id: string;
  reference: string;
  ownerSubject: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  postcode: string;
  siteCount: number;
  estimatedMrcMinor: number;
  productInterest?: string;
  source: LeadSource;
  status: LeadStatus;
  score: number;
  scoreBand: 'HOT' | 'WARM' | 'COLD';
  notes?: string;
  nextActionAt?: string;
  disqualifyReason?: string;
  convertedDealId?: string;
  createdAt: string;
}

export interface LeadRequest {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  postcode: string;
  siteCount: number;
  estimatedMrcMinor: number;
  productInterest?: string;
  source: LeadSource;
  notes?: string;
  nextActionAt?: string;
}

export interface ConvertLeadRequest {
  customerCompanyNumber?: string;
  customerWebsite?: string;
  expectedCloseDate: string;
}

export interface ConvertLeadResult {
  dealId: string;
  dealReference: string;
  dealStatus: DealStatus;
  hasConflict: boolean;
}

export type DealStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'WON' | 'LOST' | 'EXPIRED' | 'WITHDRAWN';

export interface Deal {
  id: string;
  reference: string;
  customerName: string;
  customerPostcode: string;
  siteCount: number;
  estimatedMrcMinor: number;
  currency: string;
  expectedCloseDate: string;
  productInterest: string;
  status: DealStatus;
  hasConflict: boolean;
  protectedUntil?: string;
  extensionsUsed: number;
  extensionAvailable: boolean;
  decisionReason?: string;
  submittedAt: string;
}

export type ProductCategory = 'BROADBAND' | 'VOICE' | 'SDWAN' | 'HOSTED' | 'ADD_ON';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  bandwidthMbps?: number;
  monthlyPriceMinor: number;
  installPriceMinor: number;
  minTermMonths: number;
  perSite: boolean;
  currency: string;
}

export type QuoteStatus =
  | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'ORDERED';
export type ApprovalLevel = 'NONE' | 'CHANNEL_MANAGER' | 'DEAL_DESK';

export interface QuoteLineRequest {
  sku: string;
  siteName: string;
  sitePostcode: string;
  quantity: number;
}

export interface QuoteRequest {
  dealId?: string;
  customerName: string;
  customerAccountId?: string;
  customerContactEmail: string;
  termMonths: number;
  requestedDiscountPercent: number;
  justification?: string;
  lines: QuoteLineRequest[];
}

export interface PricingPreview {
  listMrcMinor: number;
  termDiscountMinor: number;
  volumeDiscountMinor: number;
  partnerDiscountMinor: number;
  netMrcMinor: number;
  nrcMinor: number;
  nrcWaived: boolean;
  totalContractValueMinor: number;
  termDiscountPercent: number;
  volumeDiscountPercent: number;
  effectiveDiscountPercent: number;
  selfApprovedAllowancePercent: number;
  approvalLevel: ApprovalLevel;
  blockers: string[];
  currency: string;
}

export interface Quote {
  id: string;
  reference: string;
  dealId?: string;
  customerName: string;
  termMonths: number;
  currency: string;
  status: QuoteStatus;
  revision: number;
  requestedDiscountPercent: number;
  netMrcMinor: number;
  totalContractValueMinor: number;
  approvalLevel: ApprovalLevel;
  approvalsReceived: number;
  validUntil?: string;
  createdAt: string;
}

export type StatementStatus = 'DRAFT' | 'ISSUED' | 'DISPUTED' | 'APPROVED' | 'CARRIED_FORWARD' | 'PAID';

export interface Statement {
  id: string;
  reference: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  status: StatementStatus;
  accruedMinor: number;
  clawbackMinor: number;
  adjustmentMinor: number;
  broughtForwardMinor: number;
  netPayableMinor: number;
  issuedAt?: string;
  disputeReason?: string;
  disputable: boolean;
}

export interface StatementEntry {
  id: string;
  orderReference?: string;
  type: 'ACCRUAL' | 'CLAWBACK' | 'ADJUSTMENT';
  component: string;
  description: string;
  amountMinor: number;
  currency: string;
  earnedOn: string;
}

export interface Payout {
  id: string;
  amountMinor: number;
  currency: string;
  status: 'SCHEDULED' | 'PAID' | 'FAILED';
  scheduledFor: string;
  paymentReference?: string;
  paidAt?: string;
}

export interface StatementDetail {
  statement: Statement;
  entries: StatementEntry[];
  payout?: Payout;
}

export interface CommissionSummary {
  currency: string;
  tier: string;
  tierRateBps: number;
  earnedYearToDateMinor: number;
  unbilledMinor: number;
  paidYearToDateMinor: number;
  outstandingPayoutMinor: number;
}

export interface StageTotal {
  count: number;
  mrcMinor: number;
}

export interface PipelineKpis {
  currency: string;
  windowStart: string;
  leadsByStatus: Partial<Record<LeadStatus, number>>;
  newLeads: number;
  leadConversionRate: number | null;
  dealsByStatus: Partial<Record<DealStatus, StageTotal>>;
  openPipelineMrcMinor: number;
  dealWinRate: number | null;
  quotesByStatus: Partial<Record<QuoteStatus, number>>;
  quoteAcceptanceRate: number | null;
  ordersByStatus: Partial<Record<string, StageTotal>>;
  ordersInFlight: number;
  activatedMrcMinor: number;
}

export type PartnerUserRole = 'PARTNER_ADMIN' | 'PARTNER_AGENT';

export interface PartnerUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: PartnerUserRole;
  status: 'INVITED' | 'ACTIVE' | 'DEACTIVATED';
  certified: boolean;
  certifiedUntil?: string;
  inviteExpiresAt: string;
  lastLoginAt?: string;
}

export interface SeatUsage {
  seatLimit: number;
  seatsUsed: number;
  seatsAvailable: number;
}
```

## apps/enterprise-partner-portal/frontend/src/auth/AuthContext.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/auth/AuthContext.tsx`.

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { config } from '../config';
import type { Role } from '../api/types';
import {
  beginLogin, completeLogin, endSession, isExpired, loadTokens, saveTokens, userFromToken,
  type SessionUser, type TokenSet,
} from './oidc';

export interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous' | 'error';
  user?: SessionUser;
  error?: string;
  accessToken: () => string | undefined;
  hasAnyRole: (...roles: Role[]) => boolean;
  login: (returnTo?: string) => void;
  logout: () => void;
  sessionExpired: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<TokenSet | undefined>(() => loadTokens());
  const [status, setStatus] = useState<AuthState['status']>(() => (window.location.pathname === '/callback'
    ? 'loading' : loadTokens() ? 'authenticated' : 'anonymous'));
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (window.location.pathname !== '/callback') {
      return;
    }
    const { oidcAuthority, oidcClientId } = config();
    completeLogin(oidcAuthority, oidcClientId, window.location.search)
      .then(({ tokens: fresh, returnTo }) => {
        saveTokens(fresh);
        setTokens(fresh);
        setStatus('authenticated');
        window.history.replaceState(null, '', returnTo);
      })
      .catch((e: Error) => {
        setError(e.message);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    if (!tokens) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      saveTokens(undefined);
      setTokens(undefined);
      setStatus('anonymous');
    }, Math.max(0, tokens.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [tokens]);

  const user = useMemo(() => {
    if (!tokens) {
      return undefined;
    }
    const { rolesClaim, partnerClaim } = config();
    return userFromToken(tokens.accessToken, rolesClaim, partnerClaim);
  }, [tokens]);

  const login = useCallback((returnTo?: string) => {
    const { oidcAuthority, oidcClientId, oidcScope } = config();
    const target = returnTo ?? window.location.pathname + window.location.search;
    beginLogin(oidcAuthority, oidcClientId, oidcScope, target).catch((e: Error) => {
      setError(e.message);
      setStatus('error');
    });
  }, []);

  const logout = useCallback(() => {
    const { oidcAuthority, oidcClientId } = config();
    void endSession(oidcAuthority, oidcClientId, tokens?.idToken);
  }, [tokens]);

  const value = useMemo<AuthState>(() => ({
    status,
    user,
    error,
    accessToken: () => (tokens && !isExpired(tokens) ? tokens.accessToken : undefined),
    hasAnyRole: (...roles) => !!user && roles.some((r) => user.roles.includes(r)),
    login,
    logout,
    sessionExpired: () => {
      saveTokens(undefined);
      setTokens(undefined);
      setStatus('anonymous');
    },
  }), [status, user, error, tokens, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

/** Lets tests and storybook-style harnesses supply a fixed auth state. */
export const AuthTestProvider = AuthContext.Provider;
```

## apps/enterprise-partner-portal/frontend/src/auth/RequireRole.test.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/auth/RequireRole.test.tsx`.

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { renderWithApp } from '../test/harness';
import { RequireRole } from './RequireRole';

describe('role gating', () => {
  it('renders children only for permitted roles', () => {
    renderWithApp(<RequireRole roles={['PARTNER_ADMIN']} fallback={<p>nope</p>}><p>secret</p></RequireRole>,
      { roles: ['PARTNER_AGENT'] });

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByText('nope')).toBeInTheDocument();
  });

  it('hides admin navigation from agents', () => {
    renderWithApp(<AppRoutes />, { roles: ['PARTNER_AGENT'], route: '/catalog', api: { catalog: { list: async () => [] } } });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).toHaveTextContent('Leads');
    expect(nav).not.toHaveTextContent('Commissions');
    expect(nav).not.toHaveTextContent('Team');
  });

  it('blocks agents who navigate directly to an admin page', () => {
    renderWithApp(<AppRoutes />, { roles: ['PARTNER_AGENT'], route: '/commissions' });

    expect(screen.getByRole('alert')).toHaveTextContent('Not available');
  });

  it('shows admin navigation to partner admins', () => {
    renderWithApp(<AppRoutes />, { roles: ['PARTNER_ADMIN'], route: '/catalog', api: { catalog: { list: async () => [] } } });

    expect(screen.getByRole('navigation', { name: 'Main' })).toHaveTextContent('Team');
  });
});
```

## apps/enterprise-partner-portal/frontend/src/auth/RequireRole.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/auth/RequireRole.tsx`.

```tsx
import type { ReactNode } from 'react';
import type { Role } from '../api/types';
import { useAuth } from './AuthContext';

interface Props {
  roles: Role[];
  children: ReactNode;
  /** Rendered instead of the children when the user lacks every listed role. */
  fallback?: ReactNode;
}

/**
 * Hides UI the caller is not entitled to. This is a usability measure only: the API enforces
 * every role check server-side and answers 403 regardless of what the UI shows.
 */
export function RequireRole({ roles, children, fallback = null }: Props) {
  const { hasAnyRole } = useAuth();
  return <>{hasAnyRole(...roles) ? children : fallback}</>;
}

export function Forbidden() {
  return (
    <section className="panel" role="alert">
      <h2>Not available</h2>
      <p>Your role does not give access to this page. Ask your partner administrator if you need it.</p>
    </section>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/auth/oidc.test.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/auth/oidc.test.ts`.

```typescript
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
```

## apps/enterprise-partner-portal/frontend/src/auth/oidc.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/auth/oidc.ts`.

```typescript
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
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
  return JSON.parse(decodeURIComponent(escape(json))) as Record<string, unknown>;
}

/** Mirrors the API's role extraction: a JSON array or a space/comma separated string, upper-cased. */
export function extractRoles(claims: Record<string, unknown>, claim: string): string[] {
  const raw = claims[claim];
  const values = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/[ ,]/) : [];
  return [...new Set(values.map((v) => v.trim().toUpperCase()).filter(Boolean))];
}

export function userFromToken(accessToken: string, rolesClaim: string, partnerClaim: string): SessionUser {
  const claims = decodeJwt(accessToken);
  const email = typeof claims.email === 'string' ? claims.email : undefined;
  return {
    subject: String(claims.sub ?? ''),
    name: typeof claims.name === 'string' ? claims.name : email ?? 'Unknown user',
    email,
    partnerId: typeof claims[partnerClaim] === 'string' ? (claims[partnerClaim] as string) : undefined,
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
```

## apps/enterprise-partner-portal/frontend/src/components/ErrorBanner.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/components/ErrorBanner.tsx`.

```tsx
import { describeError, ProblemError } from '../api/problem';

const DETAIL_LISTS = ['blockers', 'problems', 'missing', 'conflictingReferences'];

/** Shows an API failure with any rule details it carries and the reference to quote to support. */
export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }
  const details = error instanceof ProblemError ? DETAIL_LISTS.flatMap((k) => error.listDetail(k)) : [];
  return (
    <div className="banner banner--error" role="alert">
      <p>{describeError(error)}</p>
      {details.length > 0 && (
        <ul>
          {details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </div>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/components/FormField.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/components/FormField.tsx`.

```tsx
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ProblemError } from '../api/problem';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}

function FieldShell({ label, error, hint, children }: FieldShellProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {hint && !error && <small id={`${id}-hint`}>{hint}</small>}
      {error && <small id={`${id}-error`} className="field__error">{error}</small>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };

export function TextField({ label, error, hint, ...input }: InputProps) {
  return <FieldShell label={label} error={error} hint={hint}>{(a11y) => <input {...input} {...a11y} />}</FieldShell>;
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export function SelectField({ label, error, options, placeholder, ...select }: SelectProps) {
  return (
    <FieldShell label={label} error={error}>
      {(a11y) => (
        <select {...select} {...a11y}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </FieldShell>
  );
}

/** Field-level messages from a 400 problem response, keyed by request field name. */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  return error instanceof ProblemError ? error.fieldErrors : {};
}
```

## apps/enterprise-partner-portal/frontend/src/components/Layout.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/components/Layout.tsx`.

```tsx
import { NavLink, Outlet } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  roles: Role[];
}

const PARTNER: Role[] = ['PARTNER_ADMIN', 'PARTNER_AGENT'];
const ADMIN: Role[] = ['PARTNER_ADMIN'];

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', roles: PARTNER },
  { to: '/leads', label: 'Leads', roles: PARTNER },
  { to: '/deals', label: 'Deals', roles: PARTNER },
  { to: '/quotes', label: 'Quotes', roles: PARTNER },
  { to: '/catalog', label: 'Catalog', roles: PARTNER },
  { to: '/commissions', label: 'Commissions', roles: ADMIN },
  { to: '/team', label: 'Team', roles: ADMIN },
];

export function Layout() {
  const { user, hasAnyRole, logout } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <strong>Uniti Partner Portal</strong>
        <nav aria-label="Main">
          {NAV.filter((n) => hasAnyRole(...n.roles)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="topbar__user">
          <span>{user?.name}</span>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/components/Money.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/components/Money.tsx`.

```tsx
import { formatMoney } from '../lib/money';

interface Props {
  minor: number;
  currency: string;
  /** Show positive values with an explicit "+" (ledger style). */
  signed?: boolean;
}

export function Money({ minor, currency, signed = false }: Props) {
  const text = formatMoney(minor, currency);
  return (
    <span className={`money${minor < 0 ? ' money--negative' : ''}`}>
      {signed && minor > 0 ? `+${text}` : text}
    </span>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/components/PaginatedTable.test.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/components/PaginatedTable.test.tsx`.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProblemError } from '../api/problem';
import { pageCount, PaginatedTable, type Column } from './PaginatedTable';

interface Row { id: string; name: string }
const columns: Column<Row>[] = [{ header: 'Name', render: (r) => r.name }];

describe('PaginatedTable', () => {
  it('shows the visible range and moves between pages', async () => {
    const onPageChange = vi.fn();
    render(<PaginatedTable columns={columns} loading={false} rowKey={(r) => r.id} onPageChange={onPageChange}
      page={{ items: [{ id: '1', name: 'Northwind' }], page: 2, pageSize: 20, total: 41 }} />);

    expect(screen.getByText('Northwind')).toBeInTheDocument();
    expect(screen.getByText('21–40 of 41')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange.mock.calls).toEqual([[3], [1]]);
  });

  it('disables navigation at the edges and shows the empty message', () => {
    render(<PaginatedTable columns={columns} loading={false} rowKey={(r) => r.id} onPageChange={vi.fn()}
      emptyMessage="No leads." page={{ items: [], page: 1, pageSize: 20, total: 0 }} />);

    expect(screen.getByText('No leads.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('renders API problems with the correlation reference', () => {
    const error = new ProblemError({ status: 403, detail: 'This record belongs to another partner', correlationId: 'abc-123' });
    render(<PaginatedTable columns={columns} loading={false} rowKey={(r) => r.id} onPageChange={vi.fn()} error={error} />);

    expect(screen.getByRole('alert')).toHaveTextContent('This record belongs to another partner (reference abc-123)');
  });

  it('computes at least one page', () => {
    expect(pageCount({ total: 0, pageSize: 20 })).toBe(1);
    expect(pageCount({ total: 101, pageSize: 50 })).toBe(3);
  });
});
```

## apps/enterprise-partner-portal/frontend/src/components/PaginatedTable.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/components/PaginatedTable.tsx`.

```tsx
import type { ReactNode } from 'react';
import type { Page } from '../api/types';
import { ErrorBanner } from './ErrorBanner';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

interface Props<T> {
  columns: Column<T>[];
  page?: Page<T>;
  loading: boolean;
  error?: unknown;
  rowKey: (row: T) => string;
  onPageChange: (page: number) => void;
  emptyMessage?: string;
  caption?: string;
}

export function pageCount(page: Pick<Page<unknown>, 'total' | 'pageSize'>): number {
  return Math.max(1, Math.ceil(page.total / page.pageSize));
}

/** Renders an API page ({items, page, pageSize, total}) with previous/next navigation. */
export function PaginatedTable<T>({
  columns, page, loading, error, rowKey, onPageChange, emptyMessage = 'Nothing to show yet.', caption,
}: Props<T>) {
  if (error) {
    return <ErrorBanner error={error} />;
  }
  const items = page?.items ?? [];
  const pages = page ? pageCount(page) : 1;
  const first = page && page.total > 0 ? (page.page - 1) * page.pageSize + 1 : 0;
  const last = page ? Math.min(page.page * page.pageSize, page.total) : 0;

  return (
    <div className="table-wrap" aria-busy={loading}>
      <table>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header} style={{ textAlign: c.align ?? 'left' }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.header} style={{ textAlign: c.align ?? 'left' }}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
          {!loading && items.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="empty">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
      {page && page.total > 0 && (
        <nav className="pager" aria-label="Pagination">
          <span>{first}–{last} of {page.total}</span>
          <button type="button" disabled={loading || page.page <= 1} onClick={() => onPageChange(page.page - 1)}>
            Previous
          </button>
          <span>Page {page.page} of {pages}</span>
          <button type="button" disabled={loading || page.page >= pages} onClick={() => onPageChange(page.page + 1)}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/components/StatusBadge.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/components/StatusBadge.tsx`.

```tsx
import { humanise } from '../lib/format';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** One tone table for every lifecycle in the portal, so a status reads the same everywhere. */
const TONES: Record<string, Tone> = {
  NEW: 'info', CONTACTED: 'info', QUALIFIED: 'success', CONVERTED: 'success', DISQUALIFIED: 'neutral',
  SUBMITTED: 'info', UNDER_REVIEW: 'warning', APPROVED: 'success', REJECTED: 'danger', WON: 'success',
  LOST: 'neutral', EXPIRED: 'neutral', WITHDRAWN: 'neutral',
  DRAFT: 'neutral', PENDING_APPROVAL: 'warning', SENT: 'info', ACCEPTED: 'success', DECLINED: 'danger',
  ORDERED: 'success', ISSUED: 'info', DISPUTED: 'warning', CARRIED_FORWARD: 'neutral', PAID: 'success',
  SCHEDULED: 'info', FAILED: 'danger', INVITED: 'info', ACTIVE: 'success', DEACTIVATED: 'neutral',
  HOT: 'danger', WARM: 'warning', COLD: 'info',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = TONES[status] ?? 'neutral';
  return <span className={`badge badge--${tone}`} data-tone={tone}>{humanise(status)}</span>;
}
```

## apps/enterprise-partner-portal/frontend/src/config.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/config.ts`.

```typescript
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable ${name}; see .env.example`);
  }
  return value;
}

export interface PortalConfig {
  oidcAuthority: string;
  oidcClientId: string;
  oidcScope: string;
  rolesClaim: string;
  partnerClaim: string;
  apiBaseUrl: string;
}

let cached: PortalConfig | undefined;

export function config(): PortalConfig {
  if (!cached) {
    const env = import.meta.env;
    cached = {
      oidcAuthority: required('VITE_OIDC_AUTHORITY', env.VITE_OIDC_AUTHORITY).replace(/\/$/, ''),
      oidcClientId: required('VITE_OIDC_CLIENT_ID', env.VITE_OIDC_CLIENT_ID),
      oidcScope: env.VITE_OIDC_SCOPE || 'openid profile email',
      rolesClaim: env.VITE_JWT_ROLES_CLAIM || 'roles',
      partnerClaim: env.VITE_JWT_PARTNER_CLAIM || 'partner_id',
      apiBaseUrl: (env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
    };
  }
  return cached;
}
```

## apps/enterprise-partner-portal/frontend/src/hooks/useAsync.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/hooks/useAsync.ts`.

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data?: T;
  error?: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs an async loader whenever its dependencies change. Stale responses from a superseded
 * request are discarded so fast filter changes can never render out-of-order results.
 */
export function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ data: s.data, loading: true }));
    loaderRef.current(controller.signal)
      .then((data) => !controller.signal.aborted && setState({ data, loading: false }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ error, loading: false });
        }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

export interface Mutation<A extends unknown[], R> {
  run: (...args: A) => Promise<R | undefined>;
  pending: boolean;
  error?: unknown;
  reset: () => void;
}

/** Wraps a write call with pending/error state; resolves undefined when the call failed. */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>): Mutation<A, R> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args: A) => {
    setPending(true);
    setError(undefined);
    try {
      return await fnRef.current(...args);
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error, reset: () => setError(undefined) };
}
```

## apps/enterprise-partner-portal/frontend/src/hooks/usePageParams.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/hooks/usePageParams.ts`.

```typescript
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keeps list state (page, size and filters) in the URL so lists are shareable and survive
 * reloads. Changing any filter resets to page 1.
 */
export function usePageParams<F extends string>(filterKeys: readonly F[], defaultPageSize = 20) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || defaultPageSize));
  const filters = Object.fromEntries(filterKeys.map((k) => [k, params.get(k) ?? ''])) as Record<F, string>;

  const setPage = useCallback((next: number) => {
    setParams((p) => {
      p.set('page', String(next));
      return p;
    });
  }, [setParams]);

  const setFilter = useCallback((key: F, value: string) => {
    setParams((p) => {
      if (value) {
        p.set(key, value);
      } else {
        p.delete(key);
      }
      p.delete('page');
      return p;
    });
  }, [setParams]);

  return { page, pageSize, filters, setPage, setFilter };
}
```

## apps/enterprise-partner-portal/frontend/src/lib/format.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/lib/format.ts`.

```typescript
/** Dates arrive as ISO-8601 UTC strings; they are displayed in the user's locale but in UTC for dates. */

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(iso?: string | null): string {
  return iso ? dateFmt.format(new Date(iso)) : '—';
}

export function formatDateTime(iso?: string | null): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : '—';
}

export function formatPercent(value?: number | null): string {
  return value === null || value === undefined ? 'n/a' : `${Number(value).toFixed(1)}%`;
}

/** ISO date (yyyy-mm-dd) `days` from today in UTC, for date inputs with sensible defaults. */
export function isoDateFromToday(days: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

/** Converts an enum constant such as PENDING_APPROVAL into "Pending approval". */
export function humanise(constant: string): string {
  const words = constant.toLowerCase().split('_');
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(' ');
}
```

## apps/enterprise-partner-portal/frontend/src/lib/money.test.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/lib/money.test.ts`.

```typescript
import { describe, expect, it } from 'vitest';
import { formatBps, formatMoney, minorToInput, parseMoneyInput } from './money';

describe('formatMoney', () => {
  it('formats minor units exactly with grouping and symbol', () => {
    expect(formatMoney(123456789, 'GBP')).toBe('£1,234,567.89');
    expect(formatMoney(5, 'GBP')).toBe('£0.05');
    expect(formatMoney(-2500, 'GBP')).toBe('-£25.00');
  });

  it('never drifts on amounts that are inexact in binary floating point', () => {
    expect(formatMoney(1010, 'GBP')).toBe('£10.10');
    expect(formatMoney(29, 'EUR')).toBe('€0.29');
  });

  it('rejects fractional minor units', () => {
    expect(() => formatMoney(10.5, 'GBP')).toThrow(RangeError);
  });
});

describe('parseMoneyInput', () => {
  it.each([
    ['1250', 125000],
    ['1,250.5', 125050],
    ['£99.99', 9999],
    [' 0.07 ', 7],
  ])('parses %s', (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '-5', '1.2.3'])('rejects %s', (input) => {
    expect(parseMoneyInput(input)).toBeUndefined();
  });

  it('round-trips with minorToInput', () => {
    expect(parseMoneyInput(minorToInput(1234505))).toBe(1234505);
  });
});

it('formats basis points as a percentage', () => {
  expect(formatBps(1250)).toBe('12.50%');
});
```

## apps/enterprise-partner-portal/frontend/src/lib/money.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/lib/money.ts`.

```typescript
/**
 * Money helpers. Amounts stay as integer minor units end to end; conversion to a decimal
 * string happens only for display or when parsing user input, never via floating-point maths
 * on stored values.
 */

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatters.set(currency, f);
  }
  return f;
}

export function formatMoney(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Amount must be an integer number of minor units: ${amountMinor}`);
  }
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const major = Math.trunc(abs / 100);
  const minor = abs % 100;
  // Format the major part via Intl for grouping/symbol, then splice the exact minor digits in.
  const parts = formatter(currency).formatToParts(major);
  const text = parts
    .map((p) => (p.type === 'fraction' ? String(minor).padStart(2, '0') : p.value))
    .join('');
  return negative ? `-${text}` : text;
}

/**
 * Parses a user-entered major-unit amount ("1,234.5", "£99") into minor units. Returns
 * undefined for anything that is not a plain non-negative amount with at most two decimals.
 */
export function parseMoneyInput(input: string): number | undefined {
  const cleaned = input.replace(/[£$€,\s]/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    return undefined;
  }
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : undefined;
}

export function minorToInput(amountMinor: number): string {
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
```

## apps/enterprise-partner-portal/frontend/src/main.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/main.tsx`.

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

## apps/enterprise-partner-portal/frontend/src/pages/CatalogPage.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/pages/CatalogPage.tsx`.

```tsx
import { useState } from 'react';
import { useEndpoints } from '../api/ApiContext';
import type { ProductCategory } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { SelectField } from '../components/FormField';
import { Money } from '../components/Money';
import { useAsync } from '../hooks/useAsync';
import { humanise } from '../lib/format';

const CATEGORIES: ProductCategory[] = ['BROADBAND', 'VOICE', 'SDWAN', 'HOSTED', 'ADD_ON'];

export function CatalogPage() {
  const api = useEndpoints();
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const products = useAsync(() => api.catalog.list(category || undefined), [api, category]);

  return (
    <>
      <h1>Catalog</h1>
      <div className="toolbar">
        <SelectField label="Category" value={category} placeholder="All products"
          options={CATEGORIES.map((c) => ({ value: c, label: humanise(c) }))}
          onChange={(e) => setCategory(e.target.value as ProductCategory | '')} />
      </div>
      <ErrorBanner error={products.error} />
      <div className="table-wrap" aria-busy={products.loading}>
        <table>
          <thead>
            <tr>
              <th>Product</th><th>SKU</th><th>Category</th><th>Speed</th>
              <th style={{ textAlign: 'right' }}>Monthly</th><th style={{ textAlign: 'right' }}>Installation</th>
              <th>Min. term</th><th>Priced</th>
            </tr>
          </thead>
          <tbody>
            {(products.data ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.sku}</td>
                <td>{humanise(p.category)}</td>
                <td>{p.bandwidthMbps ? (p.bandwidthMbps >= 1000 ? `${p.bandwidthMbps / 1000} Gbps` : `${p.bandwidthMbps} Mbps`) : '—'}</td>
                <td style={{ textAlign: 'right' }}><Money minor={p.monthlyPriceMinor} currency={p.currency} /></td>
                <td style={{ textAlign: 'right' }}><Money minor={p.installPriceMinor} currency={p.currency} /></td>
                <td>{p.minTermMonths} months</td>
                <td>{p.perSite ? 'Per site' : 'Per unit'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Installation is waived on terms of 36 months or more. Prices exclude VAT.</p>
    </>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/pages/CommissionsPage.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/pages/CommissionsPage.tsx`.

```tsx
import { useState } from 'react';
import { useEndpoints } from '../api/ApiContext';
import type { Statement } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { Money } from '../components/Money';
import { PaginatedTable, type Column } from '../components/PaginatedTable';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync, useMutation } from '../hooks/useAsync';
import { usePageParams } from '../hooks/usePageParams';
import { formatDate, humanise } from '../lib/format';
import { formatBps } from '../lib/money';

function StatementDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const api = useEndpoints();
  const detail = useAsync(() => api.commissions.statement(id), [api, id]);
  const dispute = useMutation((reason: string) => api.commissions.dispute(id, reason));
  const [reason, setReason] = useState('');

  if (detail.error) return <ErrorBanner error={detail.error} />;
  if (!detail.data) return <p className="loading">Loading statement…</p>;
  const { statement: s, entries, payout } = detail.data;

  return (
    <section className="panel" aria-label={`Statement ${s.reference}`}>
      <h2>{s.reference}: {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}</h2>
      <dl className="breakdown">
        <dt>Accrued</dt><dd><Money minor={s.accruedMinor} currency={s.currency} /></dd>
        <dt>Clawbacks</dt><dd><Money minor={s.clawbackMinor} currency={s.currency} /></dd>
        <dt>Adjustments</dt><dd><Money minor={s.adjustmentMinor} currency={s.currency} signed /></dd>
        <dt>Brought forward</dt><dd><Money minor={s.broughtForwardMinor} currency={s.currency} signed /></dd>
        <dt><strong>Net payable</strong></dt><dd><strong><Money minor={s.netPayableMinor} currency={s.currency} /></strong></dd>
      </dl>
      {payout && (
        <p>Payout <StatusBadge status={payout.status} /> scheduled {formatDate(payout.scheduledFor)}
          {payout.paymentReference && `, reference ${payout.paymentReference}`}</p>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Earned</th><th>Order</th><th>Type</th><th>Detail</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.earnedOn)}</td>
                <td>{e.orderReference ?? '—'}</td>
                <td>{humanise(e.type)}</td>
                <td>{e.description}</td>
                <td style={{ textAlign: 'right' }}><Money minor={e.amountMinor} currency={e.currency} signed /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.disputeReason && <p>Dispute raised: {s.disputeReason}</p>}
      {s.disputable && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (await dispute.run(reason.trim())) {
            setReason('');
            detail.reload();
            onChanged();
          }
        }}>
          <label htmlFor="dispute-reason">Something wrong? Explain what is missing or incorrect.</label>
          <textarea id="dispute-reason" rows={3} style={{ width: '100%' }} value={reason} maxLength={1000}
            onChange={(e) => setReason(e.target.value)} />
          <ErrorBanner error={dispute.error} />
          <button type="submit" disabled={!reason.trim() || dispute.pending}>Raise dispute</button>
        </form>
      )}
    </section>
  );
}

export function CommissionsPage() {
  const api = useEndpoints();
  const { page, pageSize, setPage } = usePageParams([] as const);
  const summary = useAsync(() => api.commissions.summary(), [api]);
  const statements = useAsync(() => api.commissions.statements({ page, pageSize }), [api, page, pageSize]);
  const [selected, setSelected] = useState<string>();

  const columns: Column<Statement>[] = [
    { header: 'Statement', render: (s) => s.reference },
    { header: 'Period', render: (s) => `${formatDate(s.periodStart)} – ${formatDate(s.periodEnd)}` },
    { header: 'Net payable', align: 'right', render: (s) => <Money minor={s.netPayableMinor} currency={s.currency} /> },
    { header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
    { header: '', render: (s) => <button type="button" onClick={() => setSelected(s.id)}>View</button> },
  ];

  const sum = summary.data;
  return (
    <>
      <h1>Commissions</h1>
      <ErrorBanner error={summary.error} />
      {sum && (
        <section className="grid" aria-label="Commission summary">
          <div className="kpi"><div className="kpi__label">Tier rate</div><div className="kpi__value">{humanise(sum.tier)} · {formatBps(sum.tierRateBps)}</div></div>
          <div className="kpi"><div className="kpi__label">Earned this year</div><div className="kpi__value"><Money minor={sum.earnedYearToDateMinor} currency={sum.currency} /></div></div>
          <div className="kpi"><div className="kpi__label">Not yet on a statement</div><div className="kpi__value"><Money minor={sum.unbilledMinor} currency={sum.currency} /></div></div>
          <div className="kpi"><div className="kpi__label">Paid this year</div><div className="kpi__value"><Money minor={sum.paidYearToDateMinor} currency={sum.currency} /></div></div>
          <div className="kpi"><div className="kpi__label">Awaiting payment</div><div className="kpi__value"><Money minor={sum.outstandingPayoutMinor} currency={sum.currency} /></div></div>
        </section>
      )}
      <h2 style={{ marginTop: 24 }}>Statements</h2>
      <PaginatedTable columns={columns} page={statements.data} loading={statements.loading} error={statements.error}
        rowKey={(s) => s.id} onPageChange={setPage} emptyMessage="No statements yet." />
      {selected && <StatementDetail key={selected} id={selected} onChanged={statements.reload} />}
    </>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/pages/DashboardPage.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/pages/DashboardPage.tsx`.

```tsx
import { useState, type ReactNode } from 'react';
import { useEndpoints } from '../api/ApiContext';
import type { DealStatus, PipelineKpis } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { Money } from '../components/Money';
import { formatDate, formatPercent, humanise } from '../lib/format';
import { useAsync } from '../hooks/useAsync';

const WINDOWS = [30, 90, 180, 365];
const DEAL_STAGES: DealStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'WON', 'LOST'];

function Kpi({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kpi">
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">{children}</div>
    </div>
  );
}

function openLeads(k: PipelineKpis): number {
  return (k.leadsByStatus.NEW ?? 0) + (k.leadsByStatus.CONTACTED ?? 0) + (k.leadsByStatus.QUALIFIED ?? 0);
}

export function DashboardPage() {
  const api = useEndpoints();
  const [days, setDays] = useState(90);
  const { data, error, loading } = useAsync(() => api.dashboard.pipeline(days), [api, days]);

  return (
    <>
      <div className="toolbar">
        <h1 style={{ flex: 1 }}>Pipeline</h1>
        <label>
          Window{' '}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {WINDOWS.map((w) => <option key={w} value={w}>Last {w} days</option>)}
          </select>
        </label>
      </div>
      <ErrorBanner error={error} />
      {loading && !data && <p className="loading">Loading KPIs…</p>}
      {data && (
        <>
          <section className="grid" aria-label="Key figures">
            <Kpi label="Open pipeline (monthly)"><Money minor={data.openPipelineMrcMinor} currency={data.currency} /></Kpi>
            <Kpi label="Activated MRC">
              <Money minor={data.activatedMrcMinor} currency={data.currency} />
            </Kpi>
            <Kpi label="Open leads">{openLeads(data)}</Kpi>
            <Kpi label="New leads">{data.newLeads}</Kpi>
            <Kpi label="Lead conversion">{formatPercent(data.leadConversionRate)}</Kpi>
            <Kpi label="Deal win rate">{formatPercent(data.dealWinRate)}</Kpi>
            <Kpi label="Quote acceptance">{formatPercent(data.quoteAcceptanceRate)}</Kpi>
            <Kpi label="Orders in flight">{data.ordersInFlight}</Kpi>
          </section>
          <section className="panel" style={{ marginTop: 20 }}>
            <h2>Deal registrations since {formatDate(data.windowStart)}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Stage</th><th style={{ textAlign: 'right' }}>Deals</th><th style={{ textAlign: 'right' }}>Monthly value</th></tr>
                </thead>
                <tbody>
                  {DEAL_STAGES.map((stage) => {
                    const total = data.dealsByStatus[stage];
                    return (
                      <tr key={stage}>
                        <td>{humanise(stage)}</td>
                        <td style={{ textAlign: 'right' }}>{total?.count ?? 0}</td>
                        <td style={{ textAlign: 'right' }}><Money minor={total?.mrcMinor ?? 0} currency={data.currency} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/pages/DealsPage.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/pages/DealsPage.tsx`.

```tsx
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEndpoints } from '../api/ApiContext';
import type { Deal, DealStatus } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { Money } from '../components/Money';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync, useMutation } from '../hooks/useAsync';
import { formatDate } from '../lib/format';

/** Board columns; closed-out statuses are grouped so the board stays readable. */
export const STAGES: { title: string; statuses: DealStatus[] }[] = [
  { title: 'Registered', statuses: ['SUBMITTED'] },
  { title: 'Under review', statuses: ['UNDER_REVIEW'] },
  { title: 'Protected', statuses: ['APPROVED'] },
  { title: 'Won', statuses: ['WON'] },
  { title: 'Closed', statuses: ['LOST', 'REJECTED', 'EXPIRED', 'WITHDRAWN'] },
];

const BOARD_SIZE = 100;

export function groupByStage(deals: Deal[]): Map<string, Deal[]> {
  const board = new Map(STAGES.map((s) => [s.title, [] as Deal[]]));
  for (const deal of deals) {
    const stage = STAGES.find((s) => s.statuses.includes(deal.status));
    board.get(stage?.title ?? 'Closed')!.push(deal);
  }
  return board;
}

function DealCard({ deal, onChanged }: { deal: Deal; onChanged: () => void }) {
  const api = useEndpoints();
  const extend = useMutation(() => api.deals.extend(deal.id));
  const outcome = useMutation((result: 'WON' | 'LOST') => api.deals.outcome(deal.id, result));

  async function act(run: () => Promise<unknown>) {
    if (await run()) {
      onChanged();
    }
  }

  return (
    <article className="pipeline__card" aria-label={deal.customerName}>
      <strong>{deal.customerName}</strong>
      <div>{deal.reference} · <StatusBadge status={deal.status} /></div>
      <div><Money minor={deal.estimatedMrcMinor} currency={deal.currency} /> / month · {deal.siteCount} site(s)</div>
      {deal.hasConflict && <div className="badge badge--warning">Overlapping claim</div>}
      {deal.protectedUntil && deal.status === 'APPROVED' && <div>Protected until {formatDate(deal.protectedUntil)}</div>}
      <ErrorBanner error={extend.error ?? outcome.error} />
      {deal.status === 'APPROVED' && (
        <div className="toolbar" style={{ margin: '8px 0 0' }}>
          <Link to={`/quotes/new?dealId=${deal.id}&customer=${encodeURIComponent(deal.customerName)}`}>Quote</Link>
          {deal.extensionAvailable && (
            <button type="button" disabled={extend.pending} onClick={() => act(extend.run)}>Extend</button>
          )}
          <button type="button" disabled={outcome.pending} onClick={() => act(() => outcome.run('WON'))}>Won</button>
          <button type="button" disabled={outcome.pending} onClick={() => act(() => outcome.run('LOST'))}>Lost</button>
        </div>
      )}
    </article>
  );
}

export function DealsPage() {
  const api = useEndpoints();
  const [params] = useSearchParams();
  const q = params.get('q') ?? undefined;
  const deals = useAsync(() => api.deals.search({ page: 1, pageSize: BOARD_SIZE, q }), [api, q]);
  const board = useMemo(() => groupByStage(deals.data?.items ?? []), [deals.data]);

  return (
    <>
      <h1>Deal pipeline</h1>
      <ErrorBanner error={deals.error} />
      {deals.data && deals.data.total > BOARD_SIZE && (
        <div className="banner banner--info">Showing the {BOARD_SIZE} most recent of {deals.data.total} registrations.</div>
      )}
      <div className="pipeline">
        {STAGES.map((stage) => {
          const cards = board.get(stage.title) ?? [];
          const value = cards.reduce((sum, d) => sum + d.estimatedMrcMinor, 0);
          return (
            <section key={stage.title} className="pipeline__column" aria-label={stage.title}>
              <h3>{stage.title} ({cards.length})</h3>
              <Money minor={value} currency={cards[0]?.currency ?? 'GBP'} /> / month
              {cards.map((d) => <DealCard key={d.id} deal={d} onChanged={deals.reload} />)}
            </section>
          );
        })}
      </div>
    </>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/pages/LeadsPage.test.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/pages/LeadsPage.test.tsx`.

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Deal, Lead, Page } from '../api/types';
import { renderWithApp } from '../test/harness';
import { groupByStage } from './DealsPage';
import { LeadsPage, NEXT_STEPS } from './LeadsPage';

const lead: Lead = {
  id: 'l-1', reference: 'LD-2026-000001', ownerSubject: 'u-1', companyName: 'Northwind Logistics',
  contactName: 'Ana', contactEmail: 'ana@northwind.example', postcode: 'LS1 4AP', siteCount: 4,
  estimatedMrcMinor: 125000, source: 'REFERRAL', status: 'QUALIFIED', score: 72, scoreBand: 'HOT',
  createdAt: '2026-11-01T09:00:00Z',
};

const page = (items: Lead[]): Page<Lead> => ({ items, page: 1, pageSize: 20, total: items.length });

describe('LeadsPage', () => {
  it('lists leads with money and score band, and filters by status via the URL', async () => {
    const search = vi.fn(async () => page([lead]));
    renderWithApp(<LeadsPage />, { api: { leads: { search } as never } });

    const row = (await screen.findByText('Northwind Logistics')).closest('tr')!;
    expect(within(row).getByText('£1,250.00')).toBeInTheDocument();
    expect(within(row).getByText('Hot')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'QUALIFIED');
    await waitFor(() => expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'QUALIFIED', page: 1 })));
  });

  it('converts a qualified lead into a deal and reports conflicts', async () => {
    const convert = vi.fn(async () => ({ dealId: 'd-1', dealReference: 'DR-2026-000007', dealStatus: 'UNDER_REVIEW' as const, hasConflict: true }));
    renderWithApp(<LeadsPage />, { api: { leads: { search: async () => page([lead]), convert } as never } });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Convert' }));
    await user.type(screen.getByLabelText('Company number'), 'ab123456');
    await user.click(screen.getByRole('button', { name: 'Register deal' }));

    expect(convert).toHaveBeenCalledWith('l-1', expect.objectContaining({ customerCompanyNumber: 'AB123456' }));
    expect(await screen.findByRole('status')).toHaveTextContent('DR-2026-000007 registered (Under review)');
    expect(screen.getByRole('status')).toHaveTextContent('overlapping claim');
  });

  it('only offers transitions the API allows', () => {
    expect(NEXT_STEPS.CONVERTED).toEqual([]);
    expect(NEXT_STEPS.QUALIFIED).not.toContain('CONVERTED');
  });
});

describe('groupByStage', () => {
  it('places every deal in exactly one column, grouping closed outcomes', () => {
    const deal = (id: string, status: Deal['status']) => ({ id, status } as Deal);
    const board = groupByStage([deal('a', 'SUBMITTED'), deal('b', 'APPROVED'), deal('c', 'LOST'), deal('d', 'EXPIRED')]);

    expect(board.get('Registered')!.map((d) => d.id)).toEqual(['a']);
    expect(board.get('Protected')!.map((d) => d.id)).toEqual(['b']);
    expect(board.get('Closed')!.map((d) => d.id)).toEqual(['c', 'd']);
  });
});
```

## apps/enterprise-partner-portal/frontend/src/pages/LeadsPage.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/pages/LeadsPage.tsx`.

```tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useEndpoints } from '../api/ApiContext';
import type { ConvertLeadResult, Lead, LeadRequest, LeadSource, LeadStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { fieldErrorsOf, SelectField, TextField } from '../components/FormField';
import { Money } from '../components/Money';
import { PaginatedTable, type Column } from '../components/PaginatedTable';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync, useMutation } from '../hooks/useAsync';
import { usePageParams } from '../hooks/usePageParams';
import { formatDate, humanise, isoDateFromToday } from '../lib/format';
import { parseMoneyInput } from '../lib/money';

const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DISQUALIFIED'];
const SOURCES: LeadSource[] = ['REFERRAL', 'EVENT', 'WEBSITE', 'OUTBOUND', 'UNITI_SHARED', 'OTHER'];

/** Forward moves a partner user can make from each status (conversion has its own dialog). */
export const NEXT_STEPS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'QUALIFIED', 'DISQUALIFIED'],
  CONTACTED: ['QUALIFIED', 'DISQUALIFIED'],
  QUALIFIED: ['DISQUALIFIED'],
  CONVERTED: [],
  DISQUALIFIED: ['NEW'],
};

const options = (values: string[]) => values.map((v) => ({ value: v, label: humanise(v) }));

function NewLeadForm({ onCreated }: { onCreated: () => void }) {
  const api = useEndpoints();
  const create = useMutation(api.leads.create);
  const [mrc, setMrc] = useState('');
  const [localError, setLocalError] = useState<string>();
  const errors = fieldErrorsOf(create.error);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const estimatedMrcMinor = mrc ? parseMoneyInput(mrc) : 0;
    if (estimatedMrcMinor === undefined) {
      setLocalError('Enter the monthly value as an amount, e.g. 1250.00');
      return;
    }
    setLocalError(undefined);
    const text = (k: string) => String(form.get(k) ?? '').trim() || undefined;
    const body: LeadRequest = {
      companyName: text('companyName') ?? '',
      contactName: text('contactName') ?? '',
      contactEmail: text('contactEmail') ?? '',
      contactPhone: text('contactPhone'),
      postcode: text('postcode') ?? '',
      siteCount: Number(form.get('siteCount')) || 1,
      estimatedMrcMinor,
      productInterest: text('productInterest'),
      source: form.get('source') as LeadSource,
      notes: text('notes'),
    };
    if (await create.run(body)) {
      formEl.reset();
      setMrc('');
      onCreated();
    }
  }

  return (
    <form className="panel" onSubmit={submit} aria-label="New lead">
      <h2>New lead</h2>
      {create.error && !Object.keys(errors).length ? <ErrorBanner error={create.error} /> : null}
      <div className="grid">
        <TextField label="Company" name="companyName" required maxLength={200} error={errors.companyName} />
        <TextField label="Contact name" name="contactName" required maxLength={120} error={errors.contactName} />
        <TextField label="Contact email" name="contactEmail" type="email" required error={errors.contactEmail} />
        <TextField label="Phone" name="contactPhone" error={errors.contactPhone} />
        <TextField label="Postcode" name="postcode" required error={errors.postcode} />
        <TextField label="Sites" name="siteCount" type="number" min={1} max={500} defaultValue={1} error={errors.siteCount} />
        <TextField label="Est. monthly value (£)" value={mrc} onChange={(e) => setMrc(e.target.value)}
          inputMode="decimal" error={localError ?? errors.estimatedMrcMinor} />
        <TextField label="Product interest" name="productInterest" error={errors.productInterest} />
        <SelectField label="Source" name="source" options={options(SOURCES)} defaultValue="REFERRAL" />
      </div>
      <TextField label="Notes" name="notes" maxLength={2000} />
      <button className="primary" type="submit" disabled={create.pending}>Create lead</button>
    </form>
  );
}

function ConvertDialog({ lead, onDone }: { lead: Lead; onDone: (result?: ConvertLeadResult) => void }) {
  const api = useEndpoints();
  const convert = useMutation((body: Parameters<typeof api.leads.convert>[1]) => api.leads.convert(lead.id, body));
  const [closeDate, setCloseDate] = useState(isoDateFromToday(30));
  const [companyNumber, setCompanyNumber] = useState('');
  const [website, setWebsite] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = await convert.run({
      expectedCloseDate: closeDate,
      customerCompanyNumber: companyNumber.trim().toUpperCase() || undefined,
      customerWebsite: website.trim() || undefined,
    });
    if (result) {
      onDone(result);
    }
  }

  return (
    <dialog open aria-label={`Convert ${lead.companyName}`}>
      <form onSubmit={submit}>
        <h2>Register deal for {lead.companyName}</h2>
        <p>Converting registers a deal with Uniti. Other partners' overlapping claims are checked automatically.</p>
        <ErrorBanner error={convert.error} />
        <TextField label="Expected close date" type="date" value={closeDate} min={isoDateFromToday(1)}
          onChange={(e) => setCloseDate(e.target.value)} required />
        <TextField label="Company number" value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)}
          pattern="[A-Za-z0-9]{8}" hint="8 characters, improves conflict matching" />
        <TextField label="Customer website" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <div className="toolbar">
          <button type="button" onClick={() => onDone()}>Cancel</button>
          <button className="primary" type="submit" disabled={convert.pending}>Register deal</button>
        </div>
      </form>
    </dialog>
  );
}

export function LeadsPage() {
  const api = useEndpoints();
  const { hasAnyRole } = useAuth();
  const { page, pageSize, filters, setPage, setFilter } = usePageParams(['status', 'q', 'mine', 'sort'] as const);
  const leads = useAsync(() => api.leads.search({
    page, pageSize, status: (filters.status || undefined) as LeadStatus | undefined, q: filters.q || undefined,
    mine: filters.mine === 'true', sort: filters.sort === 'score' ? 'score' : 'createdAt',
  }), [api, page, pageSize, filters.status, filters.q, filters.mine, filters.sort]);
  const transition = useMutation((lead: Lead, status: LeadStatus, reason?: string) =>
    api.leads.transition(lead.id, status, reason));
  const [converting, setConverting] = useState<Lead>();
  const [notice, setNotice] = useState<string>();

  async function move(lead: Lead, status: LeadStatus) {
    const reason = status === 'DISQUALIFIED' ? window.prompt('Why is this lead disqualified?') : undefined;
    if (status === 'DISQUALIFIED' && !reason) {
      return;
    }
    if (await transition.run(lead, status, reason ?? undefined)) {
      leads.reload();
    }
  }

  const columns: Column<Lead>[] = [
    { header: 'Ref', render: (l) => l.reference },
    { header: 'Company', render: (l) => l.companyName },
    { header: 'Contact', render: (l) => l.contactName },
    { header: 'Est. MRC', align: 'right', render: (l) => <Money minor={l.estimatedMrcMinor} currency="GBP" /> },
    { header: 'Score', render: (l) => <>{l.score} <StatusBadge status={l.scoreBand} /></> },
    { header: 'Status', render: (l) => <StatusBadge status={l.status} /> },
    { header: 'Next action', render: (l) => formatDate(l.nextActionAt) },
    {
      header: 'Actions',
      render: (l) => (
        <span className="toolbar" style={{ margin: 0 }}>
          {l.status === 'QUALIFIED' && <button type="button" onClick={() => setConverting(l)}>Convert</button>}
          {l.convertedDealId && <Link to={`/deals?q=${encodeURIComponent(l.companyName)}`}>View deal</Link>}
          {NEXT_STEPS[l.status].map((s) => (
            <button key={s} type="button" disabled={transition.pending} onClick={() => move(l, s)}>
              {humanise(s)}
            </button>
          ))}
        </span>
      ),
    },
  ];

  return (
    <>
      <h1>Leads</h1>
      {notice && <div className="banner banner--success" role="status">{notice}</div>}
      <ErrorBanner error={transition.error} />
      <NewLeadForm onCreated={leads.reload} />
      <div className="toolbar">
        <SelectField label="Status" value={filters.status} placeholder="All" options={options(STATUSES)}
          onChange={(e) => setFilter('status', e.target.value)} />
        <TextField label="Search" defaultValue={filters.q} placeholder="Company, contact or ref"
          onKeyDown={(e) => e.key === 'Enter' && setFilter('q', e.currentTarget.value.trim())} />
        <SelectField label="Sort" value={filters.sort || 'createdAt'}
          options={[{ value: 'createdAt', label: 'Newest' }, { value: 'score', label: 'Highest score' }]}
          onChange={(e) => setFilter('sort', e.target.value)} />
        {hasAnyRole('PARTNER_ADMIN') && (
          <label>
            <input type="checkbox" checked={filters.mine === 'true'}
              onChange={(e) => setFilter('mine', e.target.checked ? 'true' : '')} /> Only mine
          </label>
        )}
      </div>
      <PaginatedTable columns={columns} page={leads.data} loading={leads.loading} error={leads.error}
        rowKey={(l) => l.id} onPageChange={setPage} emptyMessage="No leads match these filters." />
      {converting && (
        <ConvertDialog lead={converting} onDone={(result) => {
          setConverting(undefined);
          if (result) {
            setNotice(`Deal ${result.dealReference} registered (${humanise(result.dealStatus)})`
              + (result.hasConflict ? ' — another partner has an overlapping claim; Uniti will review it.' : '.'));
            leads.reload();
          }
        }} />
      )}
    </>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/pages/QuoteBuilderPage.test.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/pages/QuoteBuilderPage.test.tsx`.

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PricingPreview, Product, QuoteRequest } from '../api/types';
import { renderWithApp } from '../test/harness';
import { QuoteBuilderPage, toQuoteRequest, type QuoteDraft } from './QuoteBuilderPage';

const fibre: Product = {
  id: 'p1', sku: 'FBB-BUS-500', name: 'Business Fibre 500 Mbps', category: 'BROADBAND', bandwidthMbps: 500,
  monthlyPriceMinor: 5500, installPriceMinor: 9900, minTermMonths: 12, perSite: true, currency: 'GBP',
};

const draft: QuoteDraft = {
  customerName: 'Northwind', customerAccountId: '', customerContactEmail: 'it@northwind.example', termMonths: 36,
  discount: '12.5', justification: '', lines: [{ sku: 'FBB-BUS-500', siteName: 'HQ', sitePostcode: 'LS1 4AP', quantity: 1 }],
};

function preview(overrides: Partial<PricingPreview> = {}): PricingPreview {
  return {
    listMrcMinor: 5500, termDiscountMinor: 550, volumeDiscountMinor: 0, partnerDiscountMinor: 619, netMrcMinor: 4331,
    nrcMinor: 0, nrcWaived: true, totalContractValueMinor: 155916, termDiscountPercent: 10, volumeDiscountPercent: 0,
    effectiveDiscountPercent: 21.255, selfApprovedAllowancePercent: 5, approvalLevel: 'CHANNEL_MANAGER', blockers: [],
    currency: 'GBP', ...overrides,
  };
}

describe('toQuoteRequest', () => {
  it('builds a trimmed request with a numeric discount', () => {
    const { request, problems } = toQuoteRequest({ ...draft, customerName: '  Northwind ' });

    expect(problems).toEqual([]);
    expect(request).toMatchObject({ customerName: 'Northwind', requestedDiscountPercent: 12.5, customerAccountId: undefined });
  });

  it('lists everything that blocks pricing', () => {
    const { request, problems } = toQuoteRequest({
      ...draft, customerContactEmail: 'nope', customerAccountId: 'ACC-1', discount: '12.3456',
      lines: [{ sku: 'X', siteName: '', sitePostcode: '1', quantity: 0 }],
    });

    expect(request).toBeUndefined();
    expect(problems).toEqual([
      'Enter a valid customer email',
      'Account ID must look like ACC-12345678',
      'Discount must be a percentage with up to three decimals',
      'Line 1: enter a site name',
      'Line 1: enter a valid postcode',
      'Line 1: quantity 1-100',
    ]);
  });
});

describe('QuoteBuilderPage', () => {
  it('previews pricing, requires a justification above the allowance, then submits for approval', async () => {
    const previewCall = vi.fn(async (_body: QuoteRequest) => preview());
    const create = vi.fn(async (_body: QuoteRequest) => ({ id: 'q-1' }));
    const submit = vi.fn(async () => ({ id: 'q-1', status: 'PENDING_APPROVAL' }));
    renderWithApp(<QuoteBuilderPage />, {
      route: '/quotes/new?customer=Northwind',
      api: {
        catalog: { list: async () => [fibre] },
        quotes: { preview: previewCall, create, submit } as never,
      },
    });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Customer email'), 'it@northwind.example');
    await user.clear(screen.getByLabelText('Partner discount (%)'));
    await user.type(screen.getByLabelText('Partner discount (%)'), '12.5');
    await user.selectOptions(await screen.findByLabelText('Add product'), 'FBB-BUS-500');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('Site name'), 'HQ');
    await user.type(screen.getByLabelText('Postcode'), 'LS1 4AP');

    expect(await screen.findByText('Channel manager required', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(previewCall.mock.calls.at(-1)?.[0]).toMatchObject({ termMonths: 36, requestedDiscountPercent: 12.5 });
    const submitButton = screen.getByRole('button', { name: 'Submit for approval' });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Justification for Uniti approvers'), 'Incumbent price match');
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    await waitFor(() => expect(submit).toHaveBeenCalledWith('q-1'));
    expect(create.mock.calls[0][0]).toMatchObject({ customerName: 'Northwind', justification: 'Incumbent price match' });
  });

  it('shows blockers from the pricing engine and refuses to submit', async () => {
    renderWithApp(<QuoteBuilderPage />, {
      route: '/quotes/new?customer=Northwind',
      api: {
        catalog: { list: async () => [fibre] },
        quotes: { preview: async () => preview({ approvalLevel: 'NONE', blockers: ['1 line(s) priced below the floor price'] }) } as never,
      },
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Customer email'), 'it@northwind.example');
    await user.selectOptions(await screen.findByLabelText('Add product'), 'FBB-BUS-500');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('Site name'), 'HQ');
    await user.type(screen.getByLabelText('Postcode'), 'LS1 4AP');

    expect(await screen.findByText('1 line(s) priced below the floor price', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save & approve' })).toBeDisabled();
  });
});
```
