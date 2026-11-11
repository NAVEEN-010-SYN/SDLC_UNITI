import { describeError, ProblemError } from '../api/problem';

const DETAIL_LISTS = ['blockers', 'problems', 'missing', 'conflictingReferences'];

/** Shows an API failure with any rule details it carries and the reference to quote to support. */
export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }
  const details = error instanceof ProblemError ? DETAIL_LISTS.flatMap((k) => error.listDetail(k)) : [];
  return (
    <div className="banner banner--error" role="alert">
      <p>{describeError(error)}</p>
      {details.length > 0 && (
        <ul>
          {details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </div>
  );
}
