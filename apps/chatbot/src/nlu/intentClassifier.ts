import { Entity, IntentName, IntentPrediction } from '../domain/types';
import { Logger } from '../logger';
import { redactText } from '../privacy/piiRedactor';
import { extractEntities } from './entityExtractor';
import { LlmIntentProvider } from './llmProvider';
import { RulesMatcher } from './rulesMatcher';

/**
 * Composite intent classifier.
 *
 * Strategy:
 *  1. Quick-reply payloads (e.g. "intent:RESET_ROUTER") short-circuit with confidence 1.
 *  2. The rules matcher runs first; a confident rules hit is accepted directly.
 *  3. Otherwise the LLM provider (if any) is consulted with redacted text.
 *  4. The higher-confidence prediction wins; below `minConfidence` it is FALLBACK.
 */

export interface IntentClassifier {
  classify(text: string, context?: ClassificationContext): Promise<IntentPrediction>;
}

export interface ClassificationContext {
  history?: string[];
  correlationId?: string;
}

export interface CompositeClassifierOptions {
  rules: RulesMatcher;
  llm: LlmIntentProvider;
  minConfidence: number;
  /** Rules score at or above this skips the LLM call entirely. */
  rulesShortCircuit?: number;
  logger: Logger;
}

export const ROUTABLE_INTENTS: IntentName[] = [
  'CHECK_OUTAGE',
  'BILL_ENQUIRY',
  'RESET_ROUTER',
  'PLAN_UPGRADE',
  'RAISE_TICKET',
  'TALK_TO_AGENT',
  'GREETING',
  'GOODBYE',
  'AFFIRM',
  'DENY',
  'CANCEL',
];

const PAYLOAD_PREFIX = 'intent:';

export class CompositeIntentClassifier implements IntentClassifier {
  private readonly shortCircuit: number;

  constructor(private readonly options: CompositeClassifierOptions) {
    this.shortCircuit = options.rulesShortCircuit ?? 0.85;
  }

  async classify(text: string, context: ClassificationContext = {}): Promise<IntentPrediction> {
    const entities = extractEntities(text);
    const fromPayload = this.fromPayload(text, entities);
    if (fromPayload) return fromPayload;

    const rulesBest = this.options.rules.best(text);
    if (rulesBest && rulesBest.score >= this.shortCircuit) {
      return { intent: rulesBest.intent, confidence: rulesBest.score, source: 'rules', entities };
    }

    const llmResult = await this.options.llm.classify({
      redactedText: redactText(text),
      candidateIntents: ROUTABLE_INTENTS,
      history: (context.history ?? []).map(redactText),
      correlationId: context.correlationId,
    });

    const candidates: IntentPrediction[] = [];
    if (rulesBest) candidates.push({ intent: rulesBest.intent, confidence: rulesBest.score, source: 'rules', entities });
    if (llmResult) candidates.push({ intent: llmResult.intent, confidence: llmResult.confidence, source: 'llm', entities });

    const winner = candidates.sort((a, b) => b.confidence - a.confidence)[0];
    if (!winner || winner.confidence < this.options.minConfidence || winner.intent === 'FALLBACK') {
      this.options.logger.debug('intent below threshold', {
        best: winner?.intent,
        confidence: winner?.confidence,
        correlationId: context.correlationId,
      });
      return { intent: 'FALLBACK', confidence: winner?.confidence ?? 0, source: winner?.source ?? 'rules', entities };
    }
    return winner;
  }

  private fromPayload(text: string, entities: Entity[]): IntentPrediction | undefined {
    const trimmed = text.trim();
    if (!trimmed.startsWith(PAYLOAD_PREFIX)) return undefined;
    const candidate = trimmed.slice(PAYLOAD_PREFIX.length).toUpperCase() as IntentName;
    if (!ROUTABLE_INTENTS.includes(candidate)) return undefined;
    return { intent: candidate, confidence: 1, source: 'context', entities };
  }
}

export function quickReplyPayload(intent: IntentName): string {
  return `${PAYLOAD_PREFIX}${intent}`;
}
