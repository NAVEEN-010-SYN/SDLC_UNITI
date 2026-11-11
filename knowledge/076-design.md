# Design tokens and export tooling: design

- **Application:** Design tokens and export tooling
- **Tech stack:** Figma design tokens, Node.js TypeScript
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 20

## Files

- `design/.env.example` (5 lines)
- `design/README.md` (36 lines)
- `design/jest.config.js` (10 lines)
- `design/package.json` (28 lines)
- `design/src/cli.ts` (72 lines)
- `design/src/figma/client.ts` (81 lines)
- `design/src/figma/figma.test.ts` (109 lines)
- `design/src/figma/toTokens.ts` (122 lines)
- `design/src/tokens.test.ts` (71 lines)
- `design/src/tokens.ts` (182 lines)
- `design/src/transforms/css.ts` (31 lines)
- `design/src/transforms/format.ts` (63 lines)
- `design/src/transforms/scss.ts` (34 lines)
- `design/src/transforms/swift.ts` (101 lines)
- `design/src/transforms/transforms.test.ts` (92 lines)
- `design/src/transforms/typescript.ts` (46 lines)
- `design/tokens/core.tokens.json` (89 lines)
- `design/tokens/theme.dark.tokens.json` (42 lines)
- `design/tokens/theme.light.tokens.json` (51 lines)
- `design/tsconfig.json` (19 lines)

## design/.env.example

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: bash. Path: `design/.env.example`.

```bash
# Figma personal access token with the file_variables:read scope.
FIGMA_TOKEN=
# Key of the "Uniti Design System" file (the segment after /design/ in its URL).
FIGMA_FILE_KEY=
```

## design/README.md

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: markdown. Path: `design/README.md`.

````markdown
# Design tokens

The source of truth for colour, typography, spacing, radius and elevation across every portal and the iOS app.

```
Figma variables ──pull──> tokens/*.tokens.json (W3C format, reviewed in PRs) ──build──> dist/
                                                                                ├─ tokens.css          web custom properties, light + dark
                                                                                ├─ _tokens.scss        SCSS variables + dark mixin
                                                                                ├─ theme.ts            typed theme object (React / React Native)
                                                                                └─ UnitiTokens.swift   SwiftUI constants (gokinetic-consumer-ios)
```

## Files

- `tokens/core.tokens.json` holds the primitives (palettes, font scale, spacing, radius, durations). Components never use these directly.
- `tokens/theme.light.tokens.json` holds the semantic tokens (`color.bg.*`, `color.text.*`, `color.action.*`, `elevation.*`, `typography.*`). They alias the primitives.
- `tokens/theme.dark.tokens.json` holds only the dark overrides. Anything not listed there inherits the light value.

## Usage

```bash
cp .env.example .env      # FIGMA_TOKEN, FIGMA_FILE_KEY
npm install
npm run pull              # Figma "Core" + "Theme" (Light/Dark modes) -> tokens/*.json
npm run build             # tokens -> dist/
npm test
```

`pull` merges into the existing JSON. Figma wins for every variable it defines, and tokens that Figma variables can't express (shadows, composite typography) are kept as they are. Read the diff before you commit.

## Rules

- Add a semantic token rather than using a primitive in a component. If a component needs `color.brand.600`, it needs a `color.action.*` token.
- Every semantic colour must pass WCAG AA against the background it sits on, in both themes. Check this in Figma before you publish the variable.
- The build fails on an invalid value, an unknown alias or an alias cycle, and the error names the token path.
````

## design/jest.config.js

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: javascript. Path: `design/jest.config.js`.

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/cli.ts'],
  coverageThreshold: { global: { lines: 85, branches: 75 } },
};
```

## design/package.json

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: json. Path: `design/package.json`.

```json
{
  "name": "@uniti/design-tokens",
  "version": "1.0.0",
  "private": true,
  "description": "Uniti design tokens (W3C format) and exporters to CSS, SCSS, TypeScript and Swift.",
  "bin": {
    "design-tokens": "dist-cli/cli.js"
  },
  "scripts": {
    "compile": "tsc -p tsconfig.json",
    "pull": "ts-node src/cli.ts pull",
    "build": "ts-node src/cli.ts build",
    "test": "jest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.10",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.3",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.4"
  }
}
```

## design/src/cli.ts

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: typescript. Path: `design/src/cli.ts`.

```typescript
#!/usr/bin/env node
/**
 * design-tokens pull   -> fetch Figma variables into tokens/*.tokens.json
 * design-tokens build  -> generate dist/tokens.css, _tokens.scss, theme.ts, UnitiTokens.swift
 *
 * Environment: FIGMA_TOKEN, FIGMA_FILE_KEY (pull only). Shadows and typography
 * composites are not Figma variables; they live only in the JSON files and are
 * preserved across pulls.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFigmaClient } from './figma/client';
import { variablesToTokens } from './figma/toTokens';
import { buildThemes, mergeTrees, type TokenTree } from './tokens';
import { toCss } from './transforms/css';
import { toScss } from './transforms/scss';
import { toSwift } from './transforms/swift';
import { toTypeScript } from './transforms/typescript';

const ROOT = path.resolve(__dirname, '..');
const TOKENS = path.join(ROOT, 'tokens');
const DIST = path.join(ROOT, 'dist');
const FILES = { core: 'core.tokens.json', light: 'theme.light.tokens.json', dark: 'theme.dark.tokens.json' } as const;

async function readTree(file: string): Promise<TokenTree> {
  return JSON.parse(await readFile(path.join(TOKENS, file), 'utf8')) as TokenTree;
}

async function writeJson(file: string, tree: TokenTree): Promise<void> {
  await writeFile(path.join(TOKENS, file), `${JSON.stringify(tree, null, 2)}\n`);
}

async function pull(): Promise<void> {
  const fileKey = process.env.FIGMA_FILE_KEY;
  if (!fileKey) throw new Error('FIGMA_FILE_KEY is required.');
  const client = createFigmaClient({ token: process.env.FIGMA_TOKEN ?? '' });
  const pulled = variablesToTokens(await client.getLocalVariables(fileKey));

  for (const key of Object.keys(FILES) as Array<keyof typeof FILES>) {
    // Figma wins for every variable it defines; JSON-only tokens (shadows, typography) survive.
    const merged = mergeTrees(await readTree(FILES[key]), pulled[key]);
    await writeJson(FILES[key], merged);
  }
  console.log(`Pulled variables from Figma file ${fileKey} into ${path.relative(process.cwd(), TOKENS)}`);
}

async function build(): Promise<void> {
  const themes = buildThemes(await readTree(FILES.core), await readTree(FILES.light), await readTree(FILES.dark));
  await mkdir(DIST, { recursive: true });
  const outputs: Record<string, string> = {
    'tokens.css': toCss(themes),
    '_tokens.scss': toScss(themes),
    'theme.ts': toTypeScript(themes),
    'UnitiTokens.swift': toSwift(themes),
  };
  for (const [name, content] of Object.entries(outputs)) await writeFile(path.join(DIST, name), content);
  console.log(`Built ${themes.light.length} tokens -> ${Object.keys(outputs).join(', ')}`);
}

const commands: Record<string, () => Promise<void>> = { pull, build };
const command = process.argv[2] ?? '';

if (!commands[command]) {
  console.error('Usage: design-tokens <pull|build>');
  process.exit(2);
}

commands[command]().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

## design/src/figma/client.ts

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: typescript. Path: `design/src/figma/client.ts`.

```typescript
/** Minimal typed client for the Figma Variables REST API (GET /v1/files/:key/variables/local). */

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaAlias {
  type: 'VARIABLE_ALIAS';
  id: string;
}

