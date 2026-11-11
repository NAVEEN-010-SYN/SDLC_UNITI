type Tone = 'ok' | 'warn' | 'bad' | 'muted' | 'info';

const TONES: Record<string, Tone> = {
  UP: 'ok',
  ONLINE: 'ok',
  COMPLETED: 'ok',
  APPROVED: 'ok',
  RESOLVED: 'ok',
  LOW: 'ok',
  DEGRADED: 'warn',
  STANDBY: 'muted',
  MINOR: 'warn',
  MEDIUM: 'warn',
  SUBMITTED: 'info',
  SCHEDULED: 'info',
  IN_PROGRESS: 'info',
  ACKNOWLEDGED: 'info',
  DOWN: 'bad',
  FAILED: 'bad',
  REJECTED: 'bad',
  CRITICAL: 'bad',
  MAJOR: 'bad',
  HIGH: 'bad',
  OPEN: 'bad',
};

/**
 * Colour-coded status label. The text is always present so colour is never the only
 * signal (WCAG 1.4.1); `label` overrides the default humanised value.
 */
export function StatusPill({ value, label }: { value: string; label?: string }) {
  const tone = TONES[value] ?? 'muted';
  const text = label ?? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
  return (
    <span className={`pill pill-${tone}`} data-tone={tone}>
      {text}
    </span>
  );
}
