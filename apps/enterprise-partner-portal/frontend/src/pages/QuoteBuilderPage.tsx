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
    const prefix = `Line ${i + 1}`;
    if (!l.siteName.trim()) problems.push(`${prefix}: enter a site name`);
    if (!POSTCODE.test(l.sitePostcode.trim())) problems.push(`${prefix}: enter a valid postcode`);
    const validQuantity = Number.isInteger(l.quantity) && l.quantity >= 1 && l.quantity <= 100;
    if (!validQuantity) problems.push(`${prefix}: quantity 1-100`);
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
  const tooShort: Product[] = [];
  for (const l of draft.lines) {
    const p = products.get(l.sku);
    if (p && p.minTermMonths > draft.termMonths) {
      tooShort.push(p);
    }
  }
  const errors = fieldErrorsOf(save.error);
  const needsApproval = preview !== undefined && preview.approvalLevel !== 'NONE';
  let canSubmit = Boolean(request) && !save.pending && preview !== undefined && preview.blockers.length === 0;
  if (needsApproval && !draft.justification.trim()) {
    canSubmit = false;
  }

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
        {draft.dealId && <p>Linked to a protected deal registration &mdash; your full discount allowance applies.</p>}
      </section>

      <section className="panel" aria-label="Products">
        <h2>Products</h2>
        <div className="toolbar">
          <SelectField label="Add product" value={sku} placeholder={'Choose a product\u2026'}
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
            {tooShort.map((p) => `${p.name} needs at least ${p.minTermMonths} months`).join('; ')}
          </div>
        )}
      </section>

      {problems.length > 0 && draft.lines.length > 0 && (
        <ul aria-label="Missing information">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      )}
      <ErrorBanner error={previewError} />
      {preview && <PricingSummary preview={preview} />}

      {needsApproval && (
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
          disabled={!canSubmit}
          onClick={() => finish(true)}>
          {needsApproval ? 'Submit for approval' : 'Save & approve'}
        </button>
      </div>
    </>
  );
}
