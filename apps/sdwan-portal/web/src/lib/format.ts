import type { EdgeStatus, LinkState } from '../api/types';

/** Customer-facing wording for edge state used across the dashboard. */
export const EDGE_STATUS_LABEL: Record<EdgeStatus, string> = { UP: 'Online', DEGRADED: 'Degraded', DOWN: 'Offline', UNKNOWN: 'Unknown' };
export const LINK_STATE_LABEL: Record<LinkState, string> = { UP: 'Up', DOWN: 'Down', STANDBY: 'Standby', UNKNOWN: 'Unknown' };

const UNITS = ['bps', 'kbps', 'Mbps', 'Gbps', 'Tbps'];

/** Decimal (SI) units, as ISPs quote bandwidth: 1 Mbps = 1,000,000 bps. */
export function formatBps(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '0 bps';
  const exp = Math.min(UNITS.length - 1, Math.floor(Math.log10(bps) / 3));
  const value = bps / 10 ** (exp * 3);
  if (value >= 100 || exp === 0) return `${Math.round(value)} ${UNITS[exp]}`;
  return `${value.toFixed(1).replace(/\.0$/, '')} ${UNITS[exp]}`;
}

export const formatKbps = (kbps: number): string => formatBps(kbps * 1000);

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });

/** Wire values are UTC; shown in UTC with an explicit suffix so NOC and customer see the same time. */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '\u2014';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? '\u2014' : `${dateTime.format(ms)} UTC`;
}

export function formatRelative(iso: string | undefined, nowMs = Date.now()): string {
  if (!iso) return '\u2014';
  const diffSec = Math.round((nowMs - Date.parse(iso)) / 1000);
  if (Number.isNaN(diffSec)) return '\u2014';
  const abs = Math.abs(diffSec);
  const suffix = diffSec >= 0 ? 'ago' : 'from now';
  if (abs < 60) return diffSec >= 0 ? 'just now' : 'in under a minute';
  if (abs < 3600) return `${Math.floor(abs / 60)} min ${suffix}`;
  if (abs < 86400) return `${Math.floor(abs / 3600)} h ${suffix}`;
  return `${Math.floor(abs / 86400)} d ${suffix}`;
}

export function formatMs(v: number | undefined): string {
  return v === undefined ? '\u2014' : `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`;
}

export function formatPct(v: number | null | undefined, dp = 1): string {
  return v === null || v === undefined ? '\u2014' : `${v.toFixed(dp)}%`;
}

export function humanize(code: string): string {
  return code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ');
}

/** Quick range presets for health views, ending now. */
export const RANGE_PRESETS = { '1h': 3_600_000, '24h': 86_400_000, '7d': 7 * 86_400_000 } as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

export function rangeFor(preset: RangePreset, nowMs = Date.now()): { from: string; to: string } {
  return { from: new Date(nowMs - RANGE_PRESETS[preset]).toISOString(), to: new Date(nowMs).toISOString() };
}