export type FigmaVariableValue = boolean | number | string | FigmaColor | FigmaAlias;

export interface FigmaVariable {
  id: string;
  name: string;
  variableCollectionId: string;
  resolvedType: 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';
  valuesByMode: Record<string, FigmaVariableValue>;
  scopes: string[];
  description?: string;
  remote: boolean;
  hiddenFromPublishing: boolean;
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  remote: boolean;
}

export interface LocalVariablesResponse {
  status: number;
  error: boolean;
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

export class FigmaApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Figma API ${status}: ${message}`);
    this.name = 'FigmaApiError';
  }
}

export interface FigmaClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createFigmaClient({ token, baseUrl = 'https://api.figma.com', fetchImpl = fetch, timeoutMs = 30_000 }: FigmaClientOptions) {
  if (!token) throw new Error('FIGMA_TOKEN is required (a personal access token with file_variables:read scope).');

  return {
    async getLocalVariables(fileKey: string): Promise<LocalVariablesResponse> {
      if (!/^[A-Za-z0-9]+$/.test(fileKey)) throw new Error(`Invalid Figma file key "${fileKey}".`);
      const res = await fetchImpl(`${baseUrl}/v1/files/${fileKey}/variables/local`, {
        headers: { 'X-Figma-Token': token, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        // 403 here almost always means the token lacks the variables scope or the plan is not Enterprise.
        throw new FigmaApiError(res.status, body.slice(0, 300) || res.statusText);
      }
      const json = (await res.json()) as LocalVariablesResponse;
      if (json.error) throw new FigmaApiError(json.status, 'response flagged error');
      return json;
    },
  };
}
```

## design/src/figma/figma.test.ts

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: typescript. Path: `design/src/figma/figma.test.ts`.

```typescript
import { createFigmaClient, FigmaApiError, type LocalVariablesResponse } from './client';
import { figmaColorToHex, inferType, variablesToTokens } from './toTokens';

const response: LocalVariablesResponse = {
  status: 200,
  error: false,
  meta: {
    variableCollections: {
      'VC:core': { id: 'VC:core', name: 'Core', modes: [{ modeId: 'm0', name: 'Value' }], defaultModeId: 'm0', remote: false },
      'VC:theme': {
        id: 'VC:theme', name: 'Theme', defaultModeId: 'mL', remote: false,
        modes: [{ modeId: 'mL', name: 'Light' }, { modeId: 'mD', name: 'Dark' }],
      },
    },
    variables: {
      'V:white': {
        id: 'V:white', name: 'color/neutral/0', variableCollectionId: 'VC:core', resolvedType: 'COLOR',
        valuesByMode: { m0: { r: 1, g: 1, b: 1, a: 1 } }, scopes: ['ALL_FILLS'], remote: false, hiddenFromPublishing: false,
      },
      'V:black': {
        id: 'V:black', name: 'color/neutral/950', variableCollectionId: 'VC:core', resolvedType: 'COLOR',
        valuesByMode: { m0: { r: 0.051, g: 0.063, b: 0.082, a: 1 } }, scopes: ['ALL_FILLS'], remote: false, hiddenFromPublishing: false,
      },
      'V:space': {
        id: 'V:space', name: 'space/4', variableCollectionId: 'VC:core', resolvedType: 'FLOAT',
        valuesByMode: { m0: 16 }, scopes: ['GAP', 'WIDTH_HEIGHT'], remote: false, hiddenFromPublishing: false,
      },
      'V:canvas': {
        id: 'V:canvas', name: 'color/bg/canvas', variableCollectionId: 'VC:theme', resolvedType: 'COLOR',
        valuesByMode: { mL: { type: 'VARIABLE_ALIAS', id: 'V:white' }, mD: { type: 'VARIABLE_ALIAS', id: 'V:black' } },
        scopes: ['FRAME_FILL'], remote: false, hiddenFromPublishing: false, description: 'Page background',
      },
      'V:gutter': {
        id: 'V:gutter', name: 'layout/gutter', variableCollectionId: 'VC:theme', resolvedType: 'FLOAT',
        valuesByMode: { mL: { type: 'VARIABLE_ALIAS', id: 'V:space' }, mD: { type: 'VARIABLE_ALIAS', id: 'V:space' } },
        scopes: ['GAP'], remote: false, hiddenFromPublishing: false,
      },
      'V:draft': {
        id: 'V:draft', name: 'color/experimental', variableCollectionId: 'VC:core', resolvedType: 'COLOR',
        valuesByMode: { m0: { r: 1, g: 0, b: 0, a: 1 } }, scopes: [], remote: false, hiddenFromPublishing: true,
      },
    },
  },
};

describe('variablesToTokens', () => {
  const files = variablesToTokens(response);

  it('writes core primitives with literal values', () => {
    expect(files.core).toMatchObject({
      color: { neutral: { '0': { $type: 'color', $value: '#ffffff' } } },
      space: { '4': { $type: 'dimension', $value: '16px' } },
    });
  });

  it('turns theme aliases into W3C references, per mode', () => {
    expect(files.light).toMatchObject({ color: { bg: { canvas: { $value: '{color.neutral.0}', $description: 'Page background' } } } });
    expect(files.dark).toMatchObject({ color: { bg: { canvas: { $value: '{color.neutral.950}' } } } });
  });

  it('omits dark entries identical to light and skips unpublished variables', () => {
    expect(files.dark).not.toHaveProperty('layout');
    expect(files.core).not.toHaveProperty('color.experimental');
  });

  it('requires the Core and Theme collections', () => {
    const broken = { ...response, meta: { ...response.meta, variableCollections: {} } };
    expect(() => variablesToTokens(broken)).toThrow(/"Core" and "Theme"/);
  });
});

describe('conversions', () => {
  it('encodes alpha only when translucent', () => {
    expect(figmaColorToHex({ r: 0, g: 0, b: 0, a: 1 })).toBe('#000000');
    expect(figmaColorToHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080');
  });

  it('infers token types from Figma scopes', () => {
    const base = response.meta.variables['V:space'];
    expect(inferType({ ...base, scopes: ['FONT_WEIGHT'] })).toBe('fontWeight');
    expect(inferType({ ...base, scopes: ['LINE_HEIGHT'] })).toBe('number');
    expect(inferType(base)).toBe('dimension');
    expect(() => inferType({ ...base, resolvedType: 'BOOLEAN' })).toThrow();
  });
});

describe('createFigmaClient', () => {
  it('sends the token header and returns the parsed body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => response });
    const client = createFigmaClient({ token: 'figd_test', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.getLocalVariables('AbC123')).resolves.toBe(response);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.figma.com/v1/files/AbC123/variables/local');
    expect(init.headers['X-Figma-Token']).toBe('figd_test');
  });

  it('surfaces API errors with status', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'Invalid scope' });
    const client = createFigmaClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.getLocalVariables('AbC123')).rejects.toEqual(new FigmaApiError(403, 'Invalid scope'));
  });

  it('refuses to run without a token or with a malformed file key', async () => {
    expect(() => createFigmaClient({ token: '' })).toThrow(/FIGMA_TOKEN/);
    const client = createFigmaClient({ token: 't', fetchImpl: jest.fn() as unknown as typeof fetch });
    await expect(client.getLocalVariables('../etc')).rejects.toThrow(/Invalid Figma file key/);
  });
});
```

## design/src/figma/toTokens.ts

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: typescript. Path: `design/src/figma/toTokens.ts`.

```typescript
import type { TokenTree, TokenType } from '../tokens';
import type { FigmaColor, FigmaVariable, FigmaVariableValue, LocalVariablesResponse } from './client';

/**
 * Converts Figma variables into W3C token trees.
 *
 * Expected Figma setup: a single-mode "Core" collection of primitives and a
 * "Theme" collection with "Light" and "Dark" modes whose values alias Core.
 * Variable names use `/` as the group separator (`color/brand/600`).
 */
export interface TokenFiles {
  core: TokenTree;
  light: TokenTree;
  dark: TokenTree;
}

const CORE = 'core';
const THEME = 'theme';

const isAlias = (v: FigmaVariableValue): v is { type: 'VARIABLE_ALIAS'; id: string } =>
  typeof v === 'object' && v !== null && 'type' in v && v.type === 'VARIABLE_ALIAS';

const byte = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');

export function figmaColorToHex({ r, g, b, a }: FigmaColor): string {
  return `#${byte(r)}${byte(g)}${byte(b)}${a < 1 ? byte(a) : ''}`;
}

