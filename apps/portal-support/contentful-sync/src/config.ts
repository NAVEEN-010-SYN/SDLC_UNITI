export interface Config {
  contentful: {
    spaceId: string;
    environment: string;
    deliveryToken: string;
    cdnHost: string;
    defaultLocale: string;
  };
  webhook: { secret: string; maxAgeSeconds: number };
  searchIndex: { url: string; apiKey: string; indexName: string };
  syncStateFile: string;
  syncIntervalSeconds: number;
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export class ConfigError extends Error {}

/**
 * Reads and validates configuration from the environment. Fails fast at
 * start-up listing every problem, rather than at the first request.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) problems.push(`${name} is required`);
    return value ?? '';
  };
  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      problems.push(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
  };

  const searchUrl = required('SEARCH_INDEX_URL');
  if (searchUrl && !searchUrl.startsWith('https://')) problems.push('SEARCH_INDEX_URL must use https');

  const logLevel = (env.LOG_LEVEL ?? 'info') as Config['logLevel'];
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) problems.push('LOG_LEVEL is invalid');

  const config: Config = {
    contentful: {
      spaceId: required('CONTENTFUL_SPACE_ID'),
      environment: env.CONTENTFUL_ENVIRONMENT?.trim() || 'master',
      deliveryToken: required('CONTENTFUL_DELIVERY_TOKEN'),
      cdnHost: env.CONTENTFUL_CDN_HOST?.trim() || 'cdn.contentful.com',
      defaultLocale: env.CONTENTFUL_DEFAULT_LOCALE?.trim() || 'en-US',
    },
    webhook: {
      secret: required('CONTENTFUL_WEBHOOK_SECRET'),
      maxAgeSeconds: integer('WEBHOOK_MAX_AGE_SECONDS', 300, 30, 3600),
    },
    searchIndex: {
      url: searchUrl,
      apiKey: required('SEARCH_INDEX_API_KEY'),
      indexName: env.SEARCH_INDEX_NAME?.trim() || 'support-content',
    },
    syncStateFile: env.SYNC_STATE_FILE?.trim() || './.sync-state.json',
    syncIntervalSeconds: integer('SYNC_INTERVAL_SECONDS', 900, 60, 86400),
    port: integer('PORT', 8080, 1, 65535),
    logLevel,
  };

  if (problems.length > 0) throw new ConfigError(`Invalid configuration: ${problems.join('; ')}`);
  return config;
}
