# Portal Support (WordPress plugin + Contentful CMS sync): apps/portal-support (part 1 of 2)

- **Application:** Portal Support (WordPress plugin + Contentful CMS sync)
- **Tech stack:** PHP (WordPress), Node.js TypeScript
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 28

## Files

- `apps/portal-support/contentful-sync/.env.example` (26 lines)
- `apps/portal-support/contentful-sync/jest.config.js` (8 lines)
- `apps/portal-support/contentful-sync/package.json` (31 lines)
- `apps/portal-support/contentful-sync/src/config.ts` (73 lines)
- `apps/portal-support/contentful-sync/src/contentful/syncClient.ts` (94 lines)
- `apps/portal-support/contentful-sync/src/contentful/types.ts` (48 lines)
- `apps/portal-support/contentful-sync/src/index.ts` (50 lines)
- `apps/portal-support/contentful-sync/src/logger.ts` (47 lines)
- `apps/portal-support/contentful-sync/src/model/document.ts` (60 lines)
- `apps/portal-support/contentful-sync/src/model/normalise.ts` (168 lines)
- `apps/portal-support/contentful-sync/src/model/validate.ts` (94 lines)
- `apps/portal-support/contentful-sync/src/publish/searchIndex.ts` (64 lines)
- `apps/portal-support/contentful-sync/src/server.ts` (83 lines)
- `apps/portal-support/contentful-sync/src/sync/syncService.ts` (108 lines)
- `apps/portal-support/contentful-sync/src/sync/tokenStore.ts` (41 lines)
- `apps/portal-support/contentful-sync/src/webhooks/signature.ts` (65 lines)
- `apps/portal-support/contentful-sync/test/fixtures.ts` (52 lines)
- `apps/portal-support/contentful-sync/test/normalise.test.ts` (112 lines)
- `apps/portal-support/contentful-sync/test/server.test.ts` (66 lines)
- `apps/portal-support/contentful-sync/test/signature.test.ts` (73 lines)
- `apps/portal-support/contentful-sync/test/syncService.test.ts` (151 lines)
- `apps/portal-support/contentful-sync/test/validate.test.ts` (85 lines)
- `apps/portal-support/contentful-sync/tsconfig.json` (18 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/assets/availability.js` (68 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/composer.json` (34 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/phpunit.xml` (17 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/src/ApiClient.php` (65 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/src/Availability/AddressNormaliser.php` (112 lines)

## apps/portal-support/contentful-sync/.env.example

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: bash. Path: `apps/portal-support/contentful-sync/.env.example`.

```bash
# Contentful (Content Delivery API token with Sync API access)
CONTENTFUL_SPACE_ID=
CONTENTFUL_ENVIRONMENT=master
CONTENTFUL_DELIVERY_TOKEN=
CONTENTFUL_CDN_HOST=cdn.contentful.com
# Default locale used when a field has no value in the requested locale
CONTENTFUL_DEFAULT_LOCALE=en-US

# Webhook request verification secret (Contentful > Settings > Webhooks > Request verification)
CONTENTFUL_WEBHOOK_SECRET=
# Reject signed webhook requests older than this
WEBHOOK_MAX_AGE_SECONDS=300

# Search index / content cache that the portals read from
SEARCH_INDEX_URL=https://search.internal.uniti.example
SEARCH_INDEX_API_KEY=
SEARCH_INDEX_NAME=support-content

# Where the Sync API nextSyncToken is persisted between runs
SYNC_STATE_FILE=./.sync-state.json
# Periodic catch-up sync in seconds (webhooks trigger syncs in between)
SYNC_INTERVAL_SECONDS=900

PORT=8080
LOG_LEVEL=info
```

## apps/portal-support/contentful-sync/jest.config.js

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: javascript. Path: `apps/portal-support/contentful-sync/jest.config.js`.

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
};
```

## apps/portal-support/contentful-sync/package.json

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: json. Path: `apps/portal-support/contentful-sync/package.json`.

```json
{
  "name": "@uniti/contentful-sync",
  "version": "1.0.0",
  "private": true,
  "description": "Syncs Contentful help articles, plan marketing copy and promo banners into the support search index",
  "main": "dist/index.js",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "sync:once": "node dist/index.js --once",
    "test": "jest",
    "lint": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "express": "^4.19.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.12.7",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.2",
    "typescript": "^5.4.5"
  }
}
```

## apps/portal-support/contentful-sync/src/config.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/config.ts`.

```typescript
export interface Config {
  contentful: {
    spaceId: string;
    environment: string;
    deliveryToken: string;
    cdnHost: string;
    defaultLocale: string;
  };
  webhook: { secret: string; maxAgeSeconds: number };
  searchIndex: { url: string; apiKey: string; indexName: string };
  syncStateFile: string;
  syncIntervalSeconds: number;
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export class ConfigError extends Error {}

/**
 * Reads and validates configuration from the environment. Fails fast at
 * start-up listing every problem, rather than at the first request.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) problems.push(`${name} is required`);
    return value ?? '';
  };
  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      problems.push(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
  };

  const searchUrl = required('SEARCH_INDEX_URL');
  if (searchUrl && !searchUrl.startsWith('https://')) problems.push('SEARCH_INDEX_URL must use https');

  const logLevel = (env.LOG_LEVEL ?? 'info') as Config['logLevel'];
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) problems.push('LOG_LEVEL is invalid');

  const config: Config = {
    contentful: {
      spaceId: required('CONTENTFUL_SPACE_ID'),
      environment: env.CONTENTFUL_ENVIRONMENT?.trim() || 'master',
      deliveryToken: required('CONTENTFUL_DELIVERY_TOKEN'),
      cdnHost: env.CONTENTFUL_CDN_HOST?.trim() || 'cdn.contentful.com',
      defaultLocale: env.CONTENTFUL_DEFAULT_LOCALE?.trim() || 'en-US',
    },
    webhook: {
      secret: required('CONTENTFUL_WEBHOOK_SECRET'),
      maxAgeSeconds: integer('WEBHOOK_MAX_AGE_SECONDS', 300, 30, 3600),
    },
    searchIndex: {
      url: searchUrl,
      apiKey: required('SEARCH_INDEX_API_KEY'),
      indexName: env.SEARCH_INDEX_NAME?.trim() || 'support-content',
    },
    syncStateFile: env.SYNC_STATE_FILE?.trim() || './.sync-state.json',
    syncIntervalSeconds: integer('SYNC_INTERVAL_SECONDS', 900, 60, 86400),
    port: integer('PORT', 8080, 1, 65535),
    logLevel,
  };

  if (problems.length > 0) throw new ConfigError(`Invalid configuration: ${problems.join('; ')}`);
  return config;
}
```

## apps/portal-support/contentful-sync/src/contentful/syncClient.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/contentful/syncClient.ts`.

```typescript
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
```

## apps/portal-support/contentful-sync/src/contentful/types.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/contentful/types.ts`.

```typescript
/** Localised field map as returned by the Sync API: field -> locale -> value. */
export type LocalisedFields = Record<string, Record<string, unknown> | undefined>;

export interface SyncEntry {
  sys: {
    id: string;
    type: 'Entry';
    revision: number;
    createdAt: string;
    updatedAt: string;
    contentType: { sys: { id: string } };
  };
  fields: LocalisedFields;
}

export interface SyncDeletion {
  sys: { id: string; type: 'DeletedEntry'; deletedAt?: string };
}

export type SyncItem = SyncEntry | SyncDeletion | { sys: { id: string; type: 'Asset' | 'DeletedAsset' } };

export interface SyncPage {
  items: SyncItem[];
  nextPageUrl?: string;
  nextSyncToken?: string;
}

export interface SyncResult {
  entries: SyncEntry[];
  deletedIds: string[];
  nextSyncToken: string;
}

/** Minimal Contentful rich-text node shape needed for plain-text extraction. */
export interface RichTextNode {
  nodeType: string;
  value?: string;
  content?: RichTextNode[];
}

export function isEntry(item: SyncItem): item is SyncEntry {
  return item.sys.type === 'Entry';
}

export function isDeletion(item: SyncItem): item is SyncDeletion {
  return item.sys.type === 'DeletedEntry';
}
```

## apps/portal-support/contentful-sync/src/index.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/index.ts`.

```typescript
import { loadConfig } from './config';
import { ContentfulSyncClient } from './contentful/syncClient';
import { createLogger, withCorrelationId } from './logger';
import { HttpSearchIndexPublisher } from './publish/searchIndex';
import { createApp } from './server';
import { SyncService } from './sync/syncService';
import { FileTokenStore } from './sync/tokenStore';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const sync = new SyncService(
    new ContentfulSyncClient(config.contentful, logger),
    new HttpSearchIndexPublisher(config.searchIndex, logger),
    new FileTokenStore(config.syncStateFile),
    logger,
    config.contentful.defaultLocale,
  );

  const runScheduled = (): void => {
    withCorrelationId(undefined, () => {
      sync.trigger().catch((err: Error) => logger.error('sync.failed', { error: err.message, trigger: 'schedule' }));
    });
  };

  if (process.argv.includes('--once')) {
    await withCorrelationId(undefined, () => sync.trigger());
    return;
  }

  const server = createApp({ sync, webhook: config.webhook, logger }).listen(config.port, () => {
    logger.info('server.listening', { port: config.port });
  });
  runScheduled();
  const timer = setInterval(runScheduled, config.syncIntervalSeconds * 1000);

  const shutdown = (signal: string): void => {
    logger.info('server.shutdown', { signal });
    clearInterval(timer);
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: Error) => {
  process.stderr.write(JSON.stringify({ level: 'error', event: 'startup.failed', error: err.message }) + '\n');
  process.exit(1);
});
```

## apps/portal-support/contentful-sync/src/logger.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/logger.ts`.

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

type Level = 'debug' | 'info' | 'warn' | 'error';
const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const context = new AsyncLocalStorage<{ correlationId: string }>();

/** Runs fn with a correlation id that every log line and outbound call picks up. */
export function withCorrelationId<T>(correlationId: string | undefined, fn: () => T): T {
  return context.run({ correlationId: correlationId || randomUUID() }, fn);
}

export function currentCorrelationId(): string {
  return context.getStore()?.correlationId ?? randomUUID();
}

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/** Structured JSON logger: one object per line on stdout. */
export function createLogger(minLevel: Level = 'info', write: (line: string) => void = (l) => process.stdout.write(l + '\n')): Logger {
  const log = (level: Level, event: string, fields: Record<string, unknown> = {}): void => {
    if (RANK[level] < RANK[minLevel]) return;
    write(
      JSON.stringify({
        time: new Date().toISOString(),
        level,
        service: 'contentful-sync',
        event,
        correlationId: context.getStore()?.correlationId,
        ...fields,
      }),
    );
  };
  return {
    debug: (e, f) => log('debug', e, f),
    info: (e, f) => log('info', e, f),
    warn: (e, f) => log('warn', e, f),
    error: (e, f) => log('error', e, f),
  };
}
```

## apps/portal-support/contentful-sync/src/model/document.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/model/document.ts`.

```typescript
/**
 * Normalised content model published to the search index / cache. One
 * document per entry per locale; ids are `${entryId}:${locale}` so a
 * deletion in Contentful can remove every locale variant.
 */
export type Audience = 'all' | 'consumer' | 'business';

export interface Money {
  amountMinor: number;
  currency: string;
}

interface BaseDocument {
  id: string;
  entryId: string;
  locale: string;
  revision: number;
  updatedAt: string;
}

export interface HelpArticleDocument extends BaseDocument {
  kind: 'helpArticle';
  slug: string;
  title: string;
  summary: string;
  body: string;
  topics: string[];
  products: string[];
  audience: Audience;
}

export interface PlanCopyDocument extends BaseDocument {
  kind: 'planCopy';
  planCode: string;
  headline: string;
  tagline: string;
  features: string[];
  downMbps: number;
  upMbps: number;
  monthlyPrice: Money;
  promoPrice: (Money & { months: number }) | null;
}

export interface PromoBannerDocument extends BaseDocument {
  kind: 'promoBanner';
  message: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  audience: Audience;
  priority: number;
}

export type ContentDocument = HelpArticleDocument | PlanCopyDocument | PromoBannerDocument;

export function documentId(entryId: string, locale: string): string {
  return `${entryId}:${locale}`;
}
```

## apps/portal-support/contentful-sync/src/model/normalise.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/model/normalise.ts`.

```typescript
import { LocalisedFields, RichTextNode, SyncEntry } from '../contentful/types';
import { Audience, ContentDocument, documentId, Money } from './document';

export const CONTENT_TYPES = {
  helpArticle: 'helpArticle',
  planCopy: 'planMarketing',
  promoBanner: 'promoBanner',
} as const;

/**
 * Field reader for one locale with Contentful-style fallback to the
 * default locale when the localised value is missing.
 */
class FieldReader {
  constructor(
    private readonly fields: LocalisedFields,
    private readonly locale: string,
    private readonly defaultLocale: string,
  ) {}

  raw(name: string): unknown {
    const values = this.fields[name];
    if (!values) return undefined;
    return values[this.locale] ?? values[this.defaultLocale];
  }

  string(name: string): string {
    const value = this.raw(name);
    return typeof value === 'string' ? value.trim() : '';
  }

  optionalString(name: string): string | null {
    return this.string(name) || null;
  }

  number(name: string): number {
    const value = this.raw(name);
    return typeof value === 'number' ? value : Number.NaN;
  }

  strings(name: string): string[] {
    const value = this.raw(name);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean))];
  }
}

/** Locales that have at least one field value on this entry. */
export function entryLocales(entry: SyncEntry): string[] {
  const locales = new Set<string>();
  for (const values of Object.values(entry.fields)) {
    Object.keys(values ?? {}).forEach((l) => locales.add(l));
  }
  return [...locales].sort();
}

/**
 * Map a Sync API entry to normalised documents (one per locale). Unknown
 * content types return an empty list so new models in Contentful never
 * break the sync.
 */
export function normaliseEntry(entry: SyncEntry, defaultLocale: string): ContentDocument[] {
  const contentType = entry.sys.contentType.sys.id;
  if (!Object.values<string>(CONTENT_TYPES).includes(contentType)) return [];

  return entryLocales(entry).map((locale) => {
    const f = new FieldReader(entry.fields, locale, defaultLocale);
    const base = {
      id: documentId(entry.sys.id, locale),
      entryId: entry.sys.id,
      locale,
      revision: entry.sys.revision,
      updatedAt: entry.sys.updatedAt,
    };

    switch (contentType) {
      case CONTENT_TYPES.helpArticle:
        return {
          ...base,
          kind: 'helpArticle' as const,
          slug: f.string('slug').toLowerCase(),
          title: f.string('title'),
          summary: f.string('summary'),
          body: richTextToPlain(f.raw('body')),
          topics: f.strings('topics').map((t) => t.toLowerCase()),
          products: f.strings('products').map((p) => p.toLowerCase()),
          audience: audience(f.string('audience')),
        };
      case CONTENT_TYPES.planCopy: {
        const currency = (f.string('currency') || 'USD').toUpperCase();
        const promoMonths = f.number('promoMonths');
        const promoAmount = parsePrice(f.raw('promoPrice'));
        return {
          ...base,
          kind: 'planCopy' as const,
          planCode: f.string('planCode').toUpperCase(),
          headline: f.string('headline'),
          tagline: f.string('tagline'),
          features: f.strings('features'),
          downMbps: f.number('downMbps'),
          upMbps: f.number('upMbps'),
          monthlyPrice: { amountMinor: parsePrice(f.raw('monthlyPrice')) ?? Number.NaN, currency },
          promoPrice:
            promoAmount !== null && Number.isInteger(promoMonths) ? { amountMinor: promoAmount, currency, months: promoMonths } : null,
        };
      }
      default:
        return {
          ...base,
          kind: 'promoBanner' as const,
          message: f.string('message'),
          ctaLabel: f.optionalString('ctaLabel'),
          ctaUrl: f.optionalString('ctaUrl'),
          startsAt: toUtcIso(f.string('startsAt')) ?? '',
          endsAt: toUtcIso(f.string('endsAt')),
          audience: audience(f.string('audience')),
          priority: Number.isInteger(f.number('priority')) ? f.number('priority') : 0,
        };
    }
  });
}

/**
 * Editors enter prices as decimal text ("49.99") or numbers. Convert to
 * integer minor units without floating-point arithmetic.
 */
export function parsePrice(value: unknown): Money['amountMinor'] | null {
  const text = typeof value === 'number' ? value.toFixed(2) : typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const [, whole = '0', fraction = ''] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Flatten a rich-text document to searchable plain text, one block per line. */
export function richTextToPlain(node: unknown): string {
  if (typeof node === 'string') return node.trim();
  if (!node || typeof node !== 'object') return '';

  const blocks: string[] = [];
  const walk = (n: RichTextNode, inline: string[]): void => {
    if (n.nodeType === 'text') {
      inline.push(n.value ?? '');
      return;
    }
    const isBlock = n.nodeType === 'paragraph' || n.nodeType.startsWith('heading-') || n.nodeType === 'list-item';
    const target = isBlock ? [] : inline;
    (n.content ?? []).forEach((child) => walk(child, target));
    if (isBlock) {
      const text = target.join('').replace(/\s+/g, ' ').trim();
      if (text) blocks.push(text);
    }
  };
  walk(node as RichTextNode, []);
  return blocks.join('\n');
}

function audience(value: string): Audience {
  const lower = value.toLowerCase();
  return lower === 'consumer' || lower === 'business' ? lower : 'all';
}

function toUtcIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
```

## apps/portal-support/contentful-sync/src/model/validate.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/model/validate.ts`.

```typescript
import { ContentDocument, HelpArticleDocument, PlanCopyDocument, PromoBannerDocument } from './document';

export interface ValidationIssue {
  field: string;
  message: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLAN_CODE = /^[A-Z0-9_]{3,40}$/;
const CURRENCY = /^[A-Z]{3}$/;
const ALLOWED_CTA_HOSTS = [/^([a-z0-9-]+\.)*uniti\.example$/];

/**
 * Publishing guard-rails. Editors can save drafts freely in Contentful, but
 * a published entry that would render badly or mislead customers (missing
 * price, banner linking off-site, ends before it starts) is held back from
 * the index and reported instead.
 */
export function validateDocument(doc: ContentDocument): ValidationIssue[] {
  switch (doc.kind) {
    case 'helpArticle':
      return validateArticle(doc);
    case 'planCopy':
      return validatePlan(doc);
    case 'promoBanner':
      return validateBanner(doc);
  }
}

function validateArticle(doc: HelpArticleDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  requireText(issues, 'title', doc.title, 120);
  requireText(issues, 'summary', doc.summary, 300);
  if (!SLUG.test(doc.slug) || doc.slug.length > 100) issues.push({ field: 'slug', message: 'Slug must be lower-case words separated by hyphens.' });
  if (doc.body.length < 40) issues.push({ field: 'body', message: 'Article body is too short to be useful.' });
  if (doc.topics.length === 0) issues.push({ field: 'topics', message: 'At least one topic is required for navigation.' });
  return issues;
}

function validatePlan(doc: PlanCopyDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!PLAN_CODE.test(doc.planCode)) issues.push({ field: 'planCode', message: 'Plan code must match the catalogue (A-Z, 0-9, _).' });
  requireText(issues, 'headline', doc.headline, 80);
  requireText(issues, 'tagline', doc.tagline, 160);
  if (!Number.isInteger(doc.downMbps) || doc.downMbps <= 0) issues.push({ field: 'downMbps', message: 'Download speed must be a positive whole number.' });
  if (!Number.isInteger(doc.upMbps) || doc.upMbps <= 0) issues.push({ field: 'upMbps', message: 'Upload speed must be a positive whole number.' });
  if (Number.isInteger(doc.upMbps) && Number.isInteger(doc.downMbps) && doc.upMbps > doc.downMbps) {
    issues.push({ field: 'upMbps', message: 'Upload speed cannot exceed download speed.' });
  }
  if (!Number.isInteger(doc.monthlyPrice.amountMinor) || doc.monthlyPrice.amountMinor <= 0) {
    issues.push({ field: 'monthlyPrice', message: 'Monthly price must be a positive amount such as 49.99.' });
  }
  if (!CURRENCY.test(doc.monthlyPrice.currency)) issues.push({ field: 'currency', message: 'Currency must be an ISO 4217 code.' });
  if (doc.promoPrice) {
    if (doc.promoPrice.amountMinor >= doc.monthlyPrice.amountMinor) {
      issues.push({ field: 'promoPrice', message: 'Promotional price must be lower than the regular price.' });
    }
    if (doc.promoPrice.months < 1 || doc.promoPrice.months > 24) {
      issues.push({ field: 'promoMonths', message: 'Promotion length must be 1 to 24 months.' });
    }
  }
  if (doc.features.length > 8) issues.push({ field: 'features', message: 'Show at most 8 feature bullets.' });
  return issues;
}

function validateBanner(doc: PromoBannerDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  requireText(issues, 'message', doc.message, 140);
  if (!doc.startsAt) issues.push({ field: 'startsAt', message: 'Start date is required.' });
  if (doc.startsAt && doc.endsAt && doc.endsAt <= doc.startsAt) issues.push({ field: 'endsAt', message: 'Banner must end after it starts.' });
  if ((doc.ctaLabel === null) !== (doc.ctaUrl === null)) {
    issues.push({ field: 'ctaUrl', message: 'Call to action needs both a label and a URL.' });
  }
  if (doc.ctaUrl !== null && !isAllowedCtaUrl(doc.ctaUrl)) {
    issues.push({ field: 'ctaUrl', message: 'Call to action must be an https link to a Uniti site.' });
  }
  return issues;
}

export function isAllowedCtaUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_CTA_HOSTS.some((pattern) => pattern.test(url.hostname));
  } catch {
    return false;
  }
}

function requireText(issues: ValidationIssue[], field: string, value: string, max: number): void {
  if (!value) issues.push({ field, message: 'Required.' });
  else if (value.length > max) issues.push({ field, message: `Must be at most ${max} characters.` });
}
```

## apps/portal-support/contentful-sync/src/publish/searchIndex.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/publish/searchIndex.ts`.

```typescript
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
```

## apps/portal-support/contentful-sync/src/server.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/server.ts`.

```typescript
import express, { NextFunction, Request, Response } from 'express';
import { Config } from './config';
import { currentCorrelationId, Logger, withCorrelationId } from './logger';
import { SyncService } from './sync/syncService';
import { verifyWebhook } from './webhooks/signature';

const CORRELATION_HEADER = 'x-correlation-id';
const CORRELATION_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/** Topics that change published content; anything else is acknowledged and ignored. */
const RELEVANT_TOPICS = /^ContentManagement\.Entry\.(publish|unpublish|delete|archive)$/;

function problem(res: Response, status: number, title: string, detail: string): void {
  res.status(status).type('application/problem+json').json({
    type: `https://errors.uniti.example/contentful-sync/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    status,
    detail,
    instance: res.req.originalUrl,
    correlationId: res.getHeader('X-Correlation-Id'),
  });
}

