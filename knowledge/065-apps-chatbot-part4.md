# Customer support chatbot: apps/chatbot (part 4 of 4)

- **Application:** Customer support chatbot
- **Tech stack:** Node.js (Express, TypeScript)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 15

## Files

- `apps/chatbot/src/nlu/llmProvider.test.ts` (105 lines)
- `apps/chatbot/src/nlu/llmProvider.ts` (138 lines)
- `apps/chatbot/src/nlu/rulesMatcher.ts` (142 lines)
- `apps/chatbot/src/privacy/piiRedactor.test.ts` (60 lines)
- `apps/chatbot/src/privacy/piiRedactor.ts` (134 lines)
- `apps/chatbot/src/privacy/redactionPipeline.test.ts` (80 lines)
- `apps/chatbot/src/ratelimit/rateLimiter.edge.test.ts` (53 lines)
- `apps/chatbot/src/ratelimit/rateLimiter.test.ts` (56 lines)
- `apps/chatbot/src/ratelimit/rateLimiter.ts` (71 lines)
- `apps/chatbot/src/server.ts` (74 lines)
- `apps/chatbot/src/session/conversationRepository.ts` (85 lines)
- `apps/chatbot/src/testing/chatHarness.ts` (107 lines)
- `apps/chatbot/src/testing/fakes.ts` (204 lines)
- `apps/chatbot/src/transcripts/transcriptRepository.ts` (83 lines)
- `apps/chatbot/tsconfig.json` (21 lines)

## apps/chatbot/src/nlu/llmProvider.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/nlu/llmProvider.test.ts`.

```typescript
import { silentLogger } from '../logger';
import { FetchLike, HttpLlmProvider, LlmClassifyRequest } from './llmProvider';

type FetchInit = Parameters<FetchLike>[1];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function completion(content: string) {
  return { choices: [{ message: { content } }] };
}

const request: LlmClassifyRequest = {
  redactedText: 'can I get something quicker',
  candidateIntents: ['PLAN_UPGRADE', 'BILL_ENQUIRY'],
  history: [],
  correlationId: 'corr-12345678',
};

function provider(fetchImpl: FetchLike, overrides: { apiKey?: string; timeoutMs?: number } = {}) {
  return new HttpLlmProvider({
    endpoint: 'https://llm.test/v1/chat/completions',
    model: 'intent-small',
    timeoutMs: overrides.timeoutMs ?? 1000,
    apiKey: overrides.apiKey,
    fetchImpl,
    logger: silentLogger,
  });
}

describe('HttpLlmProvider', () => {
  it('posts a deterministic JSON-mode request with auth and correlation headers', async () => {
    const calls: Array<{ url: string; init: FetchInit }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(completion('{"intent":"PLAN_UPGRADE","confidence":0.82}'));
    };

    const result = await provider(fetchImpl, { apiKey: 'k-123' }).classify(request);

    expect(result).toEqual({ intent: 'PLAN_UPGRADE', confidence: 0.82 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://llm.test/v1/chat/completions');
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer k-123', 'X-Correlation-Id': 'corr-12345678' });
    const body = JSON.parse(calls[0].init.body);
    expect(body).toMatchObject({ model: 'intent-small', temperature: 0, response_format: { type: 'json_object' } });
    expect(body.messages[0].content).toContain('Allowed intents: PLAN_UPGRADE, BILL_ENQUIRY.');
  });

  it('omits the Authorization header when no API key is configured', async () => {
    let headers: Record<string, string> = {};
    await provider(async (_url, init) => {
      headers = init.headers;
      return jsonResponse(completion('{"intent":"FALLBACK","confidence":0.2}'));
    }).classify(request);
    expect(headers.Authorization).toBeUndefined();
  });

  it('re-redacts text and history as defence in depth, keeping only the last four turns', async () => {
    let body: { messages: Array<{ role: string; content: string }> } = { messages: [] };
    await provider(async (_url, init) => {
      body = JSON.parse(init.body);
      return jsonResponse(completion('{"intent":"BILL_ENQUIRY","confidence":0.7}'));
    }).classify({
      ...request,
      redactedText: 'card 4111 1111 1111 1111 was charged',
      history: ['turn 1', 'turn 2', 'mail me at jo@example.com', 'turn 4', 'turn 5'],
    });

    const contents = body.messages.map((m) => m.content);
    expect(contents).toHaveLength(6);
    expect(contents).not.toContain('turn 1');
    expect(contents).toContain('mail me at [EMAIL]');
    expect(contents[contents.length - 1]).toBe('card [CARD_NUMBER] was charged');
  });

  it('abstains on non-2xx responses and transport errors', async () => {
    await expect(provider(async () => jsonResponse({ error: 'overloaded' }, 503)).classify(request)).resolves.toBeUndefined();
    await expect(
      provider(async () => {
        throw new Error('ECONNRESET');
      }).classify(request),
    ).resolves.toBeUndefined();
  });

  it('aborts and abstains when the provider exceeds its timeout', async () => {
    let aborted = false;
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });
    await expect(provider(hanging, { timeoutMs: 20 }).classify(request)).resolves.toBeUndefined();
    expect(aborted).toBe(true);
  });

  it('rejects intents the classifier did not offer', async () => {
    const result = await provider(async () => jsonResponse(completion('{"intent":"CLOSE_ACCOUNT","confidence":0.99}'))).classify(request);
    expect(result).toBeUndefined();
  });
});
```

## apps/chatbot/src/nlu/llmProvider.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/nlu/llmProvider.ts`.

```typescript
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
```

## apps/chatbot/src/nlu/rulesMatcher.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/nlu/rulesMatcher.ts`.

