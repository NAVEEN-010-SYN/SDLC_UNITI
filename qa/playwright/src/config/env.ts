import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export type TestEnvironment = 'dev' | 'staging';

export type Role =
  | 'CONSUMER'
  | 'BUSINESS_ADMIN'
  | 'BUSINESS_USER'
  | 'PARTNER_ADMIN'
  | 'PARTNER_AGENT'
  | 'WHOLESALE_BUYER'
  | 'SUPPORT_AGENT';

export interface Credentials {
  username: string;
  password: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}. See qa/playwright/.env.example.`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function parseEnvironment(raw: string): TestEnvironment {
  if (raw === 'dev' || raw === 'staging') {
    return raw;
  }
  throw new Error(`TEST_ENV must be "dev" or "staging", got "${raw}"`);
}

export const env = {
  name: parseEnvironment(optional('TEST_ENV', 'dev')),
  urls: {
    ecom: optional('ECOM_BASE_URL', 'http://localhost:3000'),
    uconnect: optional('UCONNECT_BASE_URL', 'http://localhost:5000'),
    partner: optional('PARTNER_BASE_URL', 'http://localhost:8080'),
    sdwan: optional('SDWAN_BASE_URL', 'http://localhost:4000'),
    api: optional('API_BASE_URL', 'http://localhost:8000'),
  },
  oidc: {
    tokenUrl: () => required('OIDC_TOKEN_URL'),
    clientId: () => required('OIDC_CLIENT_ID'),
    clientSecret: () => required('OIDC_CLIENT_SECRET'),
    scope: optional('OIDC_SCOPE', 'selfcare.api'),
  },
  workers: Number(optional('PW_WORKERS', '4')),
  retries: Number(optional('PW_RETRIES', process.env.CI ? '1' : '0')),
} as const;

const personaVariables: Partial<Record<Role, [string, string]>> = {
  CONSUMER: ['CONSUMER_USERNAME', 'CONSUMER_PASSWORD'],
  BUSINESS_ADMIN: ['BUSINESS_ADMIN_USERNAME', 'BUSINESS_ADMIN_PASSWORD'],
  PARTNER_ADMIN: ['PARTNER_ADMIN_USERNAME', 'PARTNER_ADMIN_PASSWORD'],
  PARTNER_AGENT: ['PARTNER_AGENT_USERNAME', 'PARTNER_AGENT_PASSWORD'],
};

export function credentialsFor(role: Role): Credentials {
  const vars = personaVariables[role];
  if (!vars) {
    throw new Error(`No test persona configured for role ${role}`);
  }
  return { username: required(vars[0]), password: required(vars[1]) };
}