export function createApp(deps: { sync: SyncService; webhook: Config['webhook']; logger: Logger }): express.Express {
  const { sync, webhook, logger } = deps;
  const app = express();
  app.disable('x-powered-by');

  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header(CORRELATION_HEADER);
    const id = incoming && CORRELATION_PATTERN.test(incoming) ? incoming : undefined;
    withCorrelationId(id, () => {
      res.setHeader('X-Correlation-Id', currentCorrelationId());
      next();
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'UP', time: new Date().toISOString() });
  });

  app.post(
    '/webhooks/contentful',
    express.raw({ type: '*/*', limit: '1mb' }),
    (req: Request, res: Response) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      const verdict = verifyWebhook(
        { method: req.method, path: req.originalUrl, headers: req.headers, rawBody },
        webhook.secret,
        webhook.maxAgeSeconds,
      );
      if (!verdict.ok) {
        logger.warn('webhook.rejected', { reason: verdict.reason });
        problem(res, 401, 'Unauthorized', 'Webhook signature verification failed.');
        return;
      }

      const topic = req.header('x-contentful-topic') ?? '';
      if (!RELEVANT_TOPICS.test(topic)) {
        res.status(204).end();
        return;
      }

      logger.info('webhook.accepted', { topic });
      sync.trigger().catch((err: Error) => logger.error('sync.failed', { error: err.message, trigger: 'webhook' }));
      res.status(202).json({ accepted: true });
    },
  );

  app.use((_req: Request, res: Response) => problem(res, 404, 'Not Found', 'No such route.'));

  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.too.large') {
      problem(res, 413, 'Payload Too Large', 'Webhook body exceeds 1 MB.');
      return;
    }
    logger.error('http.unhandled', { error: err.message });
    problem(res, 500, 'Internal Server Error', 'Unexpected error. Quote the correlation id when reporting.');
  });

  return app;
}
```

## apps/portal-support/contentful-sync/src/sync/syncService.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/sync/syncService.ts`.

