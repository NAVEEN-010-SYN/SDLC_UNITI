import { SyncEntry } from '../src/contentful/types';
import { Logger } from '../src/logger';

export function entry(id: string, contentType: string, fields: SyncEntry['fields'], revision = 1): SyncEntry {
  return {
    sys: {
      id,
      type: 'Entry',
      revision,
      createdAt: '2026-04-01T09:00:00.000Z',
      updatedAt: '2026-04-02T10:30:00.000Z',
      contentType: { sys: { id: contentType } },
    },
    fields,
  };
}

/** Wraps plain values as single-locale ("en-US") Sync API fields. */
export function enUs(values: Record<string, unknown>): SyncEntry['fields'] {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { 'en-US': v }]));
}

export const richText = (...paragraphs: string[]): unknown => ({
  nodeType: 'document',
  content: paragraphs.map((p) => ({ nodeType: 'paragraph', content: [{ nodeType: 'text', value: p }] })),
});

export function articleEntry(id = 'art1', overrides: Record<string, unknown> = {}): SyncEntry {
  return entry(
    id,
    'helpArticle',
    enUs({
      slug: 'Reset-Your-Router',
      title: 'Reset your router',
      summary: 'How to restart and factory reset the Uniti router.',
      body: richText('Unplug the router for 30 seconds.', 'Hold the reset button for 10 seconds to restore factory settings.'),
      topics: ['Equipment', 'equipment', 'Troubleshooting'],
      products: ['Fibre'],
      audience: 'consumer',
      ...overrides,
    }),
  );
}

export const silentLogger = (): Logger & { lines: Array<{ event: string; fields?: Record<string, unknown> }> } => {
  const lines: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  const push = (event: string, fields?: Record<string, unknown>): void => {
    lines.push({ event, fields });
  };
  return { lines, debug: push, info: push, warn: push, error: push };
};
