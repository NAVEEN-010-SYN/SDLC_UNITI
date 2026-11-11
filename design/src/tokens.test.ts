import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildThemes, flatten, mergeTrees, resolve, TokenError, type TokenTree } from './tokens';

const load = (file: string): TokenTree =>
  JSON.parse(readFileSync(path.join(__dirname, '..', 'tokens', file), 'utf8')) as TokenTree;

describe('flatten', () => {
  it('inherits $type from the nearest group', () => {
    const tokens = flatten({ space: { $type: 'dimension', sm: { $value: '4px' } } });
    expect(tokens.get('space.sm')).toMatchObject({ type: 'dimension', value: '4px' });
  });

  it('rejects tokens without a type', () => {
    expect(() => flatten({ x: { $value: 1 } })).toThrow(TokenError);
  });
});

describe('resolve', () => {
  const base = { color: { $type: 'color', a: { $value: '#112233' }, b: { $value: '{color.a}' }, c: { $value: '{color.b}' } } };

  it('follows alias chains', () => {
    expect(resolve(flatten(base)).get('color.c')?.value).toBe('#112233');
  });

  it('resolves aliases inside composite values', () => {
    const tree = mergeTrees(base, {
      size: { $type: 'dimension', md: { $value: '16px' } },
      weight: { $type: 'fontWeight', bold: { $value: 700 } },
      type: {
        $type: 'typography',
        body: { $value: { fontFamily: 'Inter', fontSize: '{size.md}', fontWeight: '{weight.bold}', lineHeight: 1.5 } },
      },
    });
    expect(resolve(flatten(tree)).get('type.body')?.value).toEqual({
      fontFamily: ['Inter'], fontSize: '16px', fontWeight: 700, lineHeight: 1.5,
    });
  });

  it('reports unknown aliases and cycles with the token path', () => {
    expect(() => resolve(flatten({ c: { $type: 'color', x: { $value: '{c.missing}' } } }))).toThrow('c.x: unknown alias {c.missing}');
    expect(() =>
      resolve(flatten({ c: { $type: 'color', x: { $value: '{c.y}' }, y: { $value: '{c.x}' } } })),
    ).toThrow(/alias cycle/);
  });

  it.each([
    ['color', 'blue'],
    ['dimension', '16'],
    ['fontWeight', 450],
    ['duration', '0.2s'],
  ])('rejects invalid %s value %p', (type, value) => {
    expect(() => resolve(flatten({ t: { $type: type, v: { $value: value } } }))).toThrow(TokenError);
  });
});

describe('repository tokens', () => {
  const themes = buildThemes(load('core.tokens.json'), load('theme.light.tokens.json'), load('theme.dark.tokens.json'));

  it('resolve without errors and give both themes the same token set', () => {
    const paths = (list: typeof themes.light) => list.map((t) => t.path.join('.')).sort();
    expect(paths(themes.dark)).toEqual(paths(themes.light));
  });

  it('override semantic colours in dark mode but keep primitives', () => {
    const find = (list: typeof themes.light, p: string) => list.find((t) => t.path.join('.') === p)?.value;
    expect(find(themes.dark, 'color.bg.canvas')).not.toEqual(find(themes.light, 'color.bg.canvas'));
    expect(find(themes.dark, 'color.brand.600')).toEqual(find(themes.light, 'color.brand.600'));
  });
});