```typescript
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
```

## apps/portal-support/contentful-sync/src/sync/tokenStore.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/sync/tokenStore.ts`.

```typescript
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

export interface SyncState {
  nextSyncToken: string;
  completedAt: string;
}

export interface TokenStore {
  load(): Promise<SyncState | null>;
  save(state: SyncState): Promise<void>;
}

/**
 * Persists the Sync API token on disk. Writes go to a temp file then
 * rename, so a crash mid-write never leaves a corrupt token (which would
 * force an expensive full resync).
 */
export class FileTokenStore implements TokenStore {
  constructor(private readonly path: string) {}

  async load(): Promise<SyncState | null> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.path, 'utf8')) as Partial<SyncState>;
      return typeof parsed.nextSyncToken === 'string' && parsed.nextSyncToken
        ? { nextSyncToken: parsed.nextSyncToken, completedAt: String(parsed.completedAt ?? '') }
        : null;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(state: SyncState): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temp, this.path);
  }
}
```

## apps/portal-support/contentful-sync/src/webhooks/signature.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/src/webhooks/signature.ts`.

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Contentful webhook request verification.
 *
 * Contentful signs a canonical representation of the request with
 * HMAC-SHA256 and sends:
 *   x-contentful-signature       hex digest
 *   x-contentful-timestamp       ms since epoch
 *   x-contentful-signed-headers  comma-separated, lower-case header names
 *
 * canonical = METHOD \n path?query \n name:value;name:value \n raw body
 */
