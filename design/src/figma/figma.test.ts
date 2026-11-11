import { createFigmaClient, FigmaApiError, type LocalVariablesResponse } from './client';
import { figmaColorToHex, inferType, variablesToTokens } from './toTokens';

const response: LocalVariablesResponse = {
  status: 200,
  error: false,
  meta: {
    variableCollections: {
      'VC:core': { id: 'VC:core', name: 'Core', modes: [{ modeId: 'm0', name: 'Value' }], defaultModeId: 'm0', remote: false },
      'VC:theme': {
        id: 'VC:theme', name: 'Theme', defaultModeId: 'mL', remote: false,
        modes: [{ modeId: 'mL', name: 'Light' }, { modeId: 'mD', name: 'Dark' }],
      },
    },
    variables: {
      'V:white': {
        id: 'V:white', name: 'color/neutral/0', variableCollectionId: 'VC:core', resolvedType: 'COLOR',
        valuesByMode: { m0: { r: 1, g: 1, b: 1, a: 1 } }, scopes: ['ALL_FILLS'], remote: false, hiddenFromPublishing: false,
      },
      'V:black': {
        id: 'V:black', name: 'color/neutral/950', variableCollectionId: 'VC:core', resolvedType: 'COLOR',
        valuesByMode: { m0: { r: 0.051, g: 0.063, b: 0.082, a: 1 } }, scopes: ['ALL_FILLS'], remote: false, hiddenFromPublishing: false,
      },
      'V:space': {
        id: 'V:space', name: 'space/4', variableCollectionId: 'VC:core', resolvedType: 'FLOAT',
        valuesByMode: { m0: 16 }, scopes: ['GAP', 'WIDTH_HEIGHT'], remote: false, hiddenFromPublishing: false,
      },
      'V:canvas': {
        id: 'V:canvas', name: 'color/bg/canvas', variableCollectionId: 'VC:theme', resolvedType: 'COLOR',
        valuesByMode: { mL: { type: 'VARIABLE_ALIAS', id: 'V:white' }, mD: { type: 'VARIABLE_ALIAS', id: 'V:black' } },
        scopes: ['FRAME_FILL'], remote: false, hiddenFromPublishing: false, description: 'Page background',
      },
      'V:gutter': {
        id: 'V:gutter', name: 'layout/gutter', variableCollectionId: 'VC:theme', resolvedType: 'FLOAT',
        valuesByMode: { mL: { type: 'VARIABLE_ALIAS', id: 'V:space' }, mD: { type: 'VARIABLE_ALIAS', id: 'V:space' } },
        scopes: ['GAP'], remote: false, hiddenFromPublishing: false,
      },
      'V:draft': {
        id: 'V:draft', name: 'color/experimental', variableCollectionId: 'VC:core', resolvedType: 'COLOR',
        valuesByMode: { m0: { r: 1, g: 0, b: 0, a: 1 } }, scopes: [], remote: false, hiddenFromPublishing: true,
      },
    },
  },
};

describe('variablesToTokens', () => {
  const files = variablesToTokens(response);

  it('writes core primitives with literal values', () => {
    expect(files.core).toMatchObject({
      color: { neutral: { '0': { $type: 'color', $value: '#ffffff' } } },
      space: { '4': { $type: 'dimension', $value: '16px' } },
    });
  });

  it('turns theme aliases into W3C references, per mode', () => {
    expect(files.light).toMatchObject({ color: { bg: { canvas: { $value: '{color.neutral.0}', $description: 'Page background' } } } });
    expect(files.dark).toMatchObject({ color: { bg: { canvas: { $value: '{color.neutral.950}' } } } });
  });

  it('omits dark entries identical to light and skips unpublished variables', () => {
    expect(files.dark).not.toHaveProperty('layout');
    expect(files.core).not.toHaveProperty('color.experimental');
  });

  it('requires the Core and Theme collections', () => {
    const broken = { ...response, meta: { ...response.meta, variableCollections: {} } };
    expect(() => variablesToTokens(broken)).toThrow(/"Core" and "Theme"/);
  });
});

describe('conversions', () => {
  it('encodes alpha only when translucent', () => {
    expect(figmaColorToHex({ r: 0, g: 0, b: 0, a: 1 })).toBe('#000000');
    expect(figmaColorToHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080');
  });

  it('infers token types from Figma scopes', () => {
    const base = response.meta.variables['V:space'];
    expect(inferType({ ...base, scopes: ['FONT_WEIGHT'] })).toBe('fontWeight');
    expect(inferType({ ...base, scopes: ['LINE_HEIGHT'] })).toBe('number');
    expect(inferType(base)).toBe('dimension');
    expect(() => inferType({ ...base, resolvedType: 'BOOLEAN' })).toThrow();
  });
});

describe('createFigmaClient', () => {
  it('sends the token header and returns the parsed body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => response });
    const client = createFigmaClient({ token: 'figd_test', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.getLocalVariables('AbC123')).resolves.toBe(response);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.figma.com/v1/files/AbC123/variables/local');
    expect(init.headers['X-Figma-Token']).toBe('figd_test');
  });

  it('surfaces API errors with status', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'Invalid scope' });
    const client = createFigmaClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.getLocalVariables('AbC123')).rejects.toEqual(new FigmaApiError(403, 'Invalid scope'));
  });

  it('refuses to run without a token or with a malformed file key', async () => {
    expect(() => createFigmaClient({ token: '' })).toThrow(/FIGMA_TOKEN/);
    const client = createFigmaClient({ token: 't', fetchImpl: jest.fn() as unknown as typeof fetch });
    await expect(client.getLocalVariables('../etc')).rejects.toThrow(/Invalid Figma file key/);
  });
});
