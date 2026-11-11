# Customer support chatbot: apps/chatbot (part 1 of 4)

- **Application:** Customer support chatbot
- **Tech stack:** Node.js (Express, TypeScript)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 16

## Files

- `apps/chatbot/.env.example` (40 lines)
- `apps/chatbot/Dockerfile` (22 lines)
- `apps/chatbot/package.json` (45 lines)
- `apps/chatbot/src/analytics/analyticsEmitter.test.ts` (59 lines)
- `apps/chatbot/src/analytics/analyticsEmitter.ts` (141 lines)
- `apps/chatbot/src/app.ts` (124 lines)
- `apps/chatbot/src/clients/httpClient.test.ts` (75 lines)
- `apps/chatbot/src/clients/httpClient.ts` (159 lines)
- `apps/chatbot/src/clients/platformClients.ts` (212 lines)
- `apps/chatbot/src/config.ts` (146 lines)
- `apps/chatbot/src/conversation/conversationService.ts` (243 lines)
- `apps/chatbot/src/dialog/dialogEngine.test.ts` (107 lines)
- `apps/chatbot/src/dialog/dialogEngine.ts` (237 lines)
- `apps/chatbot/src/dialog/flows/agentHandoff.test.ts` (75 lines)
- `apps/chatbot/src/dialog/flows/agentHandoff.ts` (125 lines)
- `apps/chatbot/src/dialog/flows/billEnquiry.test.ts` (125 lines)

## apps/chatbot/.env.example

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: bash. Path: `apps/chatbot/.env.example`.

```bash
# HTTP / WebSocket
PORT=8080
NODE_ENV=development
LOG_LEVEL=info

# OIDC bearer token validation (RS256 public key or HS256 shared secret for local dev)
JWT_ISSUER=https://login.uniti.example/realms/selfcare
JWT_AUDIENCE=uniti-chatbot
JWT_PUBLIC_KEY=
JWT_SHARED_SECRET=change-me-local-only

# Downstream platform APIs
ACCOUNT_API_BASE_URL=http://localhost:8101/api/v1
BILLING_API_BASE_URL=http://localhost:8102/api/v1
TICKET_API_BASE_URL=http://localhost:8103/api/v1
NETWORK_API_BASE_URL=http://localhost:8104/api/v1
DOWNSTREAM_TIMEOUT_MS=4000
DOWNSTREAM_RETRIES=2

# Intent classification
NLU_MIN_CONFIDENCE=0.55
LLM_PROVIDER=none
LLM_ENDPOINT=
LLM_API_KEY=
LLM_MODEL=
LLM_TIMEOUT_MS=3000

# Sessions & rate limiting
SESSION_TTL_SECONDS=1800
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_MESSAGES=30

# Analytics sink (HTTP collector); leave blank to log only
ANALYTICS_ENDPOINT=
ANALYTICS_BATCH_SIZE=25
ANALYTICS_FLUSH_INTERVAL_MS=5000

# Allowed widget origins (comma separated)
WIDGET_ALLOWED_ORIGINS=http://localhost:5173,https://selfcare.uniti.example
```

## apps/chatbot/Dockerfile

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: dockerfile. Path: `apps/chatbot/Dockerfile`.

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S chatbot && adduser -S chatbot -G chatbot
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER chatbot
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/v1/health/live || exit 1
CMD ["node", "dist/server.js"]
```

## apps/chatbot/package.json

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: json. Path: `apps/chatbot/package.json`.

```json
{
  "name": "@uniti/chatbot",
  "version": "1.0.0",
  "private": true,
  "description": "Uniti customer support chatbot service (REST + WebSocket gateway)",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "ws": "^8.17.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.14.2",
    "@types/supertest": "^6.0.2",
    "@types/ws": "^8.5.10",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.4",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4.5"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "roots": ["<rootDir>/src"],
    "testMatch": ["**/*.test.ts"],
    "collectCoverageFrom": ["src/**/*.ts", "!src/**/*.test.ts", "!src/server.ts"]
  }
}
```

## apps/chatbot/src/analytics/analyticsEmitter.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/analytics/analyticsEmitter.test.ts`.

```typescript
import { silentLogger } from '../logger';
import { AnalyticsEvent, BatchingAnalytics, hashUserId } from './analyticsEmitter';

function setup(batchSize = 3, transport = jest.fn<Promise<void>, [AnalyticsEvent[]]>(async () => undefined), maxBuffer?: number) {
  const analytics = new BatchingAnalytics({ transport, batchSize, flushIntervalMs: 0, logger: silentLogger, maxBuffer });
  return { analytics, transport };
}

describe('BatchingAnalytics', () => {
  it('hashes user ids deterministically and never sends the raw id', async () => {
    const { analytics, transport } = setup(1);
    analytics.track('message_received', 'c1', 'user-123');
    await analytics.flush();
    const sent = transport.mock.calls[0][0][0];
    expect(sent.userHash).toBe(hashUserId('user-123'));
    expect(JSON.stringify(sent)).not.toContain('user-123');
  });

  it('flushes automatically when the batch size is reached', async () => {
    const { analytics, transport } = setup(2);
    analytics.track('flow_started', 'c1', 'u');
    expect(transport).not.toHaveBeenCalled();
    analytics.track('flow_completed', 'c1', 'u');
    await analytics.flush();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0].map((e) => e.name)).toEqual(['flow_started', 'flow_completed']);
  });

  it('redacts PII in event properties', async () => {
    const { analytics, transport } = setup(10);
    analytics.track('fallback', 'c1', 'u', { utterance: 'email me at a@b.com' });
    await analytics.flush();
    expect(transport.mock.calls[0][0][0].properties.utterance).toBe('email me at [EMAIL]');
  });

  it('requeues a failed batch for the next flush', async () => {
    const transport = jest
      .fn<Promise<void>, [AnalyticsEvent[]]>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(undefined);
    const { analytics } = setup(10, transport);
    analytics.track('fallback', 'c1', 'u');
    await analytics.flush();
    expect(analytics.pending).toBe(1);
    await analytics.flush();
    expect(analytics.pending).toBe(0);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('drops the oldest events beyond the buffer limit', async () => {
    const transport = jest.fn<Promise<void>, [AnalyticsEvent[]]>().mockRejectedValue(new Error('down'));
    const { analytics } = setup(100, transport, 3);
    for (let i = 0; i < 5; i += 1) analytics.track('message_received', `c${i}`, 'u');
    expect(analytics.pending).toBe(3);
    await analytics.close();
    expect(analytics.pending).toBe(3);
  });
});
```

## apps/chatbot/src/analytics/analyticsEmitter.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/analytics/analyticsEmitter.ts`.

```typescript
import { createHash } from 'crypto';
import { Logger } from '../logger';
import { redactPayload } from '../privacy/piiRedactor';

/**
 * Analytics events for chatbot funnel reporting (Snowflake via the HTTP collector).
 * Events are batched, PII-redacted, and carry a hashed user id only.
 */

export type AnalyticsEventName =
  | 'conversation_started'
  | 'message_received'
  | 'intent_classified'
  | 'flow_started'
  | 'flow_completed'
  | 'flow_abandoned'
  | 'flow_suspended'
  | 'fallback'
  | 'handoff_requested'
  | 'rate_limited'
  | 'conversation_ended';

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  conversationId: string;
  userHash: string;
  timestamp: string;
  properties: Record<string, string | number | boolean | undefined>;
}

export interface AnalyticsSink {
  track(name: AnalyticsEventName, conversationId: string, userId: string, properties?: AnalyticsEvent['properties']): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export type Transport = (events: AnalyticsEvent[]) => Promise<void>;

export function hashUserId(userId: string, salt = 'uniti-chatbot'): string {
  return createHash('sha256').update(`${salt}:${userId}`).digest('hex').slice(0, 32);
}

export interface BatchingAnalyticsOptions {
  transport: Transport;
  batchSize: number;
  flushIntervalMs: number;
  logger: Logger;
  /** Maximum buffered events; oldest are dropped beyond this (backpressure). */
  maxBuffer?: number;
  clock?: () => Date;
}

export class BatchingAnalytics implements AnalyticsSink {
  private buffer: AnalyticsEvent[] = [];
  private timer?: NodeJS.Timeout;
  private flushing?: Promise<void>;
  private dropped = 0;
  private readonly maxBuffer: number;
  private readonly clock: () => Date;

  constructor(private readonly options: BatchingAnalyticsOptions) {
    this.maxBuffer = options.maxBuffer ?? options.batchSize * 40;
    this.clock = options.clock ?? (() => new Date());
    if (options.flushIntervalMs > 0) {
      this.timer = setInterval(() => void this.flush(), options.flushIntervalMs);
      this.timer.unref();
    }
  }

  track(name: AnalyticsEventName, conversationId: string, userId: string, properties: AnalyticsEvent['properties'] = {}): void {
    this.buffer.push({
      name,
      conversationId,
      userHash: hashUserId(userId),
      timestamp: this.clock().toISOString(),
      properties: redactPayload(properties),
    });
    if (this.buffer.length > this.maxBuffer) {
      const overflow = this.buffer.length - this.maxBuffer;
      this.buffer.splice(0, overflow);
      this.dropped += overflow;
    }
    if (this.buffer.length >= this.options.batchSize) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.options.batchSize);
    this.flushing = this.options
      .transport(batch)
      .catch((error) => {
        // Requeue at the front so ordering is preserved for the next attempt.
        this.buffer.unshift(...batch);
        this.options.logger.warn('analytics flush failed', { error, events: batch.length });
      })
      .finally(() => {
        this.flushing = undefined;
      });
    await this.flushing;
    if (this.dropped > 0) {
      this.options.logger.warn('analytics events dropped due to backpressure', { dropped: this.dropped });
      this.dropped = 0;
    }
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    let guard = 0;
    while (this.buffer.length > 0 && guard < 100) {
      const before = this.buffer.length;
      await this.flush();
      if (this.buffer.length >= before) break;
      guard += 1;
    }
  }

  get pending(): number {
    return this.buffer.length;
  }
}

/** HTTP transport posting JSON batches to the collector. */
export function httpTransport(endpoint: string, fetchImpl: typeof fetch = fetch): Transport {
  return async (events) => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'chatbot', events }),
    });
    if (!response.ok) throw new Error(`collector responded ${response.status}`);
  };
}

/** Transport that writes events to the structured log (used when no collector is configured). */
export function logTransport(logger: Logger): Transport {
  return async (events) => {
    for (const event of events) logger.info('analytics_event', { event });
  };
}
```

