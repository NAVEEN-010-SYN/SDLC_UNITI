/** Dates arrive as ISO-8601 UTC strings; they are displayed in the user's locale but in UTC for dates. */

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(iso?: string | null): string {
  return iso ? dateFmt.format(new Date(iso)) : '—';
}

export function formatDateTime(iso?: string | null): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : '—';
}

export function formatPercent(value?: number | null): string {
  return value === null || value === undefined ? 'n/a' : `${Number(value).toFixed(1)}%`;
}

/** ISO date (yyyy-mm-dd) `days` from today in UTC, for date inputs with sensible defaults. */
export function isoDateFromToday(days: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

/** Converts an enum constant such as PENDING_APPROVAL into "Pending approval". */
export function humanise(constant: string): string {
  const words = constant.toLowerCase().split('_');
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(' ');
}
