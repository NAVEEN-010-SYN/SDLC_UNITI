# SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal/web/src (part 6 of 7)

- **Application:** SD-WAN management (VeloCloud & Fortinet)
- **Tech stack:** Node.js TypeScript API + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 24

## Files

- `apps/sdwan-portal/web/src/auth/AuthContext.tsx` (118 lines)
- `apps/sdwan-portal/web/src/auth/token.test.ts` (33 lines)
- `apps/sdwan-portal/web/src/auth/token.ts` (59 lines)
- `apps/sdwan-portal/web/src/components/EdgePicker.tsx` (41 lines)
- `apps/sdwan-portal/web/src/components/Layout.tsx` (67 lines)
- `apps/sdwan-portal/web/src/components/MetricChart.tsx` (116 lines)
- `apps/sdwan-portal/web/src/components/PaginatedTable.tsx` (108 lines)
- `apps/sdwan-portal/web/src/components/ProblemBanner.tsx` (39 lines)
- `apps/sdwan-portal/web/src/components/StatusPill.tsx` (40 lines)
- `apps/sdwan-portal/web/src/components/components.test.tsx` (64 lines)
- `apps/sdwan-portal/web/src/hooks/useAsync.ts` (69 lines)
- `apps/sdwan-portal/web/src/hooks/usePageParams.ts` (48 lines)
- `apps/sdwan-portal/web/src/lib/firewallDraft.ts` (130 lines)
- `apps/sdwan-portal/web/src/lib/format.ts` (58 lines)
- `apps/sdwan-portal/web/src/lib/lib.test.ts` (77 lines)
- `apps/sdwan-portal/web/src/lib/policyDraft.ts` (59 lines)
- `apps/sdwan-portal/web/src/main.tsx` (17 lines)
- `apps/sdwan-portal/web/src/pages/AlertsPage.tsx` (91 lines)
- `apps/sdwan-portal/web/src/pages/ChangeRequestDetailPage.tsx` (182 lines)
- `apps/sdwan-portal/web/src/pages/ChangeRequestsPage.tsx` (66 lines)
- `apps/sdwan-portal/web/src/pages/EdgeDetailPage.tsx` (148 lines)
- `apps/sdwan-portal/web/src/pages/FirewallPage.tsx` (183 lines)
- `apps/sdwan-portal/web/src/pages/LoginPage.tsx` (45 lines)
- `apps/sdwan-portal/web/src/pages/OverviewPage.tsx` (102 lines)

## apps/sdwan-portal/web/src/auth/AuthContext.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/auth/AuthContext.tsx`.

```tsx
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createApiClient } from '../api/client';
import { sdwanApi, SdwanApi } from '../api/sdwan';
import type { Role } from '../api/types';
import { decodeSession, SessionUser, tokenFromFragment } from './token';

const STORAGE_KEY = 'sdwan.token';

interface AuthState {
  user: SessionUser | null;
  /** Account the UI is acting on: the user's own, or the one a support agent / partner picked. */
  accountId: string | null;
  setAccountId: (id: string) => void;
  api: SdwanApi | null;
  signIn: (token: string) => boolean;
  signOut: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

function readStoredToken(): string | null {
  try {
    const fromFragment = tokenFromFragment(window.location.hash);
    if (fromFragment) {
      sessionStorage.setItem(STORAGE_KEY, fromFragment);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return fromFragment;
    }
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function authorizeUrl(returnTo: string): string | null {
  const base = import.meta.env.VITE_OIDC_AUTHORIZE_URL as string | undefined;
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set('client_id', (import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined) ?? 'sdwan-portal');
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('redirect_uri', returnTo);
  return url.toString();
}

export function AuthProvider({ children, initialToken }: { children: ReactNode; initialToken?: string }) {
  const [token, setToken] = useState<string | null>(() => initialToken ?? readStoredToken());
  const user = useMemo(() => (token ? decodeSession(token) : null), [token]);
  const [pickedAccount, setPickedAccount] = useState<string | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const signOut = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setPickedAccount(null);
  }, []);

  const signIn = useCallback((raw: string) => {
    if (!decodeSession(raw)) return false;
    sessionStorage.setItem(STORAGE_KEY, raw);
    setToken(raw);
    return true;
  }, []);

  // Drop the session when the token expires instead of letting every request 401.
  useEffect(() => {
    if (!user) return;
    const t = window.setTimeout(signOut, Math.max(0, user.expiresAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [user, signOut]);

  const accountId = user?.accountId ?? pickedAccount ?? user?.partnerAccountIds[0] ?? null;

  const api = useMemo(() => {
    if (!user || !accountId) return null;
    const client = createApiClient({ baseUrl: '/api/v1', getToken: () => tokenRef.current, onUnauthorized: signOut });
    return sdwanApi(client, accountId);
  }, [user, accountId, signOut]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      accountId,
      setAccountId: (id) => {
        if (user && !user.accountId && /^ACC-\d{8}$/.test(id)) setPickedAccount(id);
      },
      api,
      signIn,
      signOut,
      hasRole: (...roles) => !!user?.roles.some((r) => roles.includes(r)),
    }),
    [user, accountId, api, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For pages rendered only once an account is selected (guaranteed by the router). */
export function useApi(): SdwanApi {
  const { api } = useAuth();
  if (!api) throw new Error('No account selected');
  return api;
}

/** Hides children unless the user holds one of `roles`. UX only: the API enforces the same rule. */
export function RequireRole({ roles, children, fallback = null }: { roles: Role[]; children: ReactNode; fallback?: ReactNode }) {
  const { hasRole } = useAuth();
  return <>{hasRole(...roles) ? children : fallback}</>;
}
```

## apps/sdwan-portal/web/src/auth/token.test.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/auth/token.test.ts`.

```typescript
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
```

## apps/sdwan-portal/web/src/auth/token.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/auth/token.ts`.

```typescript
import type { Role } from '../api/types';

export interface SessionUser {
  userId: string;
  roles: Role[];
  accountId?: string;
  partnerAccountIds: string[];
  expiresAt: number;
}

const KNOWN_ROLES: Role[] = ['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT', 'PARTNER_ADMIN', 'PARTNER_AGENT'];

function base64UrlDecode(segment: string): string {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Reads the claims the UI needs for navigation and gating. The signature is NOT verified
 * here — the API verifies every request; the client only uses claims to decide what to show.
 * Returns null for malformed or expired tokens.
 */
export function decodeSession(token: string, nowMs = Date.now()): SessionUser | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
  if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
  const expiresAt = claims.exp * 1000;
  if (expiresAt <= nowMs) return null;
  const realm = (claims.realm_access as { roles?: unknown } | undefined)?.roles;
  const raw = [...(Array.isArray(claims.roles) ? claims.roles : []), ...(Array.isArray(realm) ? realm : [])];
  const roles = [...new Set(raw.filter((r): r is Role => KNOWN_ROLES.includes(r as Role)))];
  if (roles.length === 0) return null;
  return {
    userId: claims.sub,
    roles,
    accountId: typeof claims.accountId === 'string' ? claims.accountId : undefined,
    partnerAccountIds: Array.isArray(claims.partnerAccountIds) ? claims.partnerAccountIds.filter((x): x is string => typeof x === 'string') : [],
    expiresAt,
  };
}

/** Extracts `access_token` from an OIDC implicit-flow redirect fragment. */
export function tokenFromFragment(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get('access_token');
}

export const canApprove = (u: SessionUser | null): boolean => !!u?.roles.some((r) => r === 'BUSINESS_ADMIN' || r === 'SUPPORT_AGENT');
export const canRequestChanges = (u: SessionUser | null): boolean =>
  !!u?.roles.some((r) => r === 'BUSINESS_ADMIN' || r === 'BUSINESS_USER' || r === 'SUPPORT_AGENT');
export const canManageAlerts = canRequestChanges;
```

## apps/sdwan-portal/web/src/components/EdgePicker.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/components/EdgePicker.tsx`.

```tsx
import { useEffect } from 'react';
import type { Vendor } from '../api/types';
import { useApi } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { ProblemBanner } from './ProblemBanner';

interface Props {
  value: string | undefined;
  onChange: (edgeId: string) => void;
  vendor?: Vendor;
  label?: string;
}

/** Edge selector for config pages; auto-selects the first edge so the page is never blank. */
export function EdgePicker({ value, onChange, vendor, label = 'Edge' }: Props) {
  const api = useApi();
  const edges = useAsync((signal) => api.edges({ page: 1, pageSize: 200, vendor }, signal), [api, vendor]);
  const items = edges.data?.items ?? [];

  useEffect(() => {
    if (!value && items.length) onChange(items[0].id);
  }, [value, items, onChange]);

  if (edges.error) return <ProblemBanner error={edges.error} onRetry={edges.reload} />;
  if (!edges.loading && items.length === 0) {
    return <p className="empty">{vendor ? `No ${vendor === 'FORTINET' ? 'Fortinet' : 'VeloCloud'} edges on this account.` : 'No edges on this account.'}</p>;
  }
  return (
    <label className="edge-picker">
      {label}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={edges.loading}>
        {items.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} ({e.vendor === 'FORTINET' ? 'Fortinet' : 'VeloCloud'}, {e.model})
          </option>
        ))}
      </select>
    </label>
  );
}
```

