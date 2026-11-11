import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keeps list state (page, size and filters) in the URL so lists are shareable and survive
 * reloads. Changing any filter resets to page 1.
 */
export function usePageParams<F extends string>(filterKeys: readonly F[], defaultPageSize = 20) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || defaultPageSize));
  const filters = Object.fromEntries(filterKeys.map((k) => [k, params.get(k) ?? ''])) as Record<F, string>;

  const setPage = useCallback((next: number) => {
    setParams((p) => {
      p.set('page', String(next));
      return p;
    });
  }, [setParams]);

  const setFilter = useCallback((key: F, value: string) => {
    setParams((p) => {
      if (value) {
        p.set(key, value);
      } else {
        p.delete(key);
      }
      p.delete('page');
      return p;
    });
  }, [setParams]);

  return { page, pageSize, filters, setPage, setFilter };
}
