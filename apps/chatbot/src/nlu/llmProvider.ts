import { IntentName } from '../domain/types';
import { redactText } from '../privacy/piiRedactor';
import { Logger } from '../logger';

/**
 * Pluggable LLM provider interface for intent classification.
 * Implementations receive already-redacted text; the classifier enforces this.
 */
export interface LlmIntentProvider {
  readonly name: string;
  classify(request: LlmClassifyRequest): Promise<LlmClassifyResult | undefined>;
}

export interface LlmClassifyRequest {
  redactedText: string;
  candidateIntents: IntentName[];
  /** Short, redacted context of the last few turns. */
  history: string[];
  correlationId?: string;
}

export interface LlmClassifyResult {
  intent: IntentName;
  confidence: number;
}

/** Provider used when no LLM is configured. Always abstains. */
export class NullLlmProvider implements LlmIntentProvider {
  readonly name = 'none';
  async classify(): Promise<undefined> {
    return undefined;
  }
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface HttpLlmProviderOptions {
  endpoint: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
  logger: Logger;
}

const SYSTEM_INSTRUCTION =
  'You classify customer support messages for a fibre broadband provider. ' +
  'Reply with JSON only: {"intent": <one of the allowed intents>, "confidence": <0..1>}. ' +
  'Use FALLBACK when none apply.';

/**
 * Generic HTTP chat-completion style provider. The request/response shape is the
 * common `{messages:[...]}` → `{choices:[{message:{content}}]}` contract; the model
 * output is parsed defensively and rejected if it names an intent outside the
 * candidate list.
 */
export class HttpLlmProvider implements LlmIntentProvider {
  readonly name = 'http';
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: HttpLlmProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  async classify(request: LlmClassifyRequest): Promise<LlmClassifyResult | undefined> {
    // Defence in depth: re-redact even though callers must pass redacted text.
    const userText = redactText(request.redactedText);
    const body = {
      model: this.options.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${SYSTEM_INSTRUCTION} Allowed intents: ${request.candidateIntents.join(', ')}.` },
        ...request.history.slice(-4).map((line) => ({ role: 'user', content: redactText(line) })),
        { role: 'user', content: userText },
      ],
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.options.apiKey) headers.Authorization = `Bearer ${this.options.apiKey}`;
      if (request.correlationId) headers['X-Correlation-Id'] = request.correlationId;

      const response = await this.fetchImpl(this.options.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.options.logger.warn('llm provider returned non-2xx', { status: response.status });
        return undefined;
      }
      return parseLlmResponse(await response.json(), request.candidateIntents);
    } catch (error) {
      this.options.logger.warn('llm provider call failed', { error });
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function parseLlmResponse(payload: unknown, allowed: IntentName[]): LlmClassifyResult | undefined {
  const content = extractContent(payload);
  if (!content) return undefined;
  let parsed: unknown;
  try {
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) return undefined;
    parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const { intent, confidence } = parsed as { intent?: unknown; confidence?: unknown };
  if (typeof intent !== 'string') return undefined;
  const upper = intent.toUpperCase() as IntentName;
  if (!allowed.includes(upper) && upper !== 'FALLBACK') return undefined;
  const numeric = typeof confidence === 'number' ? confidence : Number(confidence);
  if (!Number.isFinite(numeric)) return undefined;
  return { intent: upper, confidence: Math.min(1, Math.max(0, numeric)) };
}

function extractContent(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : undefined;
}
