/** Minimal typed client for the Figma Variables REST API (GET /v1/files/:key/variables/local). */

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaAlias {
  type: 'VARIABLE_ALIAS';
  id: string;
}

export type FigmaVariableValue = boolean | number | string | FigmaColor | FigmaAlias;

export interface FigmaVariable {
  id: string;
  name: string;
  variableCollectionId: string;
  resolvedType: 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';
  valuesByMode: Record<string, FigmaVariableValue>;
  scopes: string[];
  description?: string;
  remote: boolean;
  hiddenFromPublishing: boolean;
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  remote: boolean;
}

export interface LocalVariablesResponse {
  status: number;
  error: boolean;
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

export class FigmaApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Figma API ${status}: ${message}`);
    this.name = 'FigmaApiError';
  }
}

export interface FigmaClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createFigmaClient({ token, baseUrl = 'https://api.figma.com', fetchImpl = fetch, timeoutMs = 30_000 }: FigmaClientOptions) {
  if (!token) throw new Error('FIGMA_TOKEN is required (a personal access token with file_variables:read scope).');

  return {
    async getLocalVariables(fileKey: string): Promise<LocalVariablesResponse> {
      if (!/^[A-Za-z0-9]+$/.test(fileKey)) throw new Error(`Invalid Figma file key "${fileKey}".`);
      const res = await fetchImpl(`${baseUrl}/v1/files/${fileKey}/variables/local`, {
        headers: { 'X-Figma-Token': token, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        // 403 here almost always means the token lacks the variables scope or the plan is not Enterprise.
        throw new FigmaApiError(res.status, body.slice(0, 300) || res.statusText);
      }
      const json = (await res.json()) as LocalVariablesResponse;
      if (json.error) throw new FigmaApiError(json.status, 'response flagged error');
      return json;
    },
  };
}
