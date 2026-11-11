import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Keeps page, page size and string filters in the URL so a filtered list can be
 * bookmarked or shared with a colleague, and survives a refresh. Changing a filter
 * resets to page 1.
 */
export function usePageParams<F extends string>(filterKeys: readonly F[], defaultPageSize = 25) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const rawSize = Number(params.get('pageSize'));
  const pageSize = PAGE_SIZES.includes(rawSize) ? rawSize : defaultPageSize;

  const filterString = filterKeys.map((k) => `${k}=${params.get(k) ?? ''}`).join('&');
  const filters = useMemo(
    () => Object.fromEntries(filterKeys.map((k) => [k, params.get(k) || undefined])) as Partial<Record<F, string>>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterString],
  );

  const update = useCallback(
    (changes: Record<string, string | number | undefined>) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === undefined || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        return next;
      });
    },
    [setParams],
  );

  return {
    page,
    pageSize,
    filters,
    setPage: (p: number) => update({ page: p }),
    setPageSize: (s: number) => update({ pageSize: s, page: 1 }),
    setFilter: (key: F, value: string | undefined) => update({ [key]: value, page: 1 }),
    pageSizes: PAGE_SIZES,
  };
}
