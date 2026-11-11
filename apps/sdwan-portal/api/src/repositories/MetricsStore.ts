import type { LinkSample } from '../domain/types';

/**
 * Time-series store for polled link samples, keyed by link. Samples are kept sorted by
 * timestamp; duplicate timestamps (a re-poll of an overlapping window) replace the
 * earlier value instead of double counting. Old samples are pruned on write.
 */
export class MetricsStore {
  private readonly series = new Map<string, LinkSample[]>();

  constructor(
    private readonly retentionMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  append(samples: LinkSample[]): number {
    const cutoff = this.now() - this.retentionMs;
    let added = 0;
    const touched = new Set<string>();
    for (const s of samples) {
      const ts = Date.parse(s.timestamp);
      if (Number.isNaN(ts) || ts < cutoff) continue;
      let list = this.series.get(s.linkId);
      if (!list) {
        list = [];
        this.series.set(s.linkId, list);
      }
      const idx = this.lowerBound(list, s.timestamp);
      if (idx < list.length && list[idx].timestamp === s.timestamp) {
        list[idx] = s;
      } else {
        list.splice(idx, 0, s);
        added++;
      }
      touched.add(s.linkId);
    }
    for (const linkId of touched) this.prune(linkId, cutoff);
    return added;
  }

  query(linkIds: string[], fromIso: string, toIso: string): LinkSample[] {
    const out: LinkSample[] = [];
    for (const id of linkIds) {
      const list = this.series.get(id);
      if (!list) continue;
      let i = this.lowerBound(list, fromIso);
      while (i < list.length && list[i].timestamp <= toIso) out.push(list[i++]);
    }
    return out;
  }

  queryEdge(edgeId: string, fromIso: string, toIso: string): LinkSample[] {
    const ids = [...this.series.keys()].filter((k) => k.startsWith(`${edgeId}:`));
    return this.query(ids, fromIso, toIso);
  }

  latest(linkId: string): LinkSample | undefined {
    const list = this.series.get(linkId);
    return list?.[list.length - 1];
  }

  /** Timestamp of the newest sample for the edge, used by the poller to fetch incrementally. */
  lastTimestampForEdge(edgeId: string): string | undefined {
    let max: string | undefined;
    for (const [k, list] of this.series) {
      if (!k.startsWith(`${edgeId}:`) || list.length === 0) continue;
      const t = list[list.length - 1].timestamp;
      if (!max || t > max) max = t;
    }
    return max;
  }

  size(): number {
    let n = 0;
    for (const list of this.series.values()) n += list.length;
    return n;
  }

  private prune(linkId: string, cutoffMs: number): void {
    const list = this.series.get(linkId);
    if (!list) return;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const idx = this.lowerBound(list, cutoffIso);
    if (idx > 0) list.splice(0, idx);
    if (list.length === 0) this.series.delete(linkId);
  }

  /** ISO-8601 UTC strings sort lexicographically in time order. */
  private lowerBound(list: LinkSample[], ts: string): number {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid].timestamp < ts) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