## apps/sdwan-portal/web/src/components/Layout.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/components/Layout.tsx`.

```tsx
import { FormEvent, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { humanize } from '../lib/format';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/policies', label: 'Business policies' },
  { to: '/firewall', label: 'Firewall' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/changes', label: 'Change requests' },
];

function AccountPicker() {
  const { setAccountId, accountId } = useAuth();
  const [value, setValue] = useState(accountId ?? '');
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAccountId(value.trim().toUpperCase());
  };
  return (
    <form onSubmit={onSubmit} className="account-picker">
      <label htmlFor="account">Account</label>
      <input id="account" value={value} onChange={(e) => setValue(e.target.value)} placeholder="ACC-00000000" pattern="ACC-\d{8}" />
      <button type="submit">Open</button>
    </form>
  );
}

export function Layout() {
  const { user, accountId, signOut } = useAuth();
  return (
    <div className="shell">
      <header>
        <span className="brand">Uniti Business · SD-WAN</span>
        {user && !user.accountId && <AccountPicker />}
        {user && (
          <span className="who">
            {user.userId} · {user.roles.map(humanize).join(', ')}
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </span>
        )}
      </header>
      {accountId ? (
        <>
          <nav aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <main>
            <Outlet />
          </main>
        </>
      ) : (
        <main>
          <p>Select an account to manage its SD-WAN estate.</p>
        </main>
      )}
    </div>
  );
}
```

## apps/sdwan-portal/web/src/components/MetricChart.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/components/MetricChart.tsx`.

```tsx
import { useMemo, useState } from 'react';
import { formatDateTime } from '../lib/format';

export interface Point {
  t: string;
  v: number;
}

interface Props {
  title: string;
  points: Point[];
  unit: string;
  /** SLA limit drawn as a dashed line; points above it are highlighted. */
  threshold?: number;
  /** Bucket width; a gap larger than 1.5 buckets breaks the line instead of interpolating. */
  bucketSeconds: number;
  width?: number;
  height?: number;
}

const PAD = { top: 12, right: 12, bottom: 22, left: 44 };

/** "Nice" axis maximum: rounds up to 1/2/5 x 10^n so tick labels are readable. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

/** Splits points into contiguous runs so missing data shows as a gap, never as a fake straight line. */
export function segments(points: Point[], bucketSeconds: number): Point[][] {
  const out: Point[][] = [];
  let current: Point[] = [];
  let prev: number | undefined;
  for (const p of points) {
    const t = Date.parse(p.t);
    if (prev !== undefined && t - prev > bucketSeconds * 1500) {
      out.push(current);
      current = [];
    }
    current.push(p);
    prev = t;
  }
  if (current.length) out.push(current);
  return out;
}

export function MetricChart({ title, points, unit, threshold, bucketSeconds, width = 560, height = 160 }: Props) {
  const [hover, setHover] = useState<Point | null>(null);
  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const t0 = Date.parse(points[0].t);
    const t1 = Math.max(t0 + 1, Date.parse(points[points.length - 1].t));
    const yMax = niceMax(Math.max(threshold ?? 0, ...points.map((p) => p.v)) * 1.1);
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const x = (t: string) => PAD.left + ((Date.parse(t) - t0) / (t1 - t0)) * plotW;
    const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
    return { x, y, yMax, plotW };
  }, [points, threshold, width, height]);

  if (!geometry) {
    return (
      <figure className="chart">
        <figcaption>{title}</figcaption>
        <p className="empty">No samples in this range</p>
      </figure>
    );
  }
  const { x, y, yMax, plotW } = geometry;
  const breaches = threshold === undefined ? 0 : points.filter((p) => p.v > threshold).length;

  return (
    <figure className="chart">
      <figcaption>
        {title}
        {threshold !== undefined && (
          <span className={breaches ? 'chart-breach' : 'chart-ok'}>
            {breaches ? ` · ${breaches} interval(s) over ${threshold}${unit}` : ` · within ${threshold}${unit}`}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} chart`} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(yMax * f)} y2={y(yMax * f)} className="grid" />
            <text x={PAD.left - 6} y={y(yMax * f) + 4} textAnchor="end" className="tick">
              {Number((yMax * f).toPrecision(3))}
            </text>
          </g>
        ))}
        {threshold !== undefined && (
          <line x1={PAD.left} x2={PAD.left + plotW} y1={y(threshold)} y2={y(threshold)} className="threshold" data-testid="threshold" />
        )}
        {segments(points, bucketSeconds).map((seg, i) => (
          <polyline key={i} className="series" fill="none" points={seg.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} />
        ))}
        {points.map((p) => (
          <circle
            key={p.t}
            cx={x(p.t)}
            cy={y(p.v)}
            r={threshold !== undefined && p.v > threshold ? 3 : 6}
            className={threshold !== undefined && p.v > threshold ? 'point-breach' : 'point-hit'}
            onMouseEnter={() => setHover(p)}
          />
        ))}
      </svg>
      <div className="chart-readout" aria-live="polite">
        {hover ? `${formatDateTime(hover.t)}: ${hover.v}${unit}` : ' '}
      </div>
    </figure>
  );
}
```

## apps/sdwan-portal/web/src/components/PaginatedTable.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/components/PaginatedTable.tsx`.

```tsx
import type { ReactNode } from 'react';
import type { Page } from '../api/types';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

interface Props<T> {
  columns: Column<T>[];
  data: Page<T> | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  caption?: string;
  onPageChange: (page: number) => void;
  pageSizes?: number[];
  onPageSizeChange?: (size: number) => void;
}

export function pageWindow(page: number, totalPages: number, span = 2): number[] {
  const start = Math.max(1, Math.min(page - span, totalPages - span * 2));
  const end = Math.min(totalPages, start + span * 2);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
}

/** Server-paginated table over the API's `{ items, page, pageSize, total }` envelope. */
export function PaginatedTable<T>({ columns, data, rowKey, loading, emptyMessage = 'Nothing to show', caption, onPageChange, pageSizes, onPageSizeChange }: Props<T>) {
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const page = data?.page ?? 1;
  const first = data && data.total ? (page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.total, page * data.pageSize) : 0;

  return (
    <div className="table-wrap" aria-busy={loading}>
      <table>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={{ textAlign: c.align ?? 'left' }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data?.items.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {data && data.items.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="empty">
                {emptyMessage}
              </td>
            </tr>
          )}
          {!data && loading && (
            <tr>
              <td colSpan={columns.length} className="empty">
                Loading…
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {data && data.total > 0 && (
        <nav className="pager" aria-label="Pagination">
          <span>
            {first}–{last} of {data.total}
          </span>
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            Previous
          </button>
          {pageWindow(page, totalPages).map((p) => (
            <button key={p} type="button" aria-current={p === page ? 'page' : undefined} onClick={() => onPageChange(p)}>
              {p}
            </button>
          ))}
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
            Next
          </button>
          {pageSizes && onPageSizeChange && (
            <label>
              Rows
              <select value={data.pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
                {pageSizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
        </nav>
      )}
    </div>
  );
}
```

## apps/sdwan-portal/web/src/components/ProblemBanner.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/components/ProblemBanner.tsx`.

```tsx
import { ApiError } from '../api/client';

/**
 * Renders any failure from the API layer. Problem details are shown as-is (they are
 * written for end users); the correlation id lets support find the exact request in logs.
 */
export function ProblemBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  const api = error instanceof ApiError ? error : null;
  const title = api?.problem.title ?? 'Something went wrong';
  const detail = api?.problem.detail ?? (error instanceof Error ? error.message : undefined);
  const fieldErrors = api?.problem.errors ?? [];
  const findings = Array.isArray(api?.problem.findings) ? (api!.problem.findings as Array<{ message: string }>) : [];
  return (
    <div role="alert" className="problem">
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {(fieldErrors.length > 0 || findings.length > 0) && (
        <ul>
          {fieldErrors.map((e) => (
            <li key={`f-${e.path}-${e.message}`}>
              <code>{e.path}</code> {e.message}
            </li>
          ))}
          {findings.map((f) => (
            <li key={`l-${f.message}`}>{f.message}</li>
          ))}
        </ul>
      )}
      {api?.correlationId && <small>Reference: {api.correlationId}</small>}
      {onRetry && api && (api.status === 0 || api.status >= 500) && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
```

## apps/sdwan-portal/web/src/components/StatusPill.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/components/StatusPill.tsx`.

