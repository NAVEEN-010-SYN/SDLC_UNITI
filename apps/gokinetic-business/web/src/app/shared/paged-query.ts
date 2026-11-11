import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, of, switchMap, tap } from 'rxjs';
import { ApiProblem } from '../core/http/api-problem';
import { Page, PageRequest } from '../core/models/api.models';

export interface PagedQuery<F, T> {
  readonly filter: Signal<F>;
  readonly page: Signal<number>;
  readonly pageSize: Signal<number>;
  readonly items: Signal<T[]>;
  readonly total: Signal<number>;
  readonly loading: Signal<boolean>;
  readonly error: Signal<ApiProblem | null>;
  setFilter(patch: Partial<F>): void;
  setPage(page: number, pageSize?: number): void;
  reload(): void;
}

/**
 * Signal-backed list state for paginated endpoints. A new filter resets to page 1, and
 * switchMap discards responses to superseded requests so fast typing never shows stale rows.
 * Must be created in an injection context (component field initialiser).
 */
export function pagedQuery<F extends object, T>(
  fetch: (filter: F, page: PageRequest) => Observable<Page<T>>,
  initialFilter: F,
  initialPageSize = 20
): PagedQuery<F, T> {
  const destroyRef = inject(DestroyRef);
  const filter = signal(initialFilter);
  const page = signal(1);
  const pageSize = signal(initialPageSize);
  const result = signal<Page<T> | null>(null);
  const loading = signal(false);
  const error = signal<ApiProblem | null>(null);
  const requests = new Subject<{ filter: F; page: PageRequest }>();

  requests
    .pipe(
      tap(() => {
        loading.set(true);
        error.set(null);
      }),
      switchMap((req) =>
        fetch(req.filter, req.page).pipe(
          catchError((err: unknown) => {
            error.set(err instanceof ApiProblem ? err : new ApiProblem(0, 'Request failed', String(err), 'unknown'));
            return of(null);
          })
        )
      ),
      takeUntilDestroyed(destroyRef)
    )
    .subscribe((res) => {
      if (res) result.set(res);
      loading.set(false);
    });

  const load = () => requests.next({ filter: filter(), page: { page: page(), pageSize: pageSize() } });
  load();

  return {
    filter: filter.asReadonly(),
    page: page.asReadonly(),
    pageSize: pageSize.asReadonly(),
    items: computed(() => result()?.items ?? []),
    total: computed(() => result()?.total ?? 0),
    loading: loading.asReadonly(),
    error: error.asReadonly(),
    setFilter(patch) {
      filter.update((f) => ({ ...f, ...patch }));
      page.set(1);
      load();
    },
    setPage(next, size) {
      page.set(next);
      if (size !== undefined) pageSize.set(size);
      load();
    },
    reload: load
  };
}
