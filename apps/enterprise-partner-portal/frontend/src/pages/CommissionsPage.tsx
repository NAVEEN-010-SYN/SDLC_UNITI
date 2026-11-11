import { useState } from 'react';
import { useEndpoints } from '../api/ApiContext';
import type { Statement } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { Money } from '../components/Money';
import { PaginatedTable, type Column } from '../components/PaginatedTable';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync, useMutation } from '../hooks/useAsync';
import { usePageParams } from '../hooks/usePageParams';
import { formatDate, humanise } from '../lib/format';
import { formatBps } from '../lib/money';

function StatementDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const api = useEndpoints();
  const detail = useAsync(() => api.commissions.statement(id), [api, id]);
  const dispute = useMutation((reason: string) => api.commissions.dispute(id, reason));
  const [reason, setReason] = useState('');

  if (detail.error) return <ErrorBanner error={detail.error} />;
  if (!detail.data) return <p className="loading">Loading statement&hellip;</p>;
  const { statement: s, entries, payout } = detail.data;

  return (
    <section className="panel" aria-label={`Statement ${s.reference}`}>
      <h2>{s.reference}: {formatDate(s.periodStart)} &ndash; {formatDate(s.periodEnd)}</h2>
      <dl className="breakdown">
        <dt>Accrued</dt><dd><Money minor={s.accruedMinor} currency={s.currency} /></dd>
        <dt>Clawbacks</dt><dd><Money minor={s.clawbackMinor} currency={s.currency} /></dd>
        <dt>Adjustments</dt><dd><Money minor={s.adjustmentMinor} currency={s.currency} signed /></dd>
        <dt>Brought forward</dt><dd><Money minor={s.broughtForwardMinor} currency={s.currency} signed /></dd>
        <dt><strong>Net payable</strong></dt><dd><strong><Money minor={s.netPayableMinor} currency={s.currency} /></strong></dd>
      </dl>
      {payout && (
        <p>Payout <StatusBadge status={payout.status} /> scheduled {formatDate(payout.scheduledFor)}
          {payout.paymentReference && `, reference ${payout.paymentReference}`}</p>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Earned</th><th>Order</th><th>Type</th><th>Detail</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.earnedOn)}</td>
                <td>{e.orderReference ?? '\u2014'}</td>
                <td>{humanise(e.type)}</td>
                <td>{e.description}</td>
                <td style={{ textAlign: 'right' }}><Money minor={e.amountMinor} currency={e.currency} signed /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.disputeReason && <p>Dispute raised: {s.disputeReason}</p>}
      {s.disputable && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (await dispute.run(reason.trim())) {
            setReason('');
            detail.reload();
            onChanged();
          }
        }}>
          <label htmlFor="dispute-reason">Something wrong? Explain what is missing or incorrect.</label>
          <textarea id="dispute-reason" rows={3} style={{ width: '100%' }} value={reason} maxLength={1000}
            onChange={(e) => setReason(e.target.value)} />
          <ErrorBanner error={dispute.error} />
          <button type="submit" disabled={!reason.trim() || dispute.pending}>Raise dispute</button>
        </form>
      )}
    </section>
  );
}

export function CommissionsPage() {
  const api = useEndpoints();
  const { page, pageSize, setPage } = usePageParams([] as const);
  const summary = useAsync(() => api.commissions.summary(), [api]);
  const statements = useAsync(() => api.commissions.statements({ page, pageSize }), [api, page, pageSize]);
  const [selected, setSelected] = useState<string>();

  const columns: Column<Statement>[] = [
    { header: 'Statement', render: (s) => s.reference },
    { header: 'Period', render: (s) => `${formatDate(s.periodStart)} \u2013 ${formatDate(s.periodEnd)}` },
    { header: 'Net payable', align: 'right', render: (s) => <Money minor={s.netPayableMinor} currency={s.currency} /> },
    { header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
    { header: '', render: (s) => <button type="button" onClick={() => setSelected(s.id)}>View</button> },
  ];

  const sum = summary.data;
  return (
    <>
      <h1>Commissions</h1>
      <ErrorBanner error={summary.error} />
      {sum && (
        <section className="grid" aria-label="Commission summary">
          <div className="kpi"><div className="kpi__label">Tier rate</div><div className="kpi__value">{humanise(sum.tier)} &middot; {formatBps(sum.tierRateBps)}</div></div>
          <div className="kpi"><div className="kpi__label">Earned this year</div><div className="kpi__value"><Money minor={sum.earnedYearToDateMinor} currency={sum.currency} /></div></div>
          <div className="kpi"><div className="kpi__label">Not yet on a statement</div><div className="kpi__value"><Money minor={sum.unbilledMinor} currency={sum.currency} /></div></div>
          <div className="kpi"><div className="kpi__label">Paid this year</div><div className="kpi__value"><Money minor={sum.paidYearToDateMinor} currency={sum.currency} /></div></div>
          <div className="kpi"><div className="kpi__label">Awaiting payment</div><div className="kpi__value"><Money minor={sum.outstandingPayoutMinor} currency={sum.currency} /></div></div>
        </section>
      )}
      <h2 style={{ marginTop: 24 }}>Statements</h2>
      <PaginatedTable columns={columns} page={statements.data} loading={statements.loading} error={statements.error}
        rowKey={(s) => s.id} onPageChange={setPage} emptyMessage="No statements yet." />
      {selected && <StatementDetail key={selected} id={selected} onChanged={statements.reload} />}
    </>
  );
}