export function tokenPath(name: string): string[] {
  return name.split('/').map((s) => s.trim()).filter(Boolean);
}

export function inferType(v: FigmaVariable): TokenType {
  switch (v.resolvedType) {
    case 'COLOR':
      return 'color';
    case 'STRING':
      if (v.scopes.includes('FONT_FAMILY')) return 'fontFamily';
      throw new Error(`Unsupported STRING variable "${v.name}" (only FONT_FAMILY scope is exported).`);
    case 'FLOAT':
      if (v.scopes.includes('FONT_WEIGHT')) return 'fontWeight';
      if (v.scopes.includes('LINE_HEIGHT') || v.scopes.includes('OPACITY')) return 'number';
      return 'dimension';
    default:
      throw new Error(`Unsupported ${v.resolvedType} variable "${v.name}".`);
  }
}

function literal(type: TokenType, value: FigmaVariableValue, name: string): unknown {
  switch (type) {
    case 'color':
      return figmaColorToHex(value as FigmaColor);
    case 'dimension':
      return `${Number((value as number).toFixed(2))}px`;
    case 'fontFamily':
      return [value as string];
    case 'fontWeight':
    case 'number':
      return value as number;
    default:
      throw new Error(`Cannot convert ${name}`);
  }
}

function setIn(tree: TokenTree, path: string[], token: Record<string, unknown>): void {
  let node = tree;
  for (const key of path.slice(0, -1)) {
    node[key] = (node[key] as TokenTree | undefined) ?? {};
    node = node[key] as TokenTree;
  }
  node[path[path.length - 1]] = token;
}

export function variablesToTokens(response: LocalVariablesResponse): TokenFiles {
  const { variables, variableCollections } = response.meta;
  const collectionByName = new Map(
    Object.values(variableCollections).map((c) => [c.name.trim().toLowerCase(), c]),
  );
  const core = collectionByName.get(CORE);
  const theme = collectionByName.get(THEME);
  if (!core || !theme) throw new Error('Figma file must contain "Core" and "Theme" variable collections.');

  const modeId = (label: string) => {
    const mode = theme.modes.find((m) => m.name.trim().toLowerCase() === label);
    if (!mode) throw new Error(`Theme collection is missing a "${label}" mode.`);
    return mode.modeId;
  };
  const lightMode = modeId('light');
  const darkMode = modeId('dark');

  const files: TokenFiles = { core: {}, light: {}, dark: {} };

  for (const v of Object.values(variables)) {
    if (v.remote || v.hiddenFromPublishing) continue;
    const type = inferType(v);
    const path = tokenPath(v.name);

    const toValue = (raw: FigmaVariableValue): unknown => {
      if (!isAlias(raw)) return literal(type, raw, v.name);
      const target = variables[raw.id];
      if (!target) throw new Error(`"${v.name}" aliases a variable not in this file (${raw.id}).`);
      return `{${tokenPath(target.name).join('.')}}`;
    };
    const token = (raw: FigmaVariableValue) => ({
      $type: type,
      $value: toValue(raw),
      ...(v.description ? { $description: v.description } : {}),
    });

    if (v.variableCollectionId === core.id) {
      setIn(files.core, path, token(v.valuesByMode[core.defaultModeId]));
    } else if (v.variableCollectionId === theme.id) {
      const light = v.valuesByMode[lightMode];
      const dark = v.valuesByMode[darkMode];
      setIn(files.light, path, token(light));
      // Dark only records real overrides, keeping theme.dark.tokens.json reviewable.
      if (JSON.stringify(dark) !== JSON.stringify(light)) setIn(files.dark, path, token(dark));
    }
  }
  return files;
}
```

## design/src/tokens.test.ts

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: typescript. Path: `design/src/tokens.test.ts`.

```typescript
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildThemes, flatten, mergeTrees, resolve, TokenError, type TokenTree } from './tokens';

const load = (file: string): TokenTree =>
  JSON.parse(readFileSync(path.join(__dirname, '..', 'tokens', file), 'utf8')) as TokenTree;

describe('flatten', () => {
  it('inherits $type from the nearest group', () => {
    const tokens = flatten({ space: { $type: 'dimension', sm: { $value: '4px' } } });
    expect(tokens.get('space.sm')).toMatchObject({ type: 'dimension', value: '4px' });
  });

  it('rejects tokens without a type', () => {
    expect(() => flatten({ x: { $value: 1 } })).toThrow(TokenError);
  });
});

