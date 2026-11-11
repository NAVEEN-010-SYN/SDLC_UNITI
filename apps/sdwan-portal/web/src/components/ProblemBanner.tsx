import { ApiError } from '../api/client';

/**
 * Renders any failure from the API layer. Problem details are shown as-is (they are
 * written for end users); the correlation id lets support find the exact request in logs.
 */
export function ProblemBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  const api = error instanceof ApiError ? error : null;
  const title = api?.problem.title ?? 'Something went wrong';
  const detail = api?.problem.detail ?? (error instanceof Error ? error.message : undefined);
  const fieldErrors = api?.problem.errors ?? [];
  const findings = Array.isArray(api?.problem.findings) ? (api!.problem.findings as Array<{ message: string }>) : [];
  return (
    <div role="alert" className="problem">
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {(fieldErrors.length > 0 || findings.length > 0) && (
        <ul>
          {fieldErrors.map((e) => (
            <li key={`f-${e.path}-${e.message}`}>
              <code>{e.path}</code> {e.message}
            </li>
          ))}
          {findings.map((f) => (
            <li key={`l-${f.message}`}>{f.message}</li>
          ))}
        </ul>
      )}
      {api?.correlationId && <small>Reference: {api.correlationId}</small>}
      {onRetry && api && (api.status === 0 || api.status >= 500) && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