## apps/chatbot/src/app.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/app.ts`.

```typescript
import express, { Express } from 'express';
import { AnalyticsSink, BatchingAnalytics, httpTransport, logTransport } from './analytics/analyticsEmitter';
import { HttpClient } from './clients/httpClient';
import { HttpAccountClient, HttpBillingClient, HttpNetworkClient, HttpTicketClient, PlatformClients } from './clients/platformClients';
import { AppConfig } from './config';
import { ConversationService, HandoffPublisher } from './conversation/conversationService';
import { DialogEngine } from './dialog/dialogEngine';
import { defaultFlowRegistry } from './dialog/flows';
import { TranscriptEntry } from './domain/types';
import { correlationId, notFoundHandler, problemHandler, requestLogger } from './http/middleware';
import { conversationRoutes, HealthCheck, healthRoutes } from './http/routes';
import { Logger } from './logger';
import { CompositeIntentClassifier, IntentClassifier } from './nlu/intentClassifier';
import { HttpLlmProvider, LlmIntentProvider, NullLlmProvider } from './nlu/llmProvider';
import { RulesMatcher } from './nlu/rulesMatcher';
import { SlidingWindowRateLimiter } from './ratelimit/rateLimiter';
import { ConversationRepository, InMemoryConversationRepository } from './session/conversationRepository';
import { InMemoryTranscriptRepository, TranscriptRepository } from './transcripts/transcriptRepository';

/**
 * Composition root. Builds the object graph from configuration; every
 * dependency can be overridden (tests inject fakes for clients/clock).
 */

export interface AppOverrides {
  clients?: PlatformClients;
  llm?: LlmIntentProvider;
  classifier?: IntentClassifier;
  repository?: ConversationRepository;
  transcripts?: TranscriptRepository;
  analytics?: AnalyticsSink;
  handoff?: HandoffPublisher;
  clock?: () => Date;
  onAgentMessage?: (entry: TranscriptEntry) => void;
}

export interface Application {
  app: Express;
  service: ConversationService;
  limiter: SlidingWindowRateLimiter;
  analytics: AnalyticsSink;
  repository: ConversationRepository;
  transcripts: TranscriptRepository;
}

export function buildClients(config: AppConfig, logger: Logger): PlatformClients {
  const make = (serviceName: string, baseUrl: string) =>
    new HttpClient({ serviceName, baseUrl, timeoutMs: config.downstream.timeoutMs, retries: config.downstream.retries, logger });
  return {
    account: new HttpAccountClient(make('account-api', config.downstream.accountBaseUrl)),
    billing: new HttpBillingClient(make('billing-api', config.downstream.billingBaseUrl)),
    tickets: new HttpTicketClient(make('ticket-api', config.downstream.ticketBaseUrl)),
    network: new HttpNetworkClient(make('network-api', config.downstream.networkBaseUrl)),
  };
}

export function buildLlm(config: AppConfig, logger: Logger): LlmIntentProvider {
  if (config.llm.provider === 'http' && config.llm.endpoint) {
    return new HttpLlmProvider({
      endpoint: config.llm.endpoint,
      apiKey: config.llm.apiKey,
      model: config.llm.model,
      timeoutMs: config.llm.timeoutMs,
      logger,
    });
  }
  return new NullLlmProvider();
}

const loggingHandoff = (logger: Logger): HandoffPublisher => ({
  async publish(conversation) {
    logger.info('handoff requested', { conversationId: conversation.id, queue: conversation.handoff?.queue });
  },
});

export function createApplication(config: AppConfig, logger: Logger, overrides: AppOverrides = {}): Application {
  const clients = overrides.clients ?? buildClients(config, logger);
  const classifier =
    overrides.classifier ??
    new CompositeIntentClassifier({
      rules: new RulesMatcher(),
      llm: overrides.llm ?? buildLlm(config, logger),
      minConfidence: config.nluMinConfidence,
      logger,
    });
  const repository = overrides.repository ?? new InMemoryConversationRepository(config.sessionTtlSeconds);
  const transcripts = overrides.transcripts ?? new InMemoryTranscriptRepository();
  const analytics =
    overrides.analytics ??
    new BatchingAnalytics({
      transport: config.analytics.endpoint ? httpTransport(config.analytics.endpoint) : logTransport(logger),
      batchSize: config.analytics.batchSize,
      flushIntervalMs: config.analytics.flushIntervalMs,
      logger,
    });
  const engine = new DialogEngine({ flows: defaultFlowRegistry(overrides.clock), clients, logger, clock: overrides.clock });
  const service = new ConversationService({
    repository,
    transcripts,
    classifier,
    engine,
    analytics,
    handoff: overrides.handoff ?? loggingHandoff(logger),
    logger,
    clock: overrides.clock,
  });
  const limiter = new SlidingWindowRateLimiter(config.rateLimit.windowMs, config.rateLimit.maxMessages);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(correlationId());
  app.use(requestLogger(logger));
  app.use(express.json({ limit: '16kb' }));

  const checks: HealthCheck[] = [{ name: 'conversation-store', check: async () => (await repository.purgeExpired()) >= 0 }];
  app.use('/api/v1', healthRoutes(checks));
  app.use('/api/v1', conversationRoutes(service, config.auth, limiter, overrides.onAgentMessage));
  app.use(notFoundHandler());
  app.use(problemHandler(logger));

  return { app, service, limiter, analytics, repository, transcripts };
}
```

## apps/chatbot/src/clients/httpClient.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/clients/httpClient.test.ts`.

```typescript
import { DownstreamError } from '../domain/errors';
import { silentLogger } from '../logger';
import { backoffDelay, Fetcher, HttpClient, HttpResponse } from './httpClient';

function response(status: number, body: unknown = {}): HttpResponse {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body };
}

function client(fetcher: Fetcher, retries = 2) {
  return new HttpClient({
    serviceName: 'billing',
    baseUrl: 'https://billing.test/api/v1/',
    timeoutMs: 1000,
    retries,
    logger: silentLogger,
    fetcher,
    sleep: async () => undefined,
  });
}

const ctx = { correlationId: 'corr-1', bearerToken: 'tok' };

describe('HttpClient', () => {
  it('builds URLs with query params and propagates headers', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>(async () => response(200, { ok: 1 }));
    await client(fetcher).get('/invoices', ctx, { page: 1, pageSize: 5, status: undefined });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://billing.test/api/v1/invoices?page=1&pageSize=5');
    expect(init.headers['X-Correlation-Id']).toBe('corr-1');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('retries idempotent requests on 503 then succeeds', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, { value: 42 }));
    await expect(client(fetcher).get<{ value: number }>('/x', ctx)).resolves.toEqual({ value: 42 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not retry client errors', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>(async () => response(404, { detail: 'no such invoice' }));
    await expect(client(fetcher).get('/x', ctx)).rejects.toThrow('no such invoice');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-idempotent POST without an idempotency key', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>(async () => response(500));
    await expect(client(fetcher).post('/tickets', ctx, { a: 1 })).rejects.toBeInstanceOf(DownstreamError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries POST when an idempotency key is supplied', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>(async () => response(500));
    await expect(client(fetcher, 2).post('/tickets', ctx, { a: 1 }, 'key-1')).rejects.toBeInstanceOf(DownstreamError);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('key-1');
  });

  it('wraps network errors as retryable downstream errors', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>(async () => {
      throw new Error('ECONNRESET');
    });
    await expect(client(fetcher, 1).get('/x', ctx)).rejects.toThrow('billing: ECONNRESET');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('computes bounded jittered backoff', () => {
    expect(backoffDelay(0, 100, 1000, () => 0)).toBe(50);
    expect(backoffDelay(3, 100, 1000, () => 1)).toBe(800);
    expect(backoffDelay(10, 100, 1000, () => 1)).toBe(1000);
  });
});
```

## apps/chatbot/src/clients/httpClient.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/clients/httpClient.ts`.

