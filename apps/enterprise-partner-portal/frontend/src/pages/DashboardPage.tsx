import { useState, type ReactNode } from 'react';
import { useEndpoints } from '../api/ApiContext';
import type { DealStatus, PipelineKpis } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { Money } from '../components/Money';
import { formatDate, formatPercent, humanise } from '../lib/format';
import { useAsync } from '../hooks/useAsync';

const WINDOWS = [30, 90, 180, 365];
const DEAL_STAGES: DealStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'WON', 'LOST'];

function Kpi({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kpi">
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">{children}</div>
    </div>
  );
}

function openLeads(k: PipelineKpis): number {
  return (k.leadsByStatus.NEW ?? 0) + (k.leadsByStatus.CONTACTED ?? 0) + (k.leadsByStatus.QUALIFIED ?? 0);
}

export function DashboardPage() {
  const api = useEndpoints();
  const [days, setDays] = useState(90);
  const { data, error, loading } = useAsync(() => api.dashboard.pipeline(days), [api, days]);

  return (
    <>
      <div className="toolbar">
        <h1 style={{ flex: 1 }}>Pipeline</h1>
        <label>
          Window{' '}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {WINDOWS.map((w) => <option key={w} value={w}>Last {w} days</option>)}
          </select>
        </label>
      </div>
      <ErrorBanner error={error} />
      {loading && !data && <p className="loading">Loading KPIs…</p>}
      {data && (
        <>
          <section className="grid" aria-label="Key figures">
            <Kpi label="Open pipeline (monthly)"><Money minor={data.openPipelineMrcMinor} currency={data.currency} /></Kpi>
            <Kpi label="Activated MRC">
              <Money minor={data.activatedMrcMinor} currency={data.currency} />
            </Kpi>
            <Kpi label="Open leads">{openLeads(data)}</Kpi>
            <Kpi label="New leads">{data.newLeads}</Kpi>
            <Kpi label="Lead conversion">{formatPercent(data.leadConversionRate)}</Kpi>
            <Kpi label="Deal win rate">{formatPercent(data.dealWinRate)}</Kpi>
            <Kpi label="Quote acceptance">{formatPercent(data.quoteAcceptanceRate)}</Kpi>
            <Kpi label="Orders in flight">{data.ordersInFlight}</Kpi>
          </section>
          <section className="panel" style={{ marginTop: 20 }}>
            <h2>Deal registrations since {formatDate(data.windowStart)}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Stage</th><th style={{ textAlign: 'right' }}>Deals</th><th style={{ textAlign: 'right' }}>Monthly value</th></tr>
                </thead>
                <tbody>
                  {DEAL_STAGES.map((stage) => {
                    const total = data.dealsByStatus[stage];
                    return (
                      <tr key={stage}>
                        <td>{humanise(stage)}</td>
                        <td style={{ textAlign: 'right' }}>{total?.count ?? 0}</td>
                        <td style={{ textAlign: 'right' }}><Money minor={total?.mrcMinor ?? 0} currency={data.currency} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