```tsx
type Tone = 'ok' | 'warn' | 'bad' | 'muted' | 'info';

const TONES: Record<string, Tone> = {
  UP: 'ok',
  ONLINE: 'ok',
  COMPLETED: 'ok',
  APPROVED: 'ok',
  RESOLVED: 'ok',
  LOW: 'ok',
  DEGRADED: 'warn',
  STANDBY: 'muted',
  MINOR: 'warn',
  MEDIUM: 'warn',
  SUBMITTED: 'info',
  SCHEDULED: 'info',
  IN_PROGRESS: 'info',
  ACKNOWLEDGED: 'info',
  DOWN: 'bad',
  FAILED: 'bad',
  REJECTED: 'bad',
  CRITICAL: 'bad',
  MAJOR: 'bad',
  HIGH: 'bad',
  OPEN: 'bad',
};

/**
 * Colour-coded status label. The text is always present so colour is never the only
 * signal (WCAG 1.4.1); `label` overrides the default humanised value.
 */
export function StatusPill({ value, label }: { value: string; label?: string }) {
  const tone = TONES[value] ?? 'muted';
  const text = label ?? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
  return (
    <span className={`pill pill-${tone}`} data-tone={tone}>
      {text}
    </span>
  );
}
```

## apps/sdwan-portal/web/src/components/components.test.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/components/components.test.tsx`.

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MetricChart, niceMax, segments } from './MetricChart';
import { PaginatedTable, pageWindow } from './PaginatedTable';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it('always renders text alongside the colour tone', () => {
    render(<StatusPill value="DEGRADED" />);
    expect(screen.getByText('Degraded')).toHaveAttribute('data-tone', 'warn');
  });
});

describe('PaginatedTable', () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({ id: `e${i + 21}`, name: `edge-${i + 21}` }));
  const columns = [{ key: 'name', header: 'Name', render: (r: { name: string }) => r.name }];

  it('shows the visible range and moves between pages', () => {
    const onPageChange = vi.fn();
    render(<PaginatedTable columns={columns} data={{ items: rows, page: 3, pageSize: 10, total: 23 }} rowKey={(r) => r.id} onPageChange={onPageChange} />);
    expect(screen.getByText('21–23 of 23')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('renders the empty message', () => {
    render(<PaginatedTable columns={columns} data={{ items: [], page: 1, pageSize: 10, total: 0 }} rowKey={(r: { id: string }) => r.id} onPageChange={vi.fn()} emptyMessage="No edges" />);
    expect(screen.getByText('No edges')).toBeInTheDocument();
  });

  it('keeps a fixed-width window of page links', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(10, 20)).toEqual([8, 9, 10, 11, 12]);
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20]);
    expect(pageWindow(1, 2)).toEqual([1, 2]);
  });
});

describe('MetricChart', () => {
  const t = (min: number) => new Date(Date.UTC(2026, 2, 2, 10, min)).toISOString();

  it('breaks the line across missing buckets', () => {
    const pts = [0, 5, 10, 30, 35].map((m) => ({ t: t(m), v: 1 }));
    expect(segments(pts, 300).map((s) => s.length)).toEqual([3, 2]);
  });

  it('rounds the axis to readable maxima', () => {
    expect([niceMax(0.7), niceMax(13), niceMax(160), niceMax(0)]).toEqual([1, 20, 200, 1]);
  });

  it('draws the SLA threshold and counts breaching intervals', () => {
    render(<MetricChart title="Latency" unit=" ms" points={[{ t: t(0), v: 20 }, { t: t(5), v: 210 }]} threshold={150} bucketSeconds={300} />);
    expect(screen.getByTestId('threshold')).toBeInTheDocument();
    expect(screen.getByText(/1 interval\(s\) over 150 ms/)).toBeInTheDocument();
  });

  it('says so when there is no data', () => {
    render(<MetricChart title="Jitter" unit=" ms" points={[]} bucketSeconds={300} />);
    expect(screen.getByText('No samples in this range')).toBeInTheDocument();
  });
});
```

## apps/sdwan-portal/web/src/hooks/useAsync.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/hooks/useAsync.ts`.

```typescript
import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
  /** Replace data locally after a successful mutation, without a round trip. */
  setData: (updater: (prev: T | undefined) => T | undefined) => void;
}

/**
 * Runs `load` whenever `deps` change, aborting the previous request so a slow response
 * for an old filter can never overwrite the result for the current one.
 */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(undefined);
    loadRef
      .current(ctrl.signal)
      .then((d) => {
        if (!ctrl.signal.aborted) setDataState(d);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && (e as Error)?.name !== 'AbortError') setError(e);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((updater: (prev: T | undefined) => T | undefined) => setDataState(updater), []);
  return { data, error, loading, reload, setData };
}

/** Wraps a mutation with pending/error state; resolves to undefined when it failed. */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(undefined);
      try {
        return await fn(...args);
      } catch (e) {
        setError(e);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending, error, clearError: () => setError(undefined) };
}
```

## apps/sdwan-portal/web/src/hooks/usePageParams.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/hooks/usePageParams.ts`.

```typescript
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Keeps page, page size and string filters in the URL so a filtered list can be
 * bookmarked or shared with a colleague, and survives a refresh. Changing a filter
 * resets to page 1.
 */
export function usePageParams<F extends string>(filterKeys: readonly F[], defaultPageSize = 25) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const rawSize = Number(params.get('pageSize'));
  const pageSize = PAGE_SIZES.includes(rawSize) ? rawSize : defaultPageSize;

  const filterString = filterKeys.map((k) => `${k}=${params.get(k) ?? ''}`).join('&');
  const filters = useMemo(
    () => Object.fromEntries(filterKeys.map((k) => [k, params.get(k) || undefined])) as Partial<Record<F, string>>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterString],
  );

  const update = useCallback(
    (changes: Record<string, string | number | undefined>) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === undefined || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        return next;
      });
    },
    [setParams],
  );

  return {
    page,
    pageSize,
    filters,
    setPage: (p: number) => update({ page: p }),
    setPageSize: (s: number) => update({ pageSize: s, page: 1 }),
    setFilter: (key: F, value: string | undefined) => update({ [key]: value, page: 1 }),
    pageSizes: PAGE_SIZES,
  };
}
```

## apps/sdwan-portal/web/src/lib/firewallDraft.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/lib/firewallDraft.ts`.

```typescript
import type { FirewallRule, PortRange, Protocol } from '../api/types';

/** Raw form values for one firewall rule, as typed by the user. */
export interface FirewallRuleForm {
  name: string;
  action: 'ALLOW' | 'DENY';
  protocol: Protocol;
  sources: string;
  destinations: string;
  ports: string;
  log: boolean;
}

export const EMPTY_RULE_FORM: FirewallRuleForm = {
  name: '',
  action: 'ALLOW',
  protocol: 'TCP',
  sources: '',
  destinations: '',
  ports: '',
  log: false,
};

export type FormErrors = Partial<Record<keyof FirewallRuleForm, string>>;

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Accepts a bare address (treated as /32) or CIDR; rejects host bits set beyond the prefix. */
export function normalizeCidr(input: string): string | null {
  const [ip, prefixRaw] = input.trim().split('/');
  if (!IPV4.test(ip)) return null;
  const prefix = prefixRaw === undefined ? 32 : Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32 || (prefixRaw !== undefined && !/^\d{1,2}$/.test(prefixRaw))) return null;
  const n = ip.split('.').reduce((acc, o) => acc * 256 + Number(o), 0);
  const hostBits = 32 - prefix;
  if (hostBits > 0 && n % 2 ** hostBits !== 0) return null;
  return `${ip}/${prefix}`;
}

function parseCidrList(raw: string): { cidrs: string[]; bad?: string } {
  const parts = raw.split(/[,\s]+/).filter(Boolean);
  if (parts.length === 1 && parts[0].toLowerCase() === 'any') return { cidrs: ['0.0.0.0/0'] };
  const cidrs: string[] = [];
  for (const p of parts) {
    const c = normalizeCidr(p);
    if (!c) return { cidrs, bad: p };
    cidrs.push(c);
  }
  return { cidrs };
}

/** "80,443,8000-8080" or "any" → port ranges; same grammar as the API's parsePortList. */
export function parsePorts(raw: string): PortRange[] | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'any') return [];
  const out: PortRange[] = [];
  for (const part of trimmed.split(/[,\s]+/)) {
    const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(part);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to > 65535 || from > to) return null;
    out.push({ from, to });
  }
  return out;
}

export function formatPorts(ports: PortRange[]): string {
  return ports.length ? ports.map((p) => (p.from === p.to ? `${p.from}` : `${p.from}-${p.to}`)).join(', ') : 'any';
}

export function formatCidrs(cidrs: string[]): string {
  return cidrs.length === 0 || (cidrs.length === 1 && cidrs[0] === '0.0.0.0/0') ? 'any' : cidrs.join(', ');
}

/**
 * Validates a form and builds the rule, mirroring the API's schema limits (name ≤ 35
 * chars for FortiOS, no ports on ICMP) so most mistakes are caught before a round trip.
 */
export function buildRule(form: FirewallRuleForm, existing: FirewallRule[], id: string): { rule?: FirewallRule; errors: FormErrors } {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Name is required';
  else if (name.length > 35) errors.name = 'Name must be 35 characters or fewer';
  else if (existing.some((r) => r.name.toLowerCase() === name.toLowerCase())) errors.name = 'A rule with this name already exists';

  const src = parseCidrList(form.sources || 'any');
  if (src.bad) errors.sources = `"${src.bad}" is not a valid IPv4 address or network`;
  const dst = parseCidrList(form.destinations || 'any');
  if (dst.bad) errors.destinations = `"${dst.bad}" is not a valid IPv4 address or network`;

  const ports = parsePorts(form.ports);
  if (ports === null) errors.ports = 'Use ports like 443, 8000-8080 or any';
  else if (form.protocol === 'ICMP' && ports.length) errors.ports = 'ICMP rules cannot specify ports';

  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    rule: {
      id,
      name,
      sequence: nextSequence(existing),
      enabled: true,
      action: form.action,
      protocol: form.protocol,
      sourceCidrs: src.cidrs,
      destinationCidrs: dst.cidrs,
      destinationPorts: ports ?? [],
      log: form.log,
    },
  };
}

/**
 * New rules go above a trailing deny-all (otherwise they could never match), leaving a
 * gap of 10 so a rule can later be slotted in between without renumbering.
 */
export function nextSequence(rules: FirewallRule[]): number {
  const sorted = [...rules].sort((a, b) => a.sequence - b.sequence);
  const last = sorted[sorted.length - 1];
  const isDenyAll = (r: FirewallRule) =>
    r.action === 'DENY' && r.protocol === 'ANY' && formatCidrs(r.sourceCidrs) === 'any' && formatCidrs(r.destinationCidrs) === 'any';
  if (last && isDenyAll(last)) {
    const prev = sorted[sorted.length - 2]?.sequence ?? 0;
    const gap = last.sequence - prev;
    return gap > 1 ? prev + Math.min(10, Math.floor(gap / 2)) : last.sequence;
  }
  return (last?.sequence ?? 0) + 10;
}
```

