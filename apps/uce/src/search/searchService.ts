import { ApiClient } from '../api/apiClient';

export type SearchResultType = 'ACCOUNT' | 'SERVICE' | 'INVOICE' | 'TICKET' | 'ORDER' | 'HELP';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  /** In-shell relative path. */
  path: string;
}

export interface DirectHit {
  type: SearchResultType;
  id: string;
  path: string;
  label: string;
}

const IDENTIFIERS: Array<{ pattern: RegExp; type: SearchResultType; prefix: string; path: (id: string) => string; label: string }> = [
  { pattern: /^ACC-?(\d{8})$/i, type: 'ACCOUNT', prefix: 'ACC', path: (id) => `/accounts/${id}`, label: 'Go to account' },
  { pattern: /^INV-?(\d{6,10})$/i, type: 'INVOICE', prefix: 'INV', path: (id) => `/portals/uconnect/invoices/${id}`, label: 'Open invoice' },
  { pattern: /^TKT-?(\d{6,10})$/i, type: 'TICKET', prefix: 'TKT', path: (id) => `/portals/uconnect/tickets/${id}`, label: 'Open ticket' },
  { pattern: /^ORD-?(\d{4,10})$/i, type: 'ORDER', prefix: 'ORD', path: (id) => `/portals/ecom/orders/${id}`, label: 'Track order' },
];

/** Recognises a typed identifier so the user can jump straight to it without a search round-trip. */
export function detectIdentifier(query: string): DirectHit | undefined {
  const trimmed = query.trim();
  for (const def of IDENTIFIERS) {
    const match = def.pattern.exec(trimmed);
    if (match) {
      const id = `${def.prefix}-${match[1]}`;
      return { type: def.type, id, path: def.path(id), label: `${def.label} ${id}` };
    }
  }
  return undefined;
}

export const MIN_QUERY_LENGTH = 2;

const GROUP_ORDER: SearchResultType[] = ['ACCOUNT', 'SERVICE', 'ORDER', 'INVOICE', 'TICKET', 'HELP'];

export function groupResults(results: SearchResult[]): Array<{ type: SearchResultType; items: SearchResult[] }> {
  return GROUP_ORDER.map((type) => ({ type, items: results.filter((r) => r.type === type) })).filter((g) => g.items.length > 0);
}

export class SearchService {
  constructor(private readonly api: ApiClient) {}

  async search(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) return [];
    const page = await this.api.get<{ items: SearchResult[] }>('/search', { query: { q: q.slice(0, 100), pageSize: 20 }, signal });
    return page.items.filter((r) => r.path.startsWith('/') && !r.path.startsWith('//'));
  }
}
