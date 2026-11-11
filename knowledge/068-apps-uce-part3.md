# UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory): apps/uce (part 3 of 3)

- **Application:** UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory)
- **Tech stack:** React + TypeScript
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 9

## Files

- `apps/uce/src/search/searchService.ts` (59 lines)
- `apps/uce/src/shell/AppShell.tsx` (82 lines)
- `apps/uce/src/shell/PortalPage.tsx` (72 lines)
- `apps/uce/src/shell/portals.ts` (53 lines)
- `apps/uce/src/styles.css` (151 lines)
- `apps/uce/src/test/fakes.tsx` (63 lines)
- `apps/uce/src/test/setup.ts` (14 lines)
- `apps/uce/tsconfig.json` (22 lines)
- `apps/uce/vite.config.ts` (41 lines)

## apps/uce/src/search/searchService.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/search/searchService.ts`.

```typescript
import { ApiClient } from '../api/apiClient';

export type SearchResultType = 'ACCOUNT' | 'SERVICE' | 'INVOICE' | 'TICKET' | 'ORDER' | 'HELP';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  /** In-shell relative path. */
  path: string;
}

export interface DirectHit {
  type: SearchResultType;
  id: string;
  path: string;
  label: string;
}

const IDENTIFIERS: Array<{ pattern: RegExp; type: SearchResultType; prefix: string; path: (id: string) => string; label: string }> = [
  { pattern: /^ACC-?(\d{8})$/i, type: 'ACCOUNT', prefix: 'ACC', path: (id) => `/accounts/${id}`, label: 'Go to account' },
  { pattern: /^INV-?(\d{6,10})$/i, type: 'INVOICE', prefix: 'INV', path: (id) => `/portals/uconnect/invoices/${id}`, label: 'Open invoice' },
  { pattern: /^TKT-?(\d{6,10})$/i, type: 'TICKET', prefix: 'TKT', path: (id) => `/portals/uconnect/tickets/${id}`, label: 'Open ticket' },
  { pattern: /^ORD-?(\d{4,10})$/i, type: 'ORDER', prefix: 'ORD', path: (id) => `/portals/ecom/orders/${id}`, label: 'Track order' },
];

/** Recognises a typed identifier so the user can jump straight to it without a search round-trip. */
export function detectIdentifier(query: string): DirectHit | undefined {
  const trimmed = query.trim();
  for (const def of IDENTIFIERS) {
    const match = def.pattern.exec(trimmed);
    if (match) {
      const id = `${def.prefix}-${match[1]}`;
      return { type: def.type, id, path: def.path(id), label: `${def.label} ${id}` };
    }
  }
  return undefined;
}

export const MIN_QUERY_LENGTH = 2;

const GROUP_ORDER: SearchResultType[] = ['ACCOUNT', 'SERVICE', 'ORDER', 'INVOICE', 'TICKET', 'HELP'];

export function groupResults(results: SearchResult[]): Array<{ type: SearchResultType; items: SearchResult[] }> {
  return GROUP_ORDER.map((type) => ({ type, items: results.filter((r) => r.type === type) })).filter((g) => g.items.length > 0);
}

export class SearchService {
  constructor(private readonly api: ApiClient) {}

  async search(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) return [];
    const page = await this.api.get<{ items: SearchResult[] }>('/search', { query: { q: q.slice(0, 100), pageSize: 20 }, signal });
    return page.items.filter((r) => r.path.startsWith('/') && !r.path.startsWith('//'));
  }
}
```

## apps/uce/src/shell/AppShell.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/shell/AppShell.tsx`.

