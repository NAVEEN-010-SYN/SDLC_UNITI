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