describe('resolve', () => {
  const base = { color: { $type: 'color', a: { $value: '#112233' }, b: { $value: '{color.a}' }, c: { $value: '{color.b}' } } };

  it('follows alias chains', () => {
    expect(resolve(flatten(base)).get('color.c')?.value).toBe('#112233');
  });

  it('resolves aliases inside composite values', () => {
    const tree = mergeTrees(base, {
      size: { $type: 'dimension', md: { $value: '16px' } },
      weight: { $type: 'fontWeight', bold: { $value: 700 } },
      type: {
        $type: 'typography',
        body: { $value: { fontFamily: 'Inter', fontSize: '{size.md}', fontWeight: '{weight.bold}', lineHeight: 1.5 } },
      },
    });
    expect(resolve(flatten(tree)).get('type.body')?.value).toEqual({
      fontFamily: ['Inter'], fontSize: '16px', fontWeight: 700, lineHeight: 1.5,
    });
  });

  it('reports unknown aliases and cycles with the token path', () => {
    expect(() => resolve(flatten({ c: { $type: 'color', x: { $value: '{c.missing}' } } }))).toThrow('c.x: unknown alias {c.missing}');
    expect(() =>
      resolve(flatten({ c: { $type: 'color', x: { $value: '{c.y}' }, y: { $value: '{c.x}' } } })),
    ).toThrow(/alias cycle/);
  });

  it.each([
    ['color', 'blue'],
    ['dimension', '16'],
    ['fontWeight', 450],
    ['duration', '0.2s'],
  ])('rejects invalid %s value %p', (type, value) => {
    expect(() => resolve(flatten({ t: { $type: type, v: { $value: value } } }))).toThrow(TokenError);
  });
});

describe('repository tokens', () => {
  const themes = buildThemes(load('core.tokens.json'), load('theme.light.tokens.json'), load('theme.dark.tokens.json'));

  it('resolve without errors and give both themes the same token set', () => {
    const paths = (list: typeof themes.light) => list.map((t) => t.path.join('.')).sort();
    expect(paths(themes.dark)).toEqual(paths(themes.light));
  });

  it('override semantic colours in dark mode but keep primitives', () => {
    const find = (list: typeof themes.light, p: string) => list.find((t) => t.path.join('.') === p)?.value;
    expect(find(themes.dark, 'color.bg.canvas')).not.toEqual(find(themes.light, 'color.bg.canvas'));
    expect(find(themes.dark, 'color.brand.600')).toEqual(find(themes.light, 'color.brand.600'));
  });
});
```

## design/src/tokens.ts

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: typescript. Path: `design/src/tokens.ts`.

```typescript
/**
 * W3C design-token model: parse token files, merge theme layers, resolve
 * `{alias.path}` references and validate values per $type.
 */

export type TokenType =
  | 'color'
  | 'dimension'
  | 'fontFamily'
  | 'fontWeight'
  | 'number'
  | 'duration'
  | 'shadow'
  | 'typography';

export interface Shadow {
  color: string;
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
}

export interface Typography {
  fontFamily: string[];
  fontSize: string;
  fontWeight: number;
  lineHeight: number;
}

export type TokenValue = string | number | string[] | Shadow | Typography;

export interface Token {
  path: string[];
  type: TokenType;
  value: TokenValue;
  description?: string;
}

export type TokenTree = { [key: string]: unknown };

interface RawToken {
  path: string[];
  type: TokenType;
  value: unknown;
  description?: string;
}

const TYPES: ReadonlySet<string> = new Set([
  'color', 'dimension', 'fontFamily', 'fontWeight', 'number', 'duration', 'shadow', 'typography',
]);
const ALIAS = /^\{([^{}]+)\}$/;
const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
const DIMENSION = /^-?\d+(\.\d+)?(px|rem)$/;
const DURATION = /^\d+(\.\d+)?ms$/;

export class TokenError extends Error {
  constructor(public readonly tokenPath: string, message: string) {
    super(`${tokenPath}: ${message}`);
    this.name = 'TokenError';
  }
}

const isGroup = (node: unknown): node is TokenTree =>
  typeof node === 'object' && node !== null && !Array.isArray(node);

/** Deep-merges token trees; later layers override earlier ones token by token. */
export function mergeTrees(...trees: TokenTree[]): TokenTree {
  const out: TokenTree = {};
  for (const tree of trees) {
    for (const [key, value] of Object.entries(tree)) {
      const existing = out[key];
      const bothGroups = isGroup(existing) && isGroup(value) && !('$value' in value);
      out[key] = bothGroups ? mergeTrees(existing as TokenTree, value) : value;
    }
  }
  return out;
}

/** Walks a tree into path-keyed raw tokens, applying $type inheritance from groups. */
export function flatten(tree: TokenTree, inheritedType?: TokenType, prefix: string[] = []): Map<string, RawToken> {
  const out = new Map<string, RawToken>();
  const groupType = (tree.$type as TokenType | undefined) ?? inheritedType;
  for (const [key, node] of Object.entries(tree)) {
    if (key.startsWith('$') || !isGroup(node)) continue;
    const path = [...prefix, key];
    if ('$value' in node) {
      const type = (node.$type as TokenType | undefined) ?? groupType;
      if (!type || !TYPES.has(type)) throw new TokenError(path.join('.'), `missing or unsupported $type "${type}"`);
      out.set(path.join('.'), { path, type, value: node.$value, description: node.$description as string | undefined });
    } else {
      for (const [name, token] of flatten(node, groupType, path)) out.set(name, token);
    }
  }
  return out;
}

function validate(name: string, type: TokenType, value: unknown): TokenValue {
  const fail = (why: string): never => {
    throw new TokenError(name, `${why} (got ${JSON.stringify(value)})`);
  };
  switch (type) {
    case 'color':
      return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fail('color must be #rrggbb or #rrggbbaa');
    case 'dimension':
      return typeof value === 'string' && DIMENSION.test(value) ? value : fail('dimension must be px or rem');
    case 'duration':
      return typeof value === 'string' && DURATION.test(value) ? value : fail('duration must be in ms');
    case 'fontWeight':
      return typeof value === 'number' && value >= 100 && value <= 900 && value % 100 === 0
        ? value
        : fail('fontWeight must be 100..900 in steps of 100');
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : fail('number expected');
    case 'fontFamily':
      if (typeof value === 'string') return [value];
      return Array.isArray(value) && value.length > 0 && value.every((f) => typeof f === 'string')
        ? (value as string[])
        : fail('fontFamily must be a string or non-empty string array');
    case 'shadow': {
      if (!isGroup(value)) return fail('shadow must be an object');
      return {
        color: validate(`${name}.color`, 'color', value.color) as string,
        offsetX: validate(`${name}.offsetX`, 'dimension', value.offsetX) as string,
        offsetY: validate(`${name}.offsetY`, 'dimension', value.offsetY) as string,
        blur: validate(`${name}.blur`, 'dimension', value.blur) as string,
        spread: validate(`${name}.spread`, 'dimension', value.spread) as string,
      };
    }
    case 'typography': {
      if (!isGroup(value)) return fail('typography must be an object');
      return {
        fontFamily: validate(`${name}.fontFamily`, 'fontFamily', value.fontFamily) as string[],
        fontSize: validate(`${name}.fontSize`, 'dimension', value.fontSize) as string,
        fontWeight: validate(`${name}.fontWeight`, 'fontWeight', value.fontWeight) as number,
        lineHeight: validate(`${name}.lineHeight`, 'number', value.lineHeight) as number,
      };
    }
    default:
      return fail(`unsupported type ${String(type)}`);
  }
}

