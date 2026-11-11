import type { ReactNode } from 'react';
import type { Page } from '../api/types';
import { ErrorBanner } from './ErrorBanner';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

interface Props<T> {
  columns: Column<T>[];
  page?: Page<T>;
  loading: boolean;
  error?: unknown;
  rowKey: (row: T) => string;
  onPageChange: (page: number) => void;
  emptyMessage?: string;
  caption?: string;
}

export function pageCount(page: Pick<Page<unknown>, 'total' | 'pageSize'>): number {
  return Math.max(1, Math.ceil(page.total / page.pageSize));
}

/** Renders an API page ({items, page, pageSize, total}) with previous/next navigation. */
export function PaginatedTable<T>({
  columns, page, loading, error, rowKey, onPageChange, emptyMessage = 'Nothing to show yet.', caption,
}: Props<T>) {
  if (error) {
    return <ErrorBanner error={error} />;
  }
  const items = page?.items ?? [];
  const pages = page ? pageCount(page) : 1;
  const first = page && page.total > 0 ? (page.page - 1) * page.pageSize + 1 : 0;
  const last = page ? Math.min(page.page * page.pageSize, page.total) : 0;

  return (
    <div className="table-wrap" aria-busy={loading}>
      <table>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header} style={{ textAlign: c.align ?? 'left' }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.header} style={{ textAlign: c.align ?? 'left' }}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
          {!loading && items.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="empty">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
      {page && page.total > 0 && (
        <nav className="pager" aria-label="Pagination">
          <span>{first}&ndash;{last} of {page.total}</span>
          <button type="button" disabled={loading || page.page <= 1} onClick={() => onPageChange(page.page - 1)}>
            Previous
          </button>
          <span>Page {page.page} of {pages}</span>
          <button type="button" disabled={loading || page.page >= pages} onClick={() => onPageChange(page.page + 1)}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
