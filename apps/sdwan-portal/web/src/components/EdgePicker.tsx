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