## apps/sdwan-portal/web/src/lib/format.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/lib/format.ts`.

```typescript
import type { EdgeStatus, LinkState } from '../api/types';

/** Customer-facing wording for edge state used across the dashboard. */
export const EDGE_STATUS_LABEL: Record<EdgeStatus, string> = { UP: 'Online', DEGRADED: 'Degraded', DOWN: 'Offline', UNKNOWN: 'Unknown' };
export const LINK_STATE_LABEL: Record<LinkState, string> = { UP: 'Up', DOWN: 'Down', STANDBY: 'Standby', UNKNOWN: 'Unknown' };

const UNITS = ['bps', 'kbps', 'Mbps', 'Gbps', 'Tbps'];

/** Decimal (SI) units, as ISPs quote bandwidth: 1 Mbps = 1,000,000 bps. */
export function formatBps(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '0 bps';
  const exp = Math.min(UNITS.length - 1, Math.floor(Math.log10(bps) / 3));
  const value = bps / 10 ** (exp * 3);
  return `${value >= 100 || exp === 0 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')} ${UNITS[exp]}`;
}

export const formatKbps = (kbps: number): string => formatBps(kbps * 1000);

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });

/** Wire values are UTC; shown in UTC with an explicit suffix so NOC and customer see the same time. */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? '—' : `${dateTime.format(ms)} UTC`;
}

export function formatRelative(iso: string | undefined, nowMs = Date.now()): string {
  if (!iso) return '—';
  const diffSec = Math.round((nowMs - Date.parse(iso)) / 1000);
  if (Number.isNaN(diffSec)) return '—';
  const abs = Math.abs(diffSec);
  const suffix = diffSec >= 0 ? 'ago' : 'from now';
  if (abs < 60) return diffSec >= 0 ? 'just now' : 'in under a minute';
  const [n, unit] = abs < 3600 ? [Math.floor(abs / 60), 'min'] : abs < 86400 ? [Math.floor(abs / 3600), 'h'] : [Math.floor(abs / 86400), 'd'];
  return `${n} ${unit} ${suffix}`;
}

export function formatMs(v: number | undefined): string {
  return v === undefined ? '—' : `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`;
}

export function formatPct(v: number | null | undefined, dp = 1): string {
  return v === null || v === undefined ? '—' : `${v.toFixed(dp)}%`;
}

export function humanize(code: string): string {
  return code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ');
}

/** Quick range presets for health views, ending now. */
export const RANGE_PRESETS = { '1h': 3_600_000, '24h': 86_400_000, '7d': 7 * 86_400_000 } as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

export function rangeFor(preset: RangePreset, nowMs = Date.now()): { from: string; to: string } {
  return { from: new Date(nowMs - RANGE_PRESETS[preset]).toISOString(), to: new Date(nowMs).toISOString() };
}
```

## apps/sdwan-portal/web/src/lib/lib.test.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/lib/lib.test.ts`.

```typescript
import { describe, expect, it } from 'vitest';
import type { BusinessPolicy, FirewallRule } from '../api/types';
import { buildRule, EMPTY_RULE_FORM, nextSequence, normalizeCidr, parsePorts } from './firewallDraft';
import { formatBps, formatRelative } from './format';
import { describeChanges, movePolicy, removePolicy, summarizePolicyChanges, togglePolicy } from './policyDraft';

describe('format', () => {
  it.each([
    [0, '0 bps'],
    [950, '950 bps'],
    [1_500_000, '1.5 Mbps'],
    [1_000_000_000, '1 Gbps'],
    [250_000_000, '250 Mbps'],
  ])('formatBps(%d) = %s', (v, s) => expect(formatBps(v)).toBe(s));

  it('describes relative times in both directions', () => {
    const now = Date.parse('2026-03-02T12:00:00Z');
    expect(formatRelative('2026-03-02T11:59:30Z', now)).toBe('just now');
    expect(formatRelative('2026-03-02T09:00:00Z', now)).toBe('3 h ago');
    expect(formatRelative('2026-03-04T12:00:00Z', now)).toBe('2 d from now');
  });
});

describe('firewallDraft', () => {
  const rule = (sequence: number, o: Partial<FirewallRule> = {}): FirewallRule => ({
    id: `r${sequence}`, name: `r${sequence}`, sequence, enabled: true, action: 'ALLOW', protocol: 'TCP',
    sourceCidrs: ['10.0.0.0/24'], destinationCidrs: ['0.0.0.0/0'], destinationPorts: [], log: false, ...o,
  });
  const denyAll = rule(1000, { action: 'DENY', protocol: 'ANY', sourceCidrs: ['0.0.0.0/0'] });

  it('normalises addresses and rejects host bits past the prefix', () => {
    expect(normalizeCidr('192.168.1.10')).toBe('192.168.1.10/32');
    expect(normalizeCidr('10.0.0.0/8')).toBe('10.0.0.0/8');
    expect(normalizeCidr('10.0.0.1/24')).toBeNull();
    expect(normalizeCidr('300.1.1.1')).toBeNull();
  });

  it('parses port lists', () => {
    expect(parsePorts('80, 443 8000-8080')).toEqual([{ from: 80, to: 80 }, { from: 443, to: 443 }, { from: 8000, to: 8080 }]);
    expect(parsePorts('any')).toEqual([]);
    expect(parsePorts('9000-80')).toBeNull();
  });

  it('slots new rules above a trailing deny-all', () => {
    expect(nextSequence([])).toBe(10);
    expect(nextSequence([rule(10), rule(20)])).toBe(30);
    expect(nextSequence([rule(10), denyAll])).toBe(20);
  });

  it('validates the form like the API schema', () => {
    const { errors } = buildRule({ ...EMPTY_RULE_FORM, name: 'r10', protocol: 'ICMP', sources: '10.0.0.5/8', ports: '22' }, [rule(10)], 'n1');
    expect(errors).toEqual({ name: expect.stringMatching(/already exists/), sources: expect.stringMatching(/10.0.0.5\/8/), ports: 'ICMP rules cannot specify ports' });
    const ok = buildRule({ ...EMPTY_RULE_FORM, name: 'https', ports: '443' }, [rule(10), denyAll], 'n2');
    expect(ok.rule).toMatchObject({ sequence: 20, sourceCidrs: ['0.0.0.0/0'], destinationPorts: [{ from: 443, to: 443 }] });
  });
});

describe('policyDraft', () => {
  const p = (id: string, order: number): BusinessPolicy => ({
    id, name: id, order, enabled: true, match: {}, action: { serviceClass: 'BULK', priority: 'LOW', steering: 'BEST_PATH' },
  });
  const base = [p('voice', 10), p('saas', 20), p('backup', 30)];

  it('moves and renumbers, ignoring moves past the ends', () => {
    expect(movePolicy(base, 2, -1).map((x) => [x.id, x.order])).toEqual([['voice', 10], ['backup', 20], ['saas', 30]]);
    expect(movePolicy(base, 0, -1)).toBe(base);
  });

  it('summarises a draft against the live set', () => {
    const draft = togglePolicy(removePolicy(movePolicy(base, 1, 1), 'voice'), 'backup');
    const s = summarizePolicyChanges(base, draft);
    expect(s).toEqual({ added: [], removed: ['voice'], reordered: true, toggled: ['backup'] });
    expect(describeChanges(s)).toBe('Remove voice; toggle backup; reorder');
    expect(describeChanges(summarizePolicyChanges(base, base))).toBe('No changes');
  });
});
```

