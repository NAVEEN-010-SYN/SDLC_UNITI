import { createHash } from 'node:crypto';

export type DiffOp = 'ADDED' | 'REMOVED' | 'CHANGED';

export interface DiffEntry {
  path: string;
  op: DiffOp;
  before?: unknown;
  after?: unknown;
}

/**
 * Serialises with sorted keys so two semantically identical configs produce the same
 * checksum regardless of the key order the vendor API returned.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    if (obj[k] === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  }
  return `{${parts.join(',')}}`;
}

export function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** Keys commonly used as identity inside vendor config arrays. */
const IDENTITY_KEYS = ['id', 'name', 'policyid', 'logicalId', 'seq-num', 'seq_num', 'ruleId'];

function identityOf(item: unknown): string | undefined {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
  for (const key of IDENTITY_KEYS) {
    const v = (item as Record<string, unknown>)[key];
    if (typeof v === 'string' || typeof v === 'number') return `${key}=${v}`;
  }
  return undefined;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Structural diff of two config documents. Arrays whose elements carry an identity key
 * are matched by identity (so re-ordering firewall rules shows as CHANGED at the rule,
 * not as every index shifting); other arrays are compared positionally.
 */
export function diffConfig(before: unknown, after: unknown, path = '', out: DiffEntry[] = [], maxEntries = 500): DiffEntry[] {
  if (out.length >= maxEntries) return out;
  if (canonicalJson(before) === canonicalJson(after)) return out;

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      const p = path ? `${path}.${key}` : key;
      if (!(key in before)) out.push({ path: p, op: 'ADDED', after: after[key] });
      else if (!(key in after)) out.push({ path: p, op: 'REMOVED', before: before[key] });
      else diffConfig(before[key], after[key], p, out, maxEntries);
      if (out.length >= maxEntries) break;
    }
    return out;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const allKeyed = [...before, ...after].every((i) => identityOf(i) !== undefined);
    if (allKeyed && before.length + after.length > 0) {
      const b = new Map(before.map((i) => [identityOf(i)!, i]));
      const a = new Map(after.map((i) => [identityOf(i)!, i]));
      for (const [id, item] of b) {
        const p = `${path}[${id}]`;
        if (!a.has(id)) out.push({ path: p, op: 'REMOVED', before: item });
        else diffConfig(item, a.get(id), p, out, maxEntries);
      }
      for (const [id, item] of a) {
        if (!b.has(id)) out.push({ path: `${path}[${id}]`, op: 'ADDED', after: item });
      }
      return out;
    }
    const len = Math.max(before.length, after.length);
    for (let i = 0; i < len; i++) {
      const p = `${path}[${i}]`;
      if (i >= before.length) out.push({ path: p, op: 'ADDED', after: after[i] });
      else if (i >= after.length) out.push({ path: p, op: 'REMOVED', before: before[i] });
      else diffConfig(before[i], after[i], p, out, maxEntries);
    }
    return out;
  }

  out.push({ path: path || '(root)', op: 'CHANGED', before, after });
  return out;
}

export function summarizeDiff(entries: DiffEntry[]): Record<DiffOp, number> {
  return entries.reduce<Record<DiffOp, number>>(
    (acc, e) => {
      acc[e.op]++;
      return acc;
    },
    { ADDED: 0, REMOVED: 0, CHANGED: 0 },
  );
}