export interface IncomingWebhook {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}

export type VerificationResult = { ok: true } | { ok: false; reason: string };

export function canonicalRequest(req: IncomingWebhook, signedHeaders: string[]): string {
  const headerPart = signedHeaders
    .map((name) => {
      const value = req.headers[name];
      return `${name}:${Array.isArray(value) ? value.join(',') : (value ?? '').trim()}`;
    })
    .join(';');
  return [req.method.toUpperCase(), encodeURI(req.path), headerPart, req.rawBody].join('\n');
}

export function sign(canonical: string, secret: string): string {
  return createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

export function verifyWebhook(req: IncomingWebhook, secret: string, maxAgeSeconds: number, nowMs: number = Date.now()): VerificationResult {
  const header = (name: string): string | undefined => {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  const signature = header('x-contentful-signature');
  const timestamp = header('x-contentful-timestamp');
  const signedHeaderList = header('x-contentful-signed-headers');
  if (!signature || !timestamp || !signedHeaderList) return { ok: false, reason: 'missing signature headers' };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowMs - sentAt) > maxAgeSeconds * 1000) {
    return { ok: false, reason: 'timestamp outside tolerance' };
  }

  const signedHeaders = signedHeaderList.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!signedHeaders.includes('x-contentful-timestamp')) {
    return { ok: false, reason: 'timestamp not covered by signature' };
  }

  const expected = Buffer.from(sign(canonicalRequest(req, signedHeaders), secret), 'hex');
  const provided = Buffer.from(signature, 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}
