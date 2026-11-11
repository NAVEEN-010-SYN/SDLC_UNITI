import type {
  AlertSeverity,
  Edge,
  EdgeStatus,
  HaState,
  LinkSample,
  LinkState,
  SdwanEvent,
  WanLink,
} from '../../domain/types';
import { deriveEdgeStatus } from '../../domain/linkScoring';
import { mapTransport } from './velocloudMatch';
import type {
  VcoEdge,
  VcoEdgeState,
  VcoEvent,
  VcoHaState,
  VcoLink,
  VcoLinkSeries,
  VcoLinkState,
  VcoMetricSeries,
} from './velocloudTypes';

// Match, QoS policy and firewall translation live in their own files;
// re-exported here so existing imports keep working.
export * from './velocloudMatch';
export * from './velocloudRules';

export function mapEdgeState(state: VcoEdgeState): EdgeStatus {
  switch (state) {
    case 'CONNECTED':
      return 'UP';
    case 'DEGRADED':
      return 'DEGRADED';
    case 'OFFLINE':
      return 'DOWN';
    default:
      return 'UNKNOWN';
  }
}

export function mapHaState(state: VcoHaState): HaState {
  switch (state) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'STANDBY':
    case 'READY':
      return 'STANDBY';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'STANDALONE';
  }
}

export function mapLinkState(state: VcoLinkState): LinkState {
  switch (state) {
    case 'STABLE':
    case 'UNSTABLE':
      return 'UP';
    case 'STANDBY':
    case 'QUIET':
      return 'STANDBY';
    case 'DISCONNECTED':
      return 'DOWN';
    default:
      return 'UNKNOWN';
  }
}

export function edgeIdFor(tenant: string, logicalId: string): string {
  return `vc-${tenant}-${logicalId}`;
}

export function mapLink(edgeId: string, link: VcoLink): WanLink {
  return {
    id: `${edgeId}:${link.internalId}`,
    edgeId,
    name: link.displayName ?? link.interface,
    interface: link.interface,
    transport: mapTransport(link),
    ispName: link.isp ?? undefined,
    publicIp: link.ipAddress ?? undefined,
    bandwidthDownKbps: link.bandwidthDownKbps ?? 0,
    bandwidthUpKbps: link.bandwidthUpKbps ?? 0,
    state: mapLinkState(link.state),
  };
}

export function mapEdge(tenant: string, accountId: string, siteId: string, vco: VcoEdge): Edge {
  const id = edgeIdFor(tenant, vco.logicalId);
  const links = (vco.links ?? []).map((l) => mapLink(id, l));
  return {
    id,
    siteId,
    accountId,
    vendor: 'VELOCLOUD',
    vendorRef: { vendor: 'VELOCLOUD', tenant, id: String(vco.id) },
    name: vco.name,
    model: vco.modelNumber,
    serialNumber: vco.serialNumber ?? '',
    softwareVersion: vco.softwareVersion,
    status: deriveEdgeStatus(mapEdgeState(vco.edgeState), links.map((l) => l.state)),
    haState: mapHaState(vco.haState),
    lastContact: vco.lastContact ? new Date(vco.lastContact).toISOString() : undefined,
    links,
  };
}

/**
 * Converts VCO per-link metric series into neutral samples. VCO returns one series per
 * metric with a start time and tick interval; we zip them by index. bytesRx/bytesTx are
 * per-tick totals and are converted to bits per second.
 */
export function mapLinkSeries(edgeId: string, series: VcoLinkSeries[]): LinkSample[] {
  const out: LinkSample[] = [];
  for (const ls of series) {
    const byMetric = new Map<MetricName, VcoMetricSeries>();
    for (const s of ls.series) byMetric.set(s.metric, s);
    const anchor = byMetric.get('bestLatencyMsRx') ?? ls.series[0];
    if (!anchor) continue;
    for (let i = 0; i < anchor.data.length; i++) {
      const sample = sampleAt(edgeId, ls.link.internalId, byMetric, anchor, i);
      if (sample) out.push(sample);
    }
  }
  return out;
}

type MetricName = VcoMetricSeries['metric'];

function valueAt(byMetric: Map<MetricName, VcoMetricSeries>, metric: MetricName, i: number): number | null {
  const s = byMetric.get(metric);
  if (!s) return null;
  return s.data[i] ?? null;
}

function bytesToBps(bytes: number, tickSec: number): number {
  return tickSec > 0 ? Math.round((bytes * 8) / tickSec) : 0;
}

/** Builds the sample for tick i, or undefined when a quality metric is missing. */
function sampleAt(
  edgeId: string,
  linkInternalId: string,
  byMetric: Map<MetricName, VcoMetricSeries>,
  anchor: VcoMetricSeries,
  i: number,
): LinkSample | undefined {
  const latency = valueAt(byMetric, 'bestLatencyMsRx', i);
  const jitter = valueAt(byMetric, 'bestJitterMsRx', i);
  const loss = valueAt(byMetric, 'bestLossPctRx', i);
  if (latency === null || jitter === null || loss === null) return undefined;
  const tickSec = anchor.tickInterval / 1000;
  const start = Date.parse(anchor.startTime);
  return {
    edgeId,
    linkId: `${edgeId}:${linkInternalId}`,
    timestamp: new Date(start + i * anchor.tickInterval).toISOString(),
    latencyMs: latency,
    jitterMs: jitter,
    lossPct: loss,
    rxBps: bytesToBps(valueAt(byMetric, 'bytesRx', i) ?? 0, tickSec),
    txBps: bytesToBps(valueAt(byMetric, 'bytesTx', i) ?? 0, tickSec),
  };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function mapEventSeverity(sev: VcoEvent['severity']): AlertSeverity {
  switch (sev) {
    case 'EMERGENCY':
    case 'ALERT':
    case 'CRITICAL':
      return 'CRITICAL';
    case 'ERROR':
      return 'MAJOR';
    case 'WARNING':
      return 'MINOR';
    default:
      return 'INFO';
  }
}

export function mapEventCategory(cat: VcoEvent['category']): SdwanEvent['category'] {
  switch (cat) {
    case 'EDGE':
      return 'EDGE';
    case 'NETWORK':
      return 'LINK';
    case 'FIREWALL':
    case 'SECURITY':
      return 'SECURITY';
    default:
      return 'SYSTEM';
  }
}

export function mapEvent(tenant: string, accountId: string, ev: VcoEvent, edgeIdByName: Map<string, string>): SdwanEvent {
  const category = /CONFIG/i.test(ev.event) ? 'CONFIG' : mapEventCategory(ev.category);
  return {
    id: `vc-${tenant}-ev-${ev.id}`,
    accountId,
    edgeId: ev.edgeName ? edgeIdByName.get(ev.edgeName) : undefined,
    vendor: 'VELOCLOUD',
    occurredAt: new Date(ev.eventTime).toISOString(),
    category,
    severity: mapEventSeverity(ev.severity),
    message: ev.message,
    raw: { event: ev.event, detail: ev.detail ?? undefined },
  };
}
