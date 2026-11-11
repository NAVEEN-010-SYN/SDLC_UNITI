/**
 * GDPR / PECR consent model. Pure functions only, so the rules are unit-tested
 * independently of storage and UI.
 *
 * Rules:
 *  - "necessary" is always granted and cannot be switched off.
 *  - Everything else defaults to denied until an explicit choice is recorded.
 *  - A decision expires after 13 months or when the cookie policy version changes.
 *  - A Global Privacy Control signal forces "marketing" off regardless of choice.
 */

export type ConsentCategory = 'necessary' | 'functional' | 'analytics' | 'marketing';
export const CONSENT_CATEGORIES: ConsentCategory[] = ['necessary', 'functional', 'analytics', 'marketing'];
export type ConsentChoices = Record<ConsentCategory, boolean>;
export type ConsentSource = 'banner_accept_all' | 'banner_reject_all' | 'preferences';

export interface ConsentRecord {
  schema: 1;
  policyVersion: string;
  /** ISO-8601 UTC. */
  decidedAt: string;
  source: ConsentSource;
  choices: ConsentChoices;
  gpc: boolean;
}

export const CATEGORY_INFO: Record<ConsentCategory, { label: string; description: string }> = {
  necessary: {
    label: 'Strictly necessary',
    description: 'Sign-in, security and remembering these choices. Always on.',
  },
  functional: {
    label: 'Functional',
    description: 'Embedded services such as the referral programme widget and saved preferences.',
  },
  analytics: {
    label: 'Analytics',
    description: 'Session insights (Microsoft Clarity, FullStory) that help us fix problems. Personal details are masked.',
  },
  marketing: {
    label: 'Marketing',
    description: 'Measuring referral and offer campaigns.',
  },
};

/** 13 months, the ICO/CNIL guidance ceiling for consent validity. */
export const CONSENT_MAX_AGE_MS = 395 * 24 * 60 * 60 * 1000;

export function deniedChoices(): ConsentChoices {
  return { necessary: true, functional: false, analytics: false, marketing: false };
}

function record(choices: ConsentChoices, source: ConsentSource, policyVersion: string, now: Date, gpc: boolean): ConsentRecord {
  return {
    schema: 1,
    policyVersion,
    decidedAt: now.toISOString(),
    source,
    gpc,
    choices: { ...choices, necessary: true, marketing: choices.marketing && !gpc },
  };
}

export function acceptAll(policyVersion: string, now: Date, gpc = false): ConsentRecord {
  return record({ necessary: true, functional: true, analytics: true, marketing: true }, 'banner_accept_all', policyVersion, now, gpc);
}

export function rejectAll(policyVersion: string, now: Date, gpc = false): ConsentRecord {
  return record(deniedChoices(), 'banner_reject_all', policyVersion, now, gpc);
}

export function customise(choices: Partial<ConsentChoices>, policyVersion: string, now: Date, gpc = false): ConsentRecord {
  return record({ ...deniedChoices(), ...choices }, 'preferences', policyVersion, now, gpc);
}

export function needsDecision(current: ConsentRecord | undefined, policyVersion: string, now: Date): boolean {
  if (!current) return true;
  if (current.policyVersion !== policyVersion) return true;
  const decided = Date.parse(current.decidedAt);
  return Number.isNaN(decided) || now.getTime() - decided > CONSENT_MAX_AGE_MS;
}

/**
 * Whether a category may be used right now. A stale or outdated record counts
 * as no consent: integrations stop until the visitor decides again.
 */
export function isGranted(current: ConsentRecord | undefined, category: ConsentCategory, policyVersion: string, now: Date): boolean {
  if (category === 'necessary') return true;
  if (!current || needsDecision(current, policyVersion, now)) return false;
  return current.choices[category] === true;
}

export function diffGrants(
  before: (category: ConsentCategory) => boolean,
  after: (category: ConsentCategory) => boolean,
): { granted: ConsentCategory[]; revoked: ConsentCategory[] } {
  const granted = CONSENT_CATEGORIES.filter((c) => !before(c) && after(c));
  const revoked = CONSENT_CATEGORIES.filter((c) => before(c) && !after(c));
  return { granted, revoked };
}

export function parseConsentRecord(value: unknown): ConsentRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Partial<ConsentRecord>;
  if (v.schema !== 1 || typeof v.policyVersion !== 'string' || typeof v.decidedAt !== 'string' || !v.choices) return undefined;
  const choices = v.choices as Partial<ConsentChoices>;
  if (!CONSENT_CATEGORIES.every((c) => typeof choices[c] === 'boolean')) return undefined;
  if (v.source !== 'banner_accept_all' && v.source !== 'banner_reject_all' && v.source !== 'preferences') return undefined;
  return {
    schema: 1,
    policyVersion: v.policyVersion,
    decidedAt: v.decidedAt,
    source: v.source,
    gpc: v.gpc === true,
    choices: { ...(choices as ConsentChoices), necessary: true },
  };
}

interface GpcNavigator extends Navigator {
  globalPrivacyControl?: boolean;
}

function defaultNavigator(): Navigator | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator;
}

export function globalPrivacyControl(nav: Navigator | undefined = defaultNavigator()): boolean {
  if (!nav) return false;
  return (nav as GpcNavigator).globalPrivacyControl === true;
}
