import { ContentfulError, ContentfulSyncClient } from '../contentful/syncClient';
import { SyncResult } from '../contentful/types';
import { Logger } from '../logger';
import { ContentDocument } from '../model/document';
import { normaliseEntry } from '../model/normalise';
import { validateDocument, ValidationIssue } from '../model/validate';
import { ContentPublisher } from '../publish/searchIndex';
import { TokenStore } from './tokenStore';

export interface SyncReport {
  initial: boolean;
  entriesSeen: number;
  published: number;
  deletedEntries: number;
  rejected: Array<{ id: string; issues: ValidationIssue[] }>;
}

/**
 * Orchestrates one sync cycle: fetch changes -> normalise -> validate ->
 * publish -> persist token. The token is saved only after publishing
 * succeeds, so a failed cycle is retried from the same point.
 *
 * Rejected documents are not indexed; any previously published revision
 * stays live (last known good) until an editor fixes the entry.
 *
 * Calls are single-flight: a webhook arriving mid-sync schedules exactly
 * one follow-up run instead of running concurrently.
 */
export class SyncService {
  private running: Promise<SyncReport> | null = null;
  private rerunRequested = false;

  constructor(
    private readonly contentful: ContentfulSyncClient,
    private readonly publisher: ContentPublisher,
    private readonly tokens: TokenStore,
    private readonly logger: Logger,
    private readonly defaultLocale: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  trigger(): Promise<SyncReport> {
    if (this.running) {
      this.rerunRequested = true;
      return this.running;
    }

    this.running = this.runOnce().finally(() => {
      this.running = null;
      if (this.rerunRequested) {
        this.rerunRequested = false;
        this.trigger().catch((err: Error) => this.logger.error('sync.rerun_failed', { error: err.message }));
      }
    });
    return this.running;
  }

  private async runOnce(): Promise<SyncReport> {
    const state = await this.tokens.load();
    const { result, initial } = await this.fetchChanges(state?.nextSyncToken);

    const accepted: ContentDocument[] = [];
    const rejected: SyncReport['rejected'] = [];
    for (const entry of result.entries) {
      for (const doc of normaliseEntry(entry, this.defaultLocale)) {
        const issues = validateDocument(doc);
        if (issues.length === 0) accepted.push(doc);
        else rejected.push({ id: doc.id, issues });
      }
    }

    if (result.deletedIds.length > 0) await this.publisher.removeEntries(result.deletedIds);
    if (accepted.length > 0) await this.publisher.upsert(accepted);
    await this.tokens.save({ nextSyncToken: result.nextSyncToken, completedAt: this.now().toISOString() });

    for (const r of rejected) {
      this.logger.warn('sync.document_rejected', { documentId: r.id, issues: r.issues });
    }

    const report: SyncReport = {
      initial,
      entriesSeen: result.entries.length,
      published: accepted.length,
      deletedEntries: result.deletedIds.length,
      rejected,
    };
    this.logger.info('sync.cycle_complete', { ...report, rejected: rejected.length });
    return report;
  }

  /**
   * An expired or invalid sync token is answered with HTTP 400; fall back
   * to a full initial sync rather than stalling forever.
   */
  private async fetchChanges(token: string | undefined): Promise<{ result: SyncResult; initial: boolean }> {
    if (!token) return { result: await this.contentful.sync(), initial: true };
    try {
      return { result: await this.contentful.sync(token), initial: false };
    } catch (err) {
      if (err instanceof ContentfulError && err.status === 400) {
        this.logger.warn('sync.token_rejected_full_resync');
        return { result: await this.contentful.sync(), initial: true };
      }
      throw err;
    }
  }
}
