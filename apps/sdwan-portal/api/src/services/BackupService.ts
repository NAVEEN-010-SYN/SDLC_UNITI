import { randomUUID } from 'node:crypto';
import { checksum, DiffEntry, diffConfig, summarizeDiff } from '../domain/configDiff';
import type { ConfigBackup, Page } from '../domain/types';
import { BusinessRuleProblem, NotFoundProblem } from '../errors/problem';
import type { Logger } from '../logging/logger';
import type { ApplyResult } from '../providers/SdwanProvider';
import type { BackupRepository } from '../repositories';
import type { PageRequest } from '../repositories/InMemoryRepository';
import type { InventoryService } from './InventoryService';

export type BackupSummary = Omit<ConfigBackup, 'content'>;

export interface BackupDiff {
  from: { id: string | 'LIVE'; takenAt: string; checksum: string };
  to: { id: string | 'LIVE'; takenAt: string; checksum: string };
  identical: boolean;
  summary: ReturnType<typeof summarizeDiff>;
  entries: DiffEntry[];
}

function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}

/**
 * A snapshot can be restored onto an edge when it was taken on the same major release and
 * an equal-or-older minor release: controllers accept older config schemas within a major,
 * but a snapshot from a newer minor may carry objects the running firmware cannot parse.
 */
export function isRestoreCompatible(snapshotVersion: string, runningVersion: string): boolean {
  const snap = parseVersion(snapshotVersion);
  const run = parseVersion(runningVersion);
  if (!snap || !run) return false;
  return snap[0] === run[0] && snap[1] <= run[1];
}

function withoutContent(b: ConfigBackup): BackupSummary {
  const summary: Partial<ConfigBackup> = { ...b };
  delete summary.content;
  return summary as BackupSummary;
}

/** Checksummed configuration snapshots per edge, used for manual backups, pre-change safety nets and rollbacks. */
export class BackupService {
  constructor(
    private readonly repo: BackupRepository,
    private readonly inventory: InventoryService,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(
    accountId: string,
    edgeId: string,
    takenBy: string,
    reason: ConfigBackup['reason'] = 'MANUAL',
    changeRequestId?: string,
  ): Promise<BackupSummary> {
    const { edge, provider, ctx } = await this.inventory.resolveEdge(accountId, edgeId);
    const snapshot = await provider.exportConfig(ctx, edge.vendorRef.id);
    const serialized = JSON.stringify(snapshot.content);
    const backup: ConfigBackup = {
      id: `BKP-${randomUUID()}`,
      accountId,
      edgeId,
      vendor: edge.vendor,
      takenAt: this.now().toISOString(),
      takenBy,
      reason,
      changeRequestId,
      checksum: checksum(snapshot.content),
      sizeBytes: Buffer.byteLength(serialized, 'utf8'),
      vendorVersion: snapshot.vendorVersion,
      content: snapshot.content,
    };
    await this.repo.insert(backup);
    this.logger.info('config backup taken', { edgeId, backupId: backup.id, reason, sizeBytes: backup.sizeBytes });
    return withoutContent(backup);
  }

  async list(accountId: string, req: PageRequest, edgeId?: string): Promise<Page<BackupSummary>> {
    const page = await this.repo.page(
      (b) => b.accountId === accountId && (!edgeId || b.edgeId === edgeId),
      req,
      (a, b) => b.takenAt.localeCompare(a.takenAt),
    );
    return { ...page, items: page.items.map(withoutContent) };
  }

  async get(accountId: string, backupId: string): Promise<ConfigBackup> {
    const backup = await this.repo.get(backupId);
    if (!backup || backup.accountId !== accountId) throw new NotFoundProblem('Backup', backupId);
    return backup;
  }

  /** Diffs a backup against another backup of the same edge, or against the edge's live config when `againstId` is omitted. */
  async diff(accountId: string, backupId: string, againstId?: string): Promise<BackupDiff> {
    const base = await this.get(accountId, backupId);
    let target: { id: string; takenAt: string; content: Record<string, unknown> };
    if (againstId) {
      const other = await this.get(accountId, againstId);
      if (other.edgeId !== base.edgeId) {
        throw new BusinessRuleProblem('backup-edge-mismatch', 'Backups can only be compared for the same edge', {
          edgeIds: [base.edgeId, other.edgeId],
        });
      }
      target = other;
    } else {
      const { edge, provider, ctx } = await this.inventory.resolveEdge(accountId, base.edgeId);
      const live = await provider.exportConfig(ctx, edge.vendorRef.id);
      target = { id: 'LIVE', takenAt: this.now().toISOString(), content: live.content };
    }
    const entries = diffConfig(base.content, target.content);
    const targetChecksum = checksum(target.content);
    return {
      from: { id: base.id, takenAt: base.takenAt, checksum: base.checksum },
      to: { id: target.id, takenAt: target.takenAt, checksum: targetChecksum },
      identical: targetChecksum === base.checksum,
      summary: summarizeDiff(entries),
      entries,
    };
  }

  /** Validates integrity and firmware compatibility, then pushes the snapshot back to the edge. */
  async restore(accountId: string, backupId: string, edgeId: string): Promise<ApplyResult> {
    const backup = await this.get(accountId, backupId);
    if (backup.edgeId !== edgeId) {
      throw new BusinessRuleProblem('backup-edge-mismatch', `Backup ${backupId} belongs to edge ${backup.edgeId}, not ${edgeId}`);
    }
    if (checksum(backup.content) !== backup.checksum) {
      throw new BusinessRuleProblem('backup-corrupt', `Backup ${backupId} failed checksum verification`);
    }
    const { edge, provider, ctx } = await this.inventory.resolveEdge(accountId, edgeId);
    if (!isRestoreCompatible(backup.vendorVersion, edge.softwareVersion)) {
      throw new BusinessRuleProblem(
        'backup-incompatible',
        `Backup taken on ${backup.vendorVersion} cannot be restored onto ${edge.softwareVersion}`,
        { backupVersion: backup.vendorVersion, runningVersion: edge.softwareVersion },
      );
    }
    return provider.restoreConfig(ctx, edge.vendorRef.id, { content: backup.content, vendorVersion: backup.vendorVersion });
  }
}
