# SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal/web (part 7 of 7)

- **Application:** SD-WAN management (VeloCloud & Fortinet)
- **Tech stack:** Node.js TypeScript API + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 7

## Files

- `apps/sdwan-portal/web/src/pages/PoliciesPage.tsx` (172 lines)
- `apps/sdwan-portal/web/src/pages/pages.test.tsx` (116 lines)
- `apps/sdwan-portal/web/src/styles.css` (79 lines)
- `apps/sdwan-portal/web/src/test/setup.ts` (11 lines)
- `apps/sdwan-portal/web/src/test/utils.tsx` (45 lines)
- `apps/sdwan-portal/web/tsconfig.json` (19 lines)
- `apps/sdwan-portal/web/vite.config.ts` (20 lines)

## apps/sdwan-portal/web/src/pages/PoliciesPage.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/pages/PoliciesPage.tsx`.

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BusinessPolicy } from '../api/types';
import { useApi, useAuth } from '../auth/AuthContext';
import { canRequestChanges } from '../auth/token';
import { EdgePicker } from '../components/EdgePicker';
import { ProblemBanner } from '../components/ProblemBanner';
import { StatusPill } from '../components/StatusPill';
import { useAsync, useMutation } from '../hooks/useAsync';
import { formatCidrs, formatPorts } from '../lib/firewallDraft';
import { humanize } from '../lib/format';
import { describeChanges, hasChanges, movePolicy, removePolicy, summarizePolicyChanges, togglePolicy } from '../lib/policyDraft';

