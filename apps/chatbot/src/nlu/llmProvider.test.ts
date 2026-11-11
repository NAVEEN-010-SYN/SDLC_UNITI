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