/** Resolves aliases (including inside composite values) and validates every token. */
export function resolve(raw: Map<string, RawToken>): Map<string, Token> {
  const resolved = new Map<string, Token>();

  const deref = (value: unknown, from: string, chain: string[]): unknown => {
    if (typeof value === 'string') {
      const match = ALIAS.exec(value);
      if (!match) return value;
      const target = match[1];
      if (chain.includes(target)) throw new TokenError(from, `alias cycle ${[...chain, target].join(' -> ')}`);
      const hit = raw.get(target);
      if (!hit) throw new TokenError(from, `unknown alias {${target}}`);
      return deref(hit.value, target, [...chain, target]);
    }
    if (isGroup(value)) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deref(v, from, chain)]));
    }
    return value;
  };

  for (const [name, token] of raw) {
    const value = deref(token.value, name, [name]);
    resolved.set(name, { path: token.path, type: token.type, description: token.description, value: validate(name, token.type, value) });
  }
  return resolved;
}

export interface ThemeSet {
  light: Token[];
  dark: Token[];
}

/** Builds fully resolved light and dark token lists; dark inherits anything it does not override. */
export function buildThemes(core: TokenTree, light: TokenTree, dark: TokenTree): ThemeSet {
  const lightTokens = resolve(flatten(mergeTrees(core, light)));
  const darkTokens = resolve(flatten(mergeTrees(core, light, dark)));
  return { light: [...lightTokens.values()], dark: [...darkTokens.values()] };
}
```

## design/src/transforms/css.ts

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: typescript. Path: `design/src/transforms/css.ts`.

```typescript
import type { ThemeSet } from '../tokens';
import { changedTokens, cssValue, cssVarName, GENERATED_HEADER } from './format';

/**
 * Custom properties: the full light set on :root, and only the tokens that
 * change in dark mode. Dark applies when the OS prefers it, unless the page pins
 * `data-theme="light"`; `data-theme="dark"` forces it.
 */
export function toCss(themes: ThemeSet): string {
  const decl = (indent: string) => (t: ThemeSet['light'][number]) => `${indent}${cssVarName(t.path)}: ${cssValue(t)};`;
  const dark = changedTokens(themes.light, themes.dark);

  return [
    `/* ${GENERATED_HEADER} */`,
    ':root {',
    ...themes.light.map(decl('  ')),
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    ...dark.map(decl('    ')),
    '  }',
    '}',
    '',
    ':root[data-theme="dark"] {',
    ...dark.map(decl('  ')),
    '}',
    '',
  ].join('\n');
}
```

## design/src/transforms/format.ts

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: typescript. Path: `design/src/transforms/format.ts`.

```typescript
import type { Shadow, Token, TokenValue, Typography } from '../tokens';

export const kebab = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export const camel = (parts: string[]): string =>
  parts
    .map((p, i) => {
      const clean = p.replace(/[^a-zA-Z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ''));
      return i === 0 ? clean.charAt(0).toLowerCase() + clean.slice(1) : clean.charAt(0).toUpperCase() + clean.slice(1);
    })
    .join('');

export const cssVarName = (path: string[], prefix = 'uniti'): string => `--${prefix}-${path.map(kebab).join('-')}`;

const quoteFamily = (f: string): string => (/^[a-z-]+$/i.test(f) && !f.includes(' ') ? f : `"${f}"`);

export function fontStack(families: string[]): string {
  return families.map(quoteFamily).join(', ');
}

export function shadowCss(s: Shadow): string {
  return `${s.offsetX} ${s.offsetY} ${s.blur} ${s.spread} ${s.color}`;
}

export function typographyCss(t: Typography): string {
  return `${t.fontWeight} ${t.fontSize}/${t.lineHeight} ${fontStack(t.fontFamily)}`;
}

/** The value as a CSS literal; shared by the CSS, SCSS and TS emitters. */
export function cssValue(token: Token): string {
  const v: TokenValue = token.value;
  switch (token.type) {
    case 'fontFamily':
      return fontStack(v as string[]);
    case 'shadow':
      return shadowCss(v as Shadow);
    case 'typography':
      return typographyCss(v as Typography);
    default:
      return String(v);
  }
}

/** Dimension in points for native platforms (1rem = 16pt). */
export function toPoints(dimension: string): number {
  const n = parseFloat(dimension);
  return dimension.endsWith('rem') ? n * 16 : n;
}

export function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.replace('#', '');
  const channel = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: channel(0), g: channel(2), b: channel(4), a: h.length === 8 ? channel(6) / 255 : 1 };
}

/** Tokens whose final CSS value differs between the two themes. */
export function changedTokens(base: Token[], variant: Token[]): Token[] {
  const baseValues = new Map(base.map((t) => [t.path.join('.'), cssValue(t)]));
  return variant.filter((t) => baseValues.get(t.path.join('.')) !== cssValue(t));
}

export const GENERATED_HEADER = 'Generated by @uniti/design-tokens from design/tokens. Do not edit by hand.';
```

## design/src/transforms/scss.ts

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: typescript. Path: `design/src/transforms/scss.ts`.

```typescript
import type { ThemeSet } from '../tokens';
import { changedTokens, cssValue, cssVarName, GENERATED_HEADER, kebab } from './format';

const scssName = (path: string[]) => `uniti-${path.map(kebab).join('-')}`;

/**
 * SCSS for codebases that compile styles: `$uniti-*` variables hold the light
 * values for build-time maths, `uniti-token()` reads the themed custom property
 * at runtime, and the `uniti-dark-theme` mixin emits the dark overrides.
 */
