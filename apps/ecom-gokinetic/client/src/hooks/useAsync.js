import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data with a promise-returning function and tracks
 * `{ data, error, loading }`. Re-runs when `deps` change; responses from
 * superseded runs are ignored so fast filter changes cannot show stale data.
 *
 * @param {() => Promise<T>} fn
 * @param {unknown[]} deps
 * @param {{ enabled?: boolean }} [options]
 */
export function useAsync(fn, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled });
  const runId = useRef(0);

  const run = useCallback(() => {
    const id = runId.current + 1;
    runId.current = id;
    setState((s) => ({ ...s, loading: true, error: null }));
    return fn().then(
      (data) => {
        if (runId.current === id) setState({ data, error: null, loading: false });
        return data;
      },
      (error) => {
        if (runId.current === id) setState((s) => ({ ...s, error, loading: false }));
        return undefined;
      },
    );
    // `fn` is intentionally excluded: callers pass deps explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (enabled) run();
    return () => {
      runId.current += 1;
    };
  }, [run, enabled]);

  const setData = useCallback((data) => setState((s) => ({ ...s, data })), []);
  return { ...state, reload: run, setData };
}

/**
 * Wraps an action (button click / form submit): exposes `pending` and the
 * last `error`, and prevents double submission.
 */
export function useAction(fn) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  const execute = useCallback(
    async (...args) => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        setError(err);
        return undefined;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [fn],
  );

  return { execute, pending, error, clearError: () => setError(null) };
}
