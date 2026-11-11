import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEndpoints } from '../api/ApiContext';
import type { Deal, DealStatus } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { Money } from '../components/Money';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync, useMutation } from '../hooks/useAsync';
import { formatDate } from '../lib/format';

/** Board columns; closed-out statuses are grouped so the board stays readable. */
export const STAGES: { title: string; statuses: DealStatus[] }[] = [
  { title: 'Registered', statuses: ['SUBMITTED'] },
  { title: 'Under review', statuses: ['UNDER_REVIEW'] },
  { title: 'Protected', statuses: ['APPROVED'] },
  { title: 'Won', statuses: ['WON'] },
  { title: 'Closed', statuses: ['LOST', 'REJECTED', 'EXPIRED', 'WITHDRAWN'] },
];

const BOARD_SIZE = 100;

export function groupByStage(deals: Deal[]): Map<string, Deal[]> {
  const board = new Map(STAGES.map((s) => [s.title, [] as Deal[]]));
  for (const deal of deals) {
    const stage = STAGES.find((s) => s.statuses.includes(deal.status));
    board.get(stage?.title ?? 'Closed')!.push(deal);
  }
  return board;
}

function DealCard({ deal, onChanged }: { deal: Deal; onChanged: () => void }) {
  const api = useEndpoints();
  const extend = useMutation(() => api.deals.extend(deal.id));
  const outcome = useMutation((result: 'WON' | 'LOST') => api.deals.outcome(deal.id, result));

  async function act(run: () => Promise<unknown>) {
    if (await run()) {
      onChanged();
    }
  }

  return (
    <article className="pipeline__card" aria-label={deal.customerName}>
      <strong>{deal.customerName}</strong>
      <div>{deal.reference} &middot; <StatusBadge status={deal.status} /></div>
      <div><Money minor={deal.estimatedMrcMinor} currency={deal.currency} /> / month &middot; {deal.siteCount} site(s)</div>
      {deal.hasConflict && <div className="badge badge--warning">Overlapping claim</div>}
      {deal.protectedUntil && deal.status === 'APPROVED' && <div>Protected until {formatDate(deal.protectedUntil)}</div>}
      <ErrorBanner error={extend.error ?? outcome.error} />
      {deal.status === 'APPROVED' && (
        <div className="toolbar" style={{ margin: '8px 0 0' }}>
          <Link to={`/quotes/new?dealId=${deal.id}&customer=${encodeURIComponent(deal.customerName)}`}>Quote</Link>
          {deal.extensionAvailable && (
            <button type="button" disabled={extend.pending} onClick={() => act(extend.run)}>Extend</button>
          )}
          <button type="button" disabled={outcome.pending} onClick={() => act(() => outcome.run('WON'))}>Won</button>
          <button type="button" disabled={outcome.pending} onClick={() => act(() => outcome.run('LOST'))}>Lost</button>
        </div>
      )}
    </article>
  );
}

export function DealsPage() {
  const api = useEndpoints();
  const [params] = useSearchParams();
  const q = params.get('q') ?? undefined;
  const deals = useAsync(() => api.deals.search({ page: 1, pageSize: BOARD_SIZE, q }), [api, q]);
  const board = useMemo(() => groupByStage(deals.data?.items ?? []), [deals.data]);

  return (
    <>
      <h1>Deal pipeline</h1>
      <ErrorBanner error={deals.error} />
      {deals.data && deals.data.total > BOARD_SIZE && (
        <div className="banner banner--info">Showing the {BOARD_SIZE} most recent of {deals.data.total} registrations.</div>
      )}
      <div className="pipeline">
        {STAGES.map((stage) => {
          const cards = board.get(stage.title) ?? [];
          const value = cards.reduce((sum, d) => sum + d.estimatedMrcMinor, 0);
          return (
            <section key={stage.title} className="pipeline__column" aria-label={stage.title}>
              <h3>{stage.title} ({cards.length})</h3>
              <Money minor={value} currency={cards[0]?.currency ?? 'GBP'} /> / month
              {cards.map((d) => <DealCard key={d.id} deal={d} onChanged={deals.reload} />)}
            </section>
          );
        })}
      </div>
    </>
  );
}
