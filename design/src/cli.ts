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