```typescript
import { DownstreamError } from '../domain/errors';
import { Logger } from '../logger';

/**
 * Minimal JSON HTTP client for downstream platform APIs.
 * - Propagates X-Correlation-Id and the caller's bearer token.
 * - Applies a per-attempt timeout and retries idempotent requests with
 *   exponential backoff + jitter on network errors, 5xx and 429.
 */

export interface RequestContext {
  correlationId: string;
  bearerToken?: string;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type Fetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
) => Promise<HttpResponse>;

export interface HttpClientOptions {
  serviceName: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  logger: Logger;
  fetcher?: Fetcher;
  /** Injected for tests so backoff does not slow the suite. */
  sleep?: (ms: number) => Promise<void>;
}

const IDEMPOTENT = new Set(['GET', 'PUT', 'DELETE', 'HEAD']);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function backoffDelay(attempt: number, baseMs = 150, capMs = 2000, random: () => number = Math.random): number {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + random() * (exp / 2));
}

export class HttpClient {
  private readonly fetcher: Fetcher;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: HttpClientOptions) {
    this.fetcher = options.fetcher ?? (globalThis.fetch as unknown as Fetcher);
    this.sleep = options.sleep ?? defaultSleep;
  }

  get<T>(path: string, ctx: RequestContext, query?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>('GET', path, ctx, undefined, query);
  }

  post<T>(path: string, ctx: RequestContext, body: unknown, idempotencyKey?: string): Promise<T> {
    return this.request<T>('POST', path, ctx, body, undefined, idempotencyKey);
  }

  async request<T>(
    method: string,
    path: string,
    ctx: RequestContext,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
    idempotencyKey?: string,
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Correlation-Id': ctx.correlationId,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (ctx.bearerToken) headers.Authorization = `Bearer ${ctx.bearerToken}`;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const canRetry = IDEMPOTENT.has(method) || idempotencyKey !== undefined;
    const maxAttempts = canRetry ? this.options.retries + 1 : 1;
    let lastError: DownstreamError | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) await this.sleep(backoffDelay(attempt - 1));
      const started = Date.now();
      try {
        const response = await this.withTimeout((signal) =>
          this.fetcher(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal }),
        );
        this.options.logger.debug('downstream call', {
          service: this.options.serviceName,
          method,
          path,
          status: response.status,
          durationMs: Date.now() - started,
          attempt,
          correlationId: ctx.correlationId,
        });
        if (response.ok) {
          return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
        }
        lastError = new DownstreamError(this.options.serviceName, response.status, await this.describe(response));
        if (!lastError.retryable) throw lastError;
      } catch (error) {
        if (error instanceof DownstreamError && !error.retryable) throw error;
        lastError =
          error instanceof DownstreamError
            ? error
            : new DownstreamError(this.options.serviceName, undefined, error instanceof Error ? error.message : String(error));
        this.options.logger.warn('downstream attempt failed', {
          service: this.options.serviceName,
          method,
          path,
          attempt,
          error: lastError.message,
          correlationId: ctx.correlationId,
        });
      }
    }
    throw lastError ?? new DownstreamError(this.options.serviceName, undefined, 'request failed');
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const base = this.options.baseUrl.replace(/\/+$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) params.append(key, String(value));
    }
    const qs = params.toString();
    return `${base}${suffix}${qs ? `?${qs}` : ''}`;
  }

  private async withTimeout<R>(run: (signal: AbortSignal) => Promise<R>): Promise<R> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      return await run(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`timed out after ${this.options.timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async describe(response: HttpResponse): Promise<string> {
    try {
      const problem = (await response.json()) as { title?: string; detail?: string };
      return problem.detail ?? problem.title ?? `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }
}
```

## apps/chatbot/src/clients/platformClients.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/clients/platformClients.ts`.

```typescript
import { Money, Page, TicketPriority, TicketStatus } from '../domain/types';
import { HttpClient, RequestContext } from './httpClient';

/**
 * Typed clients for the platform APIs the chatbot integrates with.
 * Each wraps an HttpClient and exposes only the operations the dialog flows need.
 */

// ---------------------------------------------------------------- Account API

export interface ServiceSummary {
  serviceId: string;
  productCode: string;
  productName: string;
  downloadMbps: number;
  uploadMbps: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'PROVISIONING' | 'CEASED';
  serviceAddress: { line1: string; town: string; postcode: string };
  monthlyPrice: Money;
  contractEndDate?: string;
}

export interface AccountSummary {
  accountId: string;
  name: string;
  segment: 'CONSUMER' | 'BUSINESS';
  services: ServiceSummary[];
}

export interface AccountClient {
  getAccount(accountId: string, ctx: RequestContext): Promise<AccountSummary>;
}

export class HttpAccountClient implements AccountClient {
  constructor(private readonly http: HttpClient) {}

  getAccount(accountId: string, ctx: RequestContext): Promise<AccountSummary> {
    return this.http.get<AccountSummary>(`/accounts/${encodeURIComponent(accountId)}`, ctx);
  }
}

// ---------------------------------------------------------------- Billing API

export interface InvoiceLine {
  description: string;
  amount: Money;
  category: 'RECURRING' | 'ONE_OFF' | 'USAGE' | 'CREDIT' | 'DISCOUNT';
}

export interface Invoice {
  invoiceId: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
  dueDate: string;
  status: 'ISSUED' | 'PAID' | 'OVERDUE' | 'PARTIALLY_PAID';
  total: Money;
  balanceDue: Money;
  lines: InvoiceLine[];
}

export interface PlanOffer {
  code: string;
  name: string;
  downloadMbps: number;
  uploadMbps: number;
  monthly: Money;
  contractMonths: number;
}

export interface UpgradeOrderResult {
  orderId: string;
  status: 'DRAFT' | 'SUBMITTED' | 'VALIDATED' | 'PROVISIONING' | 'ACTIVE' | 'CANCELLED' | 'FAILED';
  effectiveDate: string;
}

export interface BillingClient {
  listInvoices(accountId: string, ctx: RequestContext, page?: number, pageSize?: number): Promise<Page<Invoice>>;
  getInvoice(accountId: string, invoiceId: string, ctx: RequestContext): Promise<Invoice>;
  listUpgradeOffers(accountId: string, serviceId: string, ctx: RequestContext): Promise<PlanOffer[]>;
  submitPlanChange(
    accountId: string,
    serviceId: string,
    planCode: string,
    ctx: RequestContext,
    idempotencyKey: string,
  ): Promise<UpgradeOrderResult>;
}

export class HttpBillingClient implements BillingClient {
  constructor(private readonly http: HttpClient) {}

  listInvoices(accountId: string, ctx: RequestContext, page = 1, pageSize = 3): Promise<Page<Invoice>> {
    return this.http.get<Page<Invoice>>(`/accounts/${encodeURIComponent(accountId)}/invoices`, ctx, { page, pageSize });
  }

  getInvoice(accountId: string, invoiceId: string, ctx: RequestContext): Promise<Invoice> {
    return this.http.get<Invoice>(`/accounts/${encodeURIComponent(accountId)}/invoices/${encodeURIComponent(invoiceId)}`, ctx);
  }

  listUpgradeOffers(accountId: string, serviceId: string, ctx: RequestContext): Promise<PlanOffer[]> {
    return this.http.get<PlanOffer[]>(
      `/accounts/${encodeURIComponent(accountId)}/services/${encodeURIComponent(serviceId)}/upgrade-offers`,
      ctx,
    );
  }

  submitPlanChange(
    accountId: string,
    serviceId: string,
    planCode: string,
    ctx: RequestContext,
    idempotencyKey: string,
  ): Promise<UpgradeOrderResult> {
    return this.http.post<UpgradeOrderResult>(
      `/accounts/${encodeURIComponent(accountId)}/orders`,
      ctx,
      { type: 'PLAN_CHANGE', serviceId, targetProductCode: planCode },
      idempotencyKey,
    );
  }
}

// ---------------------------------------------------------------- Ticket API

export interface CreateTicketRequest {
  accountId: string;
  category: 'FAULT' | 'BILLING' | 'COMPLAINT' | 'GENERAL' | 'HANDOFF';
  priority: TicketPriority;
  subject: string;
  description: string;
  contactPhone?: string;
  serviceId?: string;
  source: 'CHATBOT';
  conversationId: string;
}

export interface Ticket {
  ticketId: string;
  accountId: string;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  createdAt: string;
}

export interface TicketClient {
  createTicket(request: CreateTicketRequest, ctx: RequestContext, idempotencyKey: string): Promise<Ticket>;
  getTicket(ticketId: string, ctx: RequestContext): Promise<Ticket>;
}

export class HttpTicketClient implements TicketClient {
  constructor(private readonly http: HttpClient) {}

  createTicket(request: CreateTicketRequest, ctx: RequestContext, idempotencyKey: string): Promise<Ticket> {
    return this.http.post<Ticket>('/tickets', ctx, request, idempotencyKey);
  }

  getTicket(ticketId: string, ctx: RequestContext): Promise<Ticket> {
    return this.http.get<Ticket>(`/tickets/${encodeURIComponent(ticketId)}`, ctx);
  }
}

// ---------------------------------------------------------------- Network API

export interface OutageStatus {
  postcode: string;
  region: string;
  status: 'NO_KNOWN_ISSUES' | 'INVESTIGATING' | 'OUTAGE' | 'PLANNED_WORK' | 'RESTORED';
  incidentId?: string;
  summary?: string;
  estimatedRestore?: string;
}

export interface LineDiagnostic {
  serviceId: string;
  ontOnline: boolean;
  routerOnline: boolean;
  lastSeen: string;
  opticalSignalDbm?: number;
}

export interface NetworkClient {
  getOutageStatus(postcode: string, ctx: RequestContext): Promise<OutageStatus>;
  runLineDiagnostic(serviceId: string, ctx: RequestContext): Promise<LineDiagnostic>;
  requestRemoteReboot(serviceId: string, ctx: RequestContext, idempotencyKey: string): Promise<{ accepted: boolean; jobId?: string }>;
}

export class HttpNetworkClient implements NetworkClient {
  constructor(private readonly http: HttpClient) {}

  getOutageStatus(postcode: string, ctx: RequestContext): Promise<OutageStatus> {
    return this.http.get<OutageStatus>('/network/outages', ctx, { postcode });
  }

  runLineDiagnostic(serviceId: string, ctx: RequestContext): Promise<LineDiagnostic> {
    return this.http.get<LineDiagnostic>(`/network/services/${encodeURIComponent(serviceId)}/diagnostic`, ctx);
  }

  requestRemoteReboot(serviceId: string, ctx: RequestContext, idempotencyKey: string): Promise<{ accepted: boolean; jobId?: string }> {
    return this.http.post(`/network/services/${encodeURIComponent(serviceId)}/reboot`, ctx, {}, idempotencyKey);
  }
}

export interface PlatformClients {
  account: AccountClient;
  billing: BillingClient;
  tickets: TicketClient;
  network: NetworkClient;
}
```

## apps/chatbot/src/config.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/config.ts`.

```typescript
/**
 * Typed runtime configuration, read once from environment variables.
 * No secrets are defaulted here; missing required values fail fast at startup.
 */

export interface DownstreamConfig {
  accountBaseUrl: string;
  billingBaseUrl: string;
  ticketBaseUrl: string;
  networkBaseUrl: string;
  timeoutMs: number;
  retries: number;
}

export interface LlmConfig {
  provider: 'none' | 'http';
  endpoint?: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
}

export interface AuthConfig {
  issuer: string;
  audience: string;
  publicKey?: string;
  sharedSecret?: string;
}

export interface AppConfig {
  port: number;
  env: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  auth: AuthConfig;
  downstream: DownstreamConfig;
  llm: LlmConfig;
  nluMinConfidence: number;
  sessionTtlSeconds: number;
  rateLimit: { windowMs: number; maxMessages: number };
  analytics: { endpoint?: string; batchSize: number; flushIntervalMs: number };
  widgetAllowedOrigins: string[];
}

type Env = Record<string, string | undefined>;

export class ConfigError extends Error {}

function required(env: Env, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === '') {
    throw new ConfigError(`Missing required environment variable ${key}`);
  }
  return value.trim();
}

function optional(env: Env, key: string): string | undefined {
  const value = env[key];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function intValue(env: Env, key: string, fallback: number, min = 0): number {
  const raw = optional(env, key);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new ConfigError(`${key} must be an integer >= ${min}, got "${raw}"`);
  }
  return parsed;
}

function floatValue(env: Env, key: string, fallback: number, min: number, max: number): number {
  const raw = optional(env, key);
  if (raw === undefined) return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ConfigError(`${key} must be a number in [${min}, ${max}], got "${raw}"`);
  }
  return parsed;
}

function logLevel(raw: string | undefined): AppConfig['logLevel'] {
  const level = (raw ?? 'info').toLowerCase();
  if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') return level;
  throw new ConfigError(`LOG_LEVEL must be debug|info|warn|error, got "${raw}"`);
}

export function loadConfig(env: Env = process.env): AppConfig {
  const llmProvider = (optional(env, 'LLM_PROVIDER') ?? 'none').toLowerCase();
  if (llmProvider !== 'none' && llmProvider !== 'http') {
    throw new ConfigError(`LLM_PROVIDER must be none|http, got "${llmProvider}"`);
  }

  const publicKey = optional(env, 'JWT_PUBLIC_KEY');
  const sharedSecret = optional(env, 'JWT_SHARED_SECRET');
  if (!publicKey && !sharedSecret) {
    throw new ConfigError('Either JWT_PUBLIC_KEY or JWT_SHARED_SECRET must be configured');
  }

  const config: AppConfig = {
    port: intValue(env, 'PORT', 8080, 1),
    env: optional(env, 'NODE_ENV') ?? 'development',
    logLevel: logLevel(optional(env, 'LOG_LEVEL')),
    auth: {
      issuer: required(env, 'JWT_ISSUER'),
      audience: required(env, 'JWT_AUDIENCE'),
      publicKey,
      sharedSecret,
    },
    downstream: {
      accountBaseUrl: required(env, 'ACCOUNT_API_BASE_URL'),
      billingBaseUrl: required(env, 'BILLING_API_BASE_URL'),
      ticketBaseUrl: required(env, 'TICKET_API_BASE_URL'),
      networkBaseUrl: required(env, 'NETWORK_API_BASE_URL'),
      timeoutMs: intValue(env, 'DOWNSTREAM_TIMEOUT_MS', 4000, 100),
      retries: intValue(env, 'DOWNSTREAM_RETRIES', 2, 0),
    },
    llm: {
      provider: llmProvider,
      endpoint: optional(env, 'LLM_ENDPOINT'),
      apiKey: optional(env, 'LLM_API_KEY'),
      model: optional(env, 'LLM_MODEL'),
      timeoutMs: intValue(env, 'LLM_TIMEOUT_MS', 3000, 100),
    },
    nluMinConfidence: floatValue(env, 'NLU_MIN_CONFIDENCE', 0.55, 0, 1),
    sessionTtlSeconds: intValue(env, 'SESSION_TTL_SECONDS', 1800, 60),
    rateLimit: {
      windowMs: intValue(env, 'RATE_LIMIT_WINDOW_MS', 60_000, 1000),
      maxMessages: intValue(env, 'RATE_LIMIT_MAX_MESSAGES', 30, 1),
    },
    analytics: {
      endpoint: optional(env, 'ANALYTICS_ENDPOINT'),
      batchSize: intValue(env, 'ANALYTICS_BATCH_SIZE', 25, 1),
      flushIntervalMs: intValue(env, 'ANALYTICS_FLUSH_INTERVAL_MS', 5000, 100),
    },
    widgetAllowedOrigins: (optional(env, 'WIDGET_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  };

  if (config.llm.provider === 'http' && !config.llm.endpoint) {
    throw new ConfigError('LLM_ENDPOINT is required when LLM_PROVIDER=http');
  }
  return config;
}
```

## apps/chatbot/src/conversation/conversationService.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/conversation/conversationService.ts`.

```typescript
import { randomUUID } from 'crypto';
import { AnalyticsSink } from '../analytics/analyticsEmitter';
import { RequestContext } from '../clients/httpClient';
import { DialogEngine, greeting, TurnEvent } from '../dialog/dialogEngine';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors';
import { BotReply, Channel, Conversation, IntentPrediction, Page, Principal, TranscriptEntry } from '../domain/types';
import { Logger } from '../logger';
import { IntentClassifier } from '../nlu/intentClassifier';
import { redactText } from '../privacy/piiRedactor';
import { ConversationRepository } from '../session/conversationRepository';
import { renderTranscript, TranscriptRepository } from '../transcripts/transcriptRepository';

/**
 * Application service for chatbot conversations. Orchestrates: ownership checks,
 * input validation, NLU, the dialog engine, optimistic-concurrency persistence,
 * transcript writes (redacted) and analytics. Transport-agnostic: used by both
 * the REST controller and the WebSocket gateway.
 */

export const MAX_MESSAGE_LENGTH = 1000;
const HISTORY_TURNS = 6;
const SAVE_ATTEMPTS = 2;

export interface HandoffPublisher {
  /** Notifies the agent desk; receives a redacted transcript for context. */
  publish(conversation: Conversation, transcript: string): Promise<void>;
}

export interface MessageResult {
  conversation: ConversationView;
  replies: BotReply[];
  intent: IntentPrediction['intent'];
  confidence: number;
}

/** Public projection of a conversation (no slot values, which may contain PII). */
export interface ConversationView {
  id: string;
  status: Conversation['status'];
  channel: Channel;
  activeFlow?: string;
  awaiting?: string;
  createdAt: string;
  updatedAt: string;
  handoff?: { queue: string; requestedAt: string; ticketId?: string };
}

export function toView(conversation: Conversation): ConversationView {
  return {
    id: conversation.id,
    status: conversation.status,
    channel: conversation.channel,
    activeFlow: conversation.activeFlow?.flowId,
    awaiting: conversation.activeFlow?.state,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    handoff: conversation.handoff
      ? { queue: conversation.handoff.queue, requestedAt: conversation.handoff.requestedAt, ticketId: conversation.handoff.ticketId }
      : undefined,
  };
}

export interface ConversationServiceDeps {
  repository: ConversationRepository;
  transcripts: TranscriptRepository;
  classifier: IntentClassifier;
  engine: DialogEngine;
  analytics: AnalyticsSink;
  handoff: HandoffPublisher;
  logger: Logger;
  clock?: () => Date;
  idFactory?: () => string;
}

export class ConversationService {
  private readonly clock: () => Date;
  private readonly idFactory: () => string;

  constructor(private readonly deps: ConversationServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.idFactory = deps.idFactory ?? randomUUID;
  }

  async start(principal: Principal, channel: Channel): Promise<{ conversation: ConversationView; replies: BotReply[] }> {
    const now = this.clock().toISOString();
    const conversation: Conversation = {
      id: this.idFactory(),
      principal,
      channel,
      status: 'ACTIVE',
      suspendedFlows: [],
      fallbackCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.create(conversation);
    const reply = greeting(principal);
    await this.deps.transcripts.append({ conversationId: conversation.id, author: 'BOT', text: reply.text });
    this.deps.analytics.track('conversation_started', conversation.id, principal.userId, { channel });
    return { conversation: toView(conversation), replies: [reply] };
  }

  async get(conversationId: string, principal: Principal): Promise<ConversationView> {
    const stored = await this.load(conversationId, principal);
    return toView(stored.conversation);
  }

  async listForUser(principal: Principal): Promise<ConversationView[]> {
    return (await this.deps.repository.listByUser(principal.userId)).map(toView);
  }

  async transcript(conversationId: string, principal: Principal, page: number, pageSize: number): Promise<Page<TranscriptEntry>> {
    await this.load(conversationId, principal);
    return this.deps.transcripts.list(conversationId, page, pageSize);
  }

  async handleMessage(conversationId: string, principal: Principal, text: string, request: RequestContext): Promise<MessageResult> {
    const clean = validateMessage(text);

    for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt += 1) {
      const stored = await this.load(conversationId, principal);
      const conversation = stored.conversation;

      if (conversation.status === 'ENDED') {
        throw new ConflictError('This conversation has ended. Start a new one to continue.');
      }
      if (conversation.status === 'HANDED_OFF') {
        await this.deps.transcripts.append({ conversationId, author: 'USER', text: clean });
        const reply = { text: "Thanks - I've passed that on. An agent will reply here shortly." };
        return { conversation: toView(conversation), replies: [reply], intent: 'TALK_TO_AGENT', confidence: 1 };
      }

      const history = (await this.deps.transcripts.recent(conversationId, HISTORY_TURNS))
        .filter((e) => e.author === 'USER')
        .map((e) => e.text);
      const prediction = await this.deps.classifier.classify(clean, { history, correlationId: request.correlationId });
      const turn = await this.deps.engine.handleTurn(conversation, clean, prediction, request);
      conversation.updatedAt = this.clock().toISOString();

      const saved = await this.deps.repository.save(conversation, stored.version);
      if (!saved) {
        // Another message was processed concurrently; retry once against the fresh state.
        this.deps.logger.warn('conversation version conflict', { conversationId, attempt, correlationId: request.correlationId });
        continue;
      }

      await this.recordTurn(conversation, clean, prediction, turn.replies);
      this.emitAnalytics(conversation, prediction, turn.events, clean);
      if (conversation.status === 'HANDED_OFF' && turn.events.some((e) => e.type === 'handoff_requested')) {
        await this.publishHandoff(conversation);
      }
      return { conversation: toView(conversation), replies: turn.replies, intent: prediction.intent, confidence: prediction.confidence };
    }
    throw new ConflictError('The conversation was updated by another message. Please resend.');
  }

  async end(conversationId: string, principal: Principal): Promise<ConversationView> {
    const stored = await this.load(conversationId, principal);
    const conversation = stored.conversation;
    if (conversation.status === 'ENDED') return toView(conversation);
    conversation.status = 'ENDED';
    conversation.activeFlow = undefined;
    conversation.suspendedFlows = [];
    conversation.updatedAt = this.clock().toISOString();
    if (!(await this.deps.repository.save(conversation, stored.version))) {
      throw new ConflictError('The conversation changed while ending it. Please retry.');
    }
    this.deps.analytics.track('conversation_ended', conversationId, principal.userId, { reason: 'user_closed' });
    return toView(conversation);
  }

  /** Records a message from a live agent (handed-off conversations only). */
  async agentMessage(conversationId: string, agent: Principal, text: string): Promise<TranscriptEntry> {
    if (!agent.roles.includes('SUPPORT_AGENT')) throw new ForbiddenError('Only support agents can post agent messages');
    const stored = await this.deps.repository.get(conversationId);
    if (!stored) throw new NotFoundError('Conversation', conversationId);
    if (stored.conversation.status !== 'HANDED_OFF') throw new ConflictError('Conversation has not been handed off to an agent');
    return this.deps.transcripts.append({ conversationId, author: 'AGENT', text: validateMessage(text) });
  }

  private async load(conversationId: string, principal: Principal) {
    const stored = await this.deps.repository.get(conversationId);
    if (!stored) throw new NotFoundError('Conversation', conversationId);
    const owner = stored.conversation.principal.userId === principal.userId;
    if (!owner && !principal.roles.includes('SUPPORT_AGENT')) {
      // Do not reveal existence of other users' conversations.
      throw new NotFoundError('Conversation', conversationId);
    }
    return stored;
  }

  private async recordTurn(conversation: Conversation, text: string, prediction: IntentPrediction, replies: BotReply[]): Promise<void> {
    await this.deps.transcripts.append({
      conversationId: conversation.id,
      author: 'USER',
      text,
      intent: prediction.intent,
      confidence: prediction.confidence,
    });
    for (const reply of replies) {
      await this.deps.transcripts.append({ conversationId: conversation.id, author: 'BOT', text: reply.text });
    }
  }

  private emitAnalytics(conversation: Conversation, prediction: IntentPrediction, events: TurnEvent[], text: string): void {
    const { analytics } = this.deps;
    const userId = conversation.principal.userId;
    analytics.track('intent_classified', conversation.id, userId, {
      intent: prediction.intent,
      confidence: Number(prediction.confidence.toFixed(3)),
      source: prediction.source,
    });
    for (const event of events) {
      analytics.track(event.type, conversation.id, userId, {
        flowId: event.flowId,
        outcome: event.outcome,
        utterance: event.type === 'fallback' ? redactText(text).slice(0, 200) : undefined,
      });
    }
  }

  private async publishHandoff(conversation: Conversation): Promise<void> {
    try {
      const entries = await this.deps.transcripts.recent(conversation.id, 50);
      await this.deps.handoff.publish(conversation, renderTranscript(entries));
    } catch (error) {
      // The handoff ticket already exists, so an agent will still pick it up.
      this.deps.logger.error('handoff publish failed', { conversationId: conversation.id, error });
    }
  }
}

export function validateMessage(text: unknown): string {
  if (typeof text !== 'string') throw new ValidationError([{ field: 'text', message: 'must be a string' }]);
  // Strip control characters except newlines/tabs and collapse excessive whitespace.
  const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (clean.length === 0) throw new ValidationError([{ field: 'text', message: 'must not be empty' }]);
  if (clean.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError([{ field: 'text', message: `must be at most ${MAX_MESSAGE_LENGTH} characters` }]);
  }
  return clean;
}
```

## apps/chatbot/src/dialog/dialogEngine.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/dialogEngine.test.ts`.

```typescript
import { ChatHarness } from '../testing/chatHarness';
import { MAX_FALLBACKS_BEFORE_AGENT } from './dialogEngine';

describe('DialogEngine routing', () => {
  it('greets by first name and offers the main menu', async () => {
    const chat = new ChatHarness();
    const turn = await chat.say('hello');
    expect(turn.text).toBe("Hi, Jane! I'm the Uniti assistant. What can I help you with today?");
    expect(turn.replies[0].quickReplies).toHaveLength(6);
  });

  it('suspends a flow for a confident interrupting intent and resumes it afterwards', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('fault');
    await chat.say('Broadband drops every evening around 8pm');
    expect(chat.awaiting).toBe('phone');

    const interrupted = await chat.say('is there an outage at SW1A 1AA');
    expect(interrupted.events.map((e) => e.type)).toEqual(['flow_suspended', 'flow_started']);
    expect(chat.activeFlowId).toBe('check_outage');
    expect(chat.conversation.suspendedFlows.map((f) => f.flowId)).toEqual(['raise_ticket']);

    const resumed = await chat.say('no');
    expect(resumed.text).toContain('Now, back to raising a ticket.');
    expect(resumed.text).toContain('What number can our team call you back on?');
    expect(chat.activeFlowId).toBe('raise_ticket');
    // Slots collected before the interruption survive the suspension.
    expect(chat.conversation.activeFlow?.slots.category).toBe('FAULT');
  });

  it('lets an explicit quick-reply choice interrupt a free-text slot', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('fault');
    expect(chat.awaiting).toBe('description');

    await chat.say('intent:CHECK_OUTAGE');
    expect(chat.activeFlowId).toBe('check_outage');
    expect(chat.conversation.suspendedFlows[0]).toMatchObject({ flowId: 'raise_ticket', state: 'description' });
  });

  it('treats a weak intent during a slot as input for that slot', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    const turn = await chat.say('complaint');
    expect(turn.events).toHaveLength(0);
    expect(chat.conversation.activeFlow?.slots.category).toBe('COMPLAINT');
  });

  it('cancels the active flow and drops suspended ones', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('intent:PLAN_UPGRADE');
    expect(chat.conversation.suspendedFlows).toHaveLength(1);

    const cancelled = await chat.say('never mind');
    expect(cancelled.events).toEqual([{ type: 'flow_abandoned', flowId: 'plan_upgrade', outcome: 'cancelled' }]);
    expect(chat.activeFlowId).toBeUndefined();
    expect(chat.conversation.suspendedFlows).toEqual([]);
  });

  it(`offers a human after more than ${MAX_FALLBACKS_BEFORE_AGENT} consecutive fallbacks`, async () => {
    const chat = new ChatHarness();
    const first = await chat.say('the weather is lovely');
    expect(first.text).toContain("I didn't quite get that");
    await chat.say('purple elephants dancing');
    const third = await chat.say('what is the meaning of life');
    expect(third.text).toContain('Would you like to speak to someone from our team?');
    expect(third.replies[0].quickReplies?.[0].payload).toBe('intent:TALK_TO_AGENT');
    expect(chat.conversation.fallbackCount).toBe(3);
  });

  it('resets the fallback counter once a flow starts', async () => {
    const chat = new ChatHarness();
    await chat.say('the weather is lovely');
    await chat.say('purple elephants dancing');
    await chat.say('my bill');
    expect(chat.conversation.fallbackCount).toBe(0);
  });

  it('ends the conversation on goodbye', async () => {
    const chat = new ChatHarness();
    const turn = await chat.say('bye');
    expect(chat.conversation.status).toBe('ENDED');
    expect(turn.events).toEqual([{ type: 'conversation_ended', outcome: 'user_goodbye' }]);
  });

  it('remembers the last understood intent but not fallbacks', async () => {
    const chat = new ChatHarness();
    await chat.say('my bill');
    await chat.say('gibberish words here');
    expect(chat.conversation.lastIntent).toBe('BILL_ENQUIRY');
  });

  it('keeps at most three suspended flows, dropping the oldest', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('intent:PLAN_UPGRADE');
    await chat.say('intent:BILL_ENQUIRY');
    await chat.say('intent:CHECK_OUTAGE');
    await chat.say('intent:RESET_ROUTER');
    expect(chat.activeFlowId).toBe('reset_router');
    expect(chat.conversation.suspendedFlows.map((f) => f.flowId)).toEqual(['check_outage', 'bill_enquiry', 'plan_upgrade']);
  });
});
```

## apps/chatbot/src/dialog/dialogEngine.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/dialogEngine.ts`.

```typescript
import { BotReply, Conversation, IntentPrediction, Principal } from '../domain/types';
import { PlatformClients } from '../clients/platformClients';
import { RequestContext } from '../clients/httpClient';
import { Logger } from '../logger';
import { quickReplyPayload } from '../nlu/intentClassifier';
import { FlowRegistry } from './flows';
import { FlowContext, FlowDefinition, prefillFromEntities, startFlow, StepOutcome, stepFlow } from './stateMachine';

/**
 * Dialog manager: decides, for one user turn, whether to continue the active
 * flow, interrupt it with a new intent (suspending it for later), cancel it,
 * start a new flow, or answer conversationally. Mutates the conversation
 * object passed in; persistence is the caller's responsibility.
 */

export interface TurnEvent {
  type: 'flow_started' | 'flow_completed' | 'flow_abandoned' | 'flow_suspended' | 'fallback' | 'handoff_requested' | 'conversation_ended';
  flowId?: string;
  outcome?: string;
}

export interface TurnResult {
  replies: BotReply[];
  events: TurnEvent[];
}

export interface DialogEngineDeps {
  flows: FlowRegistry;
  clients: PlatformClients;
  logger: Logger;
  clock?: () => Date;
}

/** An intent this confident may interrupt a flow that is waiting for a slot value. */
export const INTERRUPT_CONFIDENCE = 0.85;
/** After this many consecutive fallbacks we proactively offer a human. */
export const MAX_FALLBACKS_BEFORE_AGENT = 2;
const MAX_SUSPENDED = 3;

const CONVERSATIONAL = new Set(['GREETING', 'GOODBYE', 'AFFIRM', 'DENY', 'CANCEL', 'FALLBACK']);

export function mainMenu(): BotReply['quickReplies'] {
  return [
    { label: 'Check for outages', payload: quickReplyPayload('CHECK_OUTAGE') },
    { label: 'My bill', payload: quickReplyPayload('BILL_ENQUIRY') },
    { label: 'Reset my router', payload: quickReplyPayload('RESET_ROUTER') },
    { label: 'Upgrade my plan', payload: quickReplyPayload('PLAN_UPGRADE') },
    { label: 'Raise a ticket', payload: quickReplyPayload('RAISE_TICKET') },
    { label: 'Talk to an agent', payload: quickReplyPayload('TALK_TO_AGENT') },
  ];
}

export function greeting(principal: Principal): BotReply {
  const name = principal.displayName ? `, ${principal.displayName.split(' ')[0]}` : '';
  return { text: `Hi${name}! I'm the Uniti assistant. What can I help you with today?`, quickReplies: mainMenu() };
}

export class DialogEngine {
  private readonly clock: () => Date;

  constructor(private readonly deps: DialogEngineDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async handleTurn(conversation: Conversation, text: string, prediction: IntentPrediction, request: RequestContext): Promise<TurnResult> {
    try {
      return await this.route(conversation, text, prediction, request);
    } finally {
      // Updated after routing so flows (e.g. handoff) can see what the customer was doing before.
      if (prediction.intent !== 'FALLBACK') conversation.lastIntent = prediction.intent;
    }
  }

  private async route(conversation: Conversation, text: string, prediction: IntentPrediction, request: RequestContext): Promise<TurnResult> {
    const replies: BotReply[] = [];
    const events: TurnEvent[] = [];
    const active = conversation.activeFlow ? this.deps.flows.get(conversation.activeFlow.flowId) : undefined;
    const targetFlow = this.deps.flows.forIntent(prediction.intent);

    // 1. Explicit cancel always wins.
    if (prediction.intent === 'CANCEL' && conversation.activeFlow) {
      events.push({ type: 'flow_abandoned', flowId: conversation.activeFlow.flowId, outcome: 'cancelled' });
      conversation.activeFlow = undefined;
      conversation.suspendedFlows = [];
      replies.push({ text: "OK, I've stopped that. What else can I help with?", quickReplies: mainMenu() });
      return { replies, events };
    }

    // 2. Continue the active flow unless a different, confident flow intent interrupts it.
    if (active && conversation.activeFlow) {
      const waiting = active.states[conversation.activeFlow.state];
      const capturesFreeText = waiting?.kind === 'slot' && waiting.captureFreeText === true;
      // Quick-reply payloads (source "context") are explicit choices and may always interrupt;
      // typed text cannot interrupt a free-text slot such as a fault description.
      const interrupts =
        targetFlow !== undefined &&
        targetFlow.id !== active.id &&
        prediction.confidence >= INTERRUPT_CONFIDENCE &&
        (prediction.source === 'context' || !capturesFreeText);
      if (!interrupts || !this.isAllowed(targetFlow!, conversation.principal)) {
        const outcome = await stepFlow(active, conversation.activeFlow, this.context(conversation, request), {
          text,
          entities: prediction.entities,
        });
        this.applyOutcome(conversation, active, outcome, replies, events);
        await this.resumeIfIdle(conversation, request, replies, events);
        return { replies, events };
      }
      this.suspend(conversation, events);
    }

    // 3. Start a new flow for a routable intent.
    if (targetFlow) {
      if (!this.isAllowed(targetFlow, conversation.principal)) {
        replies.push({
          text: `Sorry, your account role can't do that here. Please ask your account administrator, or I can connect you to our team.`,
          quickReplies: [{ label: 'Talk to an agent', payload: quickReplyPayload('TALK_TO_AGENT') }],
        });
        return { replies, events };
      }
      conversation.fallbackCount = 0;
      await this.start(conversation, targetFlow, prediction, request, replies, events);
      await this.resumeIfIdle(conversation, request, replies, events);
      return { replies, events };
    }

    // 4. Conversational intents with no flow attached.
    if (CONVERSATIONAL.has(prediction.intent)) {
      this.conversational(conversation, prediction, replies, events);
    }
    return { replies, events };
  }

  private conversational(conversation: Conversation, prediction: IntentPrediction, replies: BotReply[], events: TurnEvent[]): void {
    switch (prediction.intent) {
      case 'GREETING':
        conversation.fallbackCount = 0;
        replies.push(greeting(conversation.principal));
        return;
      case 'GOODBYE':
        conversation.status = 'ENDED';
        events.push({ type: 'conversation_ended', outcome: 'user_goodbye' });
        replies.push({ text: 'Thanks for chatting with Uniti. Have a great day!' });
        return;
      case 'AFFIRM':
      case 'DENY':
      case 'CANCEL':
        replies.push({ text: 'Is there anything else I can help you with?', quickReplies: mainMenu() });
        return;
      default: {
        conversation.fallbackCount += 1;
        events.push({ type: 'fallback', outcome: String(conversation.fallbackCount) });
        if (conversation.fallbackCount > MAX_FALLBACKS_BEFORE_AGENT) {
          replies.push({
            text: "I'm sorry, I'm still not following. Would you like to speak to someone from our team?",
            quickReplies: [{ label: 'Talk to an agent', payload: quickReplyPayload('TALK_TO_AGENT') }, ...(mainMenu() ?? []).slice(0, 3)],
          });
        } else {
          replies.push({ text: "Sorry, I didn't quite get that. Here are some things I can help with:", quickReplies: mainMenu() });
        }
      }
    }
  }

  private async start(
    conversation: Conversation,
    flow: FlowDefinition,
    prediction: IntentPrediction,
    request: RequestContext,
    replies: BotReply[],
    events: TurnEvent[],
  ): Promise<void> {
    const state = startFlow(flow, prefillFromEntities(flow, prediction.entities), this.clock());
    conversation.activeFlow = state;
    events.push({ type: 'flow_started', flowId: flow.id });
    const outcome = await stepFlow(flow, state, this.context(conversation, request));
    this.applyOutcome(conversation, flow, outcome, replies, events);
  }

  private applyOutcome(conversation: Conversation, flow: FlowDefinition, outcome: StepOutcome, replies: BotReply[], events: TurnEvent[]): void {
    replies.push(...outcome.replies);
    conversation.activeFlow = outcome.flow;
    if (outcome.flow) return;

    if (outcome.abandoned) {
      events.push({ type: 'flow_abandoned', flowId: flow.id, outcome: outcome.outcome });
      conversation.fallbackCount += 1;
    } else {
      events.push({ type: 'flow_completed', flowId: flow.id, outcome: outcome.outcome });
    }
    if (outcome.handoff) {
      conversation.status = 'HANDED_OFF';
      conversation.suspendedFlows = [];
      conversation.handoff = { ...outcome.handoff, requestedAt: this.clock().toISOString() };
      events.push({ type: 'handoff_requested', flowId: flow.id, outcome: outcome.handoff.queue });
    }
  }

  private suspend(conversation: Conversation, events: TurnEvent[]): void {
    if (!conversation.activeFlow) return;
    events.push({ type: 'flow_suspended', flowId: conversation.activeFlow.flowId });
    conversation.suspendedFlows = [conversation.activeFlow, ...conversation.suspendedFlows].slice(0, MAX_SUSPENDED);
    conversation.activeFlow = undefined;
  }

  /** After a flow finishes, resume the most recently suspended one and re-prompt it. */
  private async resumeIfIdle(conversation: Conversation, request: RequestContext, replies: BotReply[], events: TurnEvent[]): Promise<void> {
    if (conversation.activeFlow || conversation.status !== 'ACTIVE') return;
    const next = conversation.suspendedFlows.shift();
    if (!next) return;
    const flow = this.deps.flows.get(next.flowId);
    if (!flow) return;
    replies.push({ text: `Now, back to ${flow.label}.` });
    conversation.activeFlow = next;
    const outcome = await stepFlow(flow, next, this.context(conversation, request));
    this.applyOutcome(conversation, flow, outcome, replies, events);
  }

  private isAllowed(flow: FlowDefinition, principal: Principal): boolean {
    return !flow.allowedRoles || principal.roles.some((r) => flow.allowedRoles!.includes(r));
  }

  private context(conversation: Conversation, request: RequestContext): FlowContext {
    const runStarted = conversation.activeFlow?.startedAt ?? this.clock().toISOString();
    return {
      conversation,
      principal: conversation.principal,
      slots: conversation.activeFlow?.slots ?? {},
      clients: this.deps.clients,
      request,
      logger: this.deps.logger.child({ conversationId: conversation.id, correlationId: request.correlationId }),
      idempotencyKey: (purpose) => `chatbot:${conversation.id}:${runStarted}:${purpose}`,
      scratch: {},
    };
  }
}
```

## apps/chatbot/src/dialog/flows/agentHandoff.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/agentHandoff.test.ts`.

```typescript
import { ChatHarness, outcomeOf, principal } from '../../testing/chatHarness';
import { CLOSED_HOURS_CLOCK } from '../../testing/fakes';
import { isQueueOpen, londonTime, queueFor } from './agentHandoff';

describe('queue routing and opening hours', () => {
  it('routes each audience to its own desk', () => {
    expect(queueFor(principal())).toBe('consumer-support');
    expect(queueFor(principal({ roles: ['BUSINESS_USER'] }))).toBe('business-support');
    expect(queueFor(principal({ roles: ['PARTNER_AGENT'] }))).toBe('partner-desk');
    expect(queueFor(principal({ roles: ['WHOLESALE_BUYER'] }))).toBe('partner-desk');
  });

  it('evaluates opening hours in Europe/London time, including summer time', () => {
    // 07:15 UTC on a Monday in July is 08:15 BST: open, although the UTC hour is before 8.
    expect(londonTime(new Date('2026-07-06T07:15:00Z'))).toEqual({ weekday: 1, hour: 8 });
    expect(isQueueOpen('consumer-support', new Date('2026-07-06T07:15:00Z'))).toBe(true);
    // 19:30 UTC is 20:30 BST: closed, although the UTC hour is before 20.
    expect(isQueueOpen('consumer-support', new Date('2026-07-06T19:30:00Z'))).toBe(false);
  });

  it('keeps the partner desk closed at weekends and unknown queues always closed', () => {
    expect(isQueueOpen('partner-desk', new Date('2026-11-07T11:00:00Z'))).toBe(false);
    expect(isQueueOpen('business-support', CLOSED_HOURS_CLOCK())).toBe(true);
    expect(isQueueOpen('no-such-queue', new Date('2026-11-09T11:00:00Z'))).toBe(false);
  });
});

describe('agent handoff flow', () => {
  it('captures a reason and hands off with a ticket carrying the context', async () => {
    const chat = new ChatHarness();
    const ask = await chat.say('can I speak to a human');
    expect(ask.text).toContain('what do you need help with?');

    const handed = await chat.say('My router keeps dropping out at night');
    expect(handed.text).toContain('connecting you to the next available agent');
    expect(chat.conversation.status).toBe('HANDED_OFF');
    expect(chat.conversation.handoff).toEqual({
      queue: 'consumer-support',
      reason: 'My router keeps dropping out at night',
      ticketId: 'TKT-0000001',
      requestedAt: '2026-11-09T10:00:00.000Z',
    });
    expect(chat.clients.tickets.created[0].request).toMatchObject({ category: 'HANDOFF', priority: 'P4' });
    expect(handed.events).toContainEqual({ type: 'handoff_requested', flowId: 'agent_handoff', outcome: 'consumer-support' });
  });

  it('offers a callback ticket instead when the consumer desk is closed', async () => {
    const chat = new ChatHarness({ clock: CLOSED_HOURS_CLOCK });
    await chat.say('talk to an agent');
    const closed = await chat.say('Question about my contract end date');
    expect(closed.text).toContain("Our team isn't available right now");
    expect(closed.replies[0].quickReplies?.[0].payload).toBe('intent:RAISE_TICKET');
    expect(chat.conversation.status).toBe('ACTIVE');
    expect(chat.clients.tickets.created).toHaveLength(0);
    expect(outcomeOf(closed, 'agent_handoff')).toBe('out_of_hours');
  });

  it('hands business customers to the 24/7 desk at a higher priority, even overnight', async () => {
    const chat = new ChatHarness({ clock: CLOSED_HOURS_CLOCK, principal: { roles: ['BUSINESS_ADMIN'] } });
    await chat.say('live agent please');
    await chat.say('Our office line is down');
    expect(chat.conversation.handoff?.queue).toBe('business-support');
    expect(chat.clients.tickets.created[0].request.priority).toBe('P3');
  });

  it('skips the reason question when the customer arrives from another flow', async () => {
    const chat = new ChatHarness();
    chat.clients.network.diagnostic = { ...chat.clients.network.diagnostic, ontOnline: false };
    await chat.say('please reset my router');
    const handed = await chat.say('intent:TALK_TO_AGENT');
    expect(chat.conversation.handoff?.reason).toBe('Continuing from reset router');
    expect(handed.replies).toHaveLength(1);
  });
});
```

## apps/chatbot/src/dialog/flows/agentHandoff.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/agentHandoff.ts`.

```typescript
import { Principal } from '../../domain/types';
import { freeTextSlot } from '../slots';
import { END, FlowDefinition } from '../stateMachine';
import { downstreamFailure, isBusinessUser, isPartnerUser, ticketQuickReply } from './common';

/**
 * Talk to agent: captures a short reason, checks contact-centre opening hours
 * for the customer's queue, and either hands the conversation to a live agent
 * (creating a HANDOFF ticket carrying the context) or offers a callback ticket.
 */

export interface OpeningHours {
  /** 0 = Sunday ... 6 = Saturday; [openHour, closeHour) in Europe/London local time. */
  [weekday: number]: [number, number] | undefined;
}

export const QUEUE_HOURS: Record<string, OpeningHours> = {
  'consumer-support': { 1: [8, 20], 2: [8, 20], 3: [8, 20], 4: [8, 20], 5: [8, 20], 6: [9, 17] },
  'business-support': { 0: [0, 24], 1: [0, 24], 2: [0, 24], 3: [0, 24], 4: [0, 24], 5: [0, 24], 6: [0, 24] },
  'partner-desk': { 1: [8, 18], 2: [8, 18], 3: [8, 18], 4: [8, 18], 5: [8, 18] },
};

export function queueFor(principal: Principal): string {
  if (isPartnerUser(principal.roles) || principal.roles.includes('WHOLESALE_BUYER')) return 'partner-desk';
  if (isBusinessUser(principal.roles)) return 'business-support';
  return 'consumer-support';
}

/** Returns weekday and hour in Europe/London regardless of server timezone. */
export function londonTime(now: Date): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekdayName = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
  return { weekday, hour };
}

export function isQueueOpen(queue: string, now: Date): boolean {
  const hours = QUEUE_HOURS[queue];
  if (!hours) return false;
  const { weekday, hour } = londonTime(now);
  const window = hours[weekday];
  return window !== undefined && hour >= window[0] && hour < window[1];
}

/** Clock is injectable so tests can pin opening hours. */
export function createAgentHandoffFlow(clock: () => Date = () => new Date()): FlowDefinition {
  return {
    id: 'agent_handoff',
    intent: 'TALK_TO_AGENT',
    label: 'connecting you to an agent',
    initial: 'reason',
    states: {
      reason: {
        kind: 'slot',
        slot: 'reason',
        validator: freeTextSlot(3, 300),
        captureFreeText: true,
        autofill: async (ctx) => {
          // Coming from a failed flow, the reason is already known.
          const last = ctx.conversation.lastIntent;
          return last && last !== 'TALK_TO_AGENT' && last !== 'FALLBACK' ? `Continuing from ${last.toLowerCase().replace(/_/g, ' ')}` : undefined;
        },
        prompt: { text: 'Sure - so I can pass it on, what do you need help with?' },
        next: 'route',
      },
      route: {
        kind: 'action',
        async run(ctx) {
          const queue = queueFor(ctx.principal);
          ctx.slots.queue = queue;
          if (!isQueueOpen(queue, clock())) {
            return {
              replies: [
                {
                  text: "Our team isn't available right now. I can raise a ticket so they call you back first thing.",
                  quickReplies: [ticketQuickReply()],
                },
              ],
              next: END,
              outcome: 'out_of_hours',
            };
          }
          return { next: 'handoff' };
        },
      },
      handoff: {
        kind: 'action',
        async run(ctx) {
          const queue = String(ctx.slots.queue);
          const reason = String(ctx.slots.reason);
          try {
            const ticket = await ctx.clients.tickets.createTicket(
              {
                accountId: ctx.principal.accountId,
                category: 'HANDOFF',
                priority: queue === 'business-support' ? 'P3' : 'P4',
                subject: `Chat handoff: ${reason.slice(0, 80)}`,
                description: `Customer asked for a live agent from the chatbot. Reason: ${reason}`,
                source: 'CHATBOT',
                conversationId: ctx.conversation.id,
              },
              ctx.request,
              ctx.idempotencyKey('handoff'),
            );
            return {
              replies: [{ text: "I'm connecting you to the next available agent - they'll see our chat so far, so you won't need to repeat yourself." }],
              next: END,
              handoff: { queue, reason, ticketId: ticket.ticketId },
              outcome: 'handed_off',
            };
          } catch (error) {
            return downstreamFailure(ctx, error, 'reach an agent');
          }
        },
      },
    },
  };
}
```

## apps/chatbot/src/dialog/flows/billEnquiry.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/billEnquiry.test.ts`.

```typescript
import { DownstreamError } from '../../domain/errors';
import { ChatHarness, outcomeOf } from '../../testing/chatHarness';
import { gbp, invoice } from '../../testing/fakes';
import { explainChange, formatLines, summariseInvoice } from './billEnquiry';

describe('bill enquiry flow', () => {
  it('explains the latest bill against the previous one, then shows the breakdown', async () => {
    const chat = new ChatHarness();
    const summary = await chat.say('why is my bill higher this month?');
    expect(summary.text).toContain('Your invoice INV-00000002');
    expect(summary.text).toContain('£49.99');
    expect(summary.text).toContain('£14.99 higher than your previous bill');
    expect(summary.replies[0].card).toMatchObject({ kind: 'INVOICE', invoiceId: 'INV-00000002', total: gbp(4999) });
    expect(chat.awaiting).toBe('breakdownOffer');

    // Scratch is per turn, so the breakdown must re-fetch the invoice by the resolved id.
    const getInvoice = jest.spyOn(chat.clients.billing, 'getInvoice');
    const breakdown = await chat.say('yes');
    expect(getInvoice).toHaveBeenCalledWith('ACC-12345678', 'INV-00000002', expect.anything());
    expect(breakdown.text).toContain('- Fibre 500 monthly: £35.00');
    expect(chat.awaiting).toBe('disputeOffer');

    const done = await chat.say('no');
    expect(outcomeOf(done, 'bill_enquiry')).toBe('resolved');
    expect(chat.clients.tickets.created).toHaveLength(0);
  });

  it('looks up a specific invoice named in the opening message', async () => {
    const chat = new ChatHarness();
    const turn = await chat.say('question about invoice INV-00000001');
    expect(turn.text).toContain('Your invoice INV-00000001');
    expect(turn.text).not.toContain('previous bill');
  });

  it('raises an idempotent P3 billing query when the customer disputes a charge', async () => {
    const chat = new ChatHarness();
    await chat.say('my bill');
    await chat.say('no');
    const query = await chat.say('yes');

    expect(query.text).toContain("I've raised billing query TKT-0000001");
    const [created] = chat.clients.tickets.created;
    expect(created.request).toMatchObject({ category: 'BILLING', priority: 'P3', subject: 'Billing query on INV-00000002' });
    expect(created.key).toMatch(/billing-query-INV-00000002$/);
    expect(outcomeOf(query, 'bill_enquiry')).toBe('ticket_created');
  });

  it('tells new customers they have no invoices yet', async () => {
    const chat = new ChatHarness();
    chat.clients.billing.invoices = [];
    const turn = await chat.say('my bill');
    expect(turn.text).toContain("don't have any invoices yet");
    expect(outcomeOf(turn, 'bill_enquiry')).toBe('no_invoices');
  });

  it('degrades gracefully when billing is unavailable', async () => {
    const chat = new ChatHarness();
    jest.spyOn(chat.clients.billing, 'listInvoices').mockRejectedValue(new DownstreamError('billing-api', 500, 'boom'));
    const turn = await chat.say('my bill');
    expect(turn.text).toContain("couldn't fetch your bill");
  });

  it('refuses business users without billing rights', async () => {
    const chat = new ChatHarness({ principal: { roles: ['BUSINESS_USER'] } });
    const turn = await chat.say('my bill');
    expect(turn.text).toContain("your account role can't do that");
    expect(chat.activeFlowId).toBeUndefined();
  });
});

describe('bill explanations', () => {
  const previous = invoice('INV-00000001', 3500);

  it('itemises one-off charges that explain an increase', () => {
    const current = invoice('INV-00000002', 6500, {
      lines: [
        { description: 'Fibre 500 monthly', amount: gbp(3500), category: 'RECURRING' },
        { description: 'Engineer visit', amount: gbp(3000), category: 'ONE_OFF' },
      ],
    });
    const reply = summariseInvoice(current, previous);
    expect(reply.text).toContain('£30.00 higher');
    expect(reply.text).toContain('one-off charges: Engineer visit (£30.00)');
  });

  it('names new recurring add-ons when there are no one-off charges', () => {
    const current = invoice('INV-00000002', 4000, {
      lines: [
        { description: 'Fibre 500 monthly', amount: gbp(3500), category: 'RECURRING' },
        { description: 'Static IP', amount: gbp(500), category: 'RECURRING' },
      ],
    });
    expect(explainChange(current, previous)).toMatchObject({ delta: 500, newRecurring: [expect.objectContaining({ description: 'Static IP' })] });
    expect(summariseInvoice(current, previous).text).toContain('New this month: Static IP');
  });

  it('reports a lower bill without inventing a reason', () => {
    const current = invoice('INV-00000002', 3000);
    expect(summariseInvoice(current, previous).text).toContain('£5.00 lower than your previous bill.');
  });

  it('does not compare invoices in different currencies', () => {
    const euro = invoice('INV-00000002', 3500, { total: { amountMinor: 4000, currency: 'EUR' } });
    expect(explainChange(euro, previous)).toBeUndefined();
  });

  it('describes paid and overdue invoices', () => {
    expect(summariseInvoice(invoice('INV-1', 100, { status: 'PAID' })).text).toContain('paid in full');
    expect(summariseInvoice(invoice('INV-1', 100, { status: 'OVERDUE' })).text).toContain("It's overdue: £1.00");
  });

  it('orders breakdown lines recurring first and credits last', () => {
    const lines = formatLines(
      invoice('INV-1', 0, {
        lines: [
          { description: 'Goodwill credit', amount: gbp(-500), category: 'CREDIT' },
          { description: 'Fibre 500 monthly', amount: gbp(3500), category: 'RECURRING' },
          { description: 'Calls', amount: gbp(120), category: 'USAGE' },
        ],
      }),
    ).split('\n');
    expect(lines).toEqual(['- Fibre 500 monthly: £35.00', '- Calls: £1.20', '- Goodwill credit: -£5.00']);
  });
});
```
