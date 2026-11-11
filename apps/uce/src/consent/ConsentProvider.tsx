import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { readJson, safeStorage, writeJson } from '../lib/storage';
import {
  acceptAll,
  ConsentCategory,
  ConsentChoices,
  ConsentRecord,
  customise,
  globalPrivacyControl,
  isGranted,
  needsDecision,
  parseConsentRecord,
  rejectAll,
} from './consentModel';

/**
 * Holds the visitor's consent decision, persists it locally (first-party,
 * strictly necessary storage) and reports each decision to the backend audit
 * log so the business can evidence consent (GDPR Art. 7(1)).
 */

export interface ConsentContextValue {
  record?: ConsentRecord;
  policyVersion: string;
  needsDecision: boolean;
  preferencesOpen: boolean;
  isGranted(category: ConsentCategory): boolean;
  acceptAll(): void;
  rejectAll(): void;
  save(choices: Partial<ConsentChoices>): void;
  openPreferences(): void;
  closePreferences(): void;
}

export const ConsentContext = createContext<ConsentContextValue | undefined>(undefined);

export const CONSENT_STORAGE_KEY = 'uce.consent';

interface ConsentProviderProps {
  policyVersion: string;
  children: ReactNode;
  /** Best-effort audit sink; failures never block the visitor. */
  onDecision?: (record: ConsentRecord) => Promise<void> | void;
  storage?: Storage;
  clock?: () => Date;
  gpc?: boolean;
}

const isRecord = (v: unknown): v is ConsentRecord => parseConsentRecord(v) !== undefined;

export function ConsentProvider({
  policyVersion,
  children,
  onDecision,
  storage = safeStorage('localStorage'),
  clock = () => new Date(),
  gpc = globalPrivacyControl(),
}: ConsentProviderProps) {
  const [record, setRecord] = useState<ConsentRecord | undefined>(() => {
    const stored = readJson(storage, CONSENT_STORAGE_KEY, isRecord);
    return stored ? parseConsentRecord(stored) : undefined;
  });
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const commit = useCallback(
    (next: ConsentRecord) => {
      writeJson(storage, CONSENT_STORAGE_KEY, next);
      setRecord(next);
      setPreferencesOpen(false);
      Promise.resolve(onDecision?.(next)).catch(() => undefined);
    },
    [onDecision, storage],
  );

  const value = useMemo<ConsentContextValue>(() => {
    const now = clock();
    return {
      record,
      policyVersion,
      needsDecision: needsDecision(record, policyVersion, now),
      preferencesOpen,
      isGranted: (category) => isGranted(record, category, policyVersion, clock()),
      acceptAll: () => commit(acceptAll(policyVersion, clock(), gpc)),
      rejectAll: () => commit(rejectAll(policyVersion, clock(), gpc)),
      save: (choices) => commit(customise(choices, policyVersion, clock(), gpc)),
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
    };
  }, [clock, commit, gpc, policyVersion, preferencesOpen, record]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used inside <ConsentProvider>');
  return ctx;
}
