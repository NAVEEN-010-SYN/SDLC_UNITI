import type { FirewallRule } from '../domain/types';
import { ACCOUNT, createHarness, HA_EDGE, Harness, SOLO_EDGE } from '../testing/harness';
import { createChangeRequestSchema } from '../validation/schemas';
import { parse } from '../validation/validate';
import { compareVersions } from './ChangeRequestService';

const voicePolicy = {
  id: 'p-voice',
  name: 'Voice',
  order: 10,
  enabled: true,
  match: { applications: ['ms-teams'] },
  action: { serviceClass: 'REALTIME', priority: 'HIGH', steering: 'BEST_PATH' },
};

function rule(id: string, sequence: number, overrides: Partial<FirewallRule> = {}): FirewallRule {
  return {
    id,
    name: id,
    sequence,
    enabled: true,
    action: 'ALLOW',
    protocol: 'TCP',
    sourceCidrs: ['10.0.0.0/24'],
    destinationCidrs: ['0.0.0.0/0'],
    destinationPorts: [{ from: 443, to: 443 }],
    log: false,
    ...overrides,
  };
}

const denyAll = rule('deny-all', 9999, { action: 'DENY', protocol: 'ANY', sourceCidrs: ['0.0.0.0/0'], destinationPorts: [] });

describe('ChangeRequestService', () => {
  let h: Harness;
  const user = () => h.principal('u-requester', 'BUSINESS_USER');
  const admin = () => h.principal('u-admin', 'BUSINESS_ADMIN');
  const noc = () => h.principal('u-noc', 'SUPPORT_AGENT');
  const input = (body: Record<string, unknown>) => parse(createChangeRequestSchema, { title: 'Test change', ...body });

  beforeEach(() => {
    h = createHarness();
  });

  it('runs a low-risk policy change from submission to completion with a pre-change backup', async () => {
    const cr = await h.c.changes.create(user(), ACCOUNT, input({ edgeIds: [HA_EDGE], payload: { type: 'POLICY_UPDATE', policies: [voicePolicy] }, submit: true }));
    expect(cr).toMatchObject({ status: 'SUBMITTED', risk: 'LOW', outstanding: ['1 more approval(s)'] });

    await expect(h.c.changes.decide(user(), ACCOUNT, cr.id, { decision: 'APPROVE' })).rejects.toMatchObject({ status: 422, slug: 'rule/approval' });
    const approved = await h.c.changes.decide(admin(), ACCOUNT, cr.id, { decision: 'APPROVE' });
    expect(approved.status).toBe('APPROVED');

    const at = new Date(h.clock.ms + 60 * 60_000).toISOString();
    expect((await h.c.changes.schedule(user(), ACCOUNT, cr.id, { scheduledFor: at })).status).toBe('SCHEDULED');

    expect(await h.c.changes.executeDue()).toHaveLength(0);
    h.clock.advance(61);
    const [done] = await h.c.changes.executeDue();

    expect(done.status).toBe('COMPLETED');
    expect(done.results).toEqual([expect.objectContaining({ edgeId: HA_EDGE, ok: true, backupId: expect.stringMatching(/^BKP-/) })]);
    expect(done.history.map((x) => x.to)).toEqual(['DRAFT', 'SUBMITTED', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED']);
    expect(h.mocks.VELOCLOUD.calls).toContainEqual({ method: 'applyBusinessPolicies', edge: 'hq-edge-1' });
    const backups = await h.c.backups.list(ACCOUNT, { page: 1, pageSize: 10 }, HA_EDGE);
    expect(backups.items).toEqual([expect.objectContaining({ reason: 'PRE_CHANGE', changeRequestId: cr.id })]);
  });

  it('rejects a firewall rule set with blocking lint errors', async () => {
    const rules = [rule('a', 10), rule('b', 10, { destinationPorts: [{ from: 22, to: 22 }] })];
    await expect(
      h.c.changes.create(user(), ACCOUNT, input({ edgeIds: [SOLO_EDGE], payload: { type: 'FIREWALL_UPDATE', rules } })),
    ).rejects.toMatchObject({ status: 422, extensions: expect.objectContaining({ rule: 'firewall-lint' }) });
  });

  it('requires a maintenance window for medium-risk changes and validates the slot', async () => {
    const cr = await h.c.changes.create(user(), ACCOUNT, input({ edgeIds: [SOLO_EDGE], payload: { type: 'EDGE_REBOOT' }, submit: true }));
    expect(cr.risk).toBe('MEDIUM');
    expect(cr.riskReasons).toContain('1 edge(s) have no HA peer (+2)');
    await h.c.changes.decide(admin(), ACCOUNT, cr.id, { decision: 'APPROVE' });

    await expect(
      h.c.changes.schedule(user(), ACCOUNT, cr.id, { scheduledFor: '2026-03-02T22:30:00Z' }),
    ).rejects.toMatchObject({ status: 422, extensions: expect.objectContaining({ rule: 'maintenance-window' }) });

    const w = await h.c.windows.create(ACCOUNT, { name: 'Nightly', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '22:00', durationMinutes: 240, blackoutDates: [] });
    await expect(
      h.c.changes.schedule(user(), ACCOUNT, cr.id, { maintenanceWindowId: w.id, scheduledFor: '2026-03-02T12:00:00Z' }),
    ).rejects.toMatchObject({ status: 422 });
    const scheduled = await h.c.changes.schedule(user(), ACCOUNT, cr.id, { maintenanceWindowId: w.id, scheduledFor: '2026-03-02T22:30:00Z' });
    expect(scheduled).toMatchObject({ status: 'SCHEDULED', maintenanceWindowId: w.id });

    await expect(h.c.windows.remove(ACCOUNT, w.id)).rejects.toMatchObject({ status: 409 });
  });

  it('stops at the first failing edge, restores its snapshot and skips the rest', async () => {
    jest.spyOn(h.mocks.FORTINET, 'applyFirewallRules').mockRejectedValueOnce(new Error('device rejected policy'));
    const cr = await h.c.changes.create(
      user(),
      ACCOUNT,
      input({ edgeIds: [SOLO_EDGE, HA_EDGE], payload: { type: 'FIREWALL_UPDATE', rules: [rule('web', 10), denyAll] }, emergency: true, submit: true }),
    );
    // 2 edges, one without HA, plus the deny-all overlapping the allow rule: HIGH, two approvals.
    expect(cr.risk).toBe('HIGH');
    expect((await h.c.changes.decide(admin(), ACCOUNT, cr.id, { decision: 'APPROVE' })).status).toBe('SUBMITTED');
    await expect(
      h.c.changes.decide(h.principal('u-admin-2', 'BUSINESS_ADMIN'), ACCOUNT, cr.id, { decision: 'APPROVE' }),
    ).rejects.toMatchObject({ message: 'emergency changes require a SUPPORT_AGENT approval' });
    expect((await h.c.changes.decide(noc(), ACCOUNT, cr.id, { decision: 'APPROVE' })).status).toBe('APPROVED');

    const [done] = await h.c.changes.executeDue();
    expect(done.status).toBe('FAILED');
    expect(done.results).toHaveLength(1);
    expect(done.results[0].error).toMatch(/device rejected policy; pre-change config restored/);
    expect(h.mocks.FORTINET.calls).toContainEqual({ method: 'restoreConfig', edge: 'sheff-edge-1' });
    expect(h.mocks.VELOCLOUD.calls).toHaveLength(0);
  });

  it('refuses software downgrades and illegal transitions', async () => {
    await expect(
      h.c.changes.create(user(), ACCOUNT, input({ edgeIds: [HA_EDGE], payload: { type: 'SOFTWARE_UPGRADE', targetVersion: '5.2.0' } })),
    ).rejects.toMatchObject({ status: 422 });

    const draft = await h.c.changes.create(user(), ACCOUNT, input({ edgeIds: [HA_EDGE], payload: { type: 'EDGE_REBOOT' } }));
    await expect(h.c.changes.schedule(user(), ACCOUNT, draft.id, { scheduledFor: '2026-03-03T00:00:00Z' })).rejects.toMatchObject({ status: 409 });
    await expect(h.c.changes.cancel(h.principal('u-other', 'BUSINESS_USER'), ACCOUNT, draft.id)).rejects.toMatchObject({ status: 403 });
    expect((await h.c.changes.cancel(user(), ACCOUNT, draft.id, 'no longer needed')).status).toBe('CANCELLED');
    await expect(h.c.changes.get('ACC-99999999', draft.id)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects the whole change on a single rejection', async () => {
    const cr = await h.c.changes.create(user(), ACCOUNT, input({ edgeIds: [HA_EDGE], payload: { type: 'EDGE_REBOOT' }, submit: true }));
    const rejected = await h.c.changes.decide(admin(), ACCOUNT, cr.id, { decision: 'REJECT', comment: 'not during trading hours' });
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.history.at(-1)).toMatchObject({ to: 'REJECTED', note: 'not during trading hours' });
  });
});

describe('compareVersions', () => {
  it.each([
    ['5.2.1', '5.2.0', 1],
    ['5.2.0', '5.10.0', -1],
    ['7.2', '7.2.0', 0],
  ])('%s vs %s', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});
