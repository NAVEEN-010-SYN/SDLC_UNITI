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
  { key: 'model', header: 'Model', render: (e) => `${e.model} \u00B7 ${e.softwareVersion}` },
  {
    key: 'links',
    header: 'WAN links',
    render: (e) => {
      const down = e.links.filter((l) => l.state === 'DOWN').length;
      const capacity = e.links.reduce((a, l) => a + l.bandwidthDownKbps, 0);
      return `${e.links.length - down}/${e.links.length} up \u00B7 ${formatKbps(capacity)}`;
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
