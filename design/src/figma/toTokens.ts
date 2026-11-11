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
