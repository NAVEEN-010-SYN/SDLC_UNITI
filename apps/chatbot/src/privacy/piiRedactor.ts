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
  // local@domain.tld
  { kind: 'EMAIL', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // 13-19 digits, optional single space/dash separators; confirmed by Luhn
  { kind: 'CARD_NUMBER', pattern: /\b(?:\d[ -]?){12,18}\d\b/g, accept: passesLuhn },
  // 2 letters + 2 check digits + 3-7 groups of 4 + optional short tail
  { kind: 'IBAN', pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g },
  // nn-nn-nn
  { kind: 'SORT_CODE', pattern: /\b\d{2}-\d{2}-\d{2}\b/g },
  // dotted quad; octet ranges checked by isValidIpv4
  { kind: 'IP_ADDRESS', pattern: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, accept: isValidIpv4 },
  // UK numbers: +44 or leading 0, then 9-10 digits with optional separators
  { kind: 'PHONE', pattern: /(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\b/g },
  // outward code (A9, A99, AA9, A9A...) + optional space + inward code (9AA)
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