## apps/sdwan-portal/web/src/lib/policyDraft.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/lib/policyDraft.ts`.

```typescript
import type { BusinessPolicy } from '../api/types';

/** Moves the policy at `index` one slot up or down and renumbers so evaluation order matches display order. */
export function movePolicy(policies: BusinessPolicy[], index: number, direction: -1 | 1): BusinessPolicy[] {
  const target = index + direction;
  if (target < 0 || target >= policies.length) return policies;
  const next = [...policies];
  [next[index], next[target]] = [next[target], next[index]];
  return renumber(next);
}

/** Orders in steps of 10, matching how the API and vendors leave room for insertions. */
export function renumber(policies: BusinessPolicy[]): BusinessPolicy[] {
  return policies.map((p, i) => (p.order === (i + 1) * 10 ? p : { ...p, order: (i + 1) * 10 }));
}

export function togglePolicy(policies: BusinessPolicy[], id: string): BusinessPolicy[] {
  return policies.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
}

export function removePolicy(policies: BusinessPolicy[], id: string): BusinessPolicy[] {
  return renumber(policies.filter((p) => p.id !== id));
}

export interface PolicyChangeSummary {
  added: string[];
  removed: string[];
  reordered: boolean;
  toggled: string[];
}

/** What the draft changes relative to the controller's current set; drives the CR title and the submit button. */
export function summarizePolicyChanges(before: BusinessPolicy[], after: BusinessPolicy[]): PolicyChangeSummary {
  const beforeById = new Map(before.map((p) => [p.id, p]));
  const afterIds = new Set(after.map((p) => p.id));
  const commonBefore = before.filter((p) => afterIds.has(p.id)).map((p) => p.id);
  const commonAfter = after.filter((p) => beforeById.has(p.id)).map((p) => p.id);
  return {
    added: after.filter((p) => !beforeById.has(p.id)).map((p) => p.name),
    removed: before.filter((p) => !afterIds.has(p.id)).map((p) => p.name),
    reordered: commonBefore.some((id, i) => commonAfter[i] !== id),
    toggled: after.filter((p) => beforeById.has(p.id) && beforeById.get(p.id)!.enabled !== p.enabled).map((p) => p.name),
  };
}

export function hasChanges(s: PolicyChangeSummary): boolean {
  return s.added.length + s.removed.length + s.toggled.length > 0 || s.reordered;
}

export function describeChanges(s: PolicyChangeSummary): string {
  const parts: string[] = [];
  if (s.removed.length) parts.push(`remove ${s.removed.join(', ')}`);
  if (s.added.length) parts.push(`add ${s.added.join(', ')}`);
  if (s.toggled.length) parts.push(`toggle ${s.toggled.join(', ')}`);
  if (s.reordered) parts.push('reorder');
  const text = parts.join('; ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'No changes';
}
```

## apps/sdwan-portal/web/src/main.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/main.tsx`.

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
```

## apps/sdwan-portal/web/src/pages/AlertsPage.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/pages/AlertsPage.tsx`.

```tsx
import { Link } from 'react-router-dom';
import type { Alert, AlertSeverity, AlertStatus } from '../api/types';
import { useApi, useAuth } from '../auth/AuthContext';
import { canManageAlerts } from '../auth/token';
import { Column, PaginatedTable } from '../components/PaginatedTable';
import { ProblemBanner } from '../components/ProblemBanner';
import { StatusPill } from '../components/StatusPill';
import { useAsync, useMutation } from '../hooks/useAsync';
import { usePageParams } from '../hooks/usePageParams';
import { formatDateTime, formatRelative, humanize } from '../lib/format';

const FILTERS = ['status', 'severity'] as const;

export function AlertsPage() {
  const api = useApi();
  const { user } = useAuth();
  const { page, pageSize, filters, setPage, setPageSize, setFilter, pageSizes } = usePageParams(FILTERS);
  const status = (filters.status ?? 'OPEN') as AlertStatus | 'ALL';
  const alerts = useAsync(
    (s) => api.alerts({ page, pageSize, status: status === 'ALL' ? undefined : status, severity: filters.severity as AlertSeverity | undefined }, s),
    [api, page, pageSize, status, filters.severity],
  );
  const ack = useMutation((id: string) => api.acknowledgeAlert(id));

  const acknowledge = async (id: string) => {
    const updated = await ack.run(id);
    if (!updated) return;
    // Keep the row in place with its new state rather than reloading and shifting the page under the user.
    alerts.setData((prev) => prev && { ...prev, items: prev.items.map((a) => (a.id === id ? updated : a)) });
  };

  const columns: Column<Alert>[] = [
    { key: 'severity', header: 'Severity', render: (a) => <StatusPill value={a.severity} /> },
    { key: 'type', header: 'Type', render: (a) => humanize(a.type) },
    { key: 'message', header: 'Detail', render: (a) => <Link to={`/edges/${encodeURIComponent(a.edgeId)}`}>{a.message}</Link> },
    { key: 'raised', header: 'Raised', render: (a) => <time dateTime={a.raisedAt} title={formatDateTime(a.raisedAt)}>{formatRelative(a.raisedAt)}</time> },
    { key: 'count', header: 'Seen', align: 'right', render: (a) => `${a.occurrences}×` },
    { key: 'status', header: 'Status', render: (a) => <StatusPill value={a.status} label={a.acknowledgedBy ? `Acknowledged by ${a.acknowledgedBy}` : undefined} /> },
    {
      key: 'actions',
      header: '',
      render: (a) =>
        a.status === 'OPEN' && canManageAlerts(user) ? (
          <button type="button" onClick={() => acknowledge(a.id)} disabled={ack.pending}>
            Acknowledge
          </button>
        ) : null,
    },
  ];

  return (
    <section>
      <h1>Alerts</h1>
      <div className="filters">
        <label>
          Status
          <select value={status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
            <option value="ALL">All</option>
          </select>
        </label>
        <label>
          Severity
          <select value={filters.severity ?? ''} onChange={(e) => setFilter('severity', e.target.value || undefined)}>
            <option value="">Any</option>
            {(['CRITICAL', 'MAJOR', 'MINOR', 'INFO'] as const).map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ProblemBanner error={alerts.error ?? ack.error} onRetry={alerts.reload} />
      <PaginatedTable
        caption="Alerts"
        columns={columns}
        data={alerts.data}
        loading={alerts.loading}
        rowKey={(a) => a.id}
        emptyMessage={status === 'OPEN' ? 'No open alerts — all edges are healthy' : 'No alerts match these filters'}
        onPageChange={setPage}
        pageSizes={pageSizes}
        onPageSizeChange={setPageSize}
      />
    </section>
  );
}
```

## apps/sdwan-portal/web/src/pages/ChangeRequestDetailPage.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/pages/ChangeRequestDetailPage.tsx`.

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ChangeRequestView } from '../api/types';
import { useApi, useAuth } from '../auth/AuthContext';
import { canApprove, SessionUser } from '../auth/token';
import { ProblemBanner } from '../components/ProblemBanner';
import { StatusPill } from '../components/StatusPill';
import { useAsync, useMutation } from '../hooks/useAsync';
import { formatDateTime, humanize } from '../lib/format';

/** Mirrors api/src/domain/approvalRules.checkCanDecide for button state; the API remains the authority. */
export function decisionBlocker(cr: ChangeRequestView, user: SessionUser | null): string | null {
  if (cr.status !== 'SUBMITTED') return null;
  if (!canApprove(user)) return 'Only business administrators can approve changes';
  if (user!.userId === cr.requestedBy) return 'You cannot approve a change you requested';
  if (cr.approvals.some((a) => a.userId === user!.userId)) return 'You have already recorded a decision';
  return null;
}

function DecisionForm({ onDecide, pending }: { onDecide: (d: 'APPROVE' | 'REJECT', comment?: string) => void; pending: boolean }) {
  const [comment, setComment] = useState('');
  const rejectable = comment.trim().length >= 5;
  return (
    <div className="decision">
      <label>
        Comment
        <textarea value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} placeholder="Required when rejecting (5+ characters)" />
      </label>
      <button type="button" disabled={pending} onClick={() => onDecide('APPROVE', comment.trim() || undefined)}>
        Approve
      </button>
      <button type="button" disabled={pending || !rejectable} onClick={() => onDecide('REJECT', comment.trim())}>
        Reject
      </button>
    </div>
  );
}

