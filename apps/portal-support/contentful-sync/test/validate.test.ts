import { PlanCopyDocument, PromoBannerDocument } from '../src/model/document';
import { normaliseEntry } from '../src/model/normalise';
import { isAllowedCtaUrl, validateDocument } from '../src/model/validate';
import { articleEntry } from './fixtures';

const fields = (doc: Parameters<typeof validateDocument>[0]): string[] => validateDocument(doc).map((i) => i.field);

const plan = (overrides: Partial<PlanCopyDocument> = {}): PlanCopyDocument => ({
  id: 'p:en-US',
  entryId: 'p',
  locale: 'en-US',
  revision: 3,
  updatedAt: '2026-04-02T10:30:00.000Z',
  kind: 'planCopy',
  planCode: 'FIBRE_500',
  headline: 'Fast fibre',
  tagline: 'Symmetric 500 Mbps',
  features: ['No data caps'],
  downMbps: 500,
  upMbps: 500,
  monthlyPrice: { amountMinor: 4999, currency: 'USD' },
  promoPrice: null,
  ...overrides,
});

const banner = (overrides: Partial<PromoBannerDocument> = {}): PromoBannerDocument => ({
  id: 'b:en-US',
  entryId: 'b',
  locale: 'en-US',
  revision: 1,
  updatedAt: '2026-04-02T10:30:00.000Z',
  kind: 'promoBanner',
  message: 'Switch and save',
  ctaLabel: 'See plans',
  ctaUrl: 'https://www.uniti.example/plans',
  startsAt: '2026-04-01T00:00:00.000Z',
  endsAt: '2026-05-01T00:00:00.000Z',
  audience: 'all',
  priority: 1,
  ...overrides,
});

describe('validateDocument', () => {
  it('accepts a complete help article', () => {
    const [doc] = normaliseEntry(articleEntry(), 'en-US');
    expect(validateDocument(doc!)).toEqual([]);
  });

  it('flags articles without topics, with bad slugs or thin bodies', () => {
    const [doc] = normaliseEntry(articleEntry('a2', { slug: 'Reset router!', topics: [], body: 'Too short.' }), 'en-US');
    expect(fields(doc!)).toEqual(['slug', 'body', 'topics']);
  });

  it('accepts a valid plan and rejects missing prices', () => {
    expect(validateDocument(plan())).toEqual([]);
    expect(fields(plan({ monthlyPrice: { amountMinor: Number.NaN, currency: 'USD' } }))).toEqual(['monthlyPrice']);
  });

  it('rejects upload faster than download and promos that are not discounts', () => {
    expect(fields(plan({ upMbps: 1000 }))).toEqual(['upMbps']);
    expect(fields(plan({ promoPrice: { amountMinor: 4999, currency: 'USD', months: 36 } }))).toEqual(['promoPrice', 'promoMonths']);
  });

  it('requires banners to end after they start and to link only to Uniti sites', () => {
    expect(validateDocument(banner())).toEqual([]);
    expect(fields(banner({ endsAt: '2026-03-01T00:00:00.000Z' }))).toEqual(['endsAt']);
    expect(fields(banner({ ctaUrl: 'https://uniti.example.evil.test/x' }))).toEqual(['ctaUrl']);
    expect(fields(banner({ ctaLabel: null }))).toEqual(['ctaUrl']);
  });
});

describe('isAllowedCtaUrl', () => {
  it.each([
    ['/plans/fibre-1g', true],
    ['https://uniti.example/offers', true],
    ['https://shop.uniti.example/cart', true],
    ['//evil.test/x', false],
    ['http://uniti.example/offers', false],
    ['javascript:alert(1)', false],
    ['https://uniti.example.evil.test', false],
  ])('%s -> %p', (url, expected) => {
    expect(isAllowedCtaUrl(url)).toBe(expected);
  });
});
