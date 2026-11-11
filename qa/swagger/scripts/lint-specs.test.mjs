import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintFile, resolveRef } from './lint-specs.mjs';

const SPECS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'specs');

async function fixture(body) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'oas-lint-'));
  await copyFile(path.join(SPECS, 'common.yaml'), path.join(dir, 'common.yaml'));
  const file = path.join(dir, 'spec.yaml');
  await writeFile(file, body);
  return file;
}

const HEADER = `openapi: 3.0.3
info: { title: Fixture, version: 1.0.0 }
servers: [{ url: https://example.test }]
security: [{ bearerAuth: [] }]
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
`;

const messages = (findings) => findings.filter((f) => f.level === 'error').map((f) => f.message);

test('repository specs pass every house rule', async () => {
  const seen = new Map();
  for (const name of ['ecom-orders.yaml', 'uconnect-accounts-billing.yaml', 'iconnect-wholesale-orders.yaml', 'sdwan-edges.yaml']) {
    assert.deepEqual(messages(await lintFile(path.join(SPECS, name), seen)), [], name);
  }
});

test('resolves cross-file refs and reports missing ones', async () => {
  const from = path.join(SPECS, 'ecom-orders.yaml');
  assert.ok(await resolveRef('./common.yaml#/components/schemas/ProblemDetails', from));
  assert.equal(await resolveRef('./common.yaml#/components/schemas/Nope', from), null);
});

test('flags unversioned paths, undeclared path params and non-problem errors', async () => {
  const file = await fixture(`${HEADER}paths:
  /orders/{id}:
    get:
      operationId: getThing
      responses:
        '200': { description: ok }
        '404':
          description: missing
          content:
            application/json: { schema: { type: object } }
`);
  const errors = messages(await lintFile(file));
  assert.ok(errors.includes('paths must be versioned under /api/v1'));
  assert.ok(errors.includes('path parameter {id} is not declared'));
  assert.ok(errors.includes('error responses must be application/problem+json'));
});

test('rejects floating-point money and unpaired pagination', async () => {
  const file = await fixture(`${HEADER}paths:
  /api/v1/things:
    get:
      operationId: listThings
      parameters:
        - { name: page, in: query, schema: { type: integer } }
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  totalMinor: { type: number }
`);
  const errors = messages(await lintFile(file));
  assert.ok(errors.includes('money fields must be integer/int64 minor units'));
  assert.ok(errors.includes('page and pageSize must be declared together'));
});

test('detects duplicate operationIds across specs', async () => {
  const body = `${HEADER}paths:
  /api/v1/a:
    get:
      operationId: dup
      responses: { '200': { description: ok } }
`;
  const seen = new Map();
  await lintFile(await fixture(body), seen);
  const errors = messages(await lintFile(await fixture(body), seen));
  assert.ok(errors.some((m) => m.startsWith('operationId dup already used')));
});