function ScheduleForm({ cr, onSchedule, pending }: { cr: ChangeRequestView; onSchedule: (at: string, windowId?: string) => void; pending: boolean }) {
  const api = useApi();
  const windows = useAsync((s) => api.upcomingWindows(14, s), [api]);
  const [custom, setCustom] = useState('');
  const needsWindow = cr.approvalPolicy.requiresMaintenanceWindow;
  return (
    <div className="schedule">
      <h3>Schedule</h3>
      <ProblemBanner error={windows.error} />
      {windows.data?.length === 0 && needsWindow && <p className="field-error">No maintenance windows open in the next 14 days. Ask an administrator to create one.</p>}
      <ul>
        {windows.data?.map((w) => (
          <li key={`${w.windowId}-${w.start}`}>
            {w.name}: {formatDateTime(w.start)} – {formatDateTime(w.end)}{' '}
            <button type="button" disabled={pending} onClick={() => onSchedule(new Date(Math.max(Date.parse(w.start), Date.now() + 60_000)).toISOString(), w.windowId)}>
              Use this window
            </button>
          </li>
        ))}
      </ul>
      {!needsWindow && (
        <label>
          Or a specific time (UTC)
          <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button type="button" disabled={pending || !custom} onClick={() => onSchedule(new Date(`${custom}:00Z`).toISOString())}>
            Schedule
          </button>
        </label>
      )}
    </div>
  );
}