```typescript
import { IntentName } from '../domain/types';

/**
 * Rules-based intent matcher. Each intent declares weighted keyword stems,
 * multi-word phrases and optional negative cues. The score is a saturating
 * sum of matched weights, so a single strong phrase is enough for high
 * confidence while scattered weak keywords stay below threshold.
 */

export interface IntentRule {
  intent: IntentName;
  /** Exact phrases (matched against normalised text). Strong evidence. */
  phrases: string[];
  /** Single-token stems with weights in (0, 1]. */
  keywords: Record<string, number>;
  /** Tokens that, when present, rule this intent out. */
  negatives?: string[];
  /** Only matches when the whole utterance is short (e.g. "yes", "hi"). */
  shortFormOnly?: boolean;
}

export interface RuleScore {
  intent: IntentName;
  score: number;
}

export const DEFAULT_RULES: IntentRule[] = [
  {
    intent: 'CHECK_OUTAGE',
    phrases: ['internet is down', 'no internet', 'is there an outage', 'service down', 'not working', 'no connection', 'lost connection'],
    keywords: { outage: 0.8, down: 0.4, offline: 0.6, disconnected: 0.5, connection: 0.3, signal: 0.3, area: 0.2 },
    negatives: ['bill', 'invoice'],
  },
  {
    intent: 'BILL_ENQUIRY',
    phrases: ['my bill', 'latest invoice', 'how much do i owe', 'charged twice', 'payment due', 'bill higher'],
    keywords: { bill: 0.7, invoice: 0.7, charge: 0.5, charged: 0.5, payment: 0.4, owe: 0.5, balance: 0.5, refund: 0.4 },
  },
  {
    intent: 'RESET_ROUTER',
    phrases: ['reset my router', 'restart router', 'reboot the router', 'router lights', 'wifi is slow', 'reset the hub'],
    keywords: { router: 0.6, hub: 0.5, reboot: 0.7, restart: 0.6, reset: 0.5, wifi: 0.4, slow: 0.3, ont: 0.5 },
    negatives: ['password'],
  },
  {
    intent: 'PLAN_UPGRADE',
    phrases: ['upgrade my plan', 'faster speed', 'change my package', 'better plan', 'move to gigabit'],
    keywords: { upgrade: 0.8, faster: 0.5, plan: 0.3, package: 0.3, gigabit: 0.6, speed: 0.3, mbps: 0.3, gbps: 0.4 },
    negatives: ['downgrade', 'cancel'],
  },
  {
    intent: 'RAISE_TICKET',
    phrases: ['raise a ticket', 'log a fault', 'open a case', 'report a problem', 'make a complaint'],
    keywords: { ticket: 0.7, fault: 0.6, complaint: 0.6, case: 0.4, report: 0.4, issue: 0.3, problem: 0.3 },
  },
  {
    intent: 'TALK_TO_AGENT',
    phrases: ['speak to a human', 'talk to an agent', 'real person', 'speak to someone', 'customer service', 'live agent'],
    keywords: { human: 0.7, agent: 0.6, person: 0.4, operator: 0.6, representative: 0.7, someone: 0.2 },
  },
  {
    intent: 'GREETING',
    phrases: ['good morning', 'good afternoon', 'good evening'],
    keywords: { hi: 1, hello: 1, hey: 1, hiya: 1 },
    shortFormOnly: true,
  },
  {
    intent: 'GOODBYE',
    phrases: ['thats all', 'that is all', 'no thanks bye'],
    keywords: { bye: 1, goodbye: 1, thanks: 0.6, cheers: 0.6 },
    shortFormOnly: true,
  },
  {
    intent: 'AFFIRM',
    phrases: ['yes please', 'go ahead', 'sounds good', 'that is right', 'thats right'],
    keywords: { yes: 1, yeah: 1, yep: 1, sure: 0.9, ok: 0.8, okay: 0.8, correct: 0.9, confirm: 0.9 },
    shortFormOnly: true,
  },
  {
    intent: 'DENY',
    phrases: ['no thanks', 'not now', 'dont bother'],
    keywords: { no: 1, nope: 1, nah: 1, wrong: 0.7 },
    shortFormOnly: true,
  },
  {
    intent: 'CANCEL',
    phrases: ['never mind', 'start over', 'forget it', 'stop this'],
    keywords: { cancel: 0.9, nevermind: 1, stop: 0.6, quit: 0.8 },
  },
];

const SHORT_FORM_MAX_TOKENS = 4;

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const clean = normalise(text);
  return clean.length > 0 ? clean.split(' ') : [];
}

/** Maps accumulated evidence onto (0, 1): 1 - e^(-k*x). */
function saturate(raw: number): number {
  return 1 - Math.exp(-1.6 * raw);
}

export class RulesMatcher {
  constructor(private readonly rules: IntentRule[] = DEFAULT_RULES) {}

  score(text: string): RuleScore[] {
    const normalised = normalise(text);
    const tokens = tokenize(text);
    const tokenSet = new Set(tokens);
    const results: RuleScore[] = [];

    for (const rule of this.rules) {
      if (rule.shortFormOnly && tokens.length > SHORT_FORM_MAX_TOKENS) continue;
      if (rule.negatives?.some((neg) => tokenSet.has(neg))) continue;

      let evidence = 0;
      for (const phrase of rule.phrases) {
        if (` ${normalised} `.includes(` ${phrase} `)) evidence += 1.2;
      }
      for (const [keyword, weight] of Object.entries(rule.keywords)) {
        if (tokenSet.has(keyword)) evidence += weight;
      }
      if (evidence > 0) results.push({ intent: rule.intent, score: Number(saturate(evidence).toFixed(4)) });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  best(text: string): RuleScore | undefined {
    return this.score(text)[0];
  }
}
```

## apps/chatbot/src/privacy/piiRedactor.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/privacy/piiRedactor.test.ts`.

