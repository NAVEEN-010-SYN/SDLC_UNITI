#!/usr/bin/env node
/**
 * Validates the OpenAPI specs under qa/swagger/specs against the platform
 * conventions in CONVENTIONS.md. Structural OpenAPI validity is delegated to
 * @apidevtools/swagger-parser; the rules below are the house rules it cannot know.
 *
 * Usage: node scripts/lint-specs.mjs [specFile...]   (defaults to every *.yaml except common.yaml)
 * Exit code is 1 when any rule reports an error.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = path.resolve(HERE, '..', 'specs');
const SHARED_FILE = 'common.yaml';
const HTTP_METHODS = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options'];
const MONEY_NAME = /(Minor|Amount|amount)$/;

const docCache = new Map();

async function loadDoc(file) {
  const abs = path.resolve(file);
  if (!docCache.has(abs)) {
    docCache.set(abs, YAML.parse(await readFile(abs, 'utf8')));
  }
  return docCache.get(abs);
}

function pointerGet(doc, pointer) {
  if (!pointer || pointer === '/') return doc;
  return pointer
    .slice(1)
    .split('/')
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, seg) => (node == null ? undefined : node[seg]), doc);
}

/** Resolves a $ref relative to the file it appears in. Returns { file, node } or null. */
export async function resolveRef(ref, fromFile) {
  const [filePart, pointer = ''] = ref.split('#');
  const file = filePart ? path.resolve(path.dirname(fromFile), filePart) : path.resolve(fromFile);
  let doc;
  try {
    doc = await loadDoc(file);
  } catch {
    return null;
  }
  const node = pointerGet(doc, pointer);
  return node === undefined ? null : { file, node };
}

/** Follows $ref chains (bounded) so rules can inspect the concrete object. */
async function deref(node, file, depth = 0) {
  if (!node || typeof node !== 'object' || !node.$ref || depth > 10) return { node, file };
  const hit = await resolveRef(node.$ref, file);
  return hit ? deref(hit.node, hit.file, depth + 1) : { node: undefined, file };
}

async function* walk(node, file, trail = []) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) yield* walk(node[i], file, [...trail, i]);
    return;
  }
  if (!node || typeof node !== 'object') return;
  yield { node, trail };
  for (const [key, value] of Object.entries(node)) yield* walk(value, file, [...trail, key]);
}

function operations(doc) {
  const ops = [];
  for (const [route, item] of Object.entries(doc.paths || {})) {
    for (const method of HTTP_METHODS) {
      if (item[method]) ops.push({ route, method, op: item[method], pathParams: item.parameters || [] });
    }
  }
  return ops;
}

async function checkRefs(doc, file, report) {
  for await (const { node, trail } of walk(doc, file)) {
    if (typeof node.$ref === 'string' && !(await resolveRef(node.$ref, file))) {
      report('error', trail.join('.'), `unresolved $ref ${node.$ref}`);
    }
  }
}

function checkInfo(doc, report) {
  if (!/^3\.0\.\d+$/.test(String(doc.openapi))) report('error', 'openapi', 'must be OpenAPI 3.0.x');
  if (!doc.info?.title) report('error', 'info.title', 'is required');
  if (!/^\d+\.\d+\.\d+$/.test(String(doc.info?.version))) report('error', 'info.version', 'must be semver');
  if (!Array.isArray(doc.servers) || doc.servers.length === 0) report('warn', 'servers', 'no servers declared');
}

function checkSecurity(doc, report) {
  const schemes = doc.components?.securitySchemes || {};
  for (const requirement of doc.security || []) {
    for (const name of Object.keys(requirement)) {
      const scheme = schemes[name];
      if (!scheme) report('error', `security.${name}`, 'references an undeclared security scheme');
      else if (scheme.type !== 'http' || scheme.scheme !== 'bearer') {
        report('error', `components.securitySchemes.${name}`, 'must be an http bearer scheme');
      }
    }
  }
  if (!doc.security?.length) report('error', 'security', 'a global bearer security requirement is required');
}

async function paramNames(params, file) {
  const out = [];
  for (const p of params) {
    const { node } = await deref(p, file);
    if (node) out.push(node);
  }
  return out;
}

