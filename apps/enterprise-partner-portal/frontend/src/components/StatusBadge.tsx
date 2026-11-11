import { humanise } from '../lib/format';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** One tone table for every lifecycle in the portal, so a status reads the same everywhere. */
const TONES: Record<string, Tone> = {
  NEW: 'info', CONTACTED: 'info', QUALIFIED: 'success', CONVERTED: 'success', DISQUALIFIED: 'neutral',
  SUBMITTED: 'info', UNDER_REVIEW: 'warning', APPROVED: 'success', REJECTED: 'danger', WON: 'success',
  LOST: 'neutral', EXPIRED: 'neutral', WITHDRAWN: 'neutral',
  DRAFT: 'neutral', PENDING_APPROVAL: 'warning', SENT: 'info', ACCEPTED: 'success', DECLINED: 'danger',
  ORDERED: 'success', ISSUED: 'info', DISPUTED: 'warning', CARRIED_FORWARD: 'neutral', PAID: 'success',
  SCHEDULED: 'info', FAILED: 'danger', INVITED: 'info', ACTIVE: 'success', DEACTIVATED: 'neutral',
  HOT: 'danger', WARM: 'warning', COLD: 'info',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = TONES[status] ?? 'neutral';
  return <span className={`badge badge--${tone}`} data-tone={tone}>{humanise(status)}</span>;
}