```tsx
import { useMemo } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AccountSwitcher } from '../accounts/AccountSwitcher';
import { useAnalytics } from '../analytics/AnalyticsProvider';
import { useApi } from '../api/ApiProvider';
import { useAuth } from '../auth/AuthProvider';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { UceConfig } from '../config';
import { ConsentBanner } from '../consent/ConsentBanner';
import { useConsent } from '../consent/ConsentProvider';
import { Feature } from '../flags/featureFlags';
import { NotificationCentre } from '../notifications/NotificationCentre';
import { NotificationService } from '../notifications/notifications';
import { GlobalSearch } from '../search/GlobalSearch';
import { SearchService } from '../search/searchService';
import { portalsFor } from './portals';

export function AppShell({ portalUrls }: { portalUrls: UceConfig['portalUrls'] }) {
  const api = useApi();
  const analytics = useAnalytics();
  const consent = useConsent();
  const { status, user, login, logout } = useAuth();
  const location = useLocation();
  const notifications = useMemo(() => new NotificationService(api), [api]);
  const search = useMemo(() => new SearchService(api), [api]);
  const portals = user ? portalsFor(user.roles, portalUrls) : [];

  return (
    <div className="uce-shell">
      <a className="uce-skip" href="#uce-main">
        Skip to content
      </a>
      <header className="uce-header">
        <Link to="/" className="uce-brand">
          Uniti
        </Link>
        {user && (
          <nav aria-label="Portals">
            {portals.map((p) => (
              <NavLink key={p.id} to={`/portals/${p.id}`}>
                {p.name}
              </NavLink>
            ))}
            <Feature flag="referrals">
              <NavLink to="/referrals">Refer a friend</NavLink>
            </Feature>
          </nav>
        )}
        {user && (
          <Feature flag="global-search">
            <GlobalSearch service={search} onSearch={(count) => analytics.track('search_performed', { result_count: count })} />
          </Feature>
        )}
        {user && <AccountSwitcher onSwitch={() => analytics.track('account_switched', { accounts: user.accounts.length })} />}
        {user && <NotificationCentre service={notifications} />}
        {status === 'authenticated' ? (
          <button type="button" onClick={() => void logout()}>
            Sign out
          </button>
        ) : (
          status === 'anonymous' && (
            <button type="button" onClick={() => void login()}>
              Sign in
            </button>
          )
        )}
      </header>
      <main id="uce-main" className="uce-main">
        <ErrorBoundary resetKey={location.pathname} onError={(report) => analytics.track('ui_error', { error_name: report.name, reference: report.reference })}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="uce-footer">
        <button type="button" onClick={consent.openPreferences}>
          Cookie settings
        </button>
      </footer>
      <ConsentBanner />
    </div>
  );
}
```

## apps/uce/src/shell/PortalPage.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/shell/PortalPage.tsx`.

```tsx
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { UceConfig } from '../config';
import { embedUrl, portalsFor } from './portals';

interface PortalMessage {
  type: 'uce:navigate' | 'uce:title';
  path?: string;
  title?: string;
}

/** Hosts an embeddable portal in a sandboxed frame, scoped to the active account. */
export function PortalPage({ portalUrls }: { portalUrls: UceConfig['portalUrls'] }) {
  const { portalId, '*': rest = '' } = useParams();
  const { user, activeAccountId } = useAuth();
  const navigate = useNavigate();
  const portal = useMemo(() => (user ? portalsFor(user.roles, portalUrls).find((p) => p.id === portalId) : undefined), [portalId, portalUrls, user]);
  // The frame URL is fixed per portal/account: later path changes come *from* the
  // frame (uce:navigate) and must not reload it. `rest` is read only on entry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const frameSrc = useMemo(() => (portal ? embedUrl(portal, rest, activeAccountId) : ''), [portal, activeAccountId]);

  useEffect(() => {
    if (!portal) return undefined;
    const origin = new URL(portal.url).origin;
    // Accept messages only from the portal's own origin; ignore everything else.
    const onMessage = (event: MessageEvent<PortalMessage>) => {
      if (event.origin !== origin || !event.data || typeof event.data !== 'object') return;
      // Keeps the shell URL in sync with in-portal navigation so deep links and back/forward work.
      if (event.data.type === 'uce:navigate' && typeof event.data.path === 'string' && /^\/[\w\-/]*$/.test(event.data.path)) {
        navigate(`/portals/${portal.id}${event.data.path}`, { replace: true });
      }
      if (event.data.type === 'uce:title' && typeof event.data.title === 'string') document.title = `${event.data.title.slice(0, 80)} - Uniti`;
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate, portal]);

  if (!portal) {
    return (
      <section role="alert">
        <h1>Portal unavailable</h1>
        <p>This portal doesn't exist or isn't available for your account.</p>
      </section>
    );
  }

  if (portal.mode === 'link') {
    return (
      <section>
        <h1>{portal.name}</h1>
        <p>{portal.description}</p>
        <a href={embedUrl(portal, rest, activeAccountId)} target="_blank" rel="noopener noreferrer">
          Open {portal.name} in a new tab
        </a>
      </section>
    );
  }

  return (
    <iframe
      key={`${portal.id}-${activeAccountId}`}
      title={portal.name}
      src={frameSrc}
      className="uce-portal-frame"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
```

