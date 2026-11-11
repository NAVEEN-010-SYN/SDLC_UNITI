import { Config } from '../config';
import { currentCorrelationId, Logger } from '../logger';
import { ContentDocument } from '../model/document';

/** Destination for normalised content (search index, edge cache...). */
export interface ContentPublisher {
  upsert(documents: ContentDocument[]): Promise<void>;
  /** Remove every locale variant of the given Contentful entry ids. */
  removeEntries(entryIds: string[]): Promise<void>;
}

export class PublishError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const BATCH_SIZE = 200;

/**
 * Publishes to the internal search service's bulk API. Upserts are
 * idempotent by document id and carry the Contentful revision so the index
 * can ignore out-of-order (older) writes.
 */
export class HttpSearchIndexPublisher implements ContentPublisher {
  constructor(
    private readonly config: Config['searchIndex'],
    private readonly logger: Logger,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async upsert(documents: ContentDocument[]): Promise<void> {
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);
      await this.send('PUT', '/documents', {
        documents: batch.map((doc) => ({ id: doc.id, version: doc.revision, type: doc.kind, locale: doc.locale, body: doc })),
      });
      this.logger.debug('index.upserted', { count: batch.length });
    }
  }

  async removeEntries(entryIds: string[]): Promise<void> {
    for (let i = 0; i < entryIds.length; i += BATCH_SIZE) {
      await this.send('POST', '/documents/delete-by-query', { field: 'entryId', values: entryIds.slice(i, i + BATCH_SIZE) });
    }
  }

  private async send(method: string, path: string, body: unknown): Promise<void> {
    const url = `${this.config.url.replace(/\/$/, '')}/indexes/${encodeURIComponent(this.config.indexName)}${path}`;
    const response = await this.fetchFn(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        'X-Correlation-Id': currentCorrelationId(),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new PublishError(`Search index ${method} ${path} failed with HTTP ${response.status}`, response.status);
    }
  }
}
