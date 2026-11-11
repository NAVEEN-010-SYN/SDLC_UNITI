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
