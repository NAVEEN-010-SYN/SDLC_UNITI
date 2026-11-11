import { LocalisedFields, RichTextNode, SyncEntry } from '../contentful/types';
import { Audience, ContentDocument, documentId, Money } from './document';

export const CONTENT_TYPES = {
  helpArticle: 'helpArticle',
  planCopy: 'planMarketing',
  promoBanner: 'promoBanner',
} as const;

/**
 * Field reader for one locale with Contentful-style fallback to the
 * default locale when the localised value is missing.
 */
class FieldReader {
  constructor(
    private readonly fields: LocalisedFields,
    private readonly locale: string,
    private readonly defaultLocale: string,
  ) {}

  raw(name: string): unknown {
    const values = this.fields[name];
    if (!values) return undefined;
    return values[this.locale] ?? values[this.defaultLocale];
  }

  string(name: string): string {
    const value = this.raw(name);
    return typeof value === 'string' ? value.trim() : '';
  }

  optionalString(name: string): string | null {
    return this.string(name) || null;
  }

  number(name: string): number {
    const value = this.raw(name);
    return typeof value === 'number' ? value : Number.NaN;
  }

  strings(name: string): string[] {
    const value = this.raw(name);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean))];
  }
}

/** Locales that have at least one field value on this entry. */
export function entryLocales(entry: SyncEntry): string[] {
  const locales = new Set<string>();
  for (const values of Object.values(entry.fields)) {
    Object.keys(values ?? {}).forEach((l) => locales.add(l));
  }
  return [...locales].sort();
}

/**
 * Map a Sync API entry to normalised documents (one per locale). Unknown
 * content types return an empty list so new models in Contentful never
 * break the sync.
 */
export function normaliseEntry(entry: SyncEntry, defaultLocale: string): ContentDocument[] {
  const contentType = entry.sys.contentType.sys.id;
  if (!Object.values<string>(CONTENT_TYPES).includes(contentType)) return [];

  return entryLocales(entry).map((locale) => {
    const f = new FieldReader(entry.fields, locale, defaultLocale);
    const base = {
      id: documentId(entry.sys.id, locale),
      entryId: entry.sys.id,
      locale,
      revision: entry.sys.revision,
      updatedAt: entry.sys.updatedAt,
    };

    switch (contentType) {
      case CONTENT_TYPES.helpArticle:
        return {
          ...base,
          kind: 'helpArticle' as const,
          slug: f.string('slug').toLowerCase(),
          title: f.string('title'),
          summary: f.string('summary'),
          body: richTextToPlain(f.raw('body')),
          topics: f.strings('topics').map((t) => t.toLowerCase()),
          products: f.strings('products').map((p) => p.toLowerCase()),
          audience: audience(f.string('audience')),
        };
      case CONTENT_TYPES.planCopy: {
        const currency = (f.string('currency') || 'USD').toUpperCase();
        const promoMonths = f.number('promoMonths');
        const promoAmount = parsePrice(f.raw('promoPrice'));
        return {
          ...base,
          kind: 'planCopy' as const,
          planCode: f.string('planCode').toUpperCase(),
          headline: f.string('headline'),
          tagline: f.string('tagline'),
          features: f.strings('features'),
          downMbps: f.number('downMbps'),
          upMbps: f.number('upMbps'),
          monthlyPrice: { amountMinor: parsePrice(f.raw('monthlyPrice')) ?? Number.NaN, currency },
          promoPrice:
            promoAmount !== null && Number.isInteger(promoMonths) ? { amountMinor: promoAmount, currency, months: promoMonths } : null,
        };
      }
      default:
        return {
          ...base,
          kind: 'promoBanner' as const,
          message: f.string('message'),
          ctaLabel: f.optionalString('ctaLabel'),
          ctaUrl: f.optionalString('ctaUrl'),
          startsAt: toUtcIso(f.string('startsAt')) ?? '',
          endsAt: toUtcIso(f.string('endsAt')),
          audience: audience(f.string('audience')),
          priority: Number.isInteger(f.number('priority')) ? f.number('priority') : 0,
        };
    }
  });
}

/**
 * Editors enter prices as decimal text ("49.99") or numbers. Convert to
 * integer minor units without floating-point arithmetic.
 */
export function parsePrice(value: unknown): Money['amountMinor'] | null {
  const text = typeof value === 'number' ? value.toFixed(2) : typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const [, whole = '0', fraction = ''] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Flatten a rich-text document to searchable plain text, one block per line. */
export function richTextToPlain(node: unknown): string {
  if (typeof node === 'string') return node.trim();
  if (!node || typeof node !== 'object') return '';

  const blocks: string[] = [];
  const walk = (n: RichTextNode, inline: string[]): void => {
    if (n.nodeType === 'text') {
      inline.push(n.value ?? '');
      return;
    }
    const isBlock = n.nodeType === 'paragraph' || n.nodeType.startsWith('heading-') || n.nodeType === 'list-item';
    const target = isBlock ? [] : inline;
    (n.content ?? []).forEach((child) => walk(child, target));
    if (isBlock) {
      const text = target.join('').replace(/\s+/g, ' ').trim();
      if (text) blocks.push(text);
    }
  };
  walk(node as RichTextNode, []);
  return blocks.join('\n');
}

function audience(value: string): Audience {
  const lower = value.toLowerCase();
  return lower === 'consumer' || lower === 'business' ? lower : 'all';
}

function toUtcIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
