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
        <TextField label="Est. monthly value (&pound;)" value={mrc} onChange={(e) => setMrc(e.target.value)}
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
              + (result.hasConflict ? ' \u2014 another partner has an overlapping claim; Uniti will review it.' : '.'));
            leads.reload();
          }
        }} />
      )}
    </>
  );
}
