/**
 * Display formatting. The API always sends integer minor units and ISO-8601
 * UTC strings; conversion to dollars/local dates happens only here, at the
 * edge, and never feeds back into arithmetic.
 */

const currencyFormatters = new Map();

function currencyFormatter(currency) {
  if (!currencyFormatters.has(currency)) {
    currencyFormatters.set(currency, new Intl.NumberFormat('en-US', { style: 'currency', currency }));
  }
  return currencyFormatters.get(currency);
}

/** @param {number} minor integer cents */
export function formatMoney(minor, currency = 'USD') {
  if (!Number.isSafeInteger(minor)) return '-';
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  // Build the decimal string from integers to avoid float artefacts.
  const decimal = `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return `${sign}${currencyFormatter(currency).format(Number(decimal))}`;
}

export function formatMonthly(minor, currency) {
  return `${formatMoney(minor, currency)}/mo`;
}

export function formatSpeed(mbps) {
  if (!mbps) return '-';
  return mbps >= 1000 && mbps % 1000 === 0 ? `${mbps / 1000} Gbps` : `${mbps} Mbps`;
}

export function formatDate(iso, options = { dateStyle: 'medium' }) {
  if (!iso) return '-';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('en-US', options).format(date);
}

/** Formats a calendar date (YYYY-MM-DD) without shifting it into the local timezone. */
export function formatCalendarDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatAddress(address) {
  if (!address) return '';
  return [address.line1, address.line2, `${address.city}, ${address.state} ${address.postalCode}`].filter(Boolean).join(', ');
}

export function formatTerm(months) {
  return months === 0 ? 'No contract' : `${months}-month contract`;
}

const STATUS_LABELS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Order placed',
  VALIDATED: 'Confirmed',
  PROVISIONING: 'Installation scheduled',
  ACTIVE: 'Active',
  CANCELLED: 'Cancelled',
  FAILED: 'Could not complete',
  REQUESTED: 'Requested',
  PRICED: 'Being prepared',
  PENDING_APPROVAL: 'Being prepared',
  SENT: 'Ready to review',
  ACCEPTED: 'Accepted',
  REJECTED: 'Declined',
  EXPIRED: 'Expired',
  CONVERTED: 'Ordered',
  ISSUED: 'Due',
  PAID: 'Paid',
  VOID: 'Void',
  OVERDUE: 'Overdue',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}
