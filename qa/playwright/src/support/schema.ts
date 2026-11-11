import Ajv, { ErrorObject, JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import { expect } from '@playwright/test';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const moneySchema = {
  type: 'object',
  required: ['amountMinor', 'currency'],
  properties: {
    amountMinor: { type: 'integer' },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
  },
  additionalProperties: false,
} as const;

export const schemas = {
  problem: {
    type: 'object',
    required: ['type', 'title', 'status'],
    properties: {
      type: { type: 'string', format: 'uri-reference' },
      title: { type: 'string', minLength: 1 },
      status: { type: 'integer', minimum: 400, maximum: 599 },
      detail: { type: 'string' },
      instance: { type: 'string' },
      correlationId: { type: 'string' },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          required: ['field', 'message'],
          properties: { field: { type: 'string' }, message: { type: 'string' } },
        },
      },
    },
  },
  order: {
    type: 'object',
    required: ['id', 'accountId', 'status', 'lines', 'total', 'createdAt'],
    properties: {
      id: { type: 'string', pattern: '^ORD-\\d{8}$' },
      accountId: { type: 'string', pattern: '^ACC-\\d{8}$' },
      status: { enum: ['DRAFT', 'SUBMITTED', 'VALIDATED', 'PROVISIONING', 'ACTIVE', 'CANCELLED', 'FAILED'] },
      lines: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['sku', 'quantity'],
          properties: { sku: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } },
        },
      },
      total: moneySchema,
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  ticket: {
    type: 'object',
    required: ['id', 'accountId', 'subject', 'priority', 'status', 'createdAt'],
    properties: {
      id: { type: 'string', pattern: '^TCK-\\d{8}$' },
      accountId: { type: 'string', pattern: '^ACC-\\d{8}$' },
      subject: { type: 'string', minLength: 1, maxLength: 200 },
      priority: { enum: ['P1', 'P2', 'P3', 'P4'] },
      status: { enum: ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED'] },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  page: {
    type: 'object',
    required: ['items', 'page', 'pageSize', 'total'],
    properties: {
      items: { type: 'array' },
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      total: { type: 'integer', minimum: 0 },
    },
  },
} as const;

export type SchemaName = keyof typeof schemas;

const compiled = new Map<SchemaName, ReturnType<typeof ajv.compile>>();

function validator(name: SchemaName) {
  let fn = compiled.get(name);
  if (!fn) {
    fn = ajv.compile(schemas[name] as unknown as JSONSchemaType<unknown>);
    compiled.set(name, fn);
  }
  return fn;
}

function describe(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`.trim());
}

/** Asserts that a JSON payload matches one of the contract schemas above. */
export function expectSchema(name: SchemaName, payload: unknown): void {
  const validate = validator(name);
  const valid = validate(payload);
  expect(describe(validate.errors), `payload should satisfy "${name}" schema`).toEqual([]);
  expect(valid).toBe(true);
}
