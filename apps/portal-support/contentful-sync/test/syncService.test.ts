import { ContentfulSyncClient } from '../src/contentful/syncClient';
import { SyncPage } from '../src/contentful/types';
import { ContentDocument } from '../src/model/document';
import { ContentPublisher } from '../src/publish/searchIndex';
import { SyncService } from '../src/sync/syncService';
import { SyncState, TokenStore } from '../src/sync/tokenStore';
import { articleEntry, silentLogger } from './fixtures';

const CONTENTFUL = {
  spaceId: 'space1',
  environment: 'master',
  deliveryToken: 'cda-token',
  cdnHost: 'cdn.contentful.test',
  defaultLocale: 'en-US',
};

class MemoryPublisher implements ContentPublisher {
  upserted: ContentDocument[] = [];
  removed: string[] = [];
  failNext = false;
  async upsert(documents: ContentDocument[]): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('index down');
    }
    this.upserted.push(...documents);
  }
  async removeEntries(entryIds: string[]): Promise<void> {
    this.removed.push(...entryIds);
  }
}

class MemoryTokens implements TokenStore {
  constructor(public state: SyncState | null = null) {}
  async load(): Promise<SyncState | null> {
    return this.state;
  }
  async save(state: SyncState): Promise<void> {
    this.state = state;
  }
}

type Reply = { status: number; body?: SyncPage; headers?: Record<string, string> };

function fakeFetch(replies: Reply[]): jest.Mock {
  return jest.fn(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected request');
    return new Response(reply.body ? JSON.stringify(reply.body) : null, { status: reply.status, headers: reply.headers });
  });
}

function build(replies: Reply[], tokens = new MemoryTokens()) {
  const fetchFn = fakeFetch(replies);
  const logger = silentLogger();
  const client = new ContentfulSyncClient(CONTENTFUL, logger, fetchFn as unknown as typeof fetch, async () => undefined);
  const publisher = new MemoryPublisher();
  const service = new SyncService(client, publisher, tokens, logger, 'en-US', () => new Date('2026-04-03T00:00:00Z'));
  return { fetchFn, publisher, tokens, service, logger };
}

describe('SyncService', () => {
  it('runs an initial sync across pages, publishes valid documents and stores the token', async () => {
    const { fetchFn, publisher, tokens, service } = build([
      { status: 200, body: { items: [articleEntry('a1')], nextPageUrl: 'https://cdn.contentful.test/page2' } },
      { status: 200, body: { items: [articleEntry('a2'), { sys: { id: 'gone', type: 'DeletedEntry' } }], nextSyncToken: 'tok-1' } },
    ]);

    const report = await service.trigger();

    expect(fetchFn.mock.calls[0]![0]).toBe('https://cdn.contentful.test/spaces/space1/environments/master/sync?initial=true&type=Entry');
    expect(fetchFn.mock.calls[1]![0]).toBe('https://cdn.contentful.test/page2');
    expect(report).toMatchObject({ initial: true, entriesSeen: 2, published: 2, deletedEntries: 1, rejected: [] });
    expect(publisher.upserted.map((d) => d.id)).toEqual(['a1:en-US', 'a2:en-US']);
    expect(publisher.removed).toEqual(['gone']);
    expect(tokens.state).toEqual({ nextSyncToken: 'tok-1', completedAt: '2026-04-03T00:00:00.000Z' });
  });

  it('holds back invalid documents and reports why', async () => {
    const { publisher, service, logger } = build([
      { status: 200, body: { items: [articleEntry('bad', { title: '' }), articleEntry('ok')], nextSyncToken: 'tok-2' } },
    ]);

    const report = await service.trigger();

    expect(publisher.upserted.map((d) => d.entryId)).toEqual(['ok']);
    expect(report.rejected).toEqual([{ id: 'bad:en-US', issues: [{ field: 'title', message: 'Required.' }] }]);
    expect(logger.lines.some((l) => l.event === 'sync.document_rejected')).toBe(true);
  });

  it('continues from the stored token and retries rate limits', async () => {
    const tokens = new MemoryTokens({ nextSyncToken: 'tok-old', completedAt: '' });
    const { fetchFn, service } = build(
      [
        { status: 429, headers: { 'X-Contentful-RateLimit-Reset': '1' } },
        { status: 200, body: { items: [], nextSyncToken: 'tok-new' } },
      ],
      tokens,
    );

    const report = await service.trigger();

    expect(report.initial).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0]![0]).toContain('sync_token=tok-old');
    expect(tokens.state?.nextSyncToken).toBe('tok-new');
  });

  it('falls back to a full resync when the token is rejected', async () => {
    const tokens = new MemoryTokens({ nextSyncToken: 'expired', completedAt: '' });
    const { fetchFn, service } = build(
      [{ status: 400 }, { status: 200, body: { items: [], nextSyncToken: 'fresh' } }],
      tokens,
    );

    const report = await service.trigger();

    expect(report.initial).toBe(true);
    expect(fetchFn.mock.calls[1]![0]).toContain('initial=true');
    expect(tokens.state?.nextSyncToken).toBe('fresh');
  });

  it('does not advance the token when publishing fails', async () => {
    const tokens = new MemoryTokens({ nextSyncToken: 'tok-1', completedAt: '' });
    const { publisher, service } = build([{ status: 200, body: { items: [articleEntry()], nextSyncToken: 'tok-2' } }], tokens);
    publisher.failNext = true;

    await expect(service.trigger()).rejects.toThrow('index down');
    expect(tokens.state?.nextSyncToken).toBe('tok-1');
  });

  it('coalesces concurrent triggers into the running sync plus one rerun', async () => {
    const { fetchFn, service } = build([
      { status: 200, body: { items: [], nextSyncToken: 't1' } },
      { status: 200, body: { items: [], nextSyncToken: 't2' } },
    ]);

    const first = service.trigger();
    const second = service.trigger();
    const third = service.trigger();

    expect(second).toBe(first);
    expect(third).toBe(first);
    await first;
    for (let i = 0; i < 50 && fetchFn.mock.calls.length < 2; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
