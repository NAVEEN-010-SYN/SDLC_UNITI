import type { ThemeSet, Token, Typography } from '../tokens';
import { cssValue, fontStack, GENERATED_HEADER } from './format';

type Leaf = string | number | Record<string, string | number>;

interface Tree {
  [key: string]: Tree | Leaf;
}

function leaf(token: Token): Leaf {
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
    for (const key of token.path.slice(0, -1)) {
      node[key] = (node[key] as Tree | undefined) ?? {};
      node = node[key] as Tree;
    }
    node[token.path[token.path.length - 1]] = leaf(token);
  }
  return root;
}

/** A typed theme object for React (web) and React Native; dark must match light's shape. */
export function toTypeScript(themes: ThemeSet): string {
  return [
    `// ${GENERATED_HEADER}`,
    '',
    `export const lightTheme = ${JSON.stringify(nest(themes.light), null, 2)};`,
    '',
    'export type UnitiTheme = typeof lightTheme;',
    '',
    `export const darkTheme: UnitiTheme = ${JSON.stringify(nest(themes.dark), null, 2)};`,
    '',
    "export type ThemeName = 'light' | 'dark';",
    '',
    'export const themes: Record<ThemeName, UnitiTheme> = { light: lightTheme, dark: darkTheme };',
    '',
  ].join('\n');
}
