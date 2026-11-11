import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'gk.availability';

function readStored() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY));
    // Checks expire server-side; drop ours at the same moment.
    return stored && new Date(stored.check.expiresAt) > new Date() ? stored : null;
  } catch {
    return null;
  }
}

/**
 * The shopper's latest address availability check, shared by the plan
 * list, comparison and cart pages for the browser session.
 */
export function useAvailability() {
  const { endpoints } = useAuth();
  const [state, setState] = useState(readStored);

  const check = useCallback(
    async (address, segment) => {
      const result = await endpoints.serviceability.check(address, segment);
      const next = { address, check: result };
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Fine: the result just is not remembered across pages.
      }
      setState(next);
      return result;
    },
    [endpoints],
  );

  const clear = useCallback(() => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setState(null);
  }, []);

  return {
    address: state ? state.address : null,
    check: state ? state.check : null,
    isAvailable: (sku) => Boolean(state && state.check.availablePlanSkus.includes(sku)),
    runCheck: check,
    clear,
  };
}