export function ChangeRequestDetailPage() {
  const { changeId = '' } = useParams();
  const api = useApi();
  const { user } = useAuth();
  const cr = useAsync((s) => api.change(changeId, s), [api, changeId]);
  const action = useMutation(async (fn: () => Promise<ChangeRequestView>) => {
    const updated = await fn();
    cr.setData(() => updated);
    return updated;
  });

  if (cr.error) return <ProblemBanner error={cr.error} onRetry={cr.reload} />;
  const c = cr.data;
  if (!c) return <p aria-busy="true">Loading change request…</p>;

  const isOwner = user?.userId === c.requestedBy;
  const blocker = decisionBlocker(c, user);
  const canAct = isOwner || canApprove(user);

  return (
    <section>
      <h1>
        {c.title} <StatusPill value={c.status} />
      </h1>
      <p className="meta">
        {humanize(c.type)} on {c.edgeIds.length} edge(s) · requested by {c.requestedBy} on {formatDateTime(c.createdAt)}
        {c.emergency && ' · emergency'}
      </p>
      {c.description && <p>{c.description}</p>}

      <h2>
        Risk <StatusPill value={c.risk} />
      </h2>
      <ul>
        {c.riskReasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {c.lintFindings && c.lintFindings.length > 0 && (
        <>
          <h3>Rule analysis</h3>
          <ul className="findings">
            {c.lintFindings.map((f) => (
              <li key={`${f.ruleId}-${f.message}`}>
                <StatusPill value={f.severity === 'WARNING' ? 'DEGRADED' : 'STANDBY'} label={humanize(f.severity)} /> {f.message}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Approvals</h2>
      <p>
        Needs {c.approvalPolicy.requiredApprovals} approval(s)
        {c.approvalPolicy.requiredRoles.length > 0 && `, including ${c.approvalPolicy.requiredRoles.map(humanize).join(' and ')}`}
        {c.approvalPolicy.requiresMaintenanceWindow && '; must run in a maintenance window'}.
      </p>
      {c.outstanding.length > 0 && <p className="notice">Still required: {c.outstanding.join(', ')}</p>}
      <ul>
        {c.approvals.map((a) => (
          <li key={a.userId}>
            <StatusPill value={a.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'} /> {a.userId} ({humanize(a.role)}) {formatDateTime(a.decidedAt)}
            {a.comment && <q>{a.comment}</q>}
          </li>
        ))}
      </ul>

      <ProblemBanner error={action.error} />
      {c.status === 'SUBMITTED' &&
        (blocker ? <p className="meta">{blocker}</p> : <DecisionForm pending={action.pending} onDecide={(d, comment) => action.run(() => api.decideChange(c.id, d, comment))} />)}
      {c.status === 'DRAFT' && isOwner && (
        <button type="button" disabled={action.pending} onClick={() => action.run(() => api.submitChange(c.id))}>
          Submit for approval
        </button>
      )}
      {c.status === 'APPROVED' && canAct && !c.emergency && (
        <ScheduleForm cr={c} pending={action.pending} onSchedule={(at, w) => action.run(() => api.scheduleChange(c.id, at, w))} />
      )}
      {['DRAFT', 'SUBMITTED', 'APPROVED', 'SCHEDULED'].includes(c.status) && canAct && (
        <button type="button" className="secondary" disabled={action.pending} onClick={() => action.run(() => api.cancelChange(c.id))}>
          Cancel change
        </button>
      )}

      {c.results.length > 0 && (
        <>
          <h2>Execution</h2>
          <ul>
            {c.results.map((r) => (
              <li key={r.edgeId}>
                <StatusPill value={r.ok ? 'COMPLETED' : 'FAILED'} /> {r.edgeId} {r.error && `— ${r.error}`}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>History</h2>
      <ol className="timeline">
        {c.history.map((h) => (
          <li key={`${h.at}-${h.to}`}>
            <time dateTime={h.at}>{formatDateTime(h.at)}</time> {h.from ? `${humanize(h.from)} → ` : ''}
            {humanize(h.to)} by {h.by}
            {h.note && ` — ${h.note}`}
          </li>
        ))}
      </ol>
    </section>
  );
}
```

## apps/sdwan-portal/web/src/pages/ChangeRequestsPage.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/pages/ChangeRequestsPage.tsx`.

```tsx
import { Link } from 'react-router-dom';
import type { ChangeRequest, ChangeStatus } from '../api/types';
import { useApi, useAuth } from '../auth/AuthContext';
import { canApprove } from '../auth/token';
import { Column, PaginatedTable } from '../components/PaginatedTable';
import { ProblemBanner } from '../components/ProblemBanner';
import { StatusPill } from '../components/StatusPill';
import { useAsync } from '../hooks/useAsync';
import { usePageParams } from '../hooks/usePageParams';
import { formatDateTime, humanize } from '../lib/format';

const STATUSES: ChangeStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED'];

const columns: Column<ChangeRequest>[] = [
  { key: 'title', header: 'Change', render: (c) => <Link to={`/changes/${encodeURIComponent(c.id)}`}>{c.title}</Link> },
  { key: 'type', header: 'Type', render: (c) => humanize(c.type) },
  { key: 'risk', header: 'Risk', render: (c) => <StatusPill value={c.risk} /> },
  { key: 'edges', header: 'Edges', align: 'right', render: (c) => c.edgeIds.length },
  { key: 'status', header: 'Status', render: (c) => <StatusPill value={c.status} /> },
  { key: 'by', header: 'Requested by', render: (c) => c.requestedBy },
  { key: 'when', header: 'Scheduled / created', render: (c) => formatDateTime(c.scheduledFor ?? c.createdAt) },
];

export function ChangeRequestsPage() {
  const api = useApi();
  const { user } = useAuth();
  const { page, pageSize, filters, setPage, setPageSize, setFilter, pageSizes } = usePageParams(['status'] as const);
  const changes = useAsync((s) => api.changes({ page, pageSize, status: filters.status as ChangeStatus | undefined }, s), [api, page, pageSize, filters.status]);

  return (
    <section>
      <h1>Change requests</h1>
      <div className="filters">
        <label>
          Status
          <select value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value || undefined)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </label>
        {canApprove(user) && filters.status !== 'SUBMITTED' && (
          <button type="button" onClick={() => setFilter('status', 'SUBMITTED')}>
            Awaiting approval
          </button>
        )}
      </div>
      <ProblemBanner error={changes.error} onRetry={changes.reload} />
      <PaginatedTable
        caption="Change requests"
        columns={columns}
        data={changes.data}
        loading={changes.loading}
        rowKey={(c) => c.id}
        emptyMessage="No change requests"
        onPageChange={setPage}
        pageSizes={pageSizes}
        onPageSizeChange={setPageSize}
      />
    </section>
  );
}
```

## apps/sdwan-portal/web/src/pages/EdgeDetailPage.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/pages/EdgeDetailPage.tsx`.

```tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { LinkHealth } from '../api/types';
import { RequireRole, useApi } from '../auth/AuthContext';
import { MetricChart } from '../components/MetricChart';
import { ProblemBanner } from '../components/ProblemBanner';
import { StatusPill } from '../components/StatusPill';
import { useAsync, useMutation } from '../hooks/useAsync';
import { EDGE_STATUS_LABEL, formatDateTime, formatKbps, formatMs, formatPct, LINK_STATE_LABEL, RANGE_PRESETS, RangePreset, rangeFor } from '../lib/format';

/** Realtime-class SLA (api/src/domain/linkScoring.ts DEFAULT_SLA.REALTIME), drawn on every chart. */
const SLA = { latencyMs: 150, jitterMs: 30, lossPct: 1 };

function LinkPanel({ lh, bucketSeconds }: { lh: LinkHealth; bucketSeconds: number }) {
  const series = (f: (b: LinkHealth['series'][number]) => number) => lh.series.map((b) => ({ t: b.start, v: f(b) }));
  return (
    <article className="link-panel">
      <h3>
        {lh.link.name} · {lh.link.transport.toLowerCase()} {lh.link.ispName && `(${lh.link.ispName})`}{' '}
        <StatusPill value={lh.link.state} label={LINK_STATE_LABEL[lh.link.state]} />
      </h3>
      {lh.score ? (
        <dl className="stats">
          <dt>Quality</dt>
          <dd>
            <StatusPill value={lh.score.grade === 'GOOD' ? 'UP' : lh.score.grade === 'FAIR' ? 'DEGRADED' : 'DOWN'} label={`${lh.score.grade.toLowerCase()} · MOS ${lh.score.mos}`} />
          </dd>
          <dt>SLA compliance</dt>
          <dd>{formatPct(lh.score.slaCompliancePct)}</dd>
          <dt>Availability</dt>
          <dd>{formatPct(lh.score.availabilityPct, 2)}</dd>
          <dt>p95 latency / jitter</dt>
          <dd>
            {formatMs(lh.aggregate?.latencyMs.p95)} / {formatMs(lh.aggregate?.jitterMs.p95)}
          </dd>
          <dt>p95 utilisation down / up</dt>
          <dd>
            {formatPct(lh.utilisation.rxP95Pct)} / {formatPct(lh.utilisation.txP95Pct)}
          </dd>
        </dl>
      ) : (
        <p className="empty">No measurements for this link in the selected range.</p>
      )}
      <MetricChart title="Latency" unit=" ms" points={series((b) => b.latencyMs)} threshold={SLA.latencyMs} bucketSeconds={bucketSeconds} />
      <MetricChart title="Jitter" unit=" ms" points={series((b) => b.jitterMs)} threshold={SLA.jitterMs} bucketSeconds={bucketSeconds} />
      <MetricChart title="Packet loss" unit="%" points={series((b) => b.lossPct)} threshold={SLA.lossPct} bucketSeconds={bucketSeconds} />
    </article>
  );
}

export function EdgeDetailPage() {
  const { edgeId = '' } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const [preset, setPreset] = useState<RangePreset>('24h');
  const edge = useAsync((s) => api.edge(edgeId, s), [api, edgeId]);
  const health = useAsync((s) => api.edgeHealth(edgeId, rangeFor(preset), s), [api, edgeId, preset]);
  const events = useAsync((s) => api.events({ ...rangeFor('7d'), edgeId, limit: 20 }, s), [api, edgeId]);
  const reboot = useMutation(() =>
    api.createChange({ title: `Reboot ${edge.data?.name ?? edgeId}`, edgeIds: [edgeId], payload: { type: 'EDGE_REBOOT' } }),
  );

  if (edge.error) return <ProblemBanner error={edge.error} onRetry={edge.reload} />;
  const e = edge.data;
  if (!e) return <p aria-busy="true">Loading edge…</p>;

  return (
    <section>
      <h1>
        {e.name} <StatusPill value={e.status} label={EDGE_STATUS_LABEL[e.status]} />
      </h1>
      <p className="meta">
        {e.vendor === 'FORTINET' ? 'Fortinet' : 'VeloCloud'} {e.model} · serial {e.serialNumber} · software {e.softwareVersion} · HA {e.haState.toLowerCase()} · last contact{' '}
        {formatDateTime(e.lastContact)}
      </p>
      <RequireRole roles={['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT']}>
        <button
          type="button"
          disabled={reboot.pending}
          onClick={async () => {
            const cr = await reboot.run();
            if (cr) navigate(`/changes/${encodeURIComponent(cr.id)}`);
          }}
        >
          Request reboot
        </button>
        <ProblemBanner error={reboot.error} />
      </RequireRole>

      <h2>WAN links</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Link</th>
            <th scope="col">State</th>
            <th scope="col">Transport</th>
            <th scope="col">Provider</th>
            <th scope="col">Bandwidth (down/up)</th>
            <th scope="col">Public IP</th>
          </tr>
        </thead>
        <tbody>
          {e.links.map((l) => (
            <tr key={l.id}>
              <td>
                {l.name} <small>{l.interface}</small>
              </td>
              <td>
                <StatusPill value={l.state} label={LINK_STATE_LABEL[l.state]} />
              </td>
              <td>{l.transport.toLowerCase()}</td>
              <td>{l.ispName ?? '—'}</td>
              <td>
                {formatKbps(l.bandwidthDownKbps)} / {formatKbps(l.bandwidthUpKbps)}
              </td>
              <td>{l.publicIp ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>
        WAN health {health.data && <small>score {health.data.healthScore}/100</small>}
      </h2>
      <div role="group" aria-label="Time range" className="segmented">
        {(Object.keys(RANGE_PRESETS) as RangePreset[]).map((p) => (
          <button key={p} type="button" aria-pressed={preset === p} onClick={() => setPreset(p)}>
            {p}
          </button>
        ))}
      </div>
      <ProblemBanner error={health.error} onRetry={health.reload} />
      {health.data?.links.map((lh) => <LinkPanel key={lh.link.id} lh={lh} bucketSeconds={health.data!.bucketSeconds} />)}

      <h2>Recent events</h2>
      <ProblemBanner error={events.error} onRetry={events.reload} />
      {events.data && events.data.items.length === 0 && <p className="empty">No events in the last 7 days.</p>}
      <ul className="events">
        {events.data?.items.map((ev) => (
          <li key={ev.id}>
            <StatusPill value={ev.severity} /> <time dateTime={ev.occurredAt}>{formatDateTime(ev.occurredAt)}</time> {ev.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

## apps/sdwan-portal/web/src/pages/FirewallPage.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/pages/FirewallPage.tsx`.

```tsx
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Finding, FirewallRule } from '../api/types';
import { RequireRole, useApi } from '../auth/AuthContext';
import { EdgePicker } from '../components/EdgePicker';
import { ProblemBanner } from '../components/ProblemBanner';
import { StatusPill } from '../components/StatusPill';
import { useAsync, useMutation } from '../hooks/useAsync';
import { buildRule, EMPTY_RULE_FORM, FirewallRuleForm, formatCidrs, formatPorts, FormErrors } from '../lib/firewallDraft';
import { humanize } from '../lib/format';

function RuleForm({ existing, onAdd }: { existing: FirewallRule[]; onAdd: (r: FirewallRule) => void }) {
  const [form, setForm] = useState<FirewallRuleForm>(EMPTY_RULE_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const set = <K extends keyof FirewallRuleForm>(k: K, v: FirewallRuleForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const { rule, errors: errs } = buildRule(form, existing, `new-${crypto.randomUUID().slice(0, 8)}`);
    setErrors(errs);
    if (rule) {
      onAdd(rule);
      setForm(EMPTY_RULE_FORM);
    }
  };

  const field = (k: 'name' | 'sources' | 'destinations' | 'ports', label: string, placeholder: string) => (
    <label>
      {label}
      <input value={form[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `err-${k}` : undefined} />
      {errors[k] && (
        <span id={`err-${k}`} className="field-error">
          {errors[k]}
        </span>
      )}
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="rule-form" aria-label="Add firewall rule">
      {field('name', 'Name', 'Allow-HTTPS-out')}
      <label>
        Action
        <select value={form.action} onChange={(e) => set('action', e.target.value as FirewallRuleForm['action'])}>
          <option value="ALLOW">Allow</option>
          <option value="DENY">Deny</option>
        </select>
      </label>
      <label>
        Protocol
        <select value={form.protocol} onChange={(e) => set('protocol', e.target.value as FirewallRuleForm['protocol'])}>
          {(['TCP', 'UDP', 'ICMP', 'ANY'] as const).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      {field('sources', 'Source', '10.0.0.0/24 or any')}
      {field('destinations', 'Destination', '0.0.0.0/0 or any')}
      {field('ports', 'Ports', '443, 8000-8080 or any')}
      <label className="inline">
        <input type="checkbox" checked={form.log} onChange={(e) => set('log', e.target.checked)} /> Log matches
      </label>
      <button type="submit">Add rule</button>
    </form>
  );
}

/** Fortinet edges only: VeloCloud firewall is managed by Uniti through the orchestrator profile. */
export function FirewallPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [edgeId, setEdgeId] = useState<string>();
  const current = useAsync((s) => (edgeId ? api.firewall(edgeId, s) : Promise.resolve(undefined)), [api, edgeId]);
  const [draft, setDraft] = useState<FirewallRule[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  useEffect(() => {
    setDraft(current.data?.rules ?? []);
    setFindings(current.data?.findings ?? []);
  }, [current.data]);

  const ordered = useMemo(() => [...draft].sort((a, b) => a.sequence - b.sequence), [draft]);
  const dirty = JSON.stringify(ordered) !== JSON.stringify(current.data?.rules ?? []);
  const lint = useMutation((rules: FirewallRule[]) => api.previewFirewall(rules));
  const submit = useMutation(() =>
    api.createChange({ title: `Firewall update (${ordered.length} rules)`, edgeIds: [edgeId!], payload: { type: 'FIREWALL_UPDATE', rules: ordered }, submit: true }),
  );
  const blocking = findings.some((f) => f.severity === 'ERROR');
  const findingsByRule = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const f of findings) if (f.ruleId) m.set(f.ruleId, [...(m.get(f.ruleId) ?? []), f]);
    return m;
  }, [findings]);

  const updateDraft = async (next: FirewallRule[]) => {
    setDraft(next);
    const res = await lint.run(next);
    if (res) setFindings(res.findings);
  };

  return (
    <section>
      <h1>Firewall rules</h1>
      <EdgePicker value={edgeId} onChange={setEdgeId} vendor="FORTINET" label="FortiGate" />
      <ProblemBanner error={current.error} onRetry={current.reload} />
      {current.data && (
        <table>
          <thead>
            <tr>
              <th scope="col">Seq</th>
              <th scope="col">Name</th>
              <th scope="col">Action</th>
              <th scope="col">Protocol</th>
              <th scope="col">Source</th>
              <th scope="col">Destination</th>
              <th scope="col">Ports</th>
              <th scope="col">Findings</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {ordered.map((r) => (
              <tr key={r.id} className={r.enabled ? undefined : 'disabled'}>
                <td>{r.sequence}</td>
                <td>{r.name}</td>
                <td>
                  <StatusPill value={r.action === 'ALLOW' ? 'UP' : 'DOWN'} label={humanize(r.action)} />
                </td>
                <td>{r.protocol}</td>
                <td>{formatCidrs(r.sourceCidrs)}</td>
                <td>{formatCidrs(r.destinationCidrs)}</td>
                <td>{r.protocol === 'ICMP' ? '—' : formatPorts(r.destinationPorts)}</td>
                <td>
                  {(findingsByRule.get(r.id) ?? []).map((f) => (
                    <div key={`${f.code}-${f.message}`} title={f.message}>
                      <StatusPill value={f.severity === 'ERROR' ? 'FAILED' : f.severity === 'WARNING' ? 'DEGRADED' : 'STANDBY'} label={humanize(f.code ?? f.severity)} />
                    </div>
                  ))}
                </td>
                <td>
                  <RequireRole roles={['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT']}>
                    <button type="button" onClick={() => updateDraft(draft.filter((x) => x.id !== r.id))}>
                      Remove
                    </button>
                  </RequireRole>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {findings.length > 0 && (
        <ul className="findings" aria-label="Rule analysis">
          {findings.map((f) => (
            <li key={`${f.ruleId}-${f.code}-${f.message}`}>{f.message}</li>
          ))}
        </ul>
      )}
      <RequireRole roles={['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT']}>
        {current.data && <RuleForm existing={draft} onAdd={(r) => updateDraft([...draft, r])} />}
        {dirty && (
          <div className="draft-bar">
            {blocking && <p className="field-error">Resolve the errors above before submitting.</p>}
            <button
              type="button"
              disabled={blocking || lint.pending || submit.pending}
              onClick={async () => {
                const cr = await submit.run();
                if (cr) navigate(`/changes/${encodeURIComponent(cr.id)}`);
              }}
            >
              Submit for approval
            </button>
            <button type="button" onClick={() => updateDraft(current.data?.rules ?? [])}>
              Discard
            </button>
          </div>
        )}
        <ProblemBanner error={lint.error ?? submit.error} />
      </RequireRole>
    </section>
  );
}
```

## apps/sdwan-portal/web/src/pages/LoginPage.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/pages/LoginPage.tsx`.

```tsx
import { FormEvent, useState } from 'react';
import { authorizeUrl, useAuth } from '../auth/AuthContext';

/**
 * Production sign-in redirects to the IdP (implicit flow; the token comes back in the URL
 * fragment and AuthProvider picks it up). In development a token can be pasted directly,
 * e.g. one minted by the API's signDevToken helper.
 */
export function LoginPage() {
  const { signIn } = useAuth();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const idp = authorizeUrl(window.location.origin + window.location.pathname);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(signIn(raw.trim()) ? null : 'That token is malformed, expired or carries no SD-WAN portal role.');
  };

  return (
    <main className="login">
      <h1>Uniti Business SD-WAN</h1>
      {idp && (
        <a className="button" href={idp}>
          Sign in with your Uniti account
        </a>
      )}
      {import.meta.env.DEV && (
        <form onSubmit={onSubmit}>
          <label>
            Developer access token
            <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={4} />
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <button type="submit">Use token</button>
        </form>
      )}
    </main>
  );
}
```

## apps/sdwan-portal/web/src/pages/OverviewPage.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/pages/OverviewPage.tsx`.

```tsx
import { Link } from 'react-router-dom';
import type { Edge, EdgeStatus, Vendor } from '../api/types';
import { useApi } from '../auth/AuthContext';
import { Column, PaginatedTable } from '../components/PaginatedTable';
import { ProblemBanner } from '../components/ProblemBanner';
import { StatusPill } from '../components/StatusPill';
import { useAsync } from '../hooks/useAsync';
import { usePageParams } from '../hooks/usePageParams';
import { EDGE_STATUS_LABEL, formatKbps, formatRelative } from '../lib/format';

const VENDOR_LABEL: Record<Vendor, string> = { VELOCLOUD: 'VeloCloud', FORTINET: 'Fortinet' };
const FILTERS = ['status', 'vendor', 'q'] as const;

const columns: Column<Edge>[] = [
  { key: 'name', header: 'Edge', render: (e) => <Link to={`/edges/${encodeURIComponent(e.id)}`}>{e.name}</Link> },
  { key: 'status', header: 'Status', render: (e) => <StatusPill value={e.status} label={EDGE_STATUS_LABEL[e.status]} /> },
  { key: 'vendor', header: 'Vendor', render: (e) => VENDOR_LABEL[e.vendor] },
  { key: 'model', header: 'Model', render: (e) => `${e.model} · ${e.softwareVersion}` },
  {
    key: 'links',
    header: 'WAN links',
    render: (e) => {
      const down = e.links.filter((l) => l.state === 'DOWN').length;
      const capacity = e.links.reduce((a, l) => a + l.bandwidthDownKbps, 0);
      return `${e.links.length - down}/${e.links.length} up · ${formatKbps(capacity)}`;
    },
  },
  { key: 'ha', header: 'HA', render: (e) => (e.haState === 'STANDALONE' ? 'None' : <StatusPill value={e.haState === 'FAILED' ? 'DOWN' : 'UP'} label={e.haState.toLowerCase()} />) },
  { key: 'seen', header: 'Last contact', render: (e) => formatRelative(e.lastContact) },
];

export function OverviewPage() {
  const api = useApi();
  const { page, pageSize, filters, setPage, setPageSize, setFilter, pageSizes } = usePageParams(FILTERS);
  const summary = useAsync((s) => api.summary(s), [api]);
  const edges = useAsync(
    (s) => api.edges({ page, pageSize, status: filters.status as EdgeStatus | undefined, vendor: filters.vendor as Vendor | undefined, q: filters.q }, s),
    [api, page, pageSize, filters],
  );
  const sum = summary.data;

  return (
    <section>
      <h1>SD-WAN overview</h1>
      <ProblemBanner error={summary.error} onRetry={summary.reload} />
      {sum && sum.unavailable.length > 0 && (
        <div role="status" className="notice">
          {sum.unavailable.map((v) => VENDOR_LABEL[v]).join(' and ')} controller is unreachable; those edges are missing below.
        </div>
      )}
      {sum && (
        <div className="tiles">
          {(['UP', 'DEGRADED', 'DOWN'] as const).map((s) => (
            <button key={s} type="button" className={`tile tile-${s.toLowerCase()}`} aria-pressed={filters.status === s} onClick={() => setFilter('status', filters.status === s ? undefined : s)}>
              <span className="tile-value">{sum.byStatus[s]}</span>
              <span className="tile-label">{EDGE_STATUS_LABEL[s]}</span>
            </button>
          ))}
          <div className="tile">
            <span className="tile-value">{sum.sites}</span>
            <span className="tile-label">Sites</span>
          </div>
          <div className="tile">
            <span className="tile-value">
              {sum.links - sum.linksDown}/{sum.links}
            </span>
            <span className="tile-label">Links up</span>
          </div>
        </div>
      )}

      <div className="filters">
        <label>
          Vendor
          <select value={filters.vendor ?? ''} onChange={(e) => setFilter('vendor', e.target.value || undefined)}>
            <option value="">All</option>
            <option value="VELOCLOUD">VeloCloud</option>
            <option value="FORTINET">Fortinet</option>
          </select>
        </label>
        <label>
          Search
          <input type="search" defaultValue={filters.q ?? ''} placeholder="Edge name or serial" onKeyDown={(e) => e.key === 'Enter' && setFilter('q', e.currentTarget.value.trim() || undefined)} />
        </label>
      </div>

      <ProblemBanner error={edges.error} onRetry={edges.reload} />
      <PaginatedTable
        caption="Edges"
        columns={columns}
        data={edges.data}
        loading={edges.loading}
        rowKey={(e) => e.id}
        emptyMessage="No edges match these filters"
        onPageChange={setPage}
        pageSizes={pageSizes}
        onPageSizeChange={setPageSize}
      />
    </section>
  );
}
```
