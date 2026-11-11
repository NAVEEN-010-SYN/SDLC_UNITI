import type { LinkSample } from './types';

export interface MetricStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface LinkAggregate {
  edgeId: string;
  linkId: string;
  from: string;
  to: string;
  samples: number;
  latencyMs: MetricStats;
  jitterMs: MetricStats;
  lossPct: MetricStats;
  avgRxBps: number;
  avgTxBps: number;
  peakRxBps: number;
  peakTxBps: number;
}

export interface TimeBucket {
  start: string;
  latencyMs: number;
  jitterMs: number;
  lossPct: number;
  rxBps: number;
  txBps: number;
  samples: number;
}

const EMPTY_STATS: MetricStats = { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };

/**
 * Nearest-rank percentile on a pre-sorted array. Nearest-rank is used (rather than
 * linear interpolation) because SLA contracts quote "95% of samples were below X",
 * which must correspond to an observed value.
 */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (p <= 0) return sortedAsc[0];
  if (p >= 100) return sortedAsc[sortedAsc.length - 1];
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.max(0, rank - 1)];
}

export function summarize(values: number[]): MetricStats {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return { ...EMPTY_STATS };
  const sorted = [...clean].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: round(sum / sorted.length),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Drops samples that are physically impossible or obviously sentinel values that both
 * vendors emit when a probe fails (VeloCloud reports -1, FortiGate occasionally reports
 * latency 0 with loss 100 for a dead probe - which is valid and kept).
 */
export function sanitizeSamples(samples: LinkSample[]): LinkSample[] {
  return samples.filter(
    (s) =>
      s.latencyMs >= 0 &&
      s.jitterMs >= 0 &&
      s.lossPct >= 0 &&
      s.lossPct <= 100 &&
      s.latencyMs < 60_000 &&
      !Number.isNaN(Date.parse(s.timestamp)),
  );
}

export function aggregateLink(samples: LinkSample[]): LinkAggregate | null {
  const clean = sanitizeSamples(samples);
  if (clean.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const rx = sorted.map((s) => s.rxBps);
  const tx = sorted.map((s) => s.txBps);
  return {
    edgeId: sorted[0].edgeId,
    linkId: sorted[0].linkId,
    from: sorted[0].timestamp,
    to: sorted[sorted.length - 1].timestamp,
    samples: sorted.length,
    latencyMs: summarize(sorted.map((s) => s.latencyMs)),
    jitterMs: summarize(sorted.map((s) => s.jitterMs)),
    lossPct: summarize(sorted.map((s) => s.lossPct)),
    avgRxBps: Math.round(rx.reduce((a, v) => a + v, 0) / rx.length),
    avgTxBps: Math.round(tx.reduce((a, v) => a + v, 0) / tx.length),
    peakRxBps: Math.max(...rx),
    peakTxBps: Math.max(...tx),
  };
}

/** Groups samples by `${edgeId}/${linkId}` and aggregates each group. */
export function aggregateByLink(samples: LinkSample[]): LinkAggregate[] {
  const groups = new Map<string, LinkSample[]>();
  for (const s of samples) {
    const key = `${s.edgeId}/${s.linkId}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  const out: LinkAggregate[] = [];
  for (const group of groups.values()) {
    const agg = aggregateLink(group);
    if (agg) out.push(agg);
  }
  return out.sort((a, b) => a.edgeId.localeCompare(b.edgeId) || a.linkId.localeCompare(b.linkId));
}

/**
 * Down-samples into fixed-width buckets for charting. Latency/jitter use the bucket mean,
 * loss uses the bucket max (a single lossy interval should stay visible on a chart), and
 * throughput uses the mean. Empty buckets are omitted rather than zero-filled so charts
 * show gaps instead of false "0 ms" points.
 */
export function bucketize(samples: LinkSample[], bucketSeconds: number): TimeBucket[] {
  if (bucketSeconds <= 0) throw new RangeError('bucketSeconds must be positive');
  const widthMs = bucketSeconds * 1000;
  const buckets = new Map<number, LinkSample[]>();
  for (const s of sanitizeSamples(samples)) {
    const t = Date.parse(s.timestamp);
    const start = Math.floor(t / widthMs) * widthMs;
    const list = buckets.get(start);
    if (list) list.push(s);
    else buckets.set(start, [s]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, list]) => {
      const mean = (f: (s: LinkSample) => number) => round(list.reduce((a, s) => a + f(s), 0) / list.length);
      return {
        start: new Date(start).toISOString(),
        latencyMs: mean((s) => s.latencyMs),
        jitterMs: mean((s) => s.jitterMs),
        lossPct: round(Math.max(...list.map((s) => s.lossPct))),
        rxBps: Math.round(mean((s) => s.rxBps)),
        txBps: Math.round(mean((s) => s.txBps)),
        samples: list.length,
      };
    });
}

/** Chooses a bucket width that yields at most `maxPoints` points over the range. */
export function pickBucketSeconds(fromIso: string, toIso: string, maxPoints = 300): number {
  const spanSec = Math.max(1, (Date.parse(toIso) - Date.parse(fromIso)) / 1000);
  const candidates = [60, 300, 900, 1800, 3600, 3 * 3600, 6 * 3600, 86400];
  return candidates.find((c) => spanSec / c <= maxPoints) ?? 86400;
}

/**
 * Link utilisation as a percentage of contracted bandwidth, using p95 of the samples
 * (the industry-standard "95th percentile billing" view of a link).
 */
export function utilisationP95(samples: LinkSample[], bandwidthKbps: number, direction: 'rx' | 'tx'): number {
  if (bandwidthKbps <= 0) return 0;
  const values = sanitizeSamples(samples)
    .map((s) => (direction === 'rx' ? s.rxBps : s.txBps))
    .sort((a, b) => a - b);
  const p95 = percentile(values, 95);
  return round(Math.min(100, (p95 / (bandwidthKbps * 1000)) * 100), 1);
}
