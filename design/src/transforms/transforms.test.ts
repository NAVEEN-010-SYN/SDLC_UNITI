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