```typescript
import { findPii, passesLuhn, redact, redactPayload, redactText } from './piiRedactor';

describe('piiRedactor', () => {
  it('validates card numbers with the Luhn checksum', () => {
    expect(passesLuhn('4111 1111 1111 1111')).toBe(true);
    expect(passesLuhn('4111 1111 1111 1112')).toBe(false);
    expect(passesLuhn('1234')).toBe(false);
  });

  it('redacts emails, card numbers and phone numbers', () => {
    const result = redactText('Email me at jane.doe@example.com, card 4111-1111-1111-1111, call 07700 900123');
    expect(result).toBe('Email me at [EMAIL], card [CARD_NUMBER], call [PHONE]');
  });

  it('does not treat a non-Luhn digit run as a card number', () => {
    const matches = findPii('order 1234567890123456 placed');
    expect(matches.some((m) => m.kind === 'CARD_NUMBER')).toBe(false);
  });

  it('redacts UK postcodes case-insensitively', () => {
    expect(redactText('I live at sw1a 1aa near the park')).toBe('I live at [UK_POSTCODE] near the park');
  });

  it('leaves ordinary words that merely contain or follow a secret keyword untouched', () => {
    expect(redactText('my router is pinned to channel six')).toBe('my router is pinned to channel six');
    expect(redactText('I need a password reset')).toBe('I need a password reset');
    expect(redactText("my password isn't working")).toBe("my password isn't working");
  });

  it('redacts a bare PIN given straight after the keyword', () => {
    expect(redactText('my pin 4821 please')).toBe('my pin [PASSWORD] please');
  });

  it('redacts only the secret part of a password disclosure', () => {
    expect(redactText('my password is Hunter2!')).toBe('my password is [PASSWORD]');
  });

  it('validates IPv4 octets before redacting', () => {
    expect(redactText('router at 192.168.1.254')).toBe('router at [IP_ADDRESS]');
    expect(redactText('version 999.1.2.3')).toBe('version 999.1.2.3');
  });

  it('keeps kinds that the caller explicitly allows', () => {
    const result = redact('postcode SW1A 1AA email a@b.co', new Set(['UK_POSTCODE']));
    expect(result.text).toBe('postcode SW1A 1AA email [EMAIL]');
    expect(result.matches).toHaveLength(1);
  });

  it('resolves overlapping matches in favour of the earliest and longest', () => {
    const matches = findPii('+44 7700 900123');
    expect(matches).toHaveLength(1);
    expect(matches[0].kind).toBe('PHONE');
  });

  it('deep-redacts nested payloads', () => {
    const payload = { user: { note: 'contact x@y.com' }, tags: ['07700 900123', 'ok'], count: 3 };
    expect(redactPayload(payload)).toEqual({ user: { note: 'contact [EMAIL]' }, tags: ['[PHONE]', 'ok'], count: 3 });
  });
});
```

## apps/chatbot/src/privacy/piiRedactor.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/privacy/piiRedactor.ts`.

```typescript
/**
 * PII redaction applied before any utterance is persisted, logged, sent to analytics
 * or forwarded to a third-party LLM provider.
 *
 * Detectors run in priority order; overlapping matches are resolved in favour of the
 * earliest-starting, then longest match so that e.g. a card number is not partially
 * re-labelled as a phone number.
 */

export type PiiKind = 'EMAIL' | 'CARD_NUMBER' | 'PHONE' | 'UK_POSTCODE' | 'IBAN' | 'SORT_CODE' | 'IP_ADDRESS' | 'PASSWORD';

export interface PiiMatch {
  kind: PiiKind;
  start: number;
  end: number;
}

interface Detector {
  kind: PiiKind;
  pattern: RegExp;
  /** Optional secondary check to reduce false positives. */
  accept?: (match: string) => boolean;
  /** Capture group holding the sensitive part (defaults to whole match). */
  group?: number;
}

/** Luhn checksum used to confirm candidate card numbers. */
export function passesLuhn(digits: string): boolean {
  const clean = digits.replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = clean.length - 1; i >= 0; i -= 1) {
    let digit = clean.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function isValidIpv4(candidate: string): boolean {
  return candidate.split('.').every((octet) => {
    const n = Number(octet);
    return octet.length > 0 && octet.length <= 3 && n >= 0 && n <= 255;
  });
}

const DETECTORS: Detector[] = [
  {
    kind: 'PASSWORD',
    // The keyword must be a whole word ("pinned" is not a PIN disclosure) and be followed
    // either by an explicit separator ("is", ":", "=") or directly by a value containing a
    // digit ("pin 4821"), so phrases like "password reset" or "password isn't working" pass.
    pattern: /\b(?:password|passcode|pwd|pin)\b(?:\s*(?:is\b|[:=])\s*|\s+(?=\S*\d))(\S{3,})/gi,
    group: 1,
  },
  { kind: 'EMAIL', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: 'CARD_NUMBER', pattern: /\b(?:\d[ -]?){12,18}\d\b/g, accept: passesLuhn },
  { kind: 'IBAN', pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g },
  { kind: 'SORT_CODE', pattern: /\b\d{2}-\d{2}-\d{2}\b/g },
  { kind: 'IP_ADDRESS', pattern: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, accept: isValidIpv4 },
  { kind: 'PHONE', pattern: /(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\b/g },
  { kind: 'UK_POSTCODE', pattern: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi },
];

export function findPii(text: string): PiiMatch[] {
  const candidates: PiiMatch[] = [];
  for (const detector of DETECTORS) {
    detector.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = detector.pattern.exec(text)) !== null) {
      const whole = match[0];
      const sensitive = detector.group !== undefined ? match[detector.group] : whole;
      if (sensitive === undefined) continue;
      if (detector.accept && !detector.accept(sensitive)) continue;
      const offset = detector.group !== undefined ? whole.lastIndexOf(sensitive) : 0;
      const start = match.index + offset;
      candidates.push({ kind: detector.kind, start, end: start + sensitive.length });
    }
  }

  candidates.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const accepted: PiiMatch[] = [];
  let cursor = -1;
  for (const candidate of candidates) {
    if (candidate.start >= cursor) {
      accepted.push(candidate);
      cursor = candidate.end;
    }
  }
  return accepted;
}

export interface RedactionResult {
  text: string;
  matches: PiiMatch[];
}

export function redact(text: string, keep: ReadonlySet<PiiKind> = new Set()): RedactionResult {
  const matches = findPii(text).filter((m) => !keep.has(m.kind));
  if (matches.length === 0) return { text, matches };
  let output = '';
  let cursor = 0;
  for (const match of matches) {
    output += text.slice(cursor, match.start) + `[${match.kind}]`;
    cursor = match.end;
  }
  output += text.slice(cursor);
  return { text: output, matches };
}

/** Convenience wrapper returning only the redacted string. */
export function redactText(text: string): string {
  return redact(text).text;
}

/** Deep-redacts string values inside an analytics/log payload. */
export function redactPayload<T>(payload: T): T {
  if (typeof payload === 'string') return redactText(payload) as unknown as T;
  if (Array.isArray(payload)) return payload.map((item) => redactPayload(item)) as unknown as T;
  if (payload && typeof payload === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      result[key] = redactPayload(value);
    }
    return result as T;
  }
  return payload;
}
```

