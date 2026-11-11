import type { LinkSample, SlaThresholds, ServiceClass, EdgeStatus, LinkState } from './types';
import { round, sanitizeSamples } from './metricsAggregation';

/**
 * Default SLA thresholds per service class. These are the contractual defaults in the
 * managed SD-WAN product schedule; a customer's business policy may override them.
 */
export const DEFAULT_SLA: Record<ServiceClass, SlaThresholds> = {
  REALTIME: { maxLatencyMs: 150, maxJitterMs: 30, maxLossPct: 1 },
  TRANSACTIONAL: { maxLatencyMs: 250, maxJitterMs: 50, maxLossPct: 2 },
  BULK: { maxLatencyMs: 500, maxJitterMs: 100, maxLossPct: 5 },
};

/**
 * Estimates the Mean Opinion Score for a voice call over a link from latency, jitter
 * and loss using the simplified ITU-T G.107 E-model:
 *   effective latency = latency + 2 * jitter + 10
 *   R = 93.2 - delay impairment - 2.5 * loss
 *   MOS = 1 + 0.035R + 7e-6 * R(R-60)(100-R)
 * Returns a value in [1, 4.5].
 */
export function estimateMos(latencyMs: number, jitterMs: number, lossPct: number): number {
  const effective = latencyMs + 2 * jitterMs + 10;
  let r = effective < 160 ? 93.2 - effective / 40 : 93.2 - (effective - 120) / 10;
  r -= 2.5 * lossPct;
  if (r < 0) r = 0;
  if (r > 100) r = 100;
  const mos = 1 + 0.035 * r + 0.000007 * r * (r - 60) * (100 - r);
  return round(Math.min(4.5, Math.max(1, mos)), 2);
}

export type QualityGrade = 'GOOD' | 'FAIR' | 'POOR' | 'BAD';

export function gradeFromMos(mos: number): QualityGrade {
  if (mos >= 4.0) return 'GOOD';
  if (mos >= 3.6) return 'FAIR';
  if (mos >= 3.1) return 'POOR';
  return 'BAD';
}

export interface SampleCompliance {
  compliant: boolean;
  breaches: Array<'LATENCY' | 'JITTER' | 'LOSS'>;
}

export function checkSample(sample: Pick<LinkSample, 'latencyMs' | 'jitterMs' | 'lossPct'>, sla: SlaThresholds): SampleCompliance {
  const breaches: SampleCompliance['breaches'] = [];
  if (sample.latencyMs > sla.maxLatencyMs) breaches.push('LATENCY');
  if (sample.jitterMs > sla.maxJitterMs) breaches.push('JITTER');
  if (sample.lossPct > sla.maxLossPct) breaches.push('LOSS');
  return { compliant: breaches.length === 0, breaches };
}

export interface LinkScore {
  linkId: string;
  edgeId: string;
  samples: number;
  /** % of samples within all SLA thresholds. */
  slaCompliancePct: number;
  /** % of samples where the link was reachable (loss < 100). */
  availabilityPct: number;
  mos: number;
  grade: QualityGrade;
  /** 0..100 composite score used for ranking links in the UI. */
  score: number;
  breachCounts: { latency: number; jitter: number; loss: number };
}

/**
 * Scores a link over a period. The composite score weights voice quality (MOS) at 50%,
 * SLA compliance at 30% and availability at 20%, which keeps a link that is up but
 * consistently slow from outranking one with a short outage and otherwise clean metrics.
 */
export function scoreLink(samples: LinkSample[], sla: SlaThresholds = DEFAULT_SLA.REALTIME): LinkScore | null {
  const clean = sanitizeSamples(samples);
  if (clean.length === 0) return null;

  let compliant = 0;
  let reachable = 0;
  const breachCounts = { latency: 0, jitter: 0, loss: 0 };
  let latSum = 0;
  let jitSum = 0;
  let lossSum = 0;
  let reachableCount = 0;

  for (const s of clean) {
    const c = checkSample(s, sla);
    if (c.compliant) compliant++;
    if (c.breaches.includes('LATENCY')) breachCounts.latency++;
    if (c.breaches.includes('JITTER')) breachCounts.jitter++;
    if (c.breaches.includes('LOSS')) breachCounts.loss++;
    if (s.lossPct < 100) {
      reachable++;
      reachableCount++;
      latSum += s.latencyMs;
      jitSum += s.jitterMs;
    }
    lossSum += s.lossPct;
  }

  const n = clean.length;
  const mos = reachableCount
    ? estimateMos(latSum / reachableCount, jitSum / reachableCount, lossSum / n)
    : 1;
  const slaCompliancePct = round((compliant / n) * 100, 2);
  const availabilityPct = round((reachable / n) * 100, 3);
  const mosNorm = ((mos - 1) / 3.5) * 100;
  const score = Math.round(0.5 * mosNorm + 0.3 * slaCompliancePct + 0.2 * availabilityPct);

  return {
    linkId: clean[0].linkId,
    edgeId: clean[0].edgeId,
    samples: n,
    slaCompliancePct,
    availabilityPct,
    mos,
    grade: gradeFromMos(mos),
    score,
    breachCounts,
  };
}

/**
 * Derives an edge's effective status from its reported status and link states. A vendor
 * may report an edge as "connected" while one of two WAN links is down; customers expect
 * that to show as DEGRADED.
 */
export function deriveEdgeStatus(reported: EdgeStatus, linkStates: LinkState[]): EdgeStatus {
  if (reported === 'DOWN') return 'DOWN';
  const active = linkStates.filter((s) => s !== 'STANDBY');
  if (active.length === 0) return reported === 'UP' ? 'DEGRADED' : reported;
  const up = active.filter((s) => s === 'UP').length;
  if (up === 0) return 'DOWN';
  if (up < active.length) return 'DEGRADED';
  return reported === 'UNKNOWN' ? 'UP' : reported;
}

/**
 * Edge health score: the best link carries traffic, so it dominates (70%), with the
 * mean of the remaining links giving resilience credit (30%). A single-link edge gets
 * its link score, capped at 85 because it has no failover path.
 */
export function edgeHealthScore(linkScores: number[]): number {
  if (linkScores.length === 0) return 0;
  const sorted = [...linkScores].sort((a, b) => b - a);
  if (sorted.length === 1) return Math.min(85, sorted[0]);
  const rest = sorted.slice(1);
  const restMean = rest.reduce((a, v) => a + v, 0) / rest.length;
  return Math.round(0.7 * sorted[0] + 0.3 * restMean);
}
