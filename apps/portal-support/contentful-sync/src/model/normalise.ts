import { LocalisedFields, RichTextNode, SyncEntry } from '../contentful/types';
import {
  Audience,
  BaseDocument,
  ContentDocument,
  documentId,
  HelpArticleDocument,
  PlanCopyDocument,
  PromoBannerDocument,
} from './document';

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

  /** Trimmed, non-empty, de-duplicated strings (first occurrence wins). */
  strings(name: string): string[] {
    const value = this.raw(name);
    if (!Array.isArray(value)) return [];

    const result: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (trimmed !== '' && !result.includes(trimmed)) result.push(trimmed);
    }
    return result;
  }
}

/** Locales that have at least one field value on this entry. */
export function entryLocales(entry: SyncEntry): string[] {
  const locales: string[] = [];
  for (const values of Object.values(entry.fields)) {
    for (const locale of Object.keys(values ?? {})) {
      if (!locales.includes(locale)) locales.push(locale);
    }
  }
  return locales.sort();
}

/**
 * Map a Sync API entry to normalised documents (one per locale). Unknown
 * content types return an empty list so new models in Contentful never
 * break the sync.
 */
export function normaliseEntry(entry: SyncEntry, defaultLocale: string): ContentDocument[] {
  const contentType = entry.sys.contentType.sys.id;
  const known: string[] = Object.values(CONTENT_TYPES);
  if (!known.includes(contentType)) return [];

  const documents: ContentDocument[] = [];
  for (const locale of entryLocales(entry)) {
    const reader = new FieldReader(entry.fields, locale, defaultLocale);
    const base: BaseDocument = {
      id: documentId(entry.sys.id, locale),
      entryId: entry.sys.id,
      locale,
      revision: entry.sys.revision,
      updatedAt: entry.sys.updatedAt,
    };

    if (contentType === CONTENT_TYPES.helpArticle) documents.push(helpArticle(base, reader));
    else if (contentType === CONTENT_TYPES.planCopy) documents.push(planCopy(base, reader));
    else documents.push(promoBanner(base, reader));
  }
  return documents;
}

function helpArticle(base: BaseDocument, f: FieldReader): HelpArticleDocument {
  return {
    ...base,
    kind: 'helpArticle',
    slug: f.string('slug').toLowerCase(),
    title: f.string('title'),
    summary: f.string('summary'),
    body: richTextToPlain(f.raw('body')),
    topics: f.strings('topics').map((t) => t.toLowerCase()),
    products: f.strings('products').map((p) => p.toLowerCase()),
    audience: audience(f.string('audience')),
  };
}

function planCopy(base: BaseDocument, f: FieldReader): PlanCopyDocument {
  const currency = (f.string('currency') || 'USD').toUpperCase();
  const promoMonths = f.number('promoMonths');
  const promoAmount = parsePrice(f.raw('promoPrice'));
  const monthlyAmount = parsePrice(f.raw('monthlyPrice'));

  let promoPrice: PlanCopyDocument['promoPrice'] = null;
  if (promoAmount !== null && Number.isInteger(promoMonths)) {
    promoPrice = { amountMinor: promoAmount, currency, months: promoMonths };
  }

  return {
    ...base,
    kind: 'planCopy',
    planCode: f.string('planCode').toUpperCase(),
    headline: f.string('headline'),
    tagline: f.string('tagline'),
    features: f.strings('features'),
    downMbps: f.number('downMbps'),
    upMbps: f.number('upMbps'),
    monthlyPrice: { amountMinor: monthlyAmount ?? Number.NaN, currency },
    promoPrice,
  };
}

function promoBanner(base: BaseDocument, f: FieldReader): PromoBannerDocument {
  const priority = f.number('priority');
  return {
    ...base,
    kind: 'promoBanner',
    message: f.string('message'),
    ctaLabel: f.optionalString('ctaLabel'),
    ctaUrl: f.optionalString('ctaUrl'),
    startsAt: toUtcIso(f.string('startsAt')) ?? '',
    endsAt: toUtcIso(f.string('endsAt')),
    audience: audience(f.string('audience')),
    priority: Number.isInteger(priority) ? priority : 0,
  };
}

/**
 * Editors enter prices as decimal text ("49.99") or numbers. Convert to
 * integer minor units without floating-point arithmetic.
 */
export function parsePrice(value: unknown): number | null {
  let text = '';
  if (typeof value === 'number') text = value.toFixed(2);
  else if (typeof value === 'string') text = value.trim();

  // Up to 7 whole digits, optional 1-2 decimal digits.
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Collect text: block nodes start a new line, inline text joins the current one. */
function collectText(node: RichTextNode, inline: string[], blocks: string[]): void {
  if (node.nodeType === 'text') {
    inline.push(node.value ?? '');
    return;
  }

  const isBlock = node.nodeType === 'paragraph' || node.nodeType.startsWith('heading-') || node.nodeType === 'list-item';
  const target: string[] = isBlock ? [] : inline;
  for (const child of node.content ?? []) collectText(child, target, blocks);

  if (!isBlock) return;
  const text = target.join('').replace(/\s+/g, ' ').trim();
  if (text) blocks.push(text);
}

/** Flatten a rich-text document to searchable plain text, one block per line. */
export function richTextToPlain(node: unknown): string {
  if (typeof node === 'string') return node.trim();
  if (!node || typeof node !== 'object') return '';

  const blocks: string[] = [];
  collectText(node as RichTextNode, [], blocks);
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
