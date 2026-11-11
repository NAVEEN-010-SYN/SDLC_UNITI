import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../api/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { hasAnyRole, Role } from '../auth/roles';

/**
 * Feature flags served by GET /feature-flags, evaluated client-side:
 *   local override > disabled > role targeting > percentage rollout.
 * Rollout bucketing hashes (flag key, user id) so a user stays in the same
 * bucket across sessions and different flags get independent populations.
 */

export interface FlagDefinition {
  key: string;
  enabled: boolean;
  /** 0-100; omitted means everyone who passes targeting. */
  rolloutPercent?: number;
  roles?: Role[];
}

export interface FlagContext {
  userId?: string;
  roles: Role[];
}

/** FNV-1a 32-bit; deterministic and fast enough to run on every render. */
export function bucketOf(flagKey: string, userId: string): number {
  let hash = 0x811c9dc5;
  const input = `${flagKey}:${userId}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function evaluateFlag(definition: FlagDefinition | undefined, ctx: FlagContext, override?: boolean): boolean {
  if (override !== undefined) return override;
  if (!definition || !definition.enabled) return false;
  if (definition.roles && definition.roles.length > 0 && !hasAnyRole(ctx.roles, definition.roles)) return false;
  const percent = definition.rolloutPercent ?? 100;
  if (percent >= 100) return true;
  if (percent <= 0 || !ctx.userId) return false;
  return bucketOf(definition.key, ctx.userId) < percent;
}

export function parseFlags(payload: unknown): Record<string, FlagDefinition> {
  const items = (payload as { items?: unknown })?.items;
  const result: Record<string, FlagDefinition> = {};
  if (!Array.isArray(items)) return result;
  for (const item of items as Array<Partial<FlagDefinition>>) {
    if (typeof item?.key === 'string' && typeof item.enabled === 'boolean') {
      result[item.key] = { key: item.key, enabled: item.enabled, rolloutPercent: item.rolloutPercent, roles: item.roles };
    }
  }
  return result;
}

interface FlagsValue {
  isEnabled(key: string): boolean;
  ready: boolean;
}

const FlagsContext = createContext<FlagsValue>({ isEnabled: () => false, ready: false });

interface FeatureFlagProviderProps {
  api: ApiClient;
  overrides: Record<string, boolean>;
  children: ReactNode;
}

export function FeatureFlagProvider({ api, overrides, children }: FeatureFlagProviderProps) {
  const { user, status } = useAuth();
  const [definitions, setDefinitions] = useState<Record<string, FlagDefinition>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (status === 'loading') return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const payload = await api.get<unknown>('/feature-flags');
        if (!cancelled) setDefinitions(parseFlags(payload));
      } catch {
        // Flags fail closed: if the service is down, new features stay off.
        if (!cancelled) setDefinitions({});
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [api, status, user?.userId]);

  const value = useMemo<FlagsValue>(() => {
    const ctx: FlagContext = { userId: user?.userId, roles: user?.roles ?? [] };
    return { ready, isEnabled: (key) => evaluateFlag(definitions[key], ctx, overrides[key]) };
  }, [definitions, overrides, ready, user]);

  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>;
}

export function useFeatureFlag(key: string): boolean {
  return useContext(FlagsContext).isEnabled(key);
}

export function Feature({ flag, children, fallback = null }: { flag: string; children: ReactNode; fallback?: ReactNode }) {
  return <>{useFeatureFlag(flag) ? children : fallback}</>;
}
