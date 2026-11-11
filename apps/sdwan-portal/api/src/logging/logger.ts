import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface RequestContext {
  correlationId: string;
  userId?: string;
  accountId?: string;
}

/** Carries the correlation ID through async call chains without threading it through every signature. */
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentCorrelationId(): string | undefined {
  return requestContext.getStore()?.correlationId;
}

const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|apikey|api_key|session/i;

/** Recursively masks values whose keys look like credentials. Vendor payloads routinely echo them back. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

type Sink = (line: string) => void;

export function createLogger(
  level: LogLevel = 'info',
  bindings: Record<string, unknown> = {},
  sink: Sink = (line) => process.stdout.write(line + '\n'),
): Logger {
  const threshold = LEVEL_ORDER[level];

  const emit = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (LEVEL_ORDER[lvl] < threshold) return;
    const ctx = requestContext.getStore();
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: lvl,
      msg,
      service: 'sdwan-portal-api',
      ...bindings,
      ...(ctx ? { correlationId: ctx.correlationId, userId: ctx.userId, accountId: ctx.accountId } : {}),
    };
    if (fields) {
      for (const [k, v] of Object.entries(fields)) {
        record[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : redact(v);
      }
    }
    sink(JSON.stringify(record));
  };

  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (extra) => createLogger(level, { ...bindings, ...extra }, sink),
  };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};