function describeMatch(p: BusinessPolicy): string {
  const m = p.match;
  const parts = [
    m.applications?.length ? m.applications.join(', ') : null,
    m.sourceCidrs?.length ? `from ${formatCidrs(m.sourceCidrs)}` : null,
    m.destinationCidrs?.length ? `to ${formatCidrs(m.destinationCidrs)}` : null,
    m.protocol && m.protocol !== 'ANY' ? `${m.protocol}${m.destinationPorts?.length ? `/${formatPorts(m.destinationPorts)}` : ''}` : null,
    m.dscp !== undefined ? `DSCP ${m.dscp}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'all traffic';
}

function describeSteering(p: BusinessPolicy): string {
  const a = p.action;
  const base = humanize(a.steering);
  return a.preferredTransport ? `${base} (${a.preferredTransport.toLowerCase()})` : base;
}

export function PoliciesPage() {
  const api = useApi();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [edgeId, setEdgeId] = useState<string>();
  const current = useAsync((s) => (edgeId ? api.policies(edgeId, s) : Promise.resolve(undefined)), [api, edgeId]);
  const [draft, setDraft] = useState<BusinessPolicy[]>([]);
  const [title, setTitle] = useState('');

  useEffect(() => setDraft(current.data?.policies ?? []), [current.data]);

  const summary = useMemo(() => summarizePolicyChanges(current.data?.policies ?? [], draft), [current.data, draft]);
  const dirty = hasChanges(summary);
  const preview = useMutation(() => api.previewPolicies([edgeId!], draft));
  const [previewResult, setPreviewResult] = useState<Awaited<ReturnType<typeof api.previewPolicies>>>();
  useEffect(() => setPreviewResult(undefined), [draft]);
  const submit = useMutation(() =>
    api.createChange({
      title: title.trim() || `Business policies: ${describeChanges(summary)}`.slice(0, 120),
      edgeIds: [edgeId!],
      payload: { type: 'POLICY_UPDATE', policies: draft },
      submit: true,
    }),
  );
  const editable = canRequestChanges(user);

  return (
    <section>
      <h1>Business policies</h1>
      <p className="meta">Policies are evaluated top to bottom; the first match decides service class and how traffic is steered across WAN links.</p>
      <EdgePicker value={edgeId} onChange={setEdgeId} />
      <ProblemBanner error={current.error} onRetry={current.reload} />

      {current.data?.warnings.map((w) => (
        <p key={`${w.policyId}-${w.field}`} className="notice">
          {w.message}
        </p>
      ))}

      {current.data && (
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Policy</th>
              <th scope="col">Matches</th>
              <th scope="col">Class / priority</th>
              <th scope="col">Steering</th>
              <th scope="col">State</th>
              {editable && <th scope="col">Edit</th>}
            </tr>
          </thead>
          <tbody>
            {draft.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No business policies; all traffic uses default best-path steering.
                </td>
              </tr>
            )}
            {draft.map((p, i) => (
              <tr key={p.id} className={p.enabled ? undefined : 'disabled'}>
                <td>{p.order}</td>
                <td>{p.name}</td>
                <td>{describeMatch(p)}</td>
                <td>
                  {humanize(p.action.serviceClass)} / {humanize(p.action.priority)}
                </td>
                <td>{describeSteering(p)}</td>
                <td>
                  <StatusPill value={p.enabled ? 'UP' : 'STANDBY'} label={p.enabled ? 'Enabled' : 'Disabled'} />
                </td>
                {editable && (
                  <td className="row-actions">
                    <button type="button" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => setDraft(movePolicy(draft, i, -1))}>
                      ↑
                    </button>
                    <button type="button" aria-label={`Move ${p.name} down`} disabled={i === draft.length - 1} onClick={() => setDraft(movePolicy(draft, i, 1))}>
                      ↓
                    </button>
                    <button type="button" onClick={() => setDraft(togglePolicy(draft, p.id))}>
                      {p.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" onClick={() => setDraft(removePolicy(draft, p.id))}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editable && dirty && (
        <div className="draft-bar">
          <p>
            Pending: <strong>{describeChanges(summary)}</strong>
          </p>
          <label>
            Change title
            <input value={title} maxLength={120} placeholder={`Business policies: ${describeChanges(summary)}`} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <button type="button" onClick={async () => setPreviewResult(await preview.run())} disabled={preview.pending}>
            Validate
          </button>
          <button
            type="button"
            disabled={submit.pending || previewResult?.valid === false}
            onClick={async () => {
              const cr = await submit.run();
              if (cr) navigate(`/changes/${encodeURIComponent(cr.id)}`);
            }}
          >
            Submit for approval
          </button>
          <button type="button" onClick={() => setDraft(current.data?.policies ?? [])}>
            Discard
          </button>
          {previewResult && (
            <ul className="findings" aria-label="Validation results">
              {previewResult.valid && previewResult.issues.length + previewResult.warnings.length === 0 && <li>No issues found.</li>}
              {previewResult.issues.map((i) => (
                <li key={`${i.policyId}-${i.message}`}>
                  <StatusPill value={i.severity === 'ERROR' ? 'FAILED' : 'DEGRADED'} label={humanize(i.severity)} /> {i.message}
                </li>
              ))}
              {previewResult.warnings.map((w) => (
                <li key={`${w.vendor}-${w.policyId}-${w.message}`}>
                  <StatusPill value="DEGRADED" label={w.vendor === 'FORTINET' ? 'Fortinet' : 'VeloCloud'} /> {w.message}
                </li>
              ))}
            </ul>
          )}
          <ProblemBanner error={preview.error ?? submit.error} />
        </div>
      )}
    </section>
  );
}
```

## apps/sdwan-portal/web/src/pages/pages.test.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/pages/pages.test.tsx`.

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Alert, ChangeRequestView } from '../api/types';
import { mockFetch, renderAt } from '../test/utils';
import { AlertsPage } from './AlertsPage';
import { ChangeRequestDetailPage } from './ChangeRequestDetailPage';

const ACC = '/api/v1/accounts/ACC-10000001';

const alert: Alert = {
  id: 'ALR-1',
  edgeId: 'vc-1001-hq-edge-1',
  type: 'LINK_DOWN',
  severity: 'MAJOR',
  status: 'OPEN',
  message: 'hq-edge-1 link GE4 (BROADBAND) is down',
  occurrences: 3,
  raisedAt: '2026-03-02T09:00:00Z',
  lastSeenAt: '2026-03-02T10:00:00Z',
};

describe('AlertsPage', () => {
  it('lists open alerts and acknowledges in place', async () => {
    const fetch = mockFetch((url, init) => {
      if (url.pathname === `${ACC}/alerts`) return { body: { items: [alert], page: 1, pageSize: 25, total: 1 } };
      if (url.pathname === `${ACC}/alerts/ALR-1/acknowledge` && init.method === 'POST') {
        return { body: { ...alert, status: 'ACKNOWLEDGED', acknowledgedBy: 'u-user' } };
      }
      return undefined;
    });
    renderAt(<AlertsPage />, { path: '/alerts', route: '/alerts', user: { sub: 'u-user', roles: ['BUSINESS_USER'] } });

    expect(await screen.findByText(alert.message)).toBeInTheDocument();
    expect(new URL(String(fetch.mock.calls[0][0]), 'http://x').searchParams.get('status')).toBe('OPEN');
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(await screen.findByText('Acknowledged by u-user')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
  });

  it('hides acknowledge for read-only partner agents', async () => {
    mockFetch((url) => (url.pathname === `${ACC}/alerts` ? { body: { items: [alert], page: 1, pageSize: 25, total: 1 } } : undefined));
    renderAt(<AlertsPage />, { path: '/alerts', route: '/alerts', user: { sub: 'p', roles: ['PARTNER_AGENT'] } });
    await screen.findByText(alert.message);
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
  });
});

const cr: ChangeRequestView = {
  id: 'CR-1',
  title: 'Reboot head office',
  type: 'EDGE_REBOOT',
  edgeIds: ['vc-1001-hq-edge-1'],
  payload: { type: 'EDGE_REBOOT' },
  risk: 'MEDIUM',
  riskReasons: ['EDGE_REBOOT base risk 4'],
  emergency: false,
  status: 'SUBMITTED',
  requestedBy: 'u-user',
  approvals: [],
  results: [],
  history: [{ at: '2026-03-02T09:00:00Z', by: 'u-user', from: null, to: 'DRAFT' }],
  createdAt: '2026-03-02T09:00:00Z',
  updatedAt: '2026-03-02T09:00:00Z',
  approvalPolicy: { requiredApprovals: 1, requiredRoles: ['BUSINESS_ADMIN'], requiresMaintenanceWindow: true },
  outstanding: ['1 more approval(s)', 'an approval from BUSINESS_ADMIN'],
};

describe('ChangeRequestDetailPage', () => {
  const route = { path: '/changes/:changeId', route: '/changes/CR-1' };

  it('lets an administrator approve and requires a comment to reject', async () => {
    const fetch = mockFetch((url, init) => {
      if (url.pathname === `${ACC}/change-requests/CR-1`) return { body: cr };
      if (url.pathname === `${ACC}/change-requests/CR-1/decisions`) {
        expect(JSON.parse(String(init.body))).toEqual({ decision: 'APPROVE' });
        return { body: { ...cr, status: 'APPROVED', outstanding: [] } };
      }
      if (url.pathname === `${ACC}/maintenance-windows/upcoming`) return { body: [] };
      return undefined;
    });
    renderAt(<ChangeRequestDetailPage />, { ...route, user: { sub: 'u-admin', roles: ['BUSINESS_ADMIN'] } });

    expect(await screen.findByText(/Still required/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'nope' } });
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Comment'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByText('Schedule')).toBeInTheDocument());
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith('/decisions'))).toBe(true);
    expect(await screen.findByText(/No maintenance windows open/)).toBeInTheDocument();
  });

  it('explains why a business user cannot approve', async () => {
    mockFetch((url) => (url.pathname === `${ACC}/change-requests/CR-1` ? { body: cr } : undefined));
    renderAt(<ChangeRequestDetailPage />, { ...route, user: { sub: 'u-peer', roles: ['BUSINESS_USER'] } });
    expect(await screen.findByText('Only business administrators can approve changes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('shows the problem detail and reference when the approval is refused', async () => {
    mockFetch((url) => {
      if (url.pathname === `${ACC}/change-requests/CR-1`) return { body: cr };
      if (url.pathname.endsWith('/decisions')) {
        return { status: 409, body: { type: 'x/conflict', title: 'Conflict', status: 409, detail: 'Change request is APPROVED and cannot move to APPROVED', correlationId: 'srv-42' } };
      }
      return undefined;
    });
    renderAt(<ChangeRequestDetailPage />, { ...route, user: { sub: 'u-admin', roles: ['BUSINESS_ADMIN'] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot move to APPROVED');
    expect(screen.getByText('Reference: srv-42')).toBeInTheDocument();
  });
});
```

## apps/sdwan-portal/web/src/styles.css

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: css. Path: `apps/sdwan-portal/web/src/styles.css`.

```css
:root {
  --bg: #f6f7f9;
  --surface: #ffffff;
  --text: #1b1f24;
  --muted: #5b6573;
  --border: #d9dee5;
  --accent: #5a2d82;
  --ok: #1d7a46;
  --warn: #9a6500;
  --bad: #b3261e;
  --info: #1f5fa8;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--text);
  background: var(--bg);
}

body { margin: 0; }
.shell header { display: flex; gap: 16px; align-items: center; padding: 12px 24px; background: var(--accent); color: #fff; }
.shell header .brand { font-weight: 600; margin-right: auto; }
.shell header button { margin-left: 8px; }
.shell nav { display: flex; gap: 4px; padding: 0 24px; background: var(--surface); border-bottom: 1px solid var(--border); }
.shell nav a { padding: 12px; color: var(--muted); text-decoration: none; border-bottom: 2px solid transparent; }
.shell nav a.active { color: var(--accent); border-bottom-color: var(--accent); }
main { padding: 24px; max-width: 1200px; }

table { width: 100%; border-collapse: collapse; background: var(--surface); }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 14px; }
th { color: var(--muted); font-weight: 600; }
tr.disabled td { color: var(--muted); }
td.empty, p.empty { color: var(--muted); text-align: center; padding: 24px; }
caption { text-align: left; font-weight: 600; padding: 8px 0; }

.pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.pill-ok { background: #e3f4ea; color: var(--ok); }
.pill-warn { background: #fdf1d8; color: var(--warn); }
.pill-bad { background: #fbe4e2; color: var(--bad); }
.pill-info { background: #e2ecf8; color: var(--info); }
.pill-muted { background: #eceff3; color: var(--muted); }

.tiles { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
.tile { display: flex; flex-direction: column; min-width: 120px; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; text-align: left; font: inherit; }
.tile[aria-pressed='true'] { outline: 2px solid var(--accent); }
.tile-value { font-size: 28px; font-weight: 700; }
.tile-label { color: var(--muted); }
.tile-up .tile-value { color: var(--ok); }
.tile-degraded .tile-value { color: var(--warn); }
.tile-down .tile-value { color: var(--bad); }

.filters, .draft-bar, .rule-form { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin: 16px 0; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
label.inline { flex-direction: row; align-items: center; }
.field-error { color: var(--bad); font-size: 12px; }
.problem { border-left: 4px solid var(--bad); background: #fdf3f2; padding: 12px 16px; margin: 12px 0; }
.problem small { display: block; color: var(--muted); margin-top: 4px; }
.notice { border-left: 4px solid var(--warn); background: #fff8e8; padding: 8px 12px; }
.meta { color: var(--muted); }
.pager { display: flex; gap: 6px; align-items: center; justify-content: flex-end; padding: 8px 0; }
.pager button[aria-current='page'] { font-weight: 700; background: var(--accent); color: #fff; }
.segmented button[aria-pressed='true'] { background: var(--accent); color: #fff; }
.row-actions { white-space: nowrap; }

.link-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin: 16px 0; }
.stats { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; }
.stats dt { color: var(--muted); }
.stats dd { margin: 0; }
.chart { margin: 12px 0; }
.chart svg { width: 100%; height: auto; }
.chart .grid { stroke: var(--border); }
.chart .tick { font-size: 10px; fill: var(--muted); }
.chart .threshold { stroke: var(--bad); stroke-dasharray: 4 3; }
.chart .series { stroke: var(--accent); stroke-width: 1.5; }
.chart .point-hit { fill: transparent; }
.chart .point-breach { fill: var(--bad); }
.chart-breach { color: var(--bad); }
.chart-ok { color: var(--ok); }
.chart-readout { font-size: 12px; color: var(--muted); }
.timeline li, .events li { margin: 4px 0; }
.login { max-width: 420px; margin: 10vh auto; }
```

## apps/sdwan-portal/web/src/test/setup.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/test/setup.ts`.

```typescript
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
```

## apps/sdwan-portal/web/src/test/utils.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/test/utils.tsx`.

```tsx
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import type { Role } from '../api/types';
import { AuthProvider } from '../auth/AuthContext';

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Unsigned JWT with the claim layout the IdP issues; the UI never verifies signatures. */
export function fakeToken(claims: { sub: string; roles: Role[]; accountId?: string; exp?: number }): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.sig`;
}

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown } | undefined;

/** Routes fetch calls to `handler`; unmatched calls fail the test loudly. */
export function mockFetch(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const reply = handler(url, init);
    if (!reply) throw new Error(`unmocked ${init.method ?? 'GET'} ${url.pathname}`);
    const status = reply.status ?? 200;
    const problem = status >= 400;
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status,
      headers: { 'Content-Type': problem ? 'application/problem+json' : 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function renderAt(ui: ReactElement, opts: { path: string; route: string; user: { sub: string; roles: Role[]; accountId?: string } }) {
  return render(
    <AuthProvider initialToken={fakeToken({ accountId: 'ACC-10000001', ...opts.user })}>
      <MemoryRouter initialEntries={[opts.route]}>
        <Routes>
          <Route path={opts.path} element={ui} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}
```

## apps/sdwan-portal/web/tsconfig.json

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: json. Path: `apps/sdwan-portal/web/tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"]
}
```

## apps/sdwan-portal/web/vite.config.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/vite.config.ts`.

```typescript
/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
```
