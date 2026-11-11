# Enterprise Partner Portal: apps/enterprise-partner-portal/frontend (part 8 of 8)

- **Application:** Enterprise Partner Portal
- **Tech stack:** Java Spring Boot 3 + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 8

## Files

- `apps/enterprise-partner-portal/frontend/src/pages/QuoteBuilderPage.tsx` (232 lines)
- `apps/enterprise-partner-portal/frontend/src/pages/QuotesPage.tsx` (65 lines)
- `apps/enterprise-partner-portal/frontend/src/pages/TeamPage.tsx` (118 lines)
- `apps/enterprise-partner-portal/frontend/src/styles.css` (76 lines)
- `apps/enterprise-partner-portal/frontend/src/test/harness.tsx` (40 lines)
- `apps/enterprise-partner-portal/frontend/src/test/setup.ts` (9 lines)
- `apps/enterprise-partner-portal/frontend/tsconfig.json` (19 lines)
- `apps/enterprise-partner-portal/frontend/vite.config.ts` (20 lines)

## apps/enterprise-partner-portal/frontend/src/pages/QuoteBuilderPage.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/pages/QuoteBuilderPage.tsx`.

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEndpoints } from '../api/ApiContext';
import type { PricingPreview, Product, QuoteLineRequest, QuoteRequest } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { fieldErrorsOf, SelectField, TextField } from '../components/FormField';
import { Money } from '../components/Money';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync, useMutation } from '../hooks/useAsync';
import { humanise } from '../lib/format';

export const TERMS = [12, 24, 36, 60];
const PREVIEW_DEBOUNCE_MS = 400;
const POSTCODE = /^[A-Za-z0-9 ]{5,8}$/;

export interface QuoteDraft {
  dealId?: string;
  customerName: string;
  customerAccountId: string;
  customerContactEmail: string;
  termMonths: number;
  discount: string;
  justification: string;
  lines: QuoteLineRequest[];
}

/**
 * Turns the builder's form state into an API request, or explains why it cannot be priced
 * yet. Discounts are sent as decimal percentages with at most three places, as the API expects.
 */
export function toQuoteRequest(draft: QuoteDraft): { request?: QuoteRequest; problems: string[] } {
  const problems: string[] = [];
  if (!draft.customerName.trim()) problems.push('Enter the customer name');
  if (!/^\S+@\S+\.\S+$/.test(draft.customerContactEmail.trim())) problems.push('Enter a valid customer email');
  if (draft.customerAccountId && !/^ACC-\d{8}$/.test(draft.customerAccountId.trim())) {
    problems.push('Account ID must look like ACC-12345678');
  }
  const discount = Number(draft.discount || '0');
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(draft.discount || '0') || discount > 100) {
    problems.push('Discount must be a percentage with up to three decimals');
  }
  if (draft.lines.length === 0) problems.push('Add at least one product');
  draft.lines.forEach((l, i) => {
    if (!l.siteName.trim()) problems.push(`Line ${i + 1}: enter a site name`);
    if (!POSTCODE.test(l.sitePostcode.trim())) problems.push(`Line ${i + 1}: enter a valid postcode`);
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 100) problems.push(`Line ${i + 1}: quantity 1-100`);
  });
  if (problems.length) {
    return { problems };
  }
  return {
    problems,
    request: {
      dealId: draft.dealId,
      customerName: draft.customerName.trim(),
      customerAccountId: draft.customerAccountId.trim() || undefined,
      customerContactEmail: draft.customerContactEmail.trim(),
      termMonths: draft.termMonths,
      requestedDiscountPercent: discount,
      justification: draft.justification.trim() || undefined,
      lines: draft.lines.map((l) => ({ ...l, siteName: l.siteName.trim(), sitePostcode: l.sitePostcode.trim() })),
    },
  };
}

