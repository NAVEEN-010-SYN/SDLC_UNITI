import { currentCorrelationId, silentLogger } from '../logging/logger';
import { createHarness, HA_EDGE } from '../testing/harness';
import { Scheduler } from './Scheduler';
import { pollMetrics } from './tasks';

describe('Scheduler', () => {
  it('skips a tick while the previous run is still in flight', async () => {
    const s = new Scheduler(silentLogger);
    let release!: () => void;
    s.register('slow', 1000, () => new Promise<void>((r) => (release = r)));
    const first = s.runNow('slow');
    await expect(s.runNow('slow')).resolves.toBe(false);
    release();
    await expect(first).resolves.toBe(true);
    expect(s.status()[0]).toMatchObject({ running: false, skippedOverlaps: 1, consecutiveFailures: 0 });
  });

  it('runs each job in its own correlation context and records failures', async () => {
    const s = new Scheduler(silentLogger);
    const seen: Array<string | undefined> = [];
    s.register('flaky', 1000, async () => {
      seen.push(currentCorrelationId());
      throw new Error('controller unreachable');
    });
    await s.runNow('flaky');
    await s.runNow('flaky');
    expect(seen[0]).toMatch(/^job-flaky-/);
    expect(seen[0]).not.toBe(seen[1]);
    expect(s.status()[0]).toMatchObject({ consecutiveFailures: 2, lastError: 'controller unreachable' });
  });
});

describe('pollMetrics', () => {
  it('backfills an hour on first poll and continues from the newest stored sample', async () => {
    const h = createHarness();
    const deps = { tenants: h.c.repos.tenants, inventory: h.c.inventory, metrics: h.c.repos.metrics, logger: silentLogger };
    const spy = jest.spyOn(h.mocks.VELOCLOUD, 'getLinkMetrics');

    const first = await pollMetrics(deps, h.clock.now);
    expect(first.failures).toBe(0);
    expect(first.samples).toBeGreaterThan(0);
    const hqCall = spy.mock.calls.find(([, edge]) => edge === 'hq-edge-1')!;
    expect(Date.parse(hqCall[2].to) - Date.parse(hqCall[2].from)).toBe(60 * 60_000);

    const newest = h.c.repos.metrics.lastTimestampForEdge(HA_EDGE);
    h.clock.advance(10);
    spy.mockClear();
    await pollMetrics(deps, h.clock.now);
    const next = spy.mock.calls.find(([, edge]) => edge === 'hq-edge-1')!;
    expect(next[2].from).toBe(newest);
    expect(Date.parse(next[2].to) - Date.parse(next[2].from)).toBeLessThanOrEqual(15 * 60_000);
  });
});
