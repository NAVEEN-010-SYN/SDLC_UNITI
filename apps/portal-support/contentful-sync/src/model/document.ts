/**
 * Normalised content model published to the search index / cache. One
 * document per entry per locale; ids are `${entryId}:${locale}` so a
 * deletion in Contentful can remove every locale variant.
 */
export type Audience = 'all' | 'consumer' | 'business';

export interface Money {
  amountMinor: number;
  currency: string;
}

interface BaseDocument {
  id: string;
  entryId: string;
  locale: string;
  revision: number;
  updatedAt: string;
}

export interface HelpArticleDocument extends BaseDocument {
  kind: 'helpArticle';
  slug: string;
  title: string;
  summary: string;
  body: string;
  topics: string[];
  products: string[];
  audience: Audience;
}

export interface PlanCopyDocument extends BaseDocument {
  kind: 'planCopy';
  planCode: string;
  headline: string;
  tagline: string;
  features: string[];
  downMbps: number;
  upMbps: number;
  monthlyPrice: Money;
  promoPrice: (Money & { months: number }) | null;
}

export interface PromoBannerDocument extends BaseDocument {
  kind: 'promoBanner';
  message: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  audience: Audience;
  priority: number;
}

export type ContentDocument = HelpArticleDocument | PlanCopyDocument | PromoBannerDocument;

export function documentId(entryId: string, locale: string): string {
  return `${entryId}:${locale}`;
}
