import type { Edge, LinkSample } from '../domain/types';
import { ACCOUNT, createHarness, HA_EDGE } from '../testing/harness';
import { evaluateEdgeConditions, fingerprintOf } from './AlertService';

function edge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: 'e1',
    siteId: 's1',
    accountId: ACCOUNT,
    vendor: 'VELOCLOUD',
    vendorRef: { vendor: 'VELOCLOUD', tenant: '1001', id: 'e1' },
    name: 'leeds-1',
    model: 'edge840',
    serialNumber: 'SN1',
    softwareVersion: '5.2.1',
    status: 'UP',
    haState: 'STANDALONE',
    links: [
      { id: 'e1:GE1', edgeId: 'e1', name: 'GE1', interface: 'GE1', transport: 'FIBRE', bandwidthDownKbps: 1e6, bandwidthUpKbps: 1e6, state: 'UP' },
      { id: 'e1:LTE', edgeId: 'e1', name: 'LTE', interface: 'CELL1', transport: 'LTE', bandwidthDownKbps: 5e4, bandwidthUpKbps: 1e4, state: 'UP' },
    ],
    ...overrides,
  };
}

function samples(linkId: string, n: number, latencyMs: number, lossPct = 0): LinkSample[] {
  return Array.from({ length: n }, (_, i) => ({
    edgeId: 'e1',
    linkId,
    timestamp: new Date(Date.UTC(2026, 2, 2, 10, i * 5)).toISOString(),
    latencyMs,
    jitterMs: 2,
    lossPct,
    rxBps: 1000,
    txBps: 1000,
  }));
}

describe('evaluateEdgeConditions', () => {
  it('reports only EDGE_DOWN for an offline edge', () => {
    expect(evaluateEdgeConditions(edge({ status: 'DOWN' }), [])).toEqual([
      expect.objectContaining({ type: 'EDGE_DOWN', severity: 'CRITICAL' }),
    ]);
  });

  it('escalates LINK_DOWN to CRITICAL when the last active link fails', () => {
    const e = edge();
    e.links[1].state = 'DOWN';
    expect(evaluateEdgeConditions(e, [])).toEqual([expect.objectContaining({ type: 'LINK_DOWN', linkId: 'e1:LTE', severity: 'MAJOR' })]);
    e.links[0].state = 'DOWN';
    expect(evaluateEdgeConditions(e, []).map((c) => c.severity)).toEqual(['CRITICAL', 'CRITICAL']);
  });

  it('grades quality breaches on p95 and ignores links with too few samples', () => {
    const conds = evaluateEdgeConditions(edge(), [...samples('e1:GE1', 6, 400, 3), ...samples('e1:LTE', 2, 900)]);
    expect(conds.map((c) => [c.type, c.linkId, c.severity])).toEqual([
      ['HIGH_LATENCY', 'e1:GE1', 'MAJOR'],
      ['HIGH_LOSS', 'e1:GE1', 'MAJOR'],
    ]);
  });
});

describe('AlertService', () => {
  const down = { type: 'LINK_DOWN' as const, edgeId: HA_EDGE, linkId: `${HA_EDGE}:GE4`, severity: 'MAJOR' as const, message: 'GE4 down' };

  it('de-duplicates repeated conditions and escalates severity', async () => {
    const h = createHarness();
    await h.c.alerts.reconcileEdge(ACCOUNT, HA_EDGE, [down]);
    h.clock.advance(1);
    const second = await h.c.alerts.reconcileEdge(ACCOUNT, HA_EDGE, [{ ...down, severity: 'CRITICAL' }]);
    expect(second.raised).toBe(0);

    const page = await h.c.alerts.list(ACCOUNT, { page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ occurrences: 2, severity: 'CRITICAL', fingerprint: fingerprintOf(down) });
  });

  it('auto-resolves evaluated alerts once the condition clears and keeps acknowledgements single-shot', async () => {
    const h = createHarness();
    await h.c.alerts.reconcileEdge(ACCOUNT, HA_EDGE, [down]);
    const [alert] = (await h.c.alerts.list(ACCOUNT, { page: 1, pageSize: 10 })).items;

    const acked = await h.c.alerts.acknowledge(h.principal('u1', 'BUSINESS_USER'), ACCOUNT, alert.id);
    expect(acked).toMatchObject({ status: 'ACKNOWLEDGED', acknowledgedBy: 'u1' });
    await expect(h.c.alerts.acknowledge(h.principal('u2', 'BUSINESS_USER'), ACCOUNT, alert.id)).rejects.toMatchObject({ status: 409 });

    expect(await h.c.alerts.reconcileEdge(ACCOUNT, HA_EDGE, [])).toEqual({ raised: 0, resolved: 1 });
    const resolved = await h.c.alerts.list(ACCOUNT, { page: 1, pageSize: 10, status: 'RESOLVED' });
    expect(resolved.items[0].resolvedAt).toBe(h.clock.now().toISOString());
  });

  it('merges vendor events newest first and reports unreachable controllers', async () => {
    const h = createHarness();
    jest.spyOn(h.mocks.FORTINET, 'listEvents').mockRejectedValue(new Error('FMG down'));
    const res = await h.c.alerts.events(ACCOUNT, { from: '2026-03-01T00:00:00Z', to: '2026-03-02T00:00:00Z' }, { limit: 500 });
    expect(res.unavailable).toEqual(['FORTINET']);
    expect(res.items.every((e) => e.vendor === 'VELOCLOUD')).toBe(true);
    const times = res.items.map((e) => e.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
  });
});