## apps/chatbot/src/privacy/redactionPipeline.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/privacy/redactionPipeline.test.ts`.

```typescript
import { AnalyticsEvent, BatchingAnalytics } from '../analytics/analyticsEmitter';
import { silentLogger } from '../logger';
import { InMemoryTranscriptRepository } from '../transcripts/transcriptRepository';
import { findPii, redact, redactPayload, redactText } from './piiRedactor';

/**
 * Covers the remaining detectors and verifies that every sink that persists or
 * exports customer text (transcripts, analytics) applies redaction itself.
 */

describe('financial and credential detectors', () => {
  it('redacts IBANs as a single span even when the digits would also pass as a card', () => {
    const matches = findPii('refund to GB82 WEST 1234 5698 7654 32 please');
    expect(matches).toEqual([{ kind: 'IBAN', start: 10, end: 37 }]);
    expect(redactText('refund to GB82 WEST 1234 5698 7654 32 please')).toBe('refund to [IBAN] please');
  });

  it('redacts sort codes but leaves ordinary hyphenated dates alone', () => {
    expect(redactText('sort code 12-34-56')).toBe('sort code [SORT_CODE]');
    expect(redactText('installed on 2026-11-09')).toBe('installed on 2026-11-09');
  });

  it('redacts PINs and passcodes while keeping the disclosure wording', () => {
    expect(redactText('my pin: 4821')).toBe('my pin: [PASSWORD]');
    expect(redactText('Passcode = s3cr3t-value')).toBe('Passcode = [PASSWORD]');
  });

  it('redacts several kinds in one utterance, preserving surrounding text exactly', () => {
    const { text, matches } = redact('Hi, I am jo@example.com at M1 1AE, router 10.0.0.1, call +447700900123.');
    expect(text).toBe('Hi, I am [EMAIL] at [UK_POSTCODE], router [IP_ADDRESS], call [PHONE].');
    expect(matches.map((m) => m.kind)).toEqual(['EMAIL', 'UK_POSTCODE', 'IP_ADDRESS', 'PHONE']);
  });

  it('returns the original string untouched when there is nothing to redact', () => {
    const input = 'My 500 Mbps plan is slow tonight';
    expect(redact(input)).toEqual({ text: input, matches: [] });
  });

  it('does not mutate the payload it redacts', () => {
    const payload = { note: 'email a@b.co', nested: { list: ['x@y.com'] } };
    const copy = structuredClone(payload);
    redactPayload(payload);
    expect(payload).toEqual(copy);
  });

  it('passes through non-string scalars and nulls', () => {
    expect(redactPayload({ n: 1, b: false, z: null, u: undefined })).toEqual({ n: 1, b: false, z: null, u: undefined });
  });
});

describe('sinks redact on write', () => {
  it('stores only redacted transcript text, whoever the author is', async () => {
    const repo = new InMemoryTranscriptRepository(() => new Date('2026-11-09T10:00:00Z'), () => 'entry-1');
    const stored = await repo.append({ conversationId: 'c1', author: 'AGENT', text: 'I have emailed jane@example.com' });
    expect(stored.text).toBe('I have emailed [EMAIL]');
    const page = await repo.list('c1', 1, 10);
    expect(page.items[0].text).toBe('I have emailed [EMAIL]');
  });

  it('redacts analytics properties and hashes the user id before export', async () => {
    const batches: AnalyticsEvent[][] = [];
    const analytics = new BatchingAnalytics({
      transport: async (events) => {
        batches.push(events);
      },
      batchSize: 10,
      flushIntervalMs: 0,
      logger: silentLogger,
    });

    analytics.track('fallback', 'c1', 'user-42', { utterance: 'ring me on 07700 900123', outcome: '1' });
    await analytics.close();

    const [event] = batches[0];
    expect(event.properties.utterance).toBe('ring me on [PHONE]');
    expect(event.userHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(event)).not.toContain('user-42');
  });
});
```

## apps/chatbot/src/ratelimit/rateLimiter.edge.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/ratelimit/rateLimiter.edge.test.ts`.

```typescript
import { SlidingWindowRateLimiter } from './rateLimiter';

describe('SlidingWindowRateLimiter edge cases', () => {
  let now: number;
  const clock = () => now;

  beforeEach(() => {
    now = 5_000_000;
  });

  it('never tells a client to retry in less than one second', () => {
    const limiter = new SlidingWindowRateLimiter(10_000, 1, clock);
    limiter.hit('u');
    now += 9_999;
    expect(limiter.hit('u')).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 1, limit: 1 });
  });

  it('does not let denied attempts extend the lockout', () => {
    const limiter = new SlidingWindowRateLimiter(10_000, 1, clock);
    limiter.hit('u');
    for (let i = 0; i < 5; i += 1) {
      now += 1_000;
      expect(limiter.hit('u').allowed).toBe(false);
    }
    now += 5_001;
    expect(limiter.hit('u').allowed).toBe(true);
  });

  it('treats a hit exactly one window old as expired', () => {
    const limiter = new SlidingWindowRateLimiter(1_000, 1, clock);
    limiter.hit('u');
    now += 1_000;
    expect(limiter.hit('u').allowed).toBe(true);
  });

  it('restores the full budget after reset', () => {
    const limiter = new SlidingWindowRateLimiter(60_000, 2, clock);
    limiter.hit('u');
    limiter.hit('u');
    limiter.reset('u');
    expect(limiter.hit('u')).toMatchObject({ allowed: true, remaining: 1 });
  });

  it('keeps active keys during a sweep and frees memory for idle ones', () => {
    const limiter = new SlidingWindowRateLimiter(1_000, 3, clock);
    for (let i = 0; i < 100; i += 1) limiter.hit(`ip:10.0.0.${i}`);
    now += 1_001;
    limiter.hit('user:active');
    expect(limiter.sweep()).toBe(100);
    expect(limiter.size).toBe(1);
  });
});
```