## apps/uce/src/shell/portals.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/shell/portals.ts`.

```typescript
import { hasAnyRole, Role } from '../auth/roles';
import { PortalId, UceConfig } from '../config';

/**
 * Registry of the portals the shell hosts. "embed" portals render inside the
 * shell (same SSO session, shared header); "link" portals open in a new tab
 * because they set frame-ancestors restrictions or run their own chrome.
 */

export interface PortalDefinition {
  id: PortalId;
  name: string;
  description: string;
  roles: Role[];
  mode: 'embed' | 'link';
}

const BUSINESS: Role[] = ['BUSINESS_ADMIN', 'BUSINESS_USER'];
const PARTNER: Role[] = ['PARTNER_ADMIN', 'PARTNER_AGENT'];

export const PORTALS: PortalDefinition[] = [
  { id: 'ecom', name: 'Shop & orders', description: 'Browse broadband plans and track orders', roles: ['CONSUMER', ...BUSINESS], mode: 'embed' },
  { id: 'uconnect', name: 'My services & billing', description: 'Manage services, invoices and support tickets', roles: ['CONSUMER', ...BUSINESS], mode: 'embed' },
  { id: 'gokinetic-business', name: 'Go Kinetic Business', description: 'Business self-care for sites and users', roles: BUSINESS, mode: 'embed' },
  { id: 'sdwan', name: 'SD-WAN', description: 'VeloCloud and Fortinet edge management', roles: BUSINESS, mode: 'link' },
  { id: 'hosted-services', name: 'Hosted services', description: 'Hosted voice, email and web hosting', roles: BUSINESS, mode: 'embed' },
  { id: 'partner', name: 'Partner portal', description: 'Enterprise partner orders and commissions', roles: PARTNER, mode: 'link' },
  { id: 'wholesale', name: 'iConnect Wholesale', description: 'Wholesale ordering', roles: ['WHOLESALE_BUYER'], mode: 'link' },
];

export interface ResolvedPortal extends PortalDefinition {
  url: string;
}

/** Portals the user may open and that are configured for this environment. */
export function portalsFor(roles: Role[], urls: UceConfig['portalUrls']): ResolvedPortal[] {
  const isAgent = roles.includes('SUPPORT_AGENT');
  return PORTALS.filter((p) => urls[p.id] && (isAgent || hasAnyRole(roles, p.roles))).map((p) => ({ ...p, url: urls[p.id]! }));
}

/**
 * Builds the embed URL, passing only non-sensitive context. Tokens are never
 * put in URLs; embedded portals obtain their own via silent SSO.
 */
export function embedUrl(portal: ResolvedPortal, subPath: string, accountId: string | undefined): string {
  const url = new URL(portal.url);
  const clean = subPath.replace(/^\/+/, '');
  if (clean && !clean.split('/').includes('..')) url.pathname = `${url.pathname.replace(/\/$/, '')}/${clean}`;
  url.searchParams.set('embedded', 'uce');
  if (accountId) url.searchParams.set('accountId', accountId);
  return url.toString();
}
```

## apps/uce/src/styles.css

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: css. Path: `apps/uce/src/styles.css`.

