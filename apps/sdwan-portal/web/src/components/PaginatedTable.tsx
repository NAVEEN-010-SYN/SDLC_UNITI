import type { ReactNode } from 'react';
import type { Page } from '../api/types';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

interface Props<T> {
  columns: Column<T>[];
  data: Page<T> | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  caption?: string;
  onPageChange: (page: number) => void;
  pageSizes?: number[];
  onPageSizeChange?: (size: number) => void;
}

export function pageWindow(page: number, totalPages: number, span = 2): number[] {
  const start = Math.max(1, Math.min(page - span, totalPages - span * 2));
  const end = Math.min(totalPages, start + span * 2);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
}

/** Server-paginated table over the API's `{ items, page, pageSize, total }` envelope. */
export function PaginatedTable<T>({ columns, data, rowKey, loading, emptyMessage = 'Nothing to show', caption, onPageChange, pageSizes, onPageSizeChange }: Props<T>) {
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const page = data?.page ?? 1;
  const first = data && data.total ? (page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.total, page * data.pageSize) : 0;

  return (
    <div className="table-wrap" aria-busy={loading}>
      <table>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={{ textAlign: c.align ?? 'left' }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data?.items.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {data && data.items.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="empty">
                {emptyMessage}
              </td>
            </tr>
          )}
          {!data && loading && (
            <tr>
              <td colSpan={columns.length} className="empty">
                Loading…
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {data && data.total > 0 && (
        <nav className="pager" aria-label="Pagination">
          <span>
            {first}–{last} of {data.total}
          </span>
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            Previous
          </button>
          {pageWindow(page, totalPages).map((p) => (
            <button key={p} type="button" aria-current={p === page ? 'page' : undefined} onClick={() => onPageChange(p)}>
              {p}
            </button>
          ))}
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
            Next
          </button>
          {pageSizes && onPageSizeChange && (
            <label>
              Rows
              <select value={data.pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
                {pageSizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
        </nav>
      )}
    </div>
  );
}