## apps/chatbot/src/ratelimit/rateLimiter.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/ratelimit/rateLimiter.test.ts`.

```typescript
import { SlidingWindowRateLimiter } from './rateLimiter';

describe('SlidingWindowRateLimiter', () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    now = 1_000_000;
  });

  it('allows up to max hits within the window', () => {
    const limiter = new SlidingWindowRateLimiter(60_000, 3, clock);
    expect(limiter.hit('u').remaining).toBe(2);
    expect(limiter.hit('u').remaining).toBe(1);
    expect(limiter.hit('u').remaining).toBe(0);
    const denied = limiter.hit('u');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(60);
  });

  it('slides the window rather than resetting at fixed boundaries', () => {
    const limiter = new SlidingWindowRateLimiter(10_000, 2, clock);
    limiter.hit('u');
    now += 6_000;
    limiter.hit('u');
    now += 2_000;
    const denied = limiter.hit('u');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(2);
    now += 2_001;
    expect(limiter.hit('u').allowed).toBe(true);
  });

  it('keeps keys independent', () => {
    const limiter = new SlidingWindowRateLimiter(1_000, 1, clock);
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('b').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(false);
  });

  it('sweeps idle keys', () => {
    const limiter = new SlidingWindowRateLimiter(1_000, 5, clock);
    limiter.hit('a');
    limiter.hit('b');
    now += 500;
    limiter.hit('b');
    now += 600;
    expect(limiter.sweep()).toBe(1);
    expect(limiter.size).toBe(1);
  });

  it('rejects invalid configuration', () => {
    expect(() => new SlidingWindowRateLimiter(0, 1)).toThrow(RangeError);
  });
});
```

## apps/chatbot/src/ratelimit/rateLimiter.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/ratelimit/rateLimiter.ts`.

```typescript
/**
 * Sliding-window-log rate limiter keyed by user (or IP for anonymous traffic).
 * Shared by the REST message endpoint and the WebSocket gateway so a client
 * cannot bypass limits by switching transport.
 *
 * Memory is bounded: timestamps outside the window are pruned on every hit,
 * and idle keys are swept periodically.
 */

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  /** Seconds until the next message would be allowed (0 when allowed). */
  retryAfterSeconds: number;
  limit: number;
}

export interface RateLimiter {
  hit(key: string): RateLimitDecision;
  reset(key: string): void;
}

export class SlidingWindowRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
    private readonly now: () => number = Date.now,
  ) {
    if (windowMs <= 0 || max <= 0) throw new RangeError('windowMs and max must be positive');
  }

  hit(key: string): RateLimitDecision {
    const now = this.now();
    const windowStart = now - this.windowMs;
    const log = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (log.length >= this.max) {
      this.hits.set(key, log);
      const retryAfterMs = log[0] + this.windowMs - now;
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)), limit: this.max };
    }

    log.push(now);
    this.hits.set(key, log);
    return { allowed: true, remaining: this.max - log.length, retryAfterSeconds: 0, limit: this.max };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Removes keys with no hits inside the window. Returns the number removed. */
  sweep(): number {
    const windowStart = this.now() - this.windowMs;
    let removed = 0;
    for (const [key, log] of this.hits) {
      if (log.length === 0 || log[log.length - 1] <= windowStart) {
        this.hits.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.hits.size;
  }
}
```

## apps/chatbot/src/server.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/server.ts`.

```typescript
import { createServer } from 'http';
import { createApplication } from './app';
import { loadConfig } from './config';
import { HandoffPublisher } from './conversation/conversationService';
import { WebSocketGateway } from './gateway/websocketGateway';
import { createLogger } from './logger';

/** Process entry point: HTTP + WebSocket on one port, with graceful shutdown. */

const TRANSCRIPT_RETENTION_DAYS = 90;
const HOUSEKEEPING_INTERVAL_MS = 15 * 60 * 1000;

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { env: config.env });

  // The gateway is created first so it can act as the handoff publisher and
  // receive live-agent messages from the REST endpoint.
  let gateway: WebSocketGateway | undefined;
  const handoff: HandoffPublisher = {
    publish: async (conversation, transcript) => gateway?.publish(conversation, transcript),
  };

  const application = createApplication(config, logger, {
    handoff,
    onAgentMessage: (entry) => {
      gateway?.deliverAgentMessage(entry);
    },
  });

  gateway = new WebSocketGateway({
    allowedOrigins: config.widgetAllowedOrigins,
    logger,
    sessionDeps: { service: application.service, auth: config.auth, limiter: application.limiter, logger },
  });

  const server = createServer(application.app);
  gateway.attach(server);

  const housekeeping = setInterval(async () => {
    try {
      const expired = await application.repository.purgeExpired();
      const swept = application.limiter.sweep();
      const cutoff = new Date(Date.now() - TRANSCRIPT_RETENTION_DAYS * 86_400_000).toISOString();
      const purged = await application.transcripts.purgeOlderThan(cutoff);
      logger.info('housekeeping', { expiredConversations: expired, rateLimitKeysSwept: swept, transcriptEntriesPurged: purged });
    } catch (error) {
      logger.error('housekeeping failed', { error });
    }
  }, HOUSEKEEPING_INTERVAL_MS);
  housekeeping.unref();

  server.listen(config.port, () => logger.info('chatbot listening', { port: config.port }));

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down', { signal });
    clearInterval(housekeeping);
    await gateway?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await application.analytics.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ level: 'error', message: 'startup failed', error: String(error) })}\n`);
  process.exit(1);
});
```

## apps/chatbot/src/session/conversationRepository.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/session/conversationRepository.ts`.

