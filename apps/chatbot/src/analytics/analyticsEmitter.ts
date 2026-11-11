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