export function toScss(themes: ThemeSet): string {
  const dark = changedTokens(themes.light, themes.dark);
  return [
    `// ${GENERATED_HEADER}`,
    '',
    ...themes.light.map((t) => `$${scssName(t.path)}: ${cssValue(t)} !default;`),
    '',
    '$uniti-dark-overrides: (',
    ...dark.map((t) => `  '${cssVarName(t.path)}': ${cssValue(t)},`),
    ');',
    '',
    '@function uniti-token($name) {',
    "  @return var(--uniti-#{$name});",
    '}',
    '',
    '@mixin uniti-dark-theme {',
    '  @each $property, $value in $uniti-dark-overrides {',
    '    #{$property}: #{$value};',
    '  }',
    '}',
    '',
  ].join('\n');
}
```

## design/src/transforms/swift.ts

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: typescript. Path: `design/src/transforms/swift.ts`.

```typescript
import type { Shadow, ThemeSet, Token, Typography } from '../tokens';
import { camel, GENERATED_HEADER, hexToRgba, toPoints } from './format';

const SWIFT_WEIGHTS: Record<number, string> = {
  100: 'ultraLight', 200: 'thin', 300: 'light', 400: 'regular', 500: 'medium',
  600: 'semibold', 700: 'bold', 800: 'heavy', 900: 'black',
};

const SECTIONS: Array<{ root: string; enumName: string }> = [
  { root: 'color', enumName: 'Colors' },
  { root: 'space', enumName: 'Spacing' },
  { root: 'radius', enumName: 'Radius' },
  { root: 'elevation', enumName: 'Elevation' },
  { root: 'typography', enumName: 'Typography' },
];

/** `color.bg.canvas` -> `bgCanvas`; identifiers may not start with a digit, so `space.4` -> `space4`. */
export function swiftIdentifier(path: string[]): string {
  const rest = path.slice(1);
  const id = camel(rest);
  return /^[0-9]/.test(id) ? camel([path[0], ...rest]) : id;
}

const fixed = (n: number) => Number(n.toFixed(4)).toString();

function rgba(hex: string): string {
  const { r, g, b, a } = hexToRgba(hex);
  return `RGBA(${fixed(r / 255)}, ${fixed(g / 255)}, ${fixed(b / 255)}, ${fixed(a)})`;
}

function shadow(s: Shadow): string {
  return `UnitiShadow(color: ${rgba(s.color)}, x: ${toPoints(s.offsetX)}, y: ${toPoints(s.offsetY)}, blur: ${toPoints(s.blur)}, spread: ${toPoints(s.spread)})`;
}

function declaration(light: Token, dark: Token | undefined): string {
  const name = swiftIdentifier(light.path);
  switch (light.type) {
    case 'color':
      return `public static let ${name} = UnitiColor(light: ${rgba(light.value as string)}, dark: ${rgba((dark ?? light).value as string)})`;
    case 'dimension':
      return `public static let ${name}: CGFloat = ${toPoints(light.value as string)}`;
    case 'shadow':
      return `public static let ${name} = UnitiThemedShadow(light: ${shadow(light.value as Shadow)}, dark: ${shadow((dark ?? light).value as Shadow)})`;
    case 'typography': {
      const t = light.value as Typography;
      const weight = SWIFT_WEIGHTS[t.fontWeight] ?? 'regular';
      return `public static let ${name} = UnitiTextStyle(family: "${t.fontFamily[0]}", size: ${toPoints(t.fontSize)}, weight: .${weight}, lineHeightMultiple: ${t.lineHeight})`;
    }
    default:
      throw new Error(`no Swift mapping for ${light.type} (${light.path.join('.')})`);
  }
}

const SUPPORT = `public struct RGBA: Equatable { public let r, g, b, a: Double
    public init(_ r: Double, _ g: Double, _ b: Double, _ a: Double) { self.r = r; self.g = g; self.b = b; self.a = a }
    var uiColor: UIColor { UIColor(red: r, green: g, blue: b, alpha: a) }
}

public struct UnitiColor {
    public let light: RGBA
    public let dark: RGBA
    /// Resolves against the current trait collection, so it follows the system appearance.
    public var color: Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? dark.uiColor : light.uiColor })
    }
}

public struct UnitiShadow { public let color: RGBA; public let x, y, blur, spread: CGFloat }

public struct UnitiThemedShadow {
    public let light: UnitiShadow
    public let dark: UnitiShadow
    public func resolved(for scheme: ColorScheme) -> UnitiShadow { scheme == .dark ? dark : light }
}

public struct UnitiTextStyle {
    public let family: String
    public let size: CGFloat
    public let weight: Font.Weight
    public let lineHeightMultiple: CGFloat
    /// Scales with Dynamic Type relative to the body style.
    public var font: Font { .custom(family, size: size, relativeTo: .body).weight(weight) }
    public var lineSpacing: CGFloat { size * (lineHeightMultiple - 1) }
}`;

/** SwiftUI constants for the Go Kinetic iOS app; colours carry both appearances. */
export function toSwift(themes: ThemeSet): string {
  const darkByPath = new Map(themes.dark.map((t) => [t.path.join('.'), t]));
  const lines = [`// ${GENERATED_HEADER}`, '', 'import SwiftUI', 'import UIKit', '', SUPPORT, '', 'public enum UnitiTokens {'];

  for (const { root, enumName } of SECTIONS) {
    const tokens = themes.light.filter((t) => t.path[0] === root);
    if (!tokens.length) continue;
    lines.push(`    public enum ${enumName} {`);
    for (const t of tokens) lines.push(`        ${declaration(t, darkByPath.get(t.path.join('.')))}`);
    lines.push('    }');
  }
  lines.push('}', '');
  return lines.join('\n');
}
```

## design/src/transforms/transforms.test.ts

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: typescript. Path: `design/src/transforms/transforms.test.ts`.

```typescript
import type { ThemeSet, Token } from '../tokens';
import { toCss } from './css';
import { camel, cssVarName, hexToRgba, kebab } from './format';
import { toScss } from './scss';
import { swiftIdentifier, toSwift } from './swift';
import { toTypeScript } from './typescript';

const token = (path: string, type: Token['type'], value: Token['value']): Token => ({ path: path.split('.'), type, value });

const light: Token[] = [
  token('color.bg.canvas', 'color', '#f6f7f9'),
  token('color.brand.600', 'color', '#0a5fe0'),
  token('space.4', 'dimension', '16px'),
  token('radius.md', 'dimension', '0.5rem'),
  token('elevation.1', 'shadow', { color: '#171b221a', offsetX: '0px', offsetY: '1px', blur: '3px', spread: '0px' }),
  token('typography.body', 'typography', { fontFamily: ['Inter', 'Segoe UI', 'sans-serif'], fontSize: '16px', fontWeight: 400, lineHeight: 1.5 }),
];
const dark: Token[] = light.map((t) => (t.path.join('.') === 'color.bg.canvas' ? { ...t, value: '#0d1015' } : t));
const themes: ThemeSet = { light, dark };

