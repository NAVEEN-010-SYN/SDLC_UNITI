import { formatDate } from '../lib/format';

const STATE_TEXT = { COMPLETE: 'Done', CURRENT: 'In progress', UPCOMING: 'Expected', SKIPPED: 'Not reached' };

/** Renders the server-built tracking timeline (domain/orderTracking.js). */
export function OrderTimeline({ timeline }) {
  return (
    <div className="timeline">
      {timeline.closed && (
        <p className="alert alert--warning" role="status">
          This order was {timeline.status === 'CANCELLED' ? 'cancelled' : 'not completed'}
          {timeline.closedReason ? `: ${timeline.closedReason}` : '.'}
        </p>
      )}
      <ol>
        {timeline.steps.map((step) => (
          <li key={step.status} className={`timeline__step timeline__step--${step.state.toLowerCase()}`} aria-current={step.state === 'CURRENT' ? 'step' : undefined}>
            <span className="timeline__label">{step.label}</span>
            <span className="timeline__state">{STATE_TEXT[step.state]}</span>
            <span className="timeline__date">
              {step.completedAt
                ? formatDate(step.completedAt)
                : step.estimatedAt
                  ? `by ${formatDate(step.estimatedAt)}`
                  : null}
            </span>
          </li>
        ))}
      </ol>
      {timeline.installAppointment && (
        <p>
          Installation appointment: <strong>{formatDate(timeline.installAppointment, { dateStyle: 'full', timeStyle: 'short' })}</strong>
        </p>
      )}
    </div>
  );
}
