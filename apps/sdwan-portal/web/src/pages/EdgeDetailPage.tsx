import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { LinkHealth } from '../api/types';
import { RequireRole, useApi } from '../auth/AuthContext';
import { MetricChart } from '../components/MetricChart';
import { ProblemBanner } from '../components/ProblemBanner';
import { StatusPill } from '../components/StatusPill';
import { useAsync, useMutation } from '../hooks/useAsync';
import { EDGE_STATUS_LABEL, formatDateTime, formatKbps, formatMs, formatPct, LINK_STATE_LABEL, RANGE_PRESETS, RangePreset, rangeFor } from '../lib/format';

/** Realtime-class SLA (api/src/domain/linkScoring.ts DEFAULT_SLA.REALTIME), drawn on every chart. */
const SLA = { latencyMs: 150, jitterMs: 30, lossPct: 1 };

/** Maps a link quality grade to a status pill tone. */
function gradeStatus(grade: string): string {
  if (grade === 'GOOD') return 'UP';
  if (grade === 'FAIR') return 'DEGRADED';
  return 'DOWN';
}

function LinkPanel({ lh, bucketSeconds }: { lh: LinkHealth; bucketSeconds: number }) {
  const series = (f: (b: LinkHealth['series'][number]) => number) => lh.series.map((b) => ({ t: b.start, v: f(b) }));
  return (
    <article className="link-panel">
      <h3>
        {lh.link.name} &middot; {lh.link.transport.toLowerCase()} {lh.link.ispName && `(${lh.link.ispName})`}{' '}
        <StatusPill value={lh.link.state} label={LINK_STATE_LABEL[lh.link.state]} />
      </h3>
      {lh.score ? (
        <dl className="stats">
          <dt>Quality</dt>
          <dd>
            <StatusPill value={gradeStatus(lh.score.grade)} label={`${lh.score.grade.toLowerCase()} \u00B7 MOS ${lh.score.mos}`} />
          </dd>
          <dt>SLA compliance</dt>
          <dd>{formatPct(lh.score.slaCompliancePct)}</dd>
          <dt>Availability</dt>
          <dd>{formatPct(lh.score.availabilityPct, 2)}</dd>
          <dt>p95 latency / jitter</dt>
          <dd>
            {formatMs(lh.aggregate?.latencyMs.p95)} / {formatMs(lh.aggregate?.jitterMs.p95)}
          </dd>
          <dt>p95 utilisation down / up</dt>
          <dd>
            {formatPct(lh.utilisation.rxP95Pct)} / {formatPct(lh.utilisation.txP95Pct)}
          </dd>
        </dl>
      ) : (
        <p className="empty">No measurements for this link in the selected range.</p>
      )}
      <MetricChart title="Latency" unit=" ms" points={series((b) => b.latencyMs)} threshold={SLA.latencyMs} bucketSeconds={bucketSeconds} />
      <MetricChart title="Jitter" unit=" ms" points={series((b) => b.jitterMs)} threshold={SLA.jitterMs} bucketSeconds={bucketSeconds} />
      <MetricChart title="Packet loss" unit="%" points={series((b) => b.lossPct)} threshold={SLA.lossPct} bucketSeconds={bucketSeconds} />
    </article>
  );
}

export function EdgeDetailPage() {
  const { edgeId = '' } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const [preset, setPreset] = useState<RangePreset>('24h');
  const edge = useAsync((s) => api.edge(edgeId, s), [api, edgeId]);
  const health = useAsync((s) => api.edgeHealth(edgeId, rangeFor(preset), s), [api, edgeId, preset]);
  const events = useAsync((s) => api.events({ ...rangeFor('7d'), edgeId, limit: 20 }, s), [api, edgeId]);
  const reboot = useMutation(() =>
    api.createChange({ title: `Reboot ${edge.data?.name ?? edgeId}`, edgeIds: [edgeId], payload: { type: 'EDGE_REBOOT' } }),
  );

  if (edge.error) return <ProblemBanner error={edge.error} onRetry={edge.reload} />;
  const e = edge.data;
  if (!e) return <p aria-busy="true">Loading edge&hellip;</p>;

  return (
    <section>
      <h1>
        {e.name} <StatusPill value={e.status} label={EDGE_STATUS_LABEL[e.status]} />
      </h1>
      <p className="meta">
        {e.vendor === 'FORTINET' ? 'Fortinet' : 'VeloCloud'} {e.model} &middot; serial {e.serialNumber} &middot; software {e.softwareVersion} &middot; HA {e.haState.toLowerCase()} &middot; last contact{' '}
        {formatDateTime(e.lastContact)}
      </p>
      <RequireRole roles={['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT']}>
        <button
          type="button"
          disabled={reboot.pending}
          onClick={async () => {
            const cr = await reboot.run();
            if (cr) navigate(`/changes/${encodeURIComponent(cr.id)}`);
          }}
        >
          Request reboot
        </button>
        <ProblemBanner error={reboot.error} />
      </RequireRole>

      <h2>WAN links</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Link</th>
            <th scope="col">State</th>
            <th scope="col">Transport</th>
            <th scope="col">Provider</th>
            <th scope="col">Bandwidth (down/up)</th>
            <th scope="col">Public IP</th>
          </tr>
        </thead>
        <tbody>
          {e.links.map((l) => (
            <tr key={l.id}>
              <td>
                {l.name} <small>{l.interface}</small>
              </td>
              <td>
                <StatusPill value={l.state} label={LINK_STATE_LABEL[l.state]} />
              </td>
              <td>{l.transport.toLowerCase()}</td>
              <td>{l.ispName ?? '\u2014'}</td>
              <td>
                {formatKbps(l.bandwidthDownKbps)} / {formatKbps(l.bandwidthUpKbps)}
              </td>
              <td>{l.publicIp ?? '\u2014'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>
        WAN health {health.data && <small>score {health.data.healthScore}/100</small>}
      </h2>
      <div role="group" aria-label="Time range" className="segmented">
        {(Object.keys(RANGE_PRESETS) as RangePreset[]).map((p) => (
          <button key={p} type="button" aria-pressed={preset === p} onClick={() => setPreset(p)}>
            {p}
          </button>
        ))}
      </div>
      <ProblemBanner error={health.error} onRetry={health.reload} />
      {health.data?.links.map((lh) => <LinkPanel key={lh.link.id} lh={lh} bucketSeconds={health.data!.bucketSeconds} />)}

      <h2>Recent events</h2>
      <ProblemBanner error={events.error} onRetry={events.reload} />
      {events.data && events.data.items.length === 0 && <p className="empty">No events in the last 7 days.</p>}
      <ul className="events">
        {events.data?.items.map((ev) => (
          <li key={ev.id}>
            <StatusPill value={ev.severity} /> <time dateTime={ev.occurredAt}>{formatDateTime(ev.occurredAt)}</time> {ev.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