describe('naming helpers', () => {
  it('builds kebab CSS variable names from camelCase paths', () => {
    expect(kebab('primaryHover')).toBe('primary-hover');
    expect(cssVarName(['color', 'action', 'primaryHover'])).toBe('--uniti-color-action-primary-hover');
  });

  it('builds camelCase and digit-safe Swift identifiers', () => {
    expect(camel(['bg', 'canvas'])).toBe('bgCanvas');
    expect(swiftIdentifier(['color', 'bg', 'canvas'])).toBe('bgCanvas');
    expect(swiftIdentifier(['space', '4'])).toBe('space4');
    expect(swiftIdentifier(['typography', '2xl'])).toBe('typography2xl');
  });

  it('parses 8-digit hex alpha', () => {
    expect(hexToRgba('#00000080')).toEqual({ r: 0, g: 0, b: 0, a: 128 / 255 });
  });
});

describe('toCss', () => {
  const css = toCss(themes);

  it('emits every token on :root with CSS literals', () => {
    expect(css).toContain('--uniti-space-4: 16px;');
    expect(css).toContain('--uniti-elevation-1: 0px 1px 3px 0px #171b221a;');
    expect(css).toContain('--uniti-typography-body: 400 16px/1.5 Inter, "Segoe UI", sans-serif;');
  });

  it('emits only changed tokens for dark, under both the media query and the explicit attribute', () => {
    const darkBlocks = css.split(':root:not([data-theme="light"])')[1];
    expect(darkBlocks.match(/--uniti-color-bg-canvas: #0d1015;/g)).toHaveLength(2);
    expect(darkBlocks).not.toContain('--uniti-color-brand-600');
    expect(css).toContain(':root[data-theme="dark"] {');
  });
});

describe('toScss', () => {
  it('emits default variables and a dark override map', () => {
    const scss = toScss(themes);
    expect(scss).toContain('$uniti-color-bg-canvas: #f6f7f9 !default;');
    expect(scss).toContain("'--uniti-color-bg-canvas': #0d1015,");
    expect(scss).toContain('@mixin uniti-dark-theme');
  });
});

describe('toTypeScript', () => {
  it('nests tokens and types dark against light', () => {
    const ts = toTypeScript(themes);
    expect(ts).toContain('export const darkTheme: UnitiTheme = ');
    const lightJson = ts.split('export const lightTheme = ')[1].split(';\n')[0];
    const parsed = JSON.parse(lightJson);
    expect(parsed.color.bg.canvas).toBe('#f6f7f9');
    expect(parsed.typography.body).toEqual({ fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: '16px', fontWeight: 400, lineHeight: 1.5 });
  });
});

describe('toSwift', () => {
  const swift = toSwift(themes);

  it('pairs light and dark colours', () => {
    expect(swift).toContain('public static let bgCanvas = UnitiColor(light: RGBA(0.9647, 0.9686, 0.9765, 1), dark: RGBA(0.051, 0.0627, 0.0824, 1))');
  });

  it('converts dimensions to points, including rem', () => {
    expect(swift).toContain('public static let space4: CGFloat = 16');
    expect(swift).toContain('public static let md: CGFloat = 8');
  });

  it('maps typography to a Dynamic Type text style with the primary family', () => {
    expect(swift).toContain('public static let body = UnitiTextStyle(family: "Inter", size: 16, weight: .regular, lineHeightMultiple: 1.5)');
  });
});
```

## design/src/transforms/typescript.ts

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: typescript. Path: `design/src/transforms/typescript.ts`.

```typescript
import type { ThemeSet, Token, Typography } from '../tokens';
import { cssValue, fontStack, GENERATED_HEADER } from './format';

type Tree = { [key: string]: Tree | string | number | Record<string, string | number> };

function leaf(token: Token): Tree[string] {
  if (token.type === 'typography') {
    const t = token.value as Typography;
    return { fontFamily: fontStack(t.fontFamily), fontSize: t.fontSize, fontWeight: t.fontWeight, lineHeight: t.lineHeight };
  }
  if (token.type === 'fontWeight' || token.type === 'number') return token.value as number;
  return cssValue(token);
}

function nest(tokens: Token[]): Tree {
  const root: Tree = {};
  for (const token of tokens) {
    let node = root;
    token.path.slice(0, -1).forEach((key) => {
      node[key] = (node[key] as Tree | undefined) ?? {};
      node = node[key] as Tree;
    });
    node[token.path[token.path.length - 1]] = leaf(token);
  }
  return root;
}

/** A typed theme object for React (web) and React Native; dark must match light's shape. */
export function toTypeScript(themes: ThemeSet): string {
  const json = (tree: Tree) => JSON.stringify(tree, null, 2);
  return [
    `// ${GENERATED_HEADER}`,
    '',
    `export const lightTheme = ${json(nest(themes.light))};`,
    '',
    'export type UnitiTheme = typeof lightTheme;',
    '',
    `export const darkTheme: UnitiTheme = ${json(nest(themes.dark))};`,
    '',
    "export type ThemeName = 'light' | 'dark';",
    '',
    'export const themes: Record<ThemeName, UnitiTheme> = { light: lightTheme, dark: darkTheme };',
    '',
  ].join('\n');
}
```

## design/tokens/core.tokens.json

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: json. Path: `design/tokens/core.tokens.json`.

```json
{
  "$description": "Primitive tokens. Never referenced directly by components; themes alias into these.",
  "color": {
    "$type": "color",
    "brand": {
      "50":  { "$value": "#eef6ff" },
      "100": { "$value": "#d9eaff" },
      "300": { "$value": "#7db8ff" },
      "500": { "$value": "#1f7aff" },
      "600": { "$value": "#0a5fe0" },
      "700": { "$value": "#084bb3" },
      "900": { "$value": "#06265c" }
    },
    "accent": {
      "400": { "$value": "#36d6b0" },
      "600": { "$value": "#0fa383" }
    },
    "neutral": {
      "0":   { "$value": "#ffffff" },
      "50":  { "$value": "#f6f7f9" },
      "100": { "$value": "#eceef2" },
      "200": { "$value": "#d8dce3" },
      "400": { "$value": "#98a0ae" },
      "600": { "$value": "#5b6474" },
      "800": { "$value": "#2a303b" },
      "900": { "$value": "#171b22" },
      "950": { "$value": "#0d1015" }
    },
    "success": { "500": { "$value": "#1e9e5a" }, "300": { "$value": "#6fd39d" } },
    "warning": { "500": { "$value": "#c98a00" }, "300": { "$value": "#ffcf5c" } },
    "danger":  { "500": { "$value": "#d63b3b" }, "300": { "$value": "#ff8a8a" } },
    "scrim":   { "$value": "#0d101599" }
  },
  "font": {
    "family": {
      "$type": "fontFamily",
      "sans": { "$value": ["Inter", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"] },
      "mono": { "$value": ["JetBrains Mono", "SFMono-Regular", "Consolas", "monospace"] }
    },
    "weight": {
      "$type": "fontWeight",
      "regular":  { "$value": 400 },
      "medium":   { "$value": 500 },
      "semibold": { "$value": 600 },
      "bold":     { "$value": 700 }
    },
    "size": {
      "$type": "dimension",
      "xs":  { "$value": "12px" },
      "sm":  { "$value": "14px" },
      "md":  { "$value": "16px" },
      "lg":  { "$value": "18px" },
      "xl":  { "$value": "22px" },
      "2xl": { "$value": "28px" },
      "3xl": { "$value": "36px" }
    },
    "lineHeight": {
      "$type": "number",
      "tight":  { "$value": 1.2 },
      "normal": { "$value": 1.5 }
    }
  },
  "space": {
    "$type": "dimension",
    "0":  { "$value": "0px" },
    "1":  { "$value": "4px" },
    "2":  { "$value": "8px" },
    "3":  { "$value": "12px" },
    "4":  { "$value": "16px" },
    "6":  { "$value": "24px" },
    "8":  { "$value": "32px" },
    "12": { "$value": "48px" },
    "16": { "$value": "64px" }
  },
  "radius": {
    "$type": "dimension",
    "none": { "$value": "0px" },
    "sm":   { "$value": "4px" },
    "md":   { "$value": "8px" },
    "lg":   { "$value": "16px" },
    "pill": { "$value": "999px" }
  },
  "duration": {
    "$type": "duration",
    "fast":   { "$value": "120ms" },
    "normal": { "$value": "200ms" }
  }
}
```

## design/tokens/theme.dark.tokens.json

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: json. Path: `design/tokens/theme.dark.tokens.json`.

```json
{
  "$description": "Dark theme overrides. Any semantic token not listed here falls back to the light theme value.",
  "color": {
    "$type": "color",
    "bg": {
      "canvas":  { "$value": "{color.neutral.950}" },
      "surface": { "$value": "{color.neutral.900}" },
      "subtle":  { "$value": "{color.neutral.800}" },
      "inverse": { "$value": "{color.neutral.50}" }
    },
    "text": {
      "primary":   { "$value": "{color.neutral.50}" },
      "secondary": { "$value": "{color.neutral.400}" },
      "inverse":   { "$value": "{color.neutral.900}" },
      "link":      { "$value": "{color.brand.300}" }
    },
    "border": {
      "default": { "$value": "{color.neutral.800}" },
      "strong":  { "$value": "{color.neutral.600}" },
      "focus":   { "$value": "{color.brand.300}" }
    },
    "action": {
      "primary":      { "$value": "{color.brand.500}" },
      "primaryHover": { "$value": "{color.brand.300}" },
      "onPrimary":    { "$value": "{color.neutral.950}" },
      "secondary":    { "$value": "{color.brand.900}" }
    },
    "status": {
      "success": { "$value": "{color.success.300}" },
      "warning": { "$value": "{color.warning.300}" },
      "danger":  { "$value": "{color.danger.300}" },
      "info":    { "$value": "{color.brand.300}" }
    }
  },
  "elevation": {
    "$type": "shadow",
    "1": { "$value": { "color": "#00000066", "offsetX": "0px", "offsetY": "1px", "blur": "3px", "spread": "0px" } },
    "2": { "$value": { "color": "#00000080", "offsetX": "0px", "offsetY": "4px", "blur": "12px", "spread": "-2px" } },
    "3": { "$value": { "color": "#00000099", "offsetX": "0px", "offsetY": "12px", "blur": "32px", "spread": "-4px" } }
  }
}
```

## design/tokens/theme.light.tokens.json

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: json. Path: `design/tokens/theme.light.tokens.json`.

```json
{
  "$description": "Semantic tokens for the light theme. Components use only these.",
  "color": {
    "$type": "color",
    "bg": {
      "canvas":  { "$value": "{color.neutral.50}" },
      "surface": { "$value": "{color.neutral.0}" },
      "subtle":  { "$value": "{color.neutral.100}" },
      "inverse": { "$value": "{color.neutral.900}" }
    },
    "text": {
      "primary":   { "$value": "{color.neutral.900}" },
      "secondary": { "$value": "{color.neutral.600}" },
      "inverse":   { "$value": "{color.neutral.0}" },
      "link":      { "$value": "{color.brand.600}" }
    },
    "border": {
      "default": { "$value": "{color.neutral.200}" },
      "strong":  { "$value": "{color.neutral.400}" },
      "focus":   { "$value": "{color.brand.500}" }
    },
    "action": {
      "primary":      { "$value": "{color.brand.600}" },
      "primaryHover": { "$value": "{color.brand.700}" },
      "onPrimary":    { "$value": "{color.neutral.0}" },
      "secondary":    { "$value": "{color.brand.50}" }
    },
    "status": {
      "success": { "$value": "{color.success.500}" },
      "warning": { "$value": "{color.warning.500}" },
      "danger":  { "$value": "{color.danger.500}" },
      "info":    { "$value": "{color.brand.500}" }
    },
    "overlay": { "$value": "{color.scrim}" }
  },
  "elevation": {
    "$type": "shadow",
    "1": { "$value": { "color": "#171b221a", "offsetX": "0px", "offsetY": "1px", "blur": "3px", "spread": "0px" } },
    "2": { "$value": { "color": "#171b2224", "offsetX": "0px", "offsetY": "4px", "blur": "12px", "spread": "-2px" } },
    "3": { "$value": { "color": "#171b222e", "offsetX": "0px", "offsetY": "12px", "blur": "32px", "spread": "-4px" } }
  },
  "typography": {
    "$type": "typography",
    "display": { "$value": { "fontFamily": "{font.family.sans}", "fontSize": "{font.size.3xl}", "fontWeight": "{font.weight.bold}", "lineHeight": "{font.lineHeight.tight}" } },
    "heading": { "$value": { "fontFamily": "{font.family.sans}", "fontSize": "{font.size.xl}", "fontWeight": "{font.weight.semibold}", "lineHeight": "{font.lineHeight.tight}" } },
    "body":    { "$value": { "fontFamily": "{font.family.sans}", "fontSize": "{font.size.md}", "fontWeight": "{font.weight.regular}", "lineHeight": "{font.lineHeight.normal}" } },
    "caption": { "$value": { "fontFamily": "{font.family.sans}", "fontSize": "{font.size.xs}", "fontWeight": "{font.weight.medium}", "lineHeight": "{font.lineHeight.normal}" } },
    "amount":  { "$value": { "fontFamily": "{font.family.mono}", "fontSize": "{font.size.lg}", "fontWeight": "{font.weight.semibold}", "lineHeight": "{font.lineHeight.tight}" } }
  }
}
```

## design/tsconfig.json

Application: Design tokens and export tooling. Stack: Figma design tokens, Node.js TypeScript. Language: json. Path: `design/tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022", "DOM"],
    "rootDir": "src",
    "outDir": "dist-cli",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node", "jest"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```