```

## apps/portal-support/contentful-sync/test/fixtures.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/test/fixtures.ts`.

```typescript
import { SyncEntry } from '../src/contentful/types';
import { Logger } from '../src/logger';

export function entry(id: string, contentType: string, fields: SyncEntry['fields'], revision = 1): SyncEntry {
  return {
    sys: {
      id,
      type: 'Entry',
      revision,
      createdAt: '2026-04-01T09:00:00.000Z',
      updatedAt: '2026-04-02T10:30:00.000Z',
      contentType: { sys: { id: contentType } },
    },
    fields,
  };
}

/** Wraps plain values as single-locale ("en-US") Sync API fields. */
export function enUs(values: Record<string, unknown>): SyncEntry['fields'] {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { 'en-US': v }]));
}

export const richText = (...paragraphs: string[]): unknown => ({
  nodeType: 'document',
  content: paragraphs.map((p) => ({ nodeType: 'paragraph', content: [{ nodeType: 'text', value: p }] })),
});

export function articleEntry(id = 'art1', overrides: Record<string, unknown> = {}): SyncEntry {
  return entry(
    id,
    'helpArticle',
    enUs({
      slug: 'Reset-Your-Router',
      title: 'Reset your router',
      summary: 'How to restart and factory reset the Uniti router.',
      body: richText('Unplug the router for 30 seconds.', 'Hold the reset button for 10 seconds to restore factory settings.'),
      topics: ['Equipment', 'equipment', 'Troubleshooting'],
      products: ['Fibre'],
      audience: 'consumer',
      ...overrides,
    }),
  );
}

export const silentLogger = (): Logger & { lines: Array<{ event: string; fields?: Record<string, unknown> }> } => {
  const lines: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  const push = (event: string, fields?: Record<string, unknown>): void => {
    lines.push({ event, fields });
  };
  return { lines, debug: push, info: push, warn: push, error: push };
};
```

## apps/portal-support/contentful-sync/test/normalise.test.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/test/normalise.test.ts`.

```typescript
import { HelpArticleDocument, PlanCopyDocument, PromoBannerDocument } from '../src/model/document';
import { entryLocales, normaliseEntry, parsePrice, richTextToPlain } from '../src/model/normalise';
import { articleEntry, entry, enUs, richText } from './fixtures';

describe('normaliseEntry', () => {
  it('maps a help article, flattening rich text and de-duplicating taxonomy', () => {
    const [doc] = normaliseEntry(articleEntry(), 'en-US') as HelpArticleDocument[];

    expect(doc).toMatchObject({
      id: 'art1:en-US',
      entryId: 'art1',
      kind: 'helpArticle',
      slug: 'reset-your-router',
      topics: ['equipment', 'troubleshooting'],
      products: ['fibre'],
      audience: 'consumer',
      revision: 1,
    });
    expect(doc!.body).toBe('Unplug the router for 30 seconds.\nHold the reset button for 10 seconds to restore factory settings.');
  });

  it('emits one document per locale with fallback to the default locale', () => {
    const e = articleEntry();
    e.fields.title = { 'en-US': 'Reset your router', 'es-US': 'Reinicie su router' };

    const docs = normaliseEntry(e, 'en-US') as HelpArticleDocument[];

    expect(docs.map((d) => [d.id, d.title, d.slug])).toEqual([
      ['art1:en-US', 'Reset your router', 'reset-your-router'],
      ['art1:es-US', 'Reinicie su router', 'reset-your-router'],
    ]);
  });

  it('converts plan prices to integer minor units', () => {
    const [plan] = normaliseEntry(
      entry('plan1', 'planMarketing', enUs({
        planCode: 'fibre_1g',
        headline: 'Gig speed',
        tagline: 'For busy homes',
        features: ['Wi-Fi 7 router', 'No data caps'],
        downMbps: 1000,
        upMbps: 1000,
        monthlyPrice: '65.5',
        promoPrice: 45,
        promoMonths: 12,
        currency: 'usd',
      })),
      'en-US',
    ) as PlanCopyDocument[];

    expect(plan!.planCode).toBe('FIBRE_1G');
    expect(plan!.monthlyPrice).toEqual({ amountMinor: 6550, currency: 'USD' });
    expect(plan!.promoPrice).toEqual({ amountMinor: 4500, currency: 'USD', months: 12 });
  });

  it('normalises promo banner dates to UTC and defaults audience and priority', () => {
    const [banner] = normaliseEntry(
      entry('ban1', 'promoBanner', enUs({ message: 'Spring offer', startsAt: '2026-04-01T00:00:00-05:00', audience: 'everyone' })),
      'en-US',
    ) as PromoBannerDocument[];

    expect(banner).toMatchObject({ startsAt: '2026-04-01T05:00:00.000Z', endsAt: null, audience: 'all', priority: 0, ctaUrl: null });
  });

  it('ignores content types it does not know', () => {
    expect(normaliseEntry(entry('x', 'landingPage', enUs({ title: 'x' })), 'en-US')).toEqual([]);
  });

  it('lists every locale present on any field', () => {
    const e = entry('m', 'helpArticle', { title: { 'en-US': 'a' }, summary: { 'fr-CA': 'b', 'en-US': 'c' } });
    expect(entryLocales(e)).toEqual(['en-US', 'fr-CA']);
  });
});

describe('parsePrice', () => {
  it.each([
    ['49.99', 4999],
    ['49.9', 4990],
    ['49', 4900],
    [19.95, 1995],
    [0.1 + 0.2, 30],
  ])('parses %p to %p minor units', (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });

  it.each(['', '49.999', '-5', '$49', 'free', null])('rejects %p', (input) => {
    expect(parsePrice(input)).toBeNull();
  });
});

describe('richTextToPlain', () => {
  it('joins inline marks inside a block and separates headings and list items', () => {
    const doc = {
      nodeType: 'document',
      content: [
        { nodeType: 'heading-2', content: [{ nodeType: 'text', value: 'Before you start' }] },
        {
          nodeType: 'unordered-list',
          content: [
            { nodeType: 'list-item', content: [{ nodeType: 'paragraph', content: [{ nodeType: 'text', value: 'Find the ONT' }] }] },
          ],
        },
        { nodeType: 'paragraph', content: [{ nodeType: 'text', value: 'Then ' }, { nodeType: 'text', value: 'restart   it.' }] },
      ],
    };

    expect(richTextToPlain(doc)).toBe('Before you start\nFind the ONT\nThen restart it.');
    expect(richTextToPlain(richText('', '  '))).toBe('');
    expect(richTextToPlain(undefined)).toBe('');
  });
});
```

