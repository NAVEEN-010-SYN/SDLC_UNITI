import { describe, expect, it } from 'vitest';
import {
  acceptAll,
  CONSENT_MAX_AGE_MS,
  customise,
  diffGrants,
  isGranted,
  needsDecision,
  parseConsentRecord,
  rejectAll,
} from './consentModel';

const POLICY = '2026-11';
const NOW = new Date('2026-11-11T10:00:00Z');

describe('consent model', () => {
  it('requires a decision when nothing has been recorded and grants only necessary meanwhile', () => {
    expect(needsDecision(undefined, POLICY, NOW)).toBe(true);
    expect(isGranted(undefined, 'necessary', POLICY, NOW)).toBe(true);
    expect(isGranted(undefined, 'analytics', POLICY, NOW)).toBe(false);
  });

  it('accept all grants every category and reject all only necessary', () => {
    const accepted = acceptAll(POLICY, NOW);
    expect(accepted.choices).toEqual({ necessary: true, functional: true, analytics: true, marketing: true });
    expect(accepted.decidedAt).toBe('2026-11-11T10:00:00.000Z');
    expect(rejectAll(POLICY, NOW).choices).toEqual({ necessary: true, functional: false, analytics: false, marketing: false });
  });

  it('never allows necessary to be switched off and defaults unspecified categories to denied', () => {
    const record = customise({ necessary: false, analytics: true }, POLICY, NOW);
    expect(record.choices).toEqual({ necessary: true, functional: false, analytics: true, marketing: false });
    expect(record.source).toBe('preferences');
  });

  it('forces marketing off under Global Privacy Control, even on accept all', () => {
    const record = acceptAll(POLICY, NOW, true);
    expect(record.choices.marketing).toBe(false);
    expect(record.choices.analytics).toBe(true);
    expect(record.gpc).toBe(true);
  });

  it('expires a decision after 13 months', () => {
    const record = acceptAll(POLICY, NOW);
    const justValid = new Date(NOW.getTime() + CONSENT_MAX_AGE_MS);
    const expired = new Date(NOW.getTime() + CONSENT_MAX_AGE_MS + 1);
    expect(needsDecision(record, POLICY, justValid)).toBe(false);
    expect(needsDecision(record, POLICY, expired)).toBe(true);
    expect(isGranted(record, 'analytics', POLICY, expired)).toBe(false);
  });

  it('re-prompts and suspends integrations when the policy version changes', () => {
    const record = acceptAll('2025-01', NOW);
    expect(needsDecision(record, POLICY, NOW)).toBe(true);
    expect(isGranted(record, 'functional', POLICY, NOW)).toBe(false);
  });

  it('reports which categories were granted and revoked between decisions', () => {
    const before = acceptAll(POLICY, NOW);
    const after = customise({ functional: true }, POLICY, NOW);
    const grant = (r: typeof before) => (c: Parameters<typeof isGranted>[1]) => isGranted(r, c, POLICY, NOW);
    expect(diffGrants(grant(before), grant(after))).toEqual({ granted: [], revoked: ['analytics', 'marketing'] });
    expect(diffGrants(grant(after), grant(before))).toEqual({ granted: ['analytics', 'marketing'], revoked: [] });
  });

  it('round-trips through storage and rejects tampered or legacy records', () => {
    const record = customise({ analytics: true }, POLICY, NOW);
    expect(parseConsentRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(parseConsentRecord({ ...record, schema: 0 })).toBeUndefined();
    expect(parseConsentRecord({ ...record, choices: { analytics: 'yes' } })).toBeUndefined();
    expect(parseConsentRecord({ ...record, source: 'implied' })).toBeUndefined();
    expect(parseConsentRecord({ ...record, choices: { ...record.choices, necessary: false } })?.choices.necessary).toBe(true);
    expect(parseConsentRecord('accepted')).toBeUndefined();
  });
});
