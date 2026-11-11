import { statusLabel } from '../lib/format';

/** Small presentational building blocks shared by every page. */

export function Field({ label, error, hint, as: Control = 'input', children, ...input }) {
  const describedBy = error ? `${input.id}-error` : hint ? `${input.id}-hint` : undefined;
  if (input.type === 'checkbox') {
    return (
      <div className="field field--checkbox">
        <input {...input} aria-describedby={describedBy} />
        <label htmlFor={input.id}>{label}</label>
        {error && <p className="field__error" id={`${input.id}-error`} role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={input.id}>{label}</label>
      <Control {...input} aria-describedby={describedBy}>
        {children}
      </Control>
      {hint && !error && <p className="field__hint" id={`${input.id}-hint`}>{hint}</p>}
      {error && <p className="field__error" id={`${input.id}-error`} role="alert">{error}</p>}
    </div>
  );
}

export function Button({ pending, children, variant = 'primary', ...rest }) {
  return (
    <button className={`btn btn--${variant}`} disabled={pending || rest.disabled} aria-busy={pending || undefined} {...rest}>
      {pending ? 'Please wait…' : children}
    </button>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="spinner" role="status">
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

const FRIENDLY_TITLES = {
  0: 'You appear to be offline',
  401: 'Please sign in again',
  403: 'You do not have access to this',
  404: 'We could not find that',
  409: 'This changed in the meantime',
  429: 'Too many attempts',
};

/**
 * Renders an ApiError (problem+json) for the shopper. The correlation id is
 * shown for 5xx so support can find the request in Kibana.
 */
export function ProblemAlert({ error, onRetry }) {
  if (!error) return null;
  const title = error.status >= 500 ? 'Something went wrong on our side' : FRIENDLY_TITLES[error.status] || error.title || 'Request failed';
  const retryAfter = error.extensions && error.extensions.retryAfterSeconds;
  return (
    <div className="alert alert--error" role="alert">
      <strong>{title}</strong>
      {error.detail && error.status !== 500 && <p>{error.detail}</p>}
      {retryAfter ? <p>Try again in {retryAfter} seconds.</p> : null}
      {error.status >= 500 && error.correlationId && (
        <p className="alert__reference">Reference: <code>{error.correlationId}</code></p>
      )}
      {onRetry && (
        <button type="button" className="btn btn--link" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

const BADGE_TONE = {
  ACTIVE: 'success', PAID: 'success', CONVERTED: 'success', ACCEPTED: 'success',
  CANCELLED: 'muted', VOID: 'muted', EXPIRED: 'muted', REJECTED: 'muted',
  FAILED: 'danger', OVERDUE: 'danger',
  SENT: 'attention', ISSUED: 'attention',
};

export function StatusBadge({ status }) {
  return <span className={`badge badge--${BADGE_TONE[status] || 'info'}`}>{statusLabel(status)}</span>;
}

/** Pager for the API's `{ items, page, pageSize, total }` envelope. */
export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn btn--secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button type="button" className="btn btn--secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