## apps/portal-support/contentful-sync/test/server.test.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/test/server.test.ts`.

```typescript
import request from 'supertest';
import { createApp } from '../src/server';
import { SyncService } from '../src/sync/syncService';
import { canonicalRequest, sign } from '../src/webhooks/signature';
import { silentLogger } from './fixtures';

const SECRET = 'server-test-secret-abcdef0123456789';
const SIGNED = ['x-contentful-timestamp', 'x-contentful-topic'];

function headersFor(body: string, topic: string, timestamp = Date.now()): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/vnd.contentful.management.v1+json',
    'x-contentful-topic': topic,
    'x-contentful-timestamp': String(timestamp),
    'x-contentful-signed-headers': SIGNED.join(','),
  };
  headers['x-contentful-signature'] = sign(
    canonicalRequest({ method: 'POST', path: '/webhooks/contentful', headers, rawBody: body }, SIGNED),
    SECRET,
  );
  return headers;
}

describe('webhook endpoint', () => {
  const trigger = jest.fn().mockResolvedValue({});
  const app = createApp({
    sync: { trigger } as unknown as SyncService,
    webhook: { secret: SECRET, maxAgeSeconds: 300 },
    logger: silentLogger(),
  });
  const body = JSON.stringify({ sys: { id: 'art1', type: 'Entry' } });

  beforeEach(() => trigger.mockClear());

  it('accepts a signed publish event and triggers a sync', async () => {
    const res = await request(app).post('/webhooks/contentful').set(headersFor(body, 'ContentManagement.Entry.publish')).send(body);

    expect(res.status).toBe(202);
    expect(res.headers['x-correlation-id']).toBeDefined();
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('acknowledges irrelevant topics without syncing', async () => {
    const res = await request(app).post('/webhooks/contentful').set(headersFor(body, 'ContentManagement.Entry.save')).send(body);

    expect(res.status).toBe(204);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('rejects bad signatures with an RFC 7807 problem and echoes the correlation id', async () => {
    const headers = { ...headersFor(body, 'ContentManagement.Entry.publish'), 'x-correlation-id': 'corr-abc-12345' };
    const res = await request(app).post('/webhooks/contentful').set(headers).send(body.replace('art1', 'art9'));

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 401, title: 'Unauthorized', correlationId: 'corr-abc-12345' });
    expect(trigger).not.toHaveBeenCalled();
  });

  it('returns problem+json for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.instance).toBe('/nope');
  });
});
```

## apps/portal-support/contentful-sync/test/signature.test.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/test/signature.test.ts`.

```typescript
import { canonicalRequest, IncomingWebhook, sign, verifyWebhook } from '../src/webhooks/signature';

const SECRET = 'test-webhook-secret-0123456789abcdef';
const NOW = 1_780_000_000_000;

function signedRequest(body: string, overrides: Partial<IncomingWebhook> = {}, timestamp = NOW): IncomingWebhook {
  const req: IncomingWebhook = {
    method: 'POST',
    path: '/webhooks/contentful',
    rawBody: body,
    headers: {
      'content-type': 'application/vnd.contentful.management.v1+json',
      'x-contentful-topic': 'ContentManagement.Entry.publish',
      'x-contentful-timestamp': String(timestamp),
      'x-contentful-signed-headers': 'x-contentful-timestamp,x-contentful-topic',
    },
    ...overrides,
  };
  req.headers['x-contentful-signature'] = sign(canonicalRequest(req, ['x-contentful-timestamp', 'x-contentful-topic']), SECRET);
  return req;
}

describe('verifyWebhook', () => {
  const body = JSON.stringify({ sys: { id: 'art1', type: 'Entry' } });

  it('accepts a correctly signed, fresh request', () => {
    expect(verifyWebhook(signedRequest(body), SECRET, 300, NOW)).toEqual({ ok: true });
  });

  it('builds the canonical form from method, path, signed headers and body', () => {
    const req = signedRequest('{}');
    expect(canonicalRequest(req, ['x-contentful-topic'])).toBe('POST\n/webhooks/contentful\nx-contentful-topic:ContentManagement.Entry.publish\n{}');
  });

  it('rejects a tampered body', () => {
    const req = signedRequest(body);
    req.rawBody = body.replace('art1', 'art2');
    expect(verifyWebhook(req, SECRET, 300, NOW)).toEqual({ ok: false, reason: 'signature mismatch' });
  });

  it('rejects a tampered signed header', () => {
    const req = signedRequest(body);
    req.headers['x-contentful-topic'] = 'ContentManagement.Entry.delete';
    expect(verifyWebhook(req, SECRET, 300, NOW).ok).toBe(false);
  });

  it('rejects the wrong secret and malformed signatures without throwing', () => {
    expect(verifyWebhook(signedRequest(body), 'another-secret', 300, NOW).ok).toBe(false);
    const req = signedRequest(body);
    req.headers['x-contentful-signature'] = 'not-hex';
    expect(verifyWebhook(req, SECRET, 300, NOW)).toEqual({ ok: false, reason: 'signature mismatch' });
  });

  it('rejects replays outside the tolerance window', () => {
    const old = signedRequest(body, {}, NOW - 301_000);
    expect(verifyWebhook(old, SECRET, 300, NOW)).toEqual({ ok: false, reason: 'timestamp outside tolerance' });
  });

  it('requires the timestamp to be covered by the signature', () => {
    const req = signedRequest(body);
    req.headers['x-contentful-signed-headers'] = 'x-contentful-topic';
    req.headers['x-contentful-signature'] = sign(canonicalRequest(req, ['x-contentful-topic']), SECRET);
    expect(verifyWebhook(req, SECRET, 300, NOW)).toEqual({ ok: false, reason: 'timestamp not covered by signature' });
  });

  it('rejects requests with missing headers', () => {
    expect(verifyWebhook({ method: 'POST', path: '/', headers: {}, rawBody: '' }, SECRET, 300, NOW)).toEqual({
      ok: false,
      reason: 'missing signature headers',
    });
  });
});
```

## apps/portal-support/contentful-sync/test/syncService.test.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/test/syncService.test.ts`.

```typescript
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
```

## apps/portal-support/contentful-sync/test/validate.test.ts

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: typescript. Path: `apps/portal-support/contentful-sync/test/validate.test.ts`.

