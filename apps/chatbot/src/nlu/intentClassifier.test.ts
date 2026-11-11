import { silentLogger } from '../logger';
import { CompositeIntentClassifier, quickReplyPayload } from './intentClassifier';
import { LlmClassifyRequest, LlmIntentProvider, NullLlmProvider, parseLlmResponse } from './llmProvider';
import { RulesMatcher } from './rulesMatcher';

class StubLlm implements LlmIntentProvider {
  readonly name = 'stub';
  readonly requests: LlmClassifyRequest[] = [];
  constructor(private readonly reply?: { intent: never | string; confidence: number }) {}
  async classify(request: LlmClassifyRequest) {
    this.requests.push(request);
    return this.reply as never;
  }
}

function classifier(llm: LlmIntentProvider = new NullLlmProvider()) {
  return new CompositeIntentClassifier({ rules: new RulesMatcher(), llm, minConfidence: 0.55, logger: silentLogger });
}

describe('RulesMatcher', () => {
  const matcher = new RulesMatcher();

  it('scores strong phrases highly', () => {
    const best = matcher.best('My internet is down again!');
    expect(best?.intent).toBe('CHECK_OUTAGE');
    expect(best!.score).toBeGreaterThan(0.85);
  });

  it('applies negative cues', () => {
    const scores = matcher.score('I want to downgrade my plan');
    expect(scores.find((s) => s.intent === 'PLAN_UPGRADE')).toBeUndefined();
  });

  it('only matches short-form intents on short utterances', () => {
    expect(matcher.best('yes')?.intent).toBe('AFFIRM');
    const long = matcher.score('yes I would like to know why my bill went up this month');
    expect(long.find((s) => s.intent === 'AFFIRM')).toBeUndefined();
    expect(long[0].intent).toBe('BILL_ENQUIRY');
  });
});

describe('CompositeIntentClassifier', () => {
  it('short-circuits on quick reply payloads', async () => {
    const result = await classifier().classify(quickReplyPayload('RESET_ROUTER'));
    expect(result).toMatchObject({ intent: 'RESET_ROUTER', confidence: 1, source: 'context' });
  });

  it('does not call the LLM when rules are confident', async () => {
    const llm = new StubLlm({ intent: 'BILL_ENQUIRY', confidence: 0.99 });
    const result = await classifier(llm).classify('Please reset my router, the router lights are red');
    expect(result.intent).toBe('RESET_ROUTER');
    expect(llm.requests).toHaveLength(0);
  });

  it('uses the LLM when rules are weak and sends redacted text', async () => {
    const llm = new StubLlm({ intent: 'PLAN_UPGRADE', confidence: 0.8 });
    const result = await classifier(llm).classify('could I get something quicker? email me at a@b.com');
    expect(result).toMatchObject({ intent: 'PLAN_UPGRADE', source: 'llm' });
    expect(llm.requests[0].redactedText).toContain('[EMAIL]');
    expect(llm.requests[0].redactedText).not.toContain('a@b.com');
  });

  it('falls back when nothing is confident', async () => {
    const result = await classifier().classify('the weather is lovely');
    expect(result.intent).toBe('FALLBACK');
  });

  it('carries extracted entities on the prediction', async () => {
    const result = await classifier().classify('is there an outage at SW1A 1AA');
    expect(result.intent).toBe('CHECK_OUTAGE');
    expect(result.entities[0]).toMatchObject({ type: 'POSTCODE', value: 'SW1A 1AA' });
  });
});

describe('parseLlmResponse', () => {
  const allowed = ['BILL_ENQUIRY', 'CHECK_OUTAGE'] as const;

  it('parses fenced JSON content and clamps confidence', () => {
    const payload = { choices: [{ message: { content: '```json\n{"intent":"bill_enquiry","confidence":1.7}\n```' } }] };
    expect(parseLlmResponse(payload, [...allowed])).toEqual({ intent: 'BILL_ENQUIRY', confidence: 1 });
  });

  it('rejects intents outside the candidate list', () => {
    const payload = { choices: [{ message: { content: '{"intent":"DELETE_ACCOUNT","confidence":0.9}' } }] };
    expect(parseLlmResponse(payload, [...allowed])).toBeUndefined();
  });

  it('rejects malformed payloads', () => {
    expect(parseLlmResponse({}, [...allowed])).toBeUndefined();
    expect(parseLlmResponse({ choices: [{ message: { content: 'not json' } }] }, [...allowed])).toBeUndefined();
  });
});
