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
