/**
 * Storage helpers that tolerate disabled storage (Safari private mode, blocked
 * third-party contexts) and corrupt JSON, so the shell never crashes on load.
 */

export function readJson<T>(storage: Storage | undefined, key: string, validate: (value: unknown) => value is T): T | undefined {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeJson(storage: Storage | undefined, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled: the value simply won't persist.
  }
}

export function remove(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // ignore
  }
}

export function safeStorage(kind: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window[kind];
  } catch {
    return undefined;
  }
}