function PricingSummary({ preview }: { preview: PricingPreview }) {
  const ccy = preview.currency;
  return (
    <section className="panel" aria-label="Pricing">
      <h2>Pricing</h2>
      <dl className="breakdown">
        <dt>List monthly</dt><dd><Money minor={preview.listMrcMinor} currency={ccy} /></dd>
        <dt>Term discount ({preview.termDiscountPercent}%)</dt><dd><Money minor={-preview.termDiscountMinor} currency={ccy} /></dd>
        <dt>Volume discount ({preview.volumeDiscountPercent}%)</dt><dd><Money minor={-preview.volumeDiscountMinor} currency={ccy} /></dd>
        <dt>Partner discount</dt><dd><Money minor={-preview.partnerDiscountMinor} currency={ccy} /></dd>
        <dt><strong>Net monthly</strong></dt><dd><strong><Money minor={preview.netMrcMinor} currency={ccy} /></strong></dd>
        <dt>Installation{preview.nrcWaived ? ' (waived)' : ''}</dt><dd><Money minor={preview.nrcMinor} currency={ccy} /></dd>
        <dt>Total contract value</dt><dd><Money minor={preview.totalContractValueMinor} currency={ccy} /></dd>
        <dt>Effective discount</dt><dd>{preview.effectiveDiscountPercent}%</dd>
      </dl>
      <p>
        Approval: {preview.approvalLevel === 'NONE'
          ? <StatusBadge status="APPROVED" />
          : <span className="badge badge--warning">{humanise(preview.approvalLevel)} required</span>}
        {' '}(self-approved allowance {preview.selfApprovedAllowancePercent}%)
      </p>
      {preview.blockers.length > 0 && (
        <div className="banner banner--error" role="alert">
          <p>This quote cannot be submitted:</p>
          <ul>{preview.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

export function QuoteBuilderPage() {
  const api = useEndpoints();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const catalog = useAsync(() => api.catalog.list(), [api]);
  const [draft, setDraft] = useState<QuoteDraft>({
    dealId: params.get('dealId') ?? undefined,
    customerName: params.get('customer') ?? '',
    customerAccountId: '',
    customerContactEmail: '',
    termMonths: 36,
    discount: '0',
    justification: '',
    lines: [],
  });
  const [sku, setSku] = useState('');
  const [preview, setPreview] = useState<PricingPreview>();
  const [previewError, setPreviewError] = useState<unknown>();
  const { request, problems } = useMemo(() => toQuoteRequest(draft), [draft]);
  const save = useMutation(async (submit: boolean) => {
    const quote = await api.quotes.create(request!);
    return submit ? api.quotes.submit(quote.id) : quote;
  });
  const products = useMemo(() => new Map((catalog.data ?? []).map((p) => [p.sku, p])), [catalog.data]);

  useEffect(() => {
    if (!request) {
      setPreview(undefined);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api.quotes.preview(request, controller.signal)
        .then((p) => { setPreview(p); setPreviewError(undefined); })
        .catch((e) => !controller.signal.aborted && setPreviewError(e));
    }, PREVIEW_DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [api, request]);

  const update = (patch: Partial<QuoteDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateLine = (index: number, patch: Partial<QuoteLineRequest>) =>
    update({ lines: draft.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
  const addLine = (product: Product) => {
    const previous = draft.lines[draft.lines.length - 1];
    update({ lines: [...draft.lines, {
      sku: product.sku, quantity: 1, siteName: previous?.siteName ?? '', sitePostcode: previous?.sitePostcode ?? '',
    }] });
    setSku('');
  };
  const tooShort = draft.lines.map((l) => products.get(l.sku)).filter((p) => p && p.minTermMonths > draft.termMonths);
  const errors = fieldErrorsOf(save.error);

  async function finish(submit: boolean) {
    if (await save.run(submit)) {
      navigate('/quotes');
    }
  }

  return (
    <>
      <h1>New quote</h1>
      <ErrorBanner error={catalog.error} />
      <section className="panel" aria-label="Customer">
        <div className="grid">
          <TextField label="Customer name" value={draft.customerName} error={errors.customerName}
            onChange={(e) => update({ customerName: e.target.value })} />
          <TextField label="Customer email" type="email" value={draft.customerContactEmail} error={errors.customerContactEmail}
            onChange={(e) => update({ customerContactEmail: e.target.value })} />
          <TextField label="Existing account ID" value={draft.customerAccountId} hint="Leave blank for a new customer"
            onChange={(e) => update({ customerAccountId: e.target.value })} />
          <SelectField label="Term" value={String(draft.termMonths)}
            options={TERMS.map((t) => ({ value: String(t), label: `${t} months` }))}
            onChange={(e) => update({ termMonths: Number(e.target.value) })} />
          <TextField label="Partner discount (%)" inputMode="decimal" value={draft.discount}
            onChange={(e) => update({ discount: e.target.value })} />
        </div>
        {draft.dealId && <p>Linked to a protected deal registration — your full discount allowance applies.</p>}
      </section>

      <section className="panel" aria-label="Products">
        <h2>Products</h2>
        <div className="toolbar">
          <SelectField label="Add product" value={sku} placeholder="Choose a product…"
            options={(catalog.data ?? []).map((p) => ({ value: p.sku, label: `${p.name} (${p.sku})` }))}
            onChange={(e) => setSku(e.target.value)} />
          <button type="button" disabled={!products.get(sku)} onClick={() => addLine(products.get(sku)!)}>Add</button>
        </div>
        {draft.lines.map((line, i) => {
          const product = products.get(line.sku);
          return (
            <div key={i} className="toolbar" aria-label={`Line ${i + 1}`}>
              <strong style={{ minWidth: 220 }}>{product?.name ?? line.sku}</strong>
              <TextField label="Site name" value={line.siteName} onChange={(e) => updateLine(i, { siteName: e.target.value })} />
              <TextField label="Postcode" value={line.sitePostcode} onChange={(e) => updateLine(i, { sitePostcode: e.target.value })} />
              <TextField label="Qty" type="number" min={1} max={100} value={line.quantity} disabled={product?.perSite}
                onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
              {product && <Money minor={product.monthlyPriceMinor * line.quantity} currency={product.currency} />}
              <button type="button" onClick={() => update({ lines: draft.lines.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          );
        })}
        {tooShort.length > 0 && (
          <div className="banner banner--error">
            {tooShort.map((p) => `${p!.name} needs at least ${p!.minTermMonths} months`).join('; ')}
          </div>
        )}
      </section>

      {problems.length > 0 && draft.lines.length > 0 && (
        <ul aria-label="Missing information">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      )}
      <ErrorBanner error={previewError} />
      {preview && <PricingSummary preview={preview} />}

      {preview && preview.approvalLevel !== 'NONE' && (
        <section className="panel">
          <label htmlFor="justification">Justification for Uniti approvers</label>
          <textarea id="justification" rows={3} style={{ width: '100%' }} value={draft.justification}
            onChange={(e) => update({ justification: e.target.value })} maxLength={1000} />
        </section>
      )}

      <ErrorBanner error={save.error} />
      <div className="toolbar">
        <button type="button" disabled={!request || save.pending} onClick={() => finish(false)}>Save draft</button>
        <button className="primary" type="button"
          disabled={!request || save.pending || !preview || preview.blockers.length > 0
            || (preview.approvalLevel !== 'NONE' && !draft.justification.trim())}
          onClick={() => finish(true)}>
          {preview && preview.approvalLevel !== 'NONE' ? 'Submit for approval' : 'Save & approve'}
        </button>
      </div>
    </>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/pages/QuotesPage.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/pages/QuotesPage.tsx`.

```tsx
import { Link } from 'react-router-dom';
import { useEndpoints } from '../api/ApiContext';
import type { Quote, QuoteStatus } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { SelectField } from '../components/FormField';
import { Money } from '../components/Money';
import { PaginatedTable, type Column } from '../components/PaginatedTable';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync, useMutation } from '../hooks/useAsync';
import { usePageParams } from '../hooks/usePageParams';
import { formatDate, humanise } from '../lib/format';

const STATUSES: QuoteStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT', 'ACCEPTED', 'DECLINED',
  'EXPIRED', 'ORDERED'];

export function QuotesPage() {
  const api = useEndpoints();
  const { page, pageSize, filters, setPage, setFilter } = usePageParams(['status'] as const);
  const quotes = useAsync(() => api.quotes.search({
    page, pageSize, status: (filters.status || undefined) as QuoteStatus | undefined,
  }), [api, page, pageSize, filters.status]);
  const submit = useMutation(api.quotes.submit);

  const columns: Column<Quote>[] = [
    { header: 'Ref', render: (q) => `${q.reference} r${q.revision}` },
    { header: 'Customer', render: (q) => q.customerName },
    { header: 'Term', render: (q) => `${q.termMonths} mo` },
    { header: 'Net MRC', align: 'right', render: (q) => <Money minor={q.netMrcMinor} currency={q.currency} /> },
    { header: 'Contract value', align: 'right', render: (q) => <Money minor={q.totalContractValueMinor} currency={q.currency} /> },
    { header: 'Status', render: (q) => <StatusBadge status={q.status} /> },
    {
      header: 'Approval',
      render: (q) => (q.approvalLevel === 'NONE' ? 'Self-approved'
        : `${humanise(q.approvalLevel)} (${q.approvalsReceived}/${q.approvalLevel === 'DEAL_DESK' ? 2 : 1})`),
    },
    { header: 'Valid until', render: (q) => formatDate(q.validUntil) },
    {
      header: '',
      render: (q) => q.status === 'DRAFT' && (
        <button type="button" disabled={submit.pending}
          onClick={async () => (await submit.run(q.id)) && quotes.reload()}>
          Submit
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="toolbar">
        <h1 style={{ flex: 1 }}>Quotes</h1>
        <Link to="/quotes/new"><button className="primary" type="button">New quote</button></Link>
      </div>
      <ErrorBanner error={submit.error} />
      <div className="toolbar">
        <SelectField label="Status" value={filters.status} placeholder="All"
          options={STATUSES.map((s) => ({ value: s, label: humanise(s) }))}
          onChange={(e) => setFilter('status', e.target.value)} />
      </div>
      <PaginatedTable columns={columns} page={quotes.data} loading={quotes.loading} error={quotes.error}
        rowKey={(q) => q.id} onPageChange={setPage} emptyMessage="No quotes yet." />
    </>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/pages/TeamPage.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/pages/TeamPage.tsx`.

```tsx
import { useState, type FormEvent } from 'react';
import { useEndpoints } from '../api/ApiContext';
import type { PartnerUser, PartnerUserRole } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { fieldErrorsOf, SelectField, TextField } from '../components/FormField';
import { PaginatedTable, type Column } from '../components/PaginatedTable';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync, useMutation } from '../hooks/useAsync';
import { usePageParams } from '../hooks/usePageParams';
import { formatDate, formatDateTime, humanise } from '../lib/format';

const ROLES: PartnerUserRole[] = ['PARTNER_AGENT', 'PARTNER_ADMIN'];
const roleOptions = ROLES.map((r) => ({ value: r, label: humanise(r.replace('PARTNER_', '')) }));

export function TeamPage() {
  const api = useEndpoints();
  const { user } = useAuth();
  const partnerId = user?.partnerId;
  const { page, pageSize, setPage } = usePageParams([] as const);
  const users = useAsync(() => (partnerId ? api.users.list(partnerId, { page, pageSize }) : Promise.resolve(undefined)),
    [api, partnerId, page, pageSize]);
  const seats = useAsync(() => (partnerId ? api.users.seats(partnerId) : Promise.resolve(undefined)), [api, partnerId]);
  const invite = useMutation((body: Parameters<typeof api.users.invite>[1]) => api.users.invite(partnerId!, body));
  const change = useMutation((action: () => Promise<PartnerUser>) => action());

  if (!partnerId) {
    return <section className="panel"><p>Team management is only available to partner users.</p></section>;
  }
  const refresh = () => { users.reload(); seats.reload(); };
  const inviteErrors = fieldErrorsOf(invite.error);

  async function submitInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const created = await invite.run({
      email: String(form.get('email')).trim(),
      firstName: String(form.get('firstName')).trim(),
      lastName: String(form.get('lastName')).trim(),
      role: form.get('role') as PartnerUserRole,
    });
    if (created) {
      formEl.reset();
      refresh();
    }
  }

  async function apply(action: () => Promise<PartnerUser>) {
    if (await change.run(action)) {
      refresh();
    }
  }

  const isSelf = (u: PartnerUser) => u.email.toLowerCase() === user?.email?.toLowerCase();
  const columns: Column<PartnerUser>[] = [
    { header: 'Name', render: (u) => `${u.firstName} ${u.lastName}` },
    { header: 'Email', render: (u) => u.email },
    {
      header: 'Role',
      render: (u) => (u.status === 'DEACTIVATED' || isSelf(u) ? humanise(u.role.replace('PARTNER_', '')) : (
        <select aria-label={`Role for ${u.email}`} value={u.role} disabled={change.pending}
          onChange={(e) => apply(() => api.users.update(partnerId, u, e.target.value as PartnerUserRole))}>
          {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )),
    },
    { header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    { header: 'Certified', render: (u) => (u.certified ? `Until ${formatDate(u.certifiedUntil)}` : 'No') },
    { header: 'Last sign-in', render: (u) => formatDateTime(u.lastLoginAt) },
    {
      header: '',
      render: (u) => (
        <span className="toolbar" style={{ margin: 0 }}>
          {u.status === 'INVITED' && (
            <button type="button" disabled={change.pending}
              onClick={() => apply(() => api.users.resendInvite(partnerId, u.id))}>Resend invite</button>
          )}
          {u.status !== 'DEACTIVATED' && !isSelf(u) && (
            <button type="button" disabled={change.pending} onClick={() => {
              if (window.confirm(`Remove access for ${u.email}? Their seat will be released.`)) {
                void apply(() => api.users.deactivate(partnerId, u.id));
              }
            }}>Deactivate</button>
          )}
        </span>
      ),
    },
  ];

  const seat = seats.data;
  return (
    <>
      <h1>Team</h1>
      {seat && (
        <p aria-label="Seat usage">
          {seat.seatsUsed} of {seat.seatLimit} seats used
          {seat.seatsAvailable === 0 && ' — deactivate a user or progress to a higher tier to add more.'}
        </p>
      )}
      <form className="panel" onSubmit={submitInvite} aria-label="Invite user">
        <h2>Invite a colleague</h2>
        {invite.error && !Object.keys(inviteErrors).length ? <ErrorBanner error={invite.error} /> : null}
        <div className="grid">
          <TextField label="Email" name="email" type="email" required error={inviteErrors.email} />
          <TextField label="First name" name="firstName" required maxLength={80} error={inviteErrors.firstName} />
          <TextField label="Last name" name="lastName" required maxLength={80} error={inviteErrors.lastName} />
          <SelectField label="Role" name="role" options={roleOptions} defaultValue="PARTNER_AGENT" />
        </div>
        <button className="primary" type="submit" disabled={invite.pending || seat?.seatsAvailable === 0}>Send invite</button>
      </form>
      <ErrorBanner error={change.error} />
      <PaginatedTable columns={columns} page={users.data} loading={users.loading} error={users.error}
        rowKey={(u) => u.id} onPageChange={setPage} />
    </>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/styles.css

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: css. Path: `apps/enterprise-partner-portal/frontend/src/styles.css`.

```css
:root {
  --bg: #f6f7f9;
  --surface: #ffffff;
  --text: #1c2430;
  --muted: #5d6b7c;
  --border: #dde2e8;
  --accent: #5a2ca0;
  --info: #1d5fbf;
  --success: #1f7a4d;
  --warning: #9a6200;
  --danger: #b3261e;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--text);
  background: var(--bg);
}

body { margin: 0; }
main { padding: 24px; max-width: 1280px; margin: 0 auto; }
h1, h2, h3 { margin: 0 0 12px; }

.topbar { display: flex; align-items: center; gap: 24px; padding: 12px 24px; background: var(--surface); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.topbar nav { display: flex; gap: 16px; flex: 1; flex-wrap: wrap; }
.topbar nav a { color: var(--muted); text-decoration: none; padding: 4px 0; }
.topbar nav a.active { color: var(--accent); border-bottom: 2px solid var(--accent); }
.topbar__user { display: flex; gap: 12px; align-items: center; }

.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 20px; }
.toolbar { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 16px; }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }

.kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
.kpi__label { color: var(--muted); font-size: 0.85rem; }
.kpi__value { font-size: 1.6rem; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }

.table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
th { color: var(--muted); font-weight: 600; background: #fafbfc; }
td.empty { text-align: center; color: var(--muted); padding: 24px; }
.pager { display: flex; gap: 12px; align-items: center; justify-content: flex-end; padding: 10px 12px; }

.money { font-variant-numeric: tabular-nums; white-space: nowrap; }
.money--negative { color: var(--danger); }

.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
.badge--neutral { background: #eceff3; color: var(--muted); }
.badge--info { background: #e3edfb; color: var(--info); }
.badge--success { background: #e1f3ea; color: var(--success); }
.badge--warning { background: #fdf0d9; color: var(--warning); }
.badge--danger { background: #fbe4e2; color: var(--danger); }

.field { display: flex; flex-direction: column; gap: 4px; min-width: 180px; }
.field label { font-size: 0.85rem; color: var(--muted); }
.field input, .field select, textarea { padding: 8px; border: 1px solid var(--border); border-radius: 6px; font: inherit; }
.field--invalid input, .field--invalid select { border-color: var(--danger); }
.field__error { color: var(--danger); }

button { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); cursor: pointer; font: inherit; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button:disabled { opacity: 0.5; cursor: not-allowed; }

.banner { padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; }
.banner--error { background: #fbe4e2; color: var(--danger); }
.banner--info { background: #e3edfb; color: var(--info); }
.banner--success { background: #e1f3ea; color: var(--success); }

.pipeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.pipeline__column { background: #eef0f4; border-radius: 8px; padding: 12px; min-height: 120px; }
.pipeline__card { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 10px; margin-top: 8px; font-size: 0.875rem; }

dialog { border: 1px solid var(--border); border-radius: 8px; padding: 20px; max-width: 520px; }
dl.breakdown { display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; margin: 0; }
dl.breakdown dt { color: var(--muted); }
dl.breakdown dd { margin: 0; text-align: right; }
.loading { padding: 24px; color: var(--muted); }
```

## apps/enterprise-partner-portal/frontend/src/test/harness.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/test/harness.tsx`.

```tsx
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ApiTestProvider } from '../api/ApiContext';
import type { Endpoints } from '../api/endpoints';
import type { Role } from '../api/types';
import { AuthTestProvider, type AuthState } from '../auth/AuthContext';

export function authState(roles: Role[], partnerId = 'p-1'): AuthState {
  return {
    status: 'authenticated',
    user: { subject: 'u-1', name: 'Test User', email: 'me@partner.example', partnerId, roles },
    accessToken: () => 'token',
    hasAnyRole: (...wanted) => wanted.some((r) => roles.includes(r)),
    login: vi.fn(),
    logout: vi.fn(),
    sessionExpired: vi.fn(),
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (...a: never[]) => unknown ? T[K] : DeepPartial<T[K]> };

/** Renders a page with a fake signed-in user and stubbed endpoints (unstubbed calls reject). */
export function renderWithApp(ui: ReactElement, opts: { roles?: Role[]; api?: DeepPartial<Endpoints>; route?: string } = {}) {
  const api = new Proxy(opts.api ?? {}, {
    get: (target, group: string) => new Proxy((target as Record<string, object>)[group] ?? {}, {
      get: (fns, name: string) => (fns as Record<string, unknown>)[name]
        ?? (() => Promise.reject(new Error(`Unexpected call ${group}.${name}`))),
    }),
  }) as Endpoints;
  return render(
    <MemoryRouter initialEntries={[opts.route ?? '/']}>
      <AuthTestProvider value={authState(opts.roles ?? ['PARTNER_ADMIN'])}>
        <ApiTestProvider value={api}>{ui}</ApiTestProvider>
      </AuthTestProvider>
    </MemoryRouter>,
  );
}
```

## apps/enterprise-partner-portal/frontend/src/test/setup.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/test/setup.ts`.

```typescript
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
```

## apps/enterprise-partner-portal/frontend/tsconfig.json

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: json. Path: `apps/enterprise-partner-portal/frontend/tsconfig.json`.

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
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"]
}
```

## apps/enterprise-partner-portal/frontend/vite.config.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/vite.config.ts`.

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
```
