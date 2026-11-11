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
