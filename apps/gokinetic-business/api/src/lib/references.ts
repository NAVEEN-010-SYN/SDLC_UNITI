import { randomInt } from 'node:crypto';

/** Crockford base32 without ambiguous characters (I, L, O, U). */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomSuffix(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

function datePart(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export type ReferenceKind = 'ORD' | 'BAT' | 'TKT' | 'CTR';

/** Human-friendly, collision-resistant references, e.g. ORD-20240514-7K3QX9. */
export function newReference(kind: ReferenceKind, now: Date = new Date()): string {
  return `${kind}-${datePart(now)}-${randomSuffix(6)}`;
}
