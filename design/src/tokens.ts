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
