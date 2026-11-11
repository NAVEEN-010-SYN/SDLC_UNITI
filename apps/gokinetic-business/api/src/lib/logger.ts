import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

interface RequestContext {
  correlationId: string;
  userId?: string;
  accountId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentCorrelationId(): string | undefined {
  return requestContext.getStore()?.correlationId;
}

/** Keys whose values must never reach the log stream. */
const REDACTED_KEYS = new Set(['password', 'authorization', 'token', 'accessToken', 'secret', 'cardNumber']);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACTED_KEYS.has(k) ? '[REDACTED]' : redact(v, depth + 1);
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

export function createLogger(
  level: LogLevel = 'info',
  bindings: Record<string, unknown> = {},
  sink: (line: string) => void = (line) => process.stdout.write(line + '\n')
): Logger {
  const threshold = LEVEL_ORDER[level];

  const write = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[lvl] < threshold) return;
    const ctx = requestContext.getStore();
    const entry = {
      ts: new Date().toISOString(),
      level: lvl,
      service: 'gokinetic-business-api',
      msg,
      correlationId: ctx?.correlationId,
      userId: ctx?.userId,
      accountId: ctx?.accountId,
      ...bindings,
      ...(fields ? (redact(fields) as Record<string, unknown>) : {})
    };
    sink(JSON.stringify(entry));
  };

  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
    child: (extra) => createLogger(level, { ...bindings, ...extra }, sink)
  };
}

export const logger = createLogger((process.env.LOG_LEVEL as LogLevel) ?? 'info');
