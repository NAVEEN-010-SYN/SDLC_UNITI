import { Entity, EntityType } from '../domain/types';

/**
 * Deterministic entity extraction for domain identifiers and common slot values.
 * Runs on the raw utterance (in memory only) so slot filling can use real values;
 * the persisted transcript is redacted separately.
 */

interface EntityPattern {
  type: EntityType;
  pattern: RegExp;
  normalise?: (raw: string) => string;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function normaliseSpeed(raw: string): string {
  const match = /(\d+(?:\.\d+)?)\s*(g|gb|gig|gbps|m|mb|meg|mbps)/i.exec(raw.replace(/\s+/g, ''));
  if (!match) return raw;
  const value = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const mbps = unit.startsWith('g') ? Math.round(value * 1000) : Math.round(value);
  return String(mbps);
}

export function normalisePostcode(raw: string): string {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  return digits.startsWith('+44') ? `0${digits.slice(3)}` : digits;
}

/**
 * Normalises dates like "12 March", "12/03/2026", "2026-03-12" to ISO yyyy-mm-dd.
 * Year defaults to the reference date's year.
 */
export function normaliseDate(raw: string, reference: Date = new Date()): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return raw;
  const numeric = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(raw);
  if (numeric) {
    const year = numeric[3] ? (numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3])) : reference.getUTCFullYear();
    return toIso(year, Number(numeric[2]), Number(numeric[1]));
  }
  const named = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)/i.exec(raw);
  if (named) {
    const monthIndex = MONTHS.findIndex((m) => m.startsWith(named[2].toLowerCase().slice(0, 3)));
    if (monthIndex >= 0) return toIso(reference.getUTCFullYear(), monthIndex + 1, Number(named[1]));
  }
  return raw;
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const PATTERNS: EntityPattern[] = [
  { type: 'ACCOUNT_ID', pattern: /\bACC-?\d{8}\b/gi, normalise: (r) => `ACC-${r.replace(/\D/g, '')}` },
  { type: 'INVOICE_ID', pattern: /\bINV-?\d{6,10}\b/gi, normalise: (r) => `INV-${r.replace(/\D/g, '')}` },
  { type: 'TICKET_ID', pattern: /\bTKT-?\d{6,10}\b/gi, normalise: (r) => `TKT-${r.replace(/\D/g, '')}` },
  { type: 'EMAIL', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, normalise: (r) => r.toLowerCase() },
  { type: 'PHONE', pattern: /(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\b/g, normalise: normalisePhone },
  { type: 'POSTCODE', pattern: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, normalise: normalisePostcode },
  { type: 'SPEED', pattern: /\b\d+(?:\.\d+)?\s?(?:gbps|gig|gb|g|mbps|meg|mb)\b/gi, normalise: normaliseSpeed },
  {
    type: 'DATE',
    pattern: /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/gi,
    normalise: (r) => normaliseDate(r),
  },
];

export function extractEntities(text: string): Entity[] {
  const entities: Entity[] = [];
  for (const { type, pattern, normalise } of PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const overlaps = entities.some((e) => start < e.end && end > e.start);
      if (overlaps) continue;
      entities.push({ type, value: normalise ? normalise(match[0]) : match[0], start, end });
    }
  }
  return entities.sort((a, b) => a.start - b.start);
}

export function firstEntity(entities: Entity[], type: EntityType): string | undefined {
  return entities.find((e) => e.type === type)?.value;
}
