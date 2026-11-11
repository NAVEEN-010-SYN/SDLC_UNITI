import type { TokenTree, TokenType } from '../tokens';
import type {
  FigmaAlias,
  FigmaColor,
  FigmaVariable,
  FigmaVariableCollection,
  FigmaVariableValue,
  LocalVariablesResponse,
} from './client';

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

function isAlias(v: FigmaVariableValue): v is FigmaAlias {
  return typeof v === 'object' && v !== null && 'type' in v && v.type === 'VARIABLE_ALIAS';
}

function byte(n: number): string {
  return Math.round(n * 255).toString(16).padStart(2, '0');
}

export function figmaColorToHex({ r, g, b, a }: FigmaColor): string {
  return `#${byte(r)}${byte(g)}${byte(b)}${a < 1 ? byte(a) : ''}`;
}

export function tokenPath(name: string): string[] {
  const parts: string[] = [];
  for (const part of name.split('/')) {
    const trimmed = part.trim();
    if (trimmed) parts.push(trimmed);
  }
  return parts;
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

function findCollection(response: LocalVariablesResponse, label: string): FigmaVariableCollection | undefined {
  // Last match wins, as with a name-keyed map.
  let found: FigmaVariableCollection | undefined;
  for (const c of Object.values(response.meta.variableCollections)) {
    if (c.name.trim().toLowerCase() === label) found = c;
  }
  return found;
}

function findModeId(theme: FigmaVariableCollection, label: string): string {
  for (const mode of theme.modes) {
    if (mode.name.trim().toLowerCase() === label) return mode.modeId;
  }
  throw new Error(`Theme collection is missing a "${label}" mode.`);
}

function toValue(
  v: FigmaVariable,
  type: TokenType,
  raw: FigmaVariableValue,
  variables: Record<string, FigmaVariable>,
): unknown {
  if (!isAlias(raw)) return literal(type, raw, v.name);
  const target = variables[raw.id];
  if (!target) throw new Error(`"${v.name}" aliases a variable not in this file (${raw.id}).`);
  return `{${tokenPath(target.name).join('.')}}`;
}

function makeToken(
  v: FigmaVariable,
  type: TokenType,
  raw: FigmaVariableValue,
  variables: Record<string, FigmaVariable>,
): Record<string, unknown> {
  const token: Record<string, unknown> = { $type: type, $value: toValue(v, type, raw, variables) };
  if (v.description) token.$description = v.description;
  return token;
}

export function variablesToTokens(response: LocalVariablesResponse): TokenFiles {
  const variables = response.meta.variables;
  const core = findCollection(response, CORE);
  const theme = findCollection(response, THEME);
  if (!core || !theme) throw new Error('Figma file must contain "Core" and "Theme" variable collections.');

  const lightMode = findModeId(theme, 'light');
  const darkMode = findModeId(theme, 'dark');
  const files: TokenFiles = { core: {}, light: {}, dark: {} };

  for (const v of Object.values(variables)) {
    if (v.remote || v.hiddenFromPublishing) continue;
    const type = inferType(v);
    const path = tokenPath(v.name);

    if (v.variableCollectionId === core.id) {
      setIn(files.core, path, makeToken(v, type, v.valuesByMode[core.defaultModeId], variables));
    } else if (v.variableCollectionId === theme.id) {
      const light = v.valuesByMode[lightMode];
      const dark = v.valuesByMode[darkMode];
      setIn(files.light, path, makeToken(v, type, light, variables));
      // Dark only records real overrides, keeping theme.dark.tokens.json reviewable.
      if (JSON.stringify(dark) !== JSON.stringify(light)) {
        setIn(files.dark, path, makeToken(v, type, dark, variables));
      }
    }
  }
  return files;
}