```typescript
import { PlanCopyDocument, PromoBannerDocument } from '../src/model/document';
import { normaliseEntry } from '../src/model/normalise';
import { isAllowedCtaUrl, validateDocument } from '../src/model/validate';
import { articleEntry } from './fixtures';

const fields = (doc: Parameters<typeof validateDocument>[0]): string[] => validateDocument(doc).map((i) => i.field);

const plan = (overrides: Partial<PlanCopyDocument> = {}): PlanCopyDocument => ({
  id: 'p:en-US',
  entryId: 'p',
  locale: 'en-US',
  revision: 3,
  updatedAt: '2026-04-02T10:30:00.000Z',
  kind: 'planCopy',
  planCode: 'FIBRE_500',
  headline: 'Fast fibre',
  tagline: 'Symmetric 500 Mbps',
  features: ['No data caps'],
  downMbps: 500,
  upMbps: 500,
  monthlyPrice: { amountMinor: 4999, currency: 'USD' },
  promoPrice: null,
  ...overrides,
});

const banner = (overrides: Partial<PromoBannerDocument> = {}): PromoBannerDocument => ({
  id: 'b:en-US',
  entryId: 'b',
  locale: 'en-US',
  revision: 1,
  updatedAt: '2026-04-02T10:30:00.000Z',
  kind: 'promoBanner',
  message: 'Switch and save',
  ctaLabel: 'See plans',
  ctaUrl: 'https://www.uniti.example/plans',
  startsAt: '2026-04-01T00:00:00.000Z',
  endsAt: '2026-05-01T00:00:00.000Z',
  audience: 'all',
  priority: 1,
  ...overrides,
});

describe('validateDocument', () => {
  it('accepts a complete help article', () => {
    const [doc] = normaliseEntry(articleEntry(), 'en-US');
    expect(validateDocument(doc!)).toEqual([]);
  });

  it('flags articles without topics, with bad slugs or thin bodies', () => {
    const [doc] = normaliseEntry(articleEntry('a2', { slug: 'Reset router!', topics: [], body: 'Too short.' }), 'en-US');
    expect(fields(doc!)).toEqual(['slug', 'body', 'topics']);
  });

  it('accepts a valid plan and rejects missing prices', () => {
    expect(validateDocument(plan())).toEqual([]);
    expect(fields(plan({ monthlyPrice: { amountMinor: Number.NaN, currency: 'USD' } }))).toEqual(['monthlyPrice']);
  });

  it('rejects upload faster than download and promos that are not discounts', () => {
    expect(fields(plan({ upMbps: 1000 }))).toEqual(['upMbps']);
    expect(fields(plan({ promoPrice: { amountMinor: 4999, currency: 'USD', months: 36 } }))).toEqual(['promoPrice', 'promoMonths']);
  });

  it('requires banners to end after they start and to link only to Uniti sites', () => {
    expect(validateDocument(banner())).toEqual([]);
    expect(fields(banner({ endsAt: '2026-03-01T00:00:00.000Z' }))).toEqual(['endsAt']);
    expect(fields(banner({ ctaUrl: 'https://uniti.example.evil.test/x' }))).toEqual(['ctaUrl']);
    expect(fields(banner({ ctaLabel: null }))).toEqual(['ctaUrl']);
  });
});

describe('isAllowedCtaUrl', () => {
  it.each([
    ['/plans/fibre-1g', true],
    ['https://uniti.example/offers', true],
    ['https://shop.uniti.example/cart', true],
    ['//evil.test/x', false],
    ['http://uniti.example/offers', false],
    ['javascript:alert(1)', false],
    ['https://uniti.example.evil.test', false],
  ])('%s -> %p', (url, expected) => {
    expect(isAllowedCtaUrl(url)).toBe(expected);
  });
});
```

