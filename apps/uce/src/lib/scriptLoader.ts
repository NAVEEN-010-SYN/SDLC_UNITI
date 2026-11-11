/**
 * Injects a third-party script once per id. Concurrent callers share the same
 * promise; a failed load removes the tag so a later call can retry.
 */

const pending = new Map<string, Promise<void>>();

export interface ScriptOptions {
  id: string;
  nonce?: string;
  attributes?: Record<string, string>;
}

export type ScriptLoader = (src: string, options: ScriptOptions) => Promise<void>;

export const loadScript: ScriptLoader = (src, { id, nonce, attributes = {} }) => {
  const existing = pending.get(id);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    if (nonce) script.nonce = nonce;
    for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      pending.delete(id);
      reject(new Error(`Failed to load script ${src}`));
    };
    document.head.appendChild(script);
  });
  pending.set(id, promise);
  return promise;
};

export function removeScript(id: string): void {
  pending.delete(id);
  document.getElementById(id)?.remove();
}
