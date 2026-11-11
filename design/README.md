# Design tokens

The source of truth for colour, typography, spacing, radius and elevation across every portal and the iOS app.

```
Figma variables --pull--> tokens/*.tokens.json (W3C format, reviewed in PRs) --build--> dist/
                                                                                |- tokens.css          web custom properties, light + dark
                                                                                |- _tokens.scss        SCSS variables + dark mixin
                                                                                |- theme.ts            typed theme object (React / React Native)
                                                                                |- UnitiTokens.swift   SwiftUI constants (gokinetic-consumer-ios)
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
