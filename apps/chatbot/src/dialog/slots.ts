import { Entity, EntityType } from '../domain/types';
import { normalisePhone, normalisePostcode } from '../nlu/entityExtractor';
import { normalise } from '../nlu/rulesMatcher';

/**
 * Slot validators. Each validator parses free-text input (plus any entities the
 * NLU extracted from it) into a typed slot value or a user-facing error.
 */

export type SlotValue = string | number | boolean;

export type SlotParseResult = { ok: true; value: SlotValue } | { ok: false; error: string };

export interface SlotValidator {
  /** Entity type that can pre-fill this slot directly from the utterance. */
  entity?: EntityType;
  parse(text: string, entities: Entity[]): SlotParseResult;
}

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
const UK_PHONE = /^(?:0\d{9,10})$/;

export const postcodeSlot: SlotValidator = {
  entity: 'POSTCODE',
  parse(text, entities) {
    const fromEntity = entities.find((e) => e.type === 'POSTCODE');
    if (fromEntity) return { ok: true, value: fromEntity.value };
    const trimmed = text.trim();
    if (UK_POSTCODE.test(trimmed)) return { ok: true, value: normalisePostcode(trimmed) };
    return { ok: false, error: "That doesn't look like a valid UK postcode. It should look like SW1A 1AA." };
  },
};

export const phoneSlot: SlotValidator = {
  entity: 'PHONE',
  parse(text, entities) {
    const fromEntity = entities.find((e) => e.type === 'PHONE');
    const candidate = fromEntity?.value ?? normalisePhone(text.trim());
    if (UK_PHONE.test(candidate)) return { ok: true, value: candidate };
    return { ok: false, error: 'Please give a UK phone number, for example 07700 900123.' };
  },
};

const YES = new Set(['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'okay', 'correct', 'confirm', 'go ahead', 'yes please', 'intent:affirm']);
const NO = new Set(['no', 'n', 'nope', 'nah', 'no thanks', 'not now', 'cancel', 'intent:deny']);

export const yesNoSlot: SlotValidator = {
  parse(text) {
    const clean = text.trim().toLowerCase();
    const norm = normalise(text);
    if (YES.has(clean) || YES.has(norm)) return { ok: true, value: true };
    if (NO.has(clean) || NO.has(norm)) return { ok: true, value: false };
    return { ok: false, error: 'Please answer yes or no.' };
  },
};

export function freeTextSlot(minLength: number, maxLength: number): SlotValidator {
  return {
    parse(text) {
      const trimmed = text.trim().replace(/\s+/g, ' ');
      if (trimmed.length < minLength) {
        return { ok: false, error: `Could you give me a bit more detail (at least ${minLength} characters)?` };
      }
      if (trimmed.length > maxLength) {
        return { ok: false, error: `That's a little long - please keep it under ${maxLength} characters.` };
      }
      return { ok: true, value: trimmed };
    },
  };
}

/**
 * Choice slot: accepts an option number ("2"), the option key/payload, or a
 * case-insensitive label match. Options are resolved at prompt time so the
 * same validator works for dynamic lists (plans, services).
 */
export function choiceSlot(options: () => Array<{ key: string; label: string; aliases?: string[] }>): SlotValidator {
  return {
    parse(text) {
      const list = options();
      const clean = normalise(text);
      const index = Number.parseInt(clean, 10);
      if (Number.isInteger(index) && String(index) === clean && index >= 1 && index <= list.length) {
        return { ok: true, value: list[index - 1].key };
      }
      const exact = list.find(
        (o) => o.key.toLowerCase() === text.trim().toLowerCase() || normalise(o.label) === clean || o.aliases?.some((a) => normalise(a) === clean),
      );
      if (exact) return { ok: true, value: exact.key };
      const partial = list.filter((o) => clean.length >= 3 && normalise(o.label).includes(clean));
      if (partial.length === 1) return { ok: true, value: partial[0].key };
      const labels = list.map((o, i) => `${i + 1}. ${o.label}`).join(', ');
      return { ok: false, error: `Please pick one of: ${labels}.` };
    },
  };
}

/** Speed slot in Mbps, constrained to the advertised fibre tiers. */
export function speedSlot(allowedMbps: number[]): SlotValidator {
  return {
    entity: 'SPEED',
    parse(text, entities) {
      const raw = entities.find((e) => e.type === 'SPEED')?.value ?? text.replace(/[^\d]/g, '');
      const mbps = Number.parseInt(raw, 10);
      if (Number.isInteger(mbps) && allowedMbps.includes(mbps)) return { ok: true, value: mbps };
      const tiers = allowedMbps.map((m) => (m >= 1000 ? `${m / 1000} Gbps` : `${m} Mbps`)).join(', ');
      return { ok: false, error: `We offer ${tiers}. Which would you like?` };
    },
  };
}

export const invoiceIdSlot: SlotValidator = {
  entity: 'INVOICE_ID',
  parse(text, entities) {
    const fromEntity = entities.find((e) => e.type === 'INVOICE_ID');
    if (fromEntity) return { ok: true, value: fromEntity.value };
    if (/^latest|^last|^most recent|^current/i.test(text.trim())) return { ok: true, value: 'LATEST' };
    return { ok: false, error: 'Please give the invoice number (e.g. INV-00123456) or say "latest".' };
  },
};