```css
:root {
  --uce-primary: #5a1fa8;
  --uce-text: #1d1d24;
  --uce-muted: #5c5c6b;
  --uce-surface: #ffffff;
  --uce-border: #d9d9e3;
  --uce-danger: #b42318;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--uce-text);
}

body {
  margin: 0;
  background: #f6f6fa;
}

.uce-skip {
  position: absolute;
  left: -9999px;
}
.uce-skip:focus {
  left: 1rem;
  top: 1rem;
}

.uce-header {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: var(--uce-surface);
  border-bottom: 1px solid var(--uce-border);
}
.uce-header nav {
  display: flex;
  gap: 0.75rem;
  flex: 1;
}
.uce-header nav a.active {
  font-weight: 600;
  color: var(--uce-primary);
}

.uce-main {
  padding: 1.5rem;
  min-height: 70vh;
}
.uce-portal-frame {
  width: 100%;
  height: calc(100vh - 10rem);
  border: 0;
}

.uce-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 1rem;
  list-style: none;
  padding: 0;
}
.uce-tiles a {
  display: flex;
  flex-direction: column;
  padding: 1rem;
  background: var(--uce-surface);
  border: 1px solid var(--uce-border);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
}

.uce-badge {
  margin-left: 0.25rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: var(--uce-danger);
  color: #fff;
  font-size: 0.75rem;
}
.uce-notifications {
  position: relative;
}
.uce-notifications__panel {
  position: absolute;
  right: 0;
  width: 22rem;
  max-height: 28rem;
  overflow: auto;
  background: var(--uce-surface);
  border: 1px solid var(--uce-border);
  z-index: 20;
}
.uce-notifications li.is-unread strong::before {
  content: '\2022 ';
  color: var(--uce-primary);
}

.uce-search {
  position: relative;
}
.uce-search [role='listbox'] {
  position: absolute;
  width: 26rem;
  background: var(--uce-surface);
  border: 1px solid var(--uce-border);
  list-style: none;
  padding: 0.5rem;
  z-index: 20;
}
.uce-search [aria-selected='true'] {
  background: #ece6f7;
}

.uce-consent {
  position: fixed;
  inset: auto 0 0 0;
  padding: 1rem 1.5rem;
  background: var(--uce-surface);
  border-top: 2px solid var(--uce-primary);
  z-index: 50;
}
.uce-consent--dialog {
  inset: 10vh auto auto 50%;
  transform: translateX(-50%);
  max-width: 36rem;
  border: 1px solid var(--uce-border);
}
.uce-consent__category {
  display: flex;
  gap: 0.75rem;
  margin: 0.75rem 0;
}
.uce-consent__category small {
  display: block;
  color: var(--uce-muted);
}
.uce-consent__actions {
  display: flex;
  gap: 0.5rem;
}

.uce-error,
[role='alert'] {
  color: var(--uce-danger);
}
.uce-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--uce-border);
}
```

## apps/uce/src/test/fakes.tsx

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: tsx. Path: `apps/uce/src/test/fakes.tsx`.

```tsx
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ApiClient } from '../api/apiClient';
import { AuthContext, AuthContextValue } from '../auth/AuthProvider';
import { SessionUser } from '../auth/oidc';
import { hasAnyRole } from '../auth/roles';

export function testUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: 'user-1',
    name: 'Jane Customer',
    roles: ['CONSUMER'],
    accounts: [{ accountId: 'ACC-12345678', name: 'Home' }],
    defaultAccountId: 'ACC-12345678',
    ...overrides,
  };
}

export function fakeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  const user = overrides.user ?? testUser();
  return {
    status: 'authenticated',
    user,
    activeAccountId: user.defaultAccountId,
    login: vi.fn(async () => undefined),
    completeLogin: vi.fn(async () => '/'),
    logout: vi.fn(async () => undefined),
    getAccessToken: vi.fn(async () => 'token'),
    setActiveAccount: vi.fn(),
    hasRole: (...roles) => hasAnyRole(user.roles, roles),
    ...overrides,
  };
}

export function Providers({ auth = fakeAuth(), path = '/', children }: { auth?: AuthContextValue; path?: string; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    </MemoryRouter>
  );
}

/** ApiClient double whose get/post are vi mocks keyed by path. */
export function fakeApi(responses: Record<string, unknown> = {}) {
  const resolve = (path: string) => {
    if (!(path in responses)) return Promise.reject(new Error(`unexpected call ${path}`));
    const value = responses[path];
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  };
  return {
    get: vi.fn((path: string) => resolve(path)),
    post: vi.fn((path: string) => resolve(path)),
  } as unknown as ApiClient & { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
}

export function jsonResponse(body: unknown, init: { status?: number; contentType?: string; headers?: Record<string, string> } = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': init.contentType ?? 'application/json', ...init.headers },
  });
}
```

## apps/uce/src/test/setup.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/src/test/setup.ts`.

```typescript
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  document.head.querySelectorAll('script[id^="uce-"]').forEach((s) => s.remove());
  delete window.clarity;
  delete window.FS;
  delete window.squatch;
});
```

## apps/uce/tsconfig.json

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: json. Path: `apps/uce/tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"]
}
```

## apps/uce/vite.config.ts

Application: UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory). Stack: React + TypeScript. Language: typescript. Path: `apps/uce/vite.config.ts`.

```typescript
/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8080';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      sourcemap: true,
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: { react: ['react', 'react-dom', 'react-router-dom'] },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/test/**'],
      },
    },
  };
});
```