```typescript
import { Conversation } from '../domain/types';

/**
 * Conversation (session) persistence. The in-memory implementation enforces an
 * idle TTL and optimistic concurrency via a version counter so two concurrent
 * messages on the same conversation cannot silently overwrite each other's
 * dialog state. A Redis implementation can satisfy the same interface.
 */

export interface StoredConversation {
  conversation: Conversation;
  version: number;
  expiresAt: number;
}

export interface ConversationRepository {
  get(id: string): Promise<StoredConversation | undefined>;
  create(conversation: Conversation): Promise<StoredConversation>;
  /** Saves if `expectedVersion` matches; returns false on a concurrent write. */
  save(conversation: Conversation, expectedVersion: number): Promise<boolean>;
  listByUser(userId: string): Promise<Conversation[]>;
  purgeExpired(): Promise<number>;
}

export class InMemoryConversationRepository implements ConversationRepository {
  private readonly items = new Map<string, StoredConversation>();

  constructor(
    private readonly ttlSeconds: number,
    private readonly now: () => number = Date.now,
  ) {}

  async get(id: string): Promise<StoredConversation | undefined> {
    const stored = this.items.get(id);
    if (!stored) return undefined;
    if (stored.expiresAt <= this.now()) {
      this.items.delete(id);
      return undefined;
    }
    return { conversation: structuredClone(stored.conversation), version: stored.version, expiresAt: stored.expiresAt };
  }

  async create(conversation: Conversation): Promise<StoredConversation> {
    if (this.items.has(conversation.id)) throw new Error(`Conversation ${conversation.id} already exists`);
    const stored = { conversation: structuredClone(conversation), version: 1, expiresAt: this.expiry() };
    this.items.set(conversation.id, stored);
    return { ...stored, conversation: structuredClone(conversation) };
  }

  async save(conversation: Conversation, expectedVersion: number): Promise<boolean> {
    const existing = this.items.get(conversation.id);
    if (!existing || existing.version !== expectedVersion) return false;
    this.items.set(conversation.id, {
      conversation: structuredClone(conversation),
      version: expectedVersion + 1,
      expiresAt: this.expiry(),
    });
    return true;
  }

  async listByUser(userId: string): Promise<Conversation[]> {
    const now = this.now();
    return [...this.items.values()]
      .filter((s) => s.expiresAt > now && s.conversation.principal.userId === userId)
      .map((s) => structuredClone(s.conversation))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async purgeExpired(): Promise<number> {
    const now = this.now();
    let removed = 0;
    for (const [id, stored] of this.items) {
      if (stored.expiresAt <= now) {
        this.items.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  private expiry(): number {
    return this.now() + this.ttlSeconds * 1000;
  }
}
```

## apps/chatbot/src/testing/chatHarness.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/testing/chatHarness.ts`.

```typescript
import { AnalyticsEvent, AnalyticsEventName, AnalyticsSink } from '../analytics/analyticsEmitter';
import { DialogEngine, TurnEvent } from '../dialog/dialogEngine';
import { defaultFlowRegistry } from '../dialog/flows';
import { BotReply, Conversation, IntentPrediction, Principal } from '../domain/types';
import { silentLogger } from '../logger';
import { CompositeIntentClassifier } from '../nlu/intentClassifier';
import { NullLlmProvider } from '../nlu/llmProvider';
import { RulesMatcher } from '../nlu/rulesMatcher';
import { ACCOUNT_ID, FakeClients, fakeClients, OPEN_HOURS_CLOCK } from './fakes';

/**
 * Drives the real classifier + dialog engine turn by turn against fake platform
 * clients, so flow tests read like the conversation a customer would have.
 */

export interface HarnessTurn {
  prediction: IntentPrediction;
  replies: BotReply[];
  events: TurnEvent[];
  /** All reply texts of the turn joined by newlines, for concise assertions. */
  text: string;
}

export interface HarnessOptions {
  principal?: Partial<Principal>;
  clients?: FakeClients;
  clock?: () => Date;
}

export function principal(overrides: Partial<Principal> = {}): Principal {
  return { userId: 'user-1', accountId: ACCOUNT_ID, roles: ['CONSUMER'], displayName: 'Jane Customer', ...overrides };
}

export function newConversation(owner: Principal, now: Date): Conversation {
  const iso = now.toISOString();
  return {
    id: '00000000-0000-4000-8000-000000000001',
    principal: owner,
    channel: 'REST',
    status: 'ACTIVE',
    suspendedFlows: [],
    fallbackCount: 0,
    createdAt: iso,
    updatedAt: iso,
  };
}

export class ChatHarness {
  readonly clients: FakeClients;
  readonly conversation: Conversation;
  private readonly engine: DialogEngine;
  private readonly classifier = new CompositeIntentClassifier({
    rules: new RulesMatcher(),
    llm: new NullLlmProvider(),
    minConfidence: 0.55,
    logger: silentLogger,
  });
  private turnCount = 0;

  constructor(options: HarnessOptions = {}) {
    const clock = options.clock ?? OPEN_HOURS_CLOCK;
    this.clients = options.clients ?? fakeClients();
    this.conversation = newConversation(principal(options.principal), clock());
    this.engine = new DialogEngine({ flows: defaultFlowRegistry(clock), clients: this.clients, logger: silentLogger, clock });
  }

  async say(text: string): Promise<HarnessTurn> {
    this.turnCount += 1;
    const prediction = await this.classifier.classify(text);
    const result = await this.engine.handleTurn(this.conversation, text, prediction, { correlationId: `test-turn-${this.turnCount}` });
    return { prediction, ...result, text: result.replies.map((r) => r.text).join('\n') };
  }

  get activeFlowId(): string | undefined {
    return this.conversation.activeFlow?.flowId;
  }

  get awaiting(): string | undefined {
    return this.conversation.activeFlow?.state;
  }
}

export function outcomeOf(turn: HarnessTurn, flowId: string): string | undefined {
  return turn.events.find((e) => (e.type === 'flow_completed' || e.type === 'flow_abandoned') && e.flowId === flowId)?.outcome;
}

/** Analytics sink that records events in memory for assertions. */
export class RecordingAnalytics implements AnalyticsSink {
  readonly events: Array<{ name: AnalyticsEventName; conversationId: string; userId: string; properties: AnalyticsEvent['properties'] }> = [];

  track(name: AnalyticsEventName, conversationId: string, userId: string, properties: AnalyticsEvent['properties'] = {}): void {
    this.events.push({ name, conversationId, userId, properties });
  }

  names(): AnalyticsEventName[] {
    return this.events.map((e) => e.name);
  }

  async flush(): Promise<void> {
    return undefined;
  }

  async close(): Promise<void> {
    return undefined;
  }
}
```

