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
