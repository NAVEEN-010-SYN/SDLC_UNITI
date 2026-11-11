import type { ThemeSet, Token } from '../tokens';
import { changedTokens, cssValue, cssVarName, GENERATED_HEADER } from './format';

function declarations(tokens: Token[], indent: string): string[] {
  const lines: string[] = [];
  for (const t of tokens) lines.push(`${indent}${cssVarName(t.path)}: ${cssValue(t)};`);
  return lines;
}

/**
 * Custom properties: the full light set on :root, and only the tokens that
 * change in dark mode. Dark applies when the OS prefers it, unless the page pins
 * `data-theme="light"`; `data-theme="dark"` forces it.
 */
export function toCss(themes: ThemeSet): string {
  const dark = changedTokens(themes.light, themes.dark);

  return [
    `/* ${GENERATED_HEADER} */`,
    ':root {',
    ...declarations(themes.light, '  '),
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    ...declarations(dark, '    '),
    '  }',
    '}',
    '',
    ':root[data-theme="dark"] {',
    ...declarations(dark, '  '),
    '}',
    '',
  ].join('\n');
}
