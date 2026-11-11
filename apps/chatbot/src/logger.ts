/**
 * Structured JSON logger with correlation-id support.
 * Every line is a single JSON object so it can be shipped to Kibana/Dynatrace as-is.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogSink {
  write(line: string): void;
}

const stdoutSink: LogSink = {
  write: (line) => process.stdout.write(`${line}\n`),
};

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function serialiseError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export function createLogger(
  level: LogLevel = 'info',
  bindings: Record<string, unknown> = {},
  sink: LogSink = stdoutSink,
): Logger {
  const threshold = LEVEL_WEIGHT[level];

  const emit = (lvl: LogLevel, message: string, fields: Record<string, unknown> = {}): void => {
    if (LEVEL_WEIGHT[lvl] < threshold) return;
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: lvl,
      service: 'chatbot',
      message,
      ...bindings,
    };
    for (const [key, value] of Object.entries(fields)) {
      entry[key] = serialiseError(value);
    }
    sink.write(JSON.stringify(entry));
  };

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    child: (extra) => createLogger(level, { ...bindings, ...extra }, sink),
  };
}

/** A logger that discards everything; used by unit tests. */
export const silentLogger: Logger = createLogger('error', {}, { write: () => undefined });