## apps/chatbot/src/testing/fakes.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/testing/fakes.ts`.

```typescript
import jwt from 'jsonwebtoken';
import {
  AccountClient,
  AccountSummary,
  BillingClient,
  CreateTicketRequest,
  Invoice,
  LineDiagnostic,
  NetworkClient,
  OutageStatus,
  PlanOffer,
  PlatformClients,
  Ticket,
  TicketClient,
  UpgradeOrderResult,
} from '../clients/platformClients';
import { AppConfig } from '../config';
import { DownstreamError, NotFoundError } from '../domain/errors';
import { Page } from '../domain/types';

/**
 * In-memory fakes of the platform APIs plus fixture builders, shared by
 * flow, service and HTTP tests.
 */

export const ACCOUNT_ID = 'ACC-12345678';

export function gbp(amountMinor: number) {
  return { amountMinor, currency: 'GBP' };
}

export function account(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    accountId: ACCOUNT_ID,
    name: 'Jane Customer',
    segment: 'CONSUMER',
    services: [
      {
        serviceId: 'SVC-1',
        productCode: 'FIBRE-500',
        productName: 'Fibre 500',
        downloadMbps: 500,
        uploadMbps: 100,
        status: 'ACTIVE',
        serviceAddress: { line1: '1 High Street', town: 'London', postcode: 'SW1A 1AA' },
        monthlyPrice: gbp(3500),
      },
    ],
    ...overrides,
  };
}

export function invoice(id: string, totalMinor: number, overrides: Partial<Invoice> = {}): Invoice {
  return {
    invoiceId: id,
    accountId: ACCOUNT_ID,
    periodStart: '2026-10-01T00:00:00Z',
    periodEnd: '2026-10-31T23:59:59Z',
    issuedAt: '2026-11-01T00:00:00Z',
    dueDate: '2026-11-15T00:00:00Z',
    status: 'ISSUED',
    total: gbp(totalMinor),
    balanceDue: gbp(totalMinor),
    lines: [{ description: 'Fibre 500 monthly', amount: gbp(3500), category: 'RECURRING' }],
    ...overrides,
  };
}

export class FakeAccountClient implements AccountClient {
  calls = 0;
  constructor(public summary: AccountSummary = account(), public failWith?: Error) {}
  async getAccount(): Promise<AccountSummary> {
    this.calls += 1;
    if (this.failWith) throw this.failWith;
    return this.summary;
  }
}

export class FakeBillingClient implements BillingClient {
  invoices: Invoice[] = [invoice('INV-00000002', 4999), invoice('INV-00000001', 3500)];
  offers: PlanOffer[] = [
    { code: 'FIBRE-900', name: 'Fibre 900', downloadMbps: 900, uploadMbps: 200, monthly: gbp(4500), contractMonths: 18 },
    { code: 'FIBRE-1000', name: 'Gigabit', downloadMbps: 1000, uploadMbps: 1000, monthly: gbp(5500), contractMonths: 18 },
    { code: 'FIBRE-100', name: 'Fibre 100', downloadMbps: 100, uploadMbps: 20, monthly: gbp(2500), contractMonths: 12 },
  ];
  planChanges: Array<{ serviceId: string; planCode: string; key: string }> = [];

  async listInvoices(_accountId: string, _ctx: unknown, page = 1, pageSize = 3): Promise<Page<Invoice>> {
    const start = (page - 1) * pageSize;
    return { items: this.invoices.slice(start, start + pageSize), page, pageSize, total: this.invoices.length };
  }

  async getInvoice(_accountId: string, invoiceId: string): Promise<Invoice> {
    const found = this.invoices.find((i) => i.invoiceId === invoiceId);
    if (!found) throw new DownstreamError('billing-api', 404, 'invoice not found');
    return found;
  }

  async listUpgradeOffers(): Promise<PlanOffer[]> {
    return this.offers;
  }

  async submitPlanChange(_accountId: string, serviceId: string, planCode: string, _ctx: unknown, key: string): Promise<UpgradeOrderResult> {
    this.planChanges.push({ serviceId, planCode, key });
    return { orderId: 'ORD-0001', status: 'SUBMITTED', effectiveDate: '2026-11-20T00:00:00Z' };
  }
}

export class FakeTicketClient implements TicketClient {
  created: Array<{ request: CreateTicketRequest; key: string }> = [];
  failNext = false;

  async createTicket(request: CreateTicketRequest, _ctx: unknown, key: string): Promise<Ticket> {
    if (this.failNext) {
      this.failNext = false;
      throw new DownstreamError('ticket-api', 503, 'unavailable');
    }
    const existing = this.created.find((c) => c.key === key);
    const ticketId = existing ? `TKT-${String(this.created.indexOf(existing) + 1).padStart(7, '0')}` : `TKT-${String(this.created.length + 1).padStart(7, '0')}`;
    if (!existing) this.created.push({ request, key });
    return { ticketId, accountId: request.accountId, priority: request.priority, status: 'OPEN', subject: request.subject, createdAt: '2026-11-11T10:00:00Z' };
  }

  async getTicket(ticketId: string): Promise<Ticket> {
    throw new NotFoundError('Ticket', ticketId);
  }
}

export class FakeNetworkClient implements NetworkClient {
  outage: OutageStatus = { postcode: 'SW1A 1AA', region: 'Westminster', status: 'NO_KNOWN_ISSUES' };
  diagnostic: LineDiagnostic = { serviceId: 'SVC-1', ontOnline: true, routerOnline: true, lastSeen: '2026-11-11T09:59:00Z', opticalSignalDbm: -18 };
  reboots: string[] = [];
  outageQueries: string[] = [];

  async getOutageStatus(postcode: string): Promise<OutageStatus> {
    this.outageQueries.push(postcode);
    return { ...this.outage, postcode };
  }

  async runLineDiagnostic(): Promise<LineDiagnostic> {
    return this.diagnostic;
  }

  async requestRemoteReboot(serviceId: string): Promise<{ accepted: boolean; jobId?: string }> {
    this.reboots.push(serviceId);
    return { accepted: true, jobId: 'JOB-1' };
  }
}

export interface FakeClients extends PlatformClients {
  account: FakeAccountClient;
  billing: FakeBillingClient;
  tickets: FakeTicketClient;
  network: FakeNetworkClient;
}

export function fakeClients(): FakeClients {
  return {
    account: new FakeAccountClient(),
    billing: new FakeBillingClient(),
    tickets: new FakeTicketClient(),
    network: new FakeNetworkClient(),
  };
}

export const TEST_SECRET = 'test-secret-for-unit-tests-only';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    env: 'test',
    logLevel: 'error',
    auth: { issuer: 'https://issuer.test', audience: 'uniti-chatbot', sharedSecret: TEST_SECRET },
    downstream: {
      accountBaseUrl: 'http://account.test',
      billingBaseUrl: 'http://billing.test',
      ticketBaseUrl: 'http://ticket.test',
      networkBaseUrl: 'http://network.test',
      timeoutMs: 1000,
      retries: 0,
    },
    llm: { provider: 'none', timeoutMs: 1000 },
    nluMinConfidence: 0.55,
    sessionTtlSeconds: 600,
    rateLimit: { windowMs: 60_000, maxMessages: 30 },
    analytics: { batchSize: 10, flushIntervalMs: 0 },
    widgetAllowedOrigins: ['https://selfcare.test'],
    ...overrides,
  };
}

export function signToken(claims: Record<string, unknown> = {}, options: jwt.SignOptions = {}): string {
  return jwt.sign(
    { sub: 'user-1', account_id: ACCOUNT_ID, roles: ['CONSUMER'], name: 'Jane Customer', ...claims },
    TEST_SECRET,
    { algorithm: 'HS256', issuer: 'https://issuer.test', audience: 'uniti-chatbot', expiresIn: '5m', ...options },
  );
}

/** A Monday at 10:00 London time: inside every queue's opening hours. */
export const OPEN_HOURS_CLOCK = () => new Date('2026-11-09T10:00:00Z');
/** A Sunday at 03:00 London time: only the business queue is open. */
export const CLOSED_HOURS_CLOCK = () => new Date('2026-11-08T03:00:00Z');
```