## apps/portal-support/contentful-sync/tsconfig.json

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: json. Path: `apps/portal-support/contentful-sync/tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

## apps/portal-support/wordpress-plugin/uniti-support/assets/availability.js

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: javascript. Path: `apps/portal-support/wordpress-plugin/uniti-support/assets/availability.js`.

```javascript
/* global UnitiAvailability */
(function () {
  'use strict';

  function text(tag, value) {
    var el = document.createElement(tag);
    el.textContent = value;
    return el;
  }

  function renderResult(container, data) {
    container.replaceChildren();
    if (!data.serviceable) {
      container.appendChild(text('p', UnitiAvailability.messages.unavailable));
      return;
    }
    var list = document.createElement('ul');
    data.plans.forEach(function (plan) {
      list.appendChild(text('li', plan.name + ' - ' + plan.speed + ' - ' + plan.price));
    });
    container.appendChild(list);
    if (data.installWindow) {
      container.appendChild(text('p', 'Earliest installation: ' + data.installWindow));
    }
  }

  function renderErrors(form, container, payload) {
    container.replaceChildren();
    var errors = (payload && payload.errors) || {};
    Object.keys(errors).forEach(function (field) {
      var input = form.querySelector('[name="' + field + '"]');
      if (input) {
        input.setAttribute('aria-invalid', 'true');
      }
      container.appendChild(text('p', errors[field]));
    });
    if (!Object.keys(errors).length) {
      container.appendChild(text('p', (payload && payload.message) || UnitiAvailability.messages.error));
    }
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form.classList || !form.classList.contains('uniti-availability')) {
      return;
    }
    event.preventDefault();
    var result = form.querySelector('.uniti-availability__result');
    form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    result.replaceChildren(text('p', UnitiAvailability.messages.checking));

    var body = new FormData(form);
    body.append('action', UnitiAvailability.action);
    body.append('nonce', UnitiAvailability.nonce);

    fetch(UnitiAvailability.ajaxUrl, { method: 'POST', body: body, credentials: 'same-origin' })
      .then(function (response) { return response.json(); })
      .then(function (json) {
        if (json.success) {
          renderResult(result, json.data);
        } else {
          renderErrors(form, result, json.data);
        }
      })
      .catch(function () { renderErrors(form, result, null); });
  });
})();
```

## apps/portal-support/wordpress-plugin/uniti-support/composer.json

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: json. Path: `apps/portal-support/wordpress-plugin/uniti-support/composer.json`.

```json
{
    "name": "uniti/wp-uniti-support",
    "description": "Uniti Support WordPress plugin: status banner, availability checker, knowledge base",
    "type": "wordpress-plugin",
    "license": "proprietary",
    "require": {
        "php": "^8.1"
    },
    "require-dev": {
        "phpunit/phpunit": "^10.5",
        "squizlabs/php_codesniffer": "^3.9",
        "wp-coding-standards/wpcs": "^3.1"
    },
    "autoload": {
        "psr-4": {
            "Uniti\Support\\": "src/"
        }
    },
    "autoload-dev": {
        "psr-4": {
            "Uniti\Support\Tests\\": "tests/"
        }
    },
    "scripts": {
        "test": "phpunit",
        "lint": "phpcs --standard=WordPress-Extra src uninstall.php uniti-support.php"
    },
    "config": {
        "allow-plugins": {
            "dealerdirect/phpcodesniffer-composer-installer": true
        }
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/phpunit.xml

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: xml. Path: `apps/portal-support/wordpress-plugin/uniti-support/phpunit.xml`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true">
    <testsuites>
        <testsuite name="Unit">
            <directory>tests/Unit</directory>
        </testsuite>
    </testsuites>
    <source>
        <include>
            <directory>src</directory>
        </include>
    </source>
</phpunit>
```

## apps/portal-support/wordpress-plugin/uniti-support/src/ApiClient.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/src/ApiClient.php`.

```php
<?php

declare(strict_types=1);

namespace Uniti\Support;

use Uniti\Support\Settings\Options;

/**
 * Minimal JSON client for the Uniti public content API. Sends a
 * correlation id on every call and logs failures as single-line JSON so
 * they can be shipped alongside the other platform logs.
 */
final class ApiClient
{
    public function __construct(private readonly Options $options)
    {
    }

    /**
     * @param array<string, scalar> $query
     * @return array<string, mixed>|null Decoded body, or null on any failure.
     */
    public function get(string $path, array $query = [], int $timeoutSeconds = 4): ?array
    {
        $base = $this->options->get('api_base_url');
        if ($base === '') {
            return null;
        }

        $url = add_query_arg(array_map('rawurlencode', array_map('strval', $query)), rtrim($base, '/') . '/' . ltrim($path, '/'));
        $correlationId = wp_generate_uuid4();
        $headers = ['Accept' => 'application/json', 'X-Correlation-Id' => $correlationId];
        $apiKey = $this->options->get('api_key');
        if ($apiKey !== '') {
            $headers['Authorization'] = 'Bearer ' . $apiKey;
        }

        $response = wp_remote_get($url, ['timeout' => $timeoutSeconds, 'headers' => $headers, 'redirection' => 0]);
        if (is_wp_error($response)) {
            self::log('api.transport_error', ['path' => $path, 'correlationId' => $correlationId, 'error' => $response->get_error_message()]);

            return null;
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $decoded = json_decode((string) wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || !is_array($decoded)) {
            self::log('api.bad_response', ['path' => $path, 'correlationId' => $correlationId, 'status' => $status]);

            return null;
        }

        return $decoded;
    }

    /**
     * @param array<string, mixed> $context
     */
    public static function log(string $event, array $context = []): void
    {
        error_log((string) wp_json_encode(['level' => 'warning', 'event' => $event, 'time' => gmdate('Y-m-d\TH:i:s\Z')] + $context));
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/src/Availability/AddressNormaliser.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/src/Availability/AddressNormaliser.php`.

```php
<?php

declare(strict_types=1);

namespace Uniti\Support\Availability;

/**
 * Pure validation/normalisation of the availability form and formatting of
 * the API answer. Returns either a normalised address or field errors.
 */
final class AddressNormaliser
{
    private const STREET_SUFFIXES = [
        'STREET' => 'ST', 'AVENUE' => 'AVE', 'ROAD' => 'RD', 'DRIVE' => 'DR', 'LANE' => 'LN',
        'BOULEVARD' => 'BLVD', 'COURT' => 'CT', 'PLACE' => 'PL', 'TERRACE' => 'TER', 'HIGHWAY' => 'HWY',
    ];

    /**
     * @param array<string, mixed> $input Already unslashed form input.
     * @return array{address: ?array{line1: string, unit: ?string, zip: string}, errors: array<string, string>}
     */
    public function normalise(array $input): array
    {
        $errors = [];
        $line1 = $this->collapse((string) ($input['line1'] ?? ''));
        $unit = $this->collapse((string) ($input['unit'] ?? ''));
        $zip = preg_replace('/\s+/', '', (string) ($input['zip'] ?? '')) ?? '';

        if ($line1 === '' || mb_strlen($line1) > 120) {
            $errors['line1'] = 'Enter your street address.';
        } elseif (preg_match('/^\d+[A-Z]?\s+\S+/u', strtoupper($line1)) !== 1) {
            $errors['line1'] = 'Start with the house number, for example "120 Main Street".';
        }

        if (preg_match('/^\d{5}(-\d{4})?$/', $zip) !== 1) {
            $errors['zip'] = 'Enter a 5-digit ZIP code.';
        }

        if (mb_strlen($unit) > 20 || preg_match('/^[A-Za-z0-9 #-]*$/', $unit) !== 1) {
            $errors['unit'] = 'Apartment or unit may contain letters, numbers, spaces, # and -.';
        }

        if ($errors !== []) {
            return ['address' => null, 'errors' => $errors];
        }

        return [
            'address' => [
                'line1' => $this->abbreviateSuffix(strtoupper($line1)),
                'unit' => $unit === '' ? null : strtoupper(ltrim($unit, '# ')),
                'zip' => substr($zip, 0, 5),
            ],
            'errors' => [],
        ];
    }

    /**
     * @param array<string, mixed> $response Availability API body.
     * @return array{serviceable: bool, plans: list<array{name: string, speed: string, price: string}>, installWindow: ?string}
     */
    public function summarise(array $response): array
    {
        $plans = [];
        foreach ((array) ($response['plans'] ?? []) as $plan) {
            if (!is_array($plan) || !isset($plan['name'], $plan['downMbps'], $plan['monthlyPrice']['amountMinor'], $plan['monthlyPrice']['currency'])) {
                continue;
            }
            $plans[] = [
                'name' => (string) $plan['name'],
                'speed' => self::speed((int) $plan['downMbps']),
                'price' => self::money((int) $plan['monthlyPrice']['amountMinor'], (string) $plan['monthlyPrice']['currency']) . '/mo',
                'sort' => (int) $plan['downMbps'],
            ];
        }
        usort($plans, static fn (array $a, array $b) => $a['sort'] <=> $b['sort']);

        return [
            'serviceable' => ($response['status'] ?? '') === 'SERVICEABLE' && $plans !== [],
            'plans' => array_map(static fn (array $p) => array_diff_key($p, ['sort' => true]), $plans),
            'installWindow' => isset($response['earliestInstallDate']) ? (string) $response['earliestInstallDate'] : null,
        ];
    }

    public static function speed(int $mbps): string
    {
        return $mbps >= 1000 && $mbps % 1000 === 0 ? ($mbps / 1000) . ' Gbps' : $mbps . ' Mbps';
    }

    public static function money(int $amountMinor, string $currency): string
    {
        $symbol = ['USD' => '$', 'CAD' => 'CA$', 'GBP' => '£', 'EUR' => '€'][strtoupper($currency)] ?? strtoupper($currency) . ' ';
        $sign = $amountMinor < 0 ? '-' : '';
        $abs = abs($amountMinor);

        return sprintf('%s%s%s.%02d', $sign, $symbol, number_format(intdiv($abs, 100)), $abs % 100);
    }

    private function collapse(string $value): string
    {
        return trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    }

    private function abbreviateSuffix(string $line1): string
    {
        $words = explode(' ', $line1);
        $last = count($words) - 1;
        $words[$last] = self::STREET_SUFFIXES[rtrim($words[$last], '.')] ?? $words[$last];

        return implode(' ', $words);
    }
}
```
