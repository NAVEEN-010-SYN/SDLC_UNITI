import { Config } from '../config';
import { currentCorrelationId, Logger } from '../logger';
import { isDeletion, isEntry, SyncPage, SyncResult } from './types';

export type FetchFn = typeof fetch;

export class ContentfulError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const MAX_ATTEMPTS = 4;
const MAX_PAGES = 1000;

/**
 * Client for the Contentful Sync API. A sync without a token is an initial
 * (full) sync; with a token only changes since that token are returned.
 * Pages are followed via nextPageUrl until a nextSyncToken arrives.
 */
export class ContentfulSyncClient {
  private readonly baseUrl: string;

  constructor(
    private readonly config: Config['contentful'],
    private readonly logger: Logger,
    private readonly fetchFn: FetchFn = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.baseUrl = `https://${config.cdnHost}/spaces/${encodeURIComponent(config.spaceId)}/environments/${encodeURIComponent(config.environment)}/sync`;
  }

  async sync(syncToken?: string): Promise<SyncResult> {
    let url = syncToken
      ? `${this.baseUrl}?sync_token=${encodeURIComponent(syncToken)}`
      : `${this.baseUrl}?initial=true&type=Entry`;

    const result: SyncResult = { entries: [], deletedIds: [], nextSyncToken: '' };

    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
      const page = await this.fetchPage(url);
      for (const item of page.items) {
        if (isEntry(item)) result.entries.push(item);
        else if (isDeletion(item)) result.deletedIds.push(item.sys.id);
      }

      if (page.nextSyncToken) {
        result.nextSyncToken = page.nextSyncToken;
        this.logger.info('contentful.sync_complete', {
          initial: !syncToken,
          pages: pageNo,
          entries: result.entries.length,
          deletions: result.deletedIds.length,
        });
        return result;
      }
      if (!page.nextPageUrl) throw new ContentfulError('Sync response had neither nextPageUrl nor nextSyncToken');
      url = page.nextPageUrl;
    }

    throw new ContentfulError(`Sync did not finish within ${MAX_PAGES} pages`);
  }

  private async fetchPage(url: string): Promise<SyncPage> {
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          headers: {
            Authorization: `Bearer ${this.config.deliveryToken}`,
            'X-Correlation-Id': currentCorrelationId(),
          },
        });
      } catch (err) {
        if (attempt >= MAX_ATTEMPTS) throw new ContentfulError(`Contentful unreachable: ${(err as Error).message}`);
        await this.sleep(500 * attempt);
        continue;
      }

      if (response.ok) return (await response.json()) as SyncPage;

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        throw new ContentfulError(`Contentful sync failed with HTTP ${response.status}`, response.status);
      }

      const resetSeconds = Number(response.headers.get('X-Contentful-RateLimit-Reset'));
      const delayMs = Number.isFinite(resetSeconds) && resetSeconds > 0 ? resetSeconds * 1000 : 500 * 2 ** (attempt - 1);
      this.logger.warn('contentful.retry', { status: response.status, attempt, delayMs });
      await this.sleep(delayMs);
    }
  }
}