## apps/chatbot/src/transcripts/transcriptRepository.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/transcripts/transcriptRepository.ts`.

```typescript
import { randomUUID } from 'crypto';
import { MessageAuthor, Page, TranscriptEntry } from '../domain/types';
import { redactText } from '../privacy/piiRedactor';

/**
 * Conversation transcript storage. Text is always redacted on write, so no
 * repository implementation can ever hold raw PII. Retention is enforced by
 * `purgeOlderThan`, scheduled by the server.
 */

export interface NewTranscriptEntry {
  conversationId: string;
  author: MessageAuthor;
  text: string;
  intent?: TranscriptEntry['intent'];
  confidence?: number;
}

export interface TranscriptRepository {
  append(entry: NewTranscriptEntry): Promise<TranscriptEntry>;
  list(conversationId: string, page: number, pageSize: number): Promise<Page<TranscriptEntry>>;
  recent(conversationId: string, limit: number): Promise<TranscriptEntry[]>;
  purgeOlderThan(cutoffIso: string): Promise<number>;
}

export class InMemoryTranscriptRepository implements TranscriptRepository {
  private readonly entries = new Map<string, TranscriptEntry[]>();

  constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = randomUUID,
  ) {}

  async append(entry: NewTranscriptEntry): Promise<TranscriptEntry> {
    const stored: TranscriptEntry = {
      id: this.idFactory(),
      conversationId: entry.conversationId,
      author: entry.author,
      text: redactText(entry.text),
      intent: entry.intent,
      confidence: entry.confidence !== undefined ? Math.round(entry.confidence * 1000) / 1000 : undefined,
      createdAt: this.clock().toISOString(),
    };
    const list = this.entries.get(entry.conversationId) ?? [];
    list.push(stored);
    this.entries.set(entry.conversationId, list);
    return stored;
  }

  async list(conversationId: string, page: number, pageSize: number): Promise<Page<TranscriptEntry>> {
    const all = this.entries.get(conversationId) ?? [];
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), page, pageSize, total: all.length };
  }

  async recent(conversationId: string, limit: number): Promise<TranscriptEntry[]> {
    const all = this.entries.get(conversationId) ?? [];
    return all.slice(Math.max(0, all.length - limit));
  }

  async purgeOlderThan(cutoffIso: string): Promise<number> {
    let removed = 0;
    for (const [conversationId, list] of this.entries) {
      const kept = list.filter((e) => e.createdAt >= cutoffIso);
      removed += list.length - kept.length;
      if (kept.length === 0) this.entries.delete(conversationId);
      else this.entries.set(conversationId, kept);
    }
    return removed;
  }
}

/** Renders a transcript as plain text for agent handoff context. */
export function renderTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => {
      const time = e.createdAt.slice(11, 16);
      const who = e.author === 'USER' ? 'Customer' : e.author === 'BOT' ? 'Bot' : e.author === 'AGENT' ? 'Agent' : 'System';
      return `[${time}] ${who}: ${e.text}`;
    })
    .join('\n');
}
```

## apps/chatbot/tsconfig.json

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: json. Path: `apps/chatbot/tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "widget"]
}
```
