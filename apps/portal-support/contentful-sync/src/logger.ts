import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

type Level = 'debug' | 'info' | 'warn' | 'error';
const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const context = new AsyncLocalStorage<{ correlationId: string }>();

/** Runs fn with a correlation id that every log line and outbound call picks up. */
export function withCorrelationId<T>(correlationId: string | undefined, fn: () => T): T {
  return context.run({ correlationId: correlationId || randomUUID() }, fn);
}

export function currentCorrelationId(): string {
  return context.getStore()?.correlationId ?? randomUUID();
}

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/** Structured JSON logger: one object per line on stdout. */
export function createLogger(minLevel: Level = 'info', write: (line: string) => void = (l) => process.stdout.write(l + '\n')): Logger {
  const log = (level: Level, event: string, fields: Record<string, unknown> = {}): void => {
    if (RANK[level] < RANK[minLevel]) return;
    write(
      JSON.stringify({
        time: new Date().toISOString(),
        level,
        service: 'contentful-sync',
        event,
        correlationId: context.getStore()?.correlationId,
        ...fields,
      }),
    );
  };
  return {
    debug: (e, f) => log('debug', e, f),
    info: (e, f) => log('info', e, f),
    warn: (e, f) => log('warn', e, f),
    error: (e, f) => log('error', e, f),
  };
}
