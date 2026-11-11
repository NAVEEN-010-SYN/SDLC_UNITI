import { ACCOUNT, createHarness, HA_EDGE, SOLO_EDGE } from '../testing/harness';
import { isRestoreCompatible } from './BackupService';

describe('isRestoreCompatible', () => {
  it.each([
    ['7.2.8', '7.2.8', true],
    ['7.0.12', '7.2.8', true],
    ['7.4.1', '7.2.8', false],
    ['6.4.9', '7.2.8', false],
    ['garbage', '7.2.8', false],
  ])('%s onto %s -> %s', (snap, running, ok) => {
    expect(isRestoreCompatible(snap, running)).toBe(ok);
  });
});

describe('BackupService', () => {
  it('takes checksummed snapshots and diffs them against live config', async () => {
    const h = createHarness();
    const backup = await h.c.backups.create(ACCOUNT, HA_EDGE, 'u-admin');
    expect(backup).toMatchObject({ reason: 'MANUAL', vendor: 'VELOCLOUD', checksum: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(backup).not.toHaveProperty('content');

    expect((await h.c.backups.diff(ACCOUNT, backup.id)).identical).toBe(true);

    await h.mocks.VELOCLOUD.applyFirewallRules({ accountId: ACCOUNT, tenant: '1001' }, 'hq-edge-1', [
      { id: 'r1', name: 'web', sequence: 10, enabled: true, action: 'ALLOW', protocol: 'TCP', sourceCidrs: [], destinationCidrs: [], destinationPorts: [{ from: 443, to: 443 }], log: false },
    ]);
    const diff = await h.c.backups.diff(ACCOUNT, backup.id);
    expect(diff.identical).toBe(false);
    expect(diff.summary.ADDED).toBe(1);
    expect(diff.entries[0]).toMatchObject({ op: 'ADDED', path: 'firewall[id=r1]' });
  });

  it('refuses to compare or restore across edges and detects tampering', async () => {
    const h = createHarness();
    const a = await h.c.backups.create(ACCOUNT, HA_EDGE, 'u');
    const b = await h.c.backups.create(ACCOUNT, SOLO_EDGE, 'u');
    await expect(h.c.backups.diff(ACCOUNT, a.id, b.id)).rejects.toMatchObject({ status: 422 });
    await expect(h.c.backups.restore(ACCOUNT, a.id, SOLO_EDGE)).rejects.toMatchObject({ status: 422 });

    const stored = await h.c.repos.backups.get(a.id);
    await h.c.repos.backups.update({ ...stored!, content: { ...stored!.content, injected: true } });
    await expect(h.c.backups.restore(ACCOUNT, a.id, HA_EDGE)).rejects.toMatchObject({ extensions: expect.objectContaining({ rule: 'backup-corrupt' }) });
  });

  it('hides other accounts’ backups', async () => {
    const h = createHarness();
    const a = await h.c.backups.create(ACCOUNT, HA_EDGE, 'u');
    await expect(h.c.backups.get('ACC-99999999', a.id)).rejects.toMatchObject({ status: 404 });
  });
});
