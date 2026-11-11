import type { BusinessPolicy } from '../api/types';

/** Moves the policy at `index` one slot up or down and renumbers so evaluation order matches display order. */
export function movePolicy(policies: BusinessPolicy[], index: number, direction: -1 | 1): BusinessPolicy[] {
  const target = index + direction;
  if (target < 0 || target >= policies.length) return policies;
  const next = [...policies];
  [next[index], next[target]] = [next[target], next[index]];
  return renumber(next);
}

/** Orders in steps of 10, matching how the API and vendors leave room for insertions. */
export function renumber(policies: BusinessPolicy[]): BusinessPolicy[] {
  return policies.map((p, i) => (p.order === (i + 1) * 10 ? p : { ...p, order: (i + 1) * 10 }));
}

export function togglePolicy(policies: BusinessPolicy[], id: string): BusinessPolicy[] {
  return policies.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
}

export function removePolicy(policies: BusinessPolicy[], id: string): BusinessPolicy[] {
  return renumber(policies.filter((p) => p.id !== id));
}

export interface PolicyChangeSummary {
  added: string[];
  removed: string[];
  reordered: boolean;
  toggled: string[];
}

/** What the draft changes relative to the controller's current set; drives the CR title and the submit button. */
export function summarizePolicyChanges(before: BusinessPolicy[], after: BusinessPolicy[]): PolicyChangeSummary {
  const beforeById = new Map(before.map((p) => [p.id, p]));
  const afterIds = new Set(after.map((p) => p.id));
  const commonBefore = before.filter((p) => afterIds.has(p.id)).map((p) => p.id);
  const commonAfter = after.filter((p) => beforeById.has(p.id)).map((p) => p.id);
  return {
    added: after.filter((p) => !beforeById.has(p.id)).map((p) => p.name),
    removed: before.filter((p) => !afterIds.has(p.id)).map((p) => p.name),
    reordered: commonBefore.some((id, i) => commonAfter[i] !== id),
    toggled: after.filter((p) => beforeById.has(p.id) && beforeById.get(p.id)!.enabled !== p.enabled).map((p) => p.name),
  };
}

export function hasChanges(s: PolicyChangeSummary): boolean {
  return s.added.length + s.removed.length + s.toggled.length > 0 || s.reordered;
}

export function describeChanges(s: PolicyChangeSummary): string {
  const parts: string[] = [];
  if (s.removed.length) parts.push(`remove ${s.removed.join(', ')}`);
  if (s.added.length) parts.push(`add ${s.added.join(', ')}`);
  if (s.toggled.length) parts.push(`toggle ${s.toggled.join(', ')}`);
  if (s.reordered) parts.push('reorder');
  const text = parts.join('; ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'No changes';
}
