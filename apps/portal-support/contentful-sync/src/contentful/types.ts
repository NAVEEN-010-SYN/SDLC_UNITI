/** Localised field map as returned by the Sync API: field -> locale -> value. */
export type LocalisedFields = Record<string, Record<string, unknown> | undefined>;

export interface SyncEntry {
  sys: {
    id: string;
    type: 'Entry';
    revision: number;
    createdAt: string;
    updatedAt: string;
    contentType: { sys: { id: string } };
  };
  fields: LocalisedFields;
}

export interface SyncDeletion {
  sys: { id: string; type: 'DeletedEntry'; deletedAt?: string };
}

export type SyncItem = SyncEntry | SyncDeletion | { sys: { id: string; type: 'Asset' | 'DeletedAsset' } };

export interface SyncPage {
  items: SyncItem[];
  nextPageUrl?: string;
  nextSyncToken?: string;
}

export interface SyncResult {
  entries: SyncEntry[];
  deletedIds: string[];
  nextSyncToken: string;
}

/** Minimal Contentful rich-text node shape needed for plain-text extraction. */
export interface RichTextNode {
  nodeType: string;
  value?: string;
  content?: RichTextNode[];
}

export function isEntry(item: SyncItem): item is SyncEntry {
  return item.sys.type === 'Entry';
}

export function isDeletion(item: SyncItem): item is SyncDeletion {
  return item.sys.type === 'DeletedEntry';
}
