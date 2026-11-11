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
    { key: 'count', header: 'Seen', align: 'right', render: (a) => `${a.occurrences}\u00D7` },
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
        emptyMessage={status === 'OPEN' ? 'No open alerts \u2014 all edges are healthy' : 'No alerts match these filters'}
        onPageChange={setPage}
        pageSizes={pageSizes}
        onPageSizeChange={setPageSize}
      />
    </section>
  );
}