async function checkOperations(doc, file, report, seenOperationIds) {
  for (const { route, method, op, pathParams } of operations(doc)) {
    const where = `paths.${route}.${method}`;
    if (!route.startsWith('/api/v1/')) report('error', where, 'paths must be versioned under /api/v1');

    if (!op.operationId) report('error', where, 'operationId is required');
    else if (seenOperationIds.has(op.operationId)) {
      report('error', where, `operationId ${op.operationId} already used in ${seenOperationIds.get(op.operationId)}`);
    } else seenOperationIds.set(op.operationId, path.basename(file));

    const params = await paramNames([...pathParams, ...(op.parameters || [])], file);
    const declared = new Set(params.filter((p) => p.in === 'path').map((p) => p.name));
    const templated = new Set([...route.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]));
    for (const name of templated) if (!declared.has(name)) report('error', where, `path parameter {${name}} is not declared`);
    for (const name of declared) if (!templated.has(name)) report('error', where, `declared path parameter ${name} is not in the route`);

    const query = new Set(params.filter((p) => p.in === 'query').map((p) => p.name));
    if (query.has('page') !== query.has('pageSize')) report('error', where, 'page and pageSize must be declared together');

    const responses = op.responses || {};
    const codes = Object.keys(responses);
    if (!codes.some((c) => /^2\d\d$/.test(c))) report('error', where, 'must declare a 2xx response');
    if (op.security?.length === 0) report('warn', where, 'operation opts out of authentication');

    for (const code of codes.filter((c) => /^[45]\d\d$/.test(c))) {
      const { node } = await deref(responses[code], file);
      const types = Object.keys(node?.content || {});
      if (!types.includes('application/problem+json')) {
        report('error', `${where}.responses.${code}`, 'error responses must be application/problem+json');
      }
    }

    if (['post', 'put', 'patch'].includes(method) && op.requestBody) {
      const { node } = await deref(op.requestBody, file);
      if (!node?.required) report('warn', `${where}.requestBody`, 'request body should be required');
    }

    if (query.has('page')) {
      const ok = await deref(responses['200'], file);
      const schema = ok.node?.content?.['application/json']?.schema;
      const parts = schema?.allOf || [];
      const hasMeta = parts.some((p) => typeof p.$ref === 'string' && p.$ref.endsWith('/PageMeta'));
      const hasItems = parts.some((p) => p.properties?.items?.type === 'array');
      if (!hasMeta || !hasItems) report('error', where, 'paginated responses must be PageMeta + items[]');
    }
  }
}

async function checkMoney(doc, file, report) {
  for await (const { node, trail } of walk(doc, file)) {
    if (!node.properties || typeof node.properties !== 'object') continue;
    for (const [name, prop] of Object.entries(node.properties)) {
      if (!MONEY_NAME.test(name) || !prop || prop.$ref || prop.type === 'object') continue;
      if (prop.type !== 'integer' || prop.format !== 'int64') {
        report('error', [...trail, 'properties', name].join('.'), 'money fields must be integer/int64 minor units');
      }
    }
  }
}

export async function lintFile(file, seenOperationIds = new Map()) {
  const findings = [];
  const report = (level, at, message) => findings.push({ file: path.basename(file), level, at, message });
  let doc;
  try {
    doc = await loadDoc(file);
  } catch (err) {
    report('error', '(parse)', err.message);
    return findings;
  }
  checkInfo(doc, report);
  await checkRefs(doc, file, report);
  await checkMoney(doc, file, report);
  if (path.basename(file) !== SHARED_FILE) {
    checkSecurity(doc, report);
    await checkOperations(doc, file, report, seenOperationIds);
  }
  return findings;
}

async function structuralValidate(file) {
  try {
    const { default: SwaggerParser } = await import('@apidevtools/swagger-parser');
    await SwaggerParser.validate(file);
    return [];
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') return [];
    return [{ file: path.basename(file), level: 'error', at: '(schema)', message: err.message }];
  }
}

export async function lintAll(files) {
  const seen = new Map();
  const findings = [];
  for (const file of files) {
    findings.push(...(await lintFile(file, seen)));
    if (path.basename(file) !== SHARED_FILE) findings.push(...(await structuralValidate(file)));
  }
  return findings;
}

async function main(argv) {
  const files = argv.length
    ? argv.map((f) => path.resolve(f))
    : (await readdir(SPEC_DIR)).filter((f) => f.endsWith('.yaml')).map((f) => path.join(SPEC_DIR, f));

  const findings = await lintAll(files);
  for (const f of findings) console.log(`${f.level.toUpperCase().padEnd(5)} ${f.file} ${f.at}: ${f.message}`);
  const errors = findings.filter((f) => f.level === 'error').length;
  console.log(`\n${files.length} spec(s) checked, ${errors} error(s), ${findings.length - errors} warning(s).`);
  return errors ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
