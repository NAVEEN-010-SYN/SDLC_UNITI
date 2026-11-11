import type { LinkSample } from '../domain/types';
import { ACCOUNT, createHarness, HA_EDGE } from '../testing/harness';
import { LinkSlaRow, periodBounds, toCsv } from './ReportService';

describe('periodBounds', () => {
  it('covers the whole calendar month, clamped to now for the current month', () => {
    expect(periodBounds('2026-02', new Date('2026-03-02T10:00:00Z'))).toEqual({ from: '2026-02-01T00:00:00.000Z', to: '2026-03-01T00:00:00.000Z' });
    expect(periodBounds('2026-03', new Date('2026-03-02T10:00:00Z')).to).toBe('2026-03-02T10:00:00.000Z');
  });
});

describe('toCsv', () => {
  it('quotes cells containing delimiters and renders nulls as empty', () => {
    const row = { siteName: 'Branch, "North"', edgeName: 'e1', vendor: 'FORTINET', linkName: 'wan1', transport: 'FIBRE', samples: 0, coveragePct: 0, availabilityPct: null, slaCompliancePct: null, mos: null } as LinkSlaRow;
    expect(toCsv([row]).split('\r\n')[1]).toBe('"Branch, ""North""",e1,FORTINET,wan1,FIBRE,0,0,,,');
  });
});

describe('ReportService.slaReport', () => {
  it('rolls link availability up to site availability assuming independent failures', async () => {
    const h = createHarness();
    const mk = (link: string, minute: number, lossPct: number): LinkSample => ({
      edgeId: HA_EDGE,
      linkId: `${HA_EDGE}:${link}`,
      timestamp: new Date(Date.UTC(2026, 2, 2, 9, minute)).toISOString(),
      latencyMs: 10,
      jitterMs: 1,
      lossPct,
      rxBps: 0,
      txBps: 0,
    });
    // GE3 unreachable for half the samples, GE4 for a quarter.
    h.c.repos.metrics.append([0, 5, 10, 15].flatMap((m, i) => [mk('GE3', m, i < 2 ? 100 : 0), mk('GE4', m, i < 1 ? 100 : 0)]));

    const report = await h.c.reports.slaReport(ACCOUNT, '2026-03');
    const ge3 = report.links.find((l) => l.linkId.endsWith('GE3'))!;
    const ge4 = report.links.find((l) => l.linkId.endsWith('GE4'))!;
    expect([ge3.availabilityPct, ge4.availabilityPct]).toEqual([50, 75]);
    const hq = report.sites.find((s) => s.siteName === 'Head Office' && s.availabilityPct !== null)!;
    expect(hq.availabilityPct).toBe(87.5);
  });
});
