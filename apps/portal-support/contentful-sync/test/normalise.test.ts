import { HelpArticleDocument, PlanCopyDocument, PromoBannerDocument } from '../src/model/document';
import { entryLocales, normaliseEntry, parsePrice, richTextToPlain } from '../src/model/normalise';
import { articleEntry, entry, enUs, richText } from './fixtures';

describe('normaliseEntry', () => {
  it('maps a help article, flattening rich text and de-duplicating taxonomy', () => {
    const [doc] = normaliseEntry(articleEntry(), 'en-US') as HelpArticleDocument[];

    expect(doc).toMatchObject({
      id: 'art1:en-US',
      entryId: 'art1',
      kind: 'helpArticle',
      slug: 'reset-your-router',
      topics: ['equipment', 'troubleshooting'],
      products: ['fibre'],
      audience: 'consumer',
      revision: 1,
    });
    expect(doc!.body).toBe('Unplug the router for 30 seconds.\nHold the reset button for 10 seconds to restore factory settings.');
  });

  it('emits one document per locale with fallback to the default locale', () => {
    const e = articleEntry();
    e.fields.title = { 'en-US': 'Reset your router', 'es-US': 'Reinicie su router' };

    const docs = normaliseEntry(e, 'en-US') as HelpArticleDocument[];

    expect(docs.map((d) => [d.id, d.title, d.slug])).toEqual([
      ['art1:en-US', 'Reset your router', 'reset-your-router'],
      ['art1:es-US', 'Reinicie su router', 'reset-your-router'],
    ]);
  });

  it('converts plan prices to integer minor units', () => {
    const [plan] = normaliseEntry(
      entry('plan1', 'planMarketing', enUs({
        planCode: 'fibre_1g',
        headline: 'Gig speed',
        tagline: 'For busy homes',
        features: ['Wi-Fi 7 router', 'No data caps'],
        downMbps: 1000,
        upMbps: 1000,
        monthlyPrice: '65.5',
        promoPrice: 45,
        promoMonths: 12,
        currency: 'usd',
      })),
      'en-US',
    ) as PlanCopyDocument[];

    expect(plan!.planCode).toBe('FIBRE_1G');
    expect(plan!.monthlyPrice).toEqual({ amountMinor: 6550, currency: 'USD' });
    expect(plan!.promoPrice).toEqual({ amountMinor: 4500, currency: 'USD', months: 12 });
  });

  it('normalises promo banner dates to UTC and defaults audience and priority', () => {
    const [banner] = normaliseEntry(
      entry('ban1', 'promoBanner', enUs({ message: 'Spring offer', startsAt: '2026-04-01T00:00:00-05:00', audience: 'everyone' })),
      'en-US',
    ) as PromoBannerDocument[];

    expect(banner).toMatchObject({ startsAt: '2026-04-01T05:00:00.000Z', endsAt: null, audience: 'all', priority: 0, ctaUrl: null });
  });

  it('ignores content types it does not know', () => {
    expect(normaliseEntry(entry('x', 'landingPage', enUs({ title: 'x' })), 'en-US')).toEqual([]);
  });

  it('lists every locale present on any field', () => {
    const e = entry('m', 'helpArticle', { title: { 'en-US': 'a' }, summary: { 'fr-CA': 'b', 'en-US': 'c' } });
    expect(entryLocales(e)).toEqual(['en-US', 'fr-CA']);
  });
});

describe('parsePrice', () => {
  it.each([
    ['49.99', 4999],
    ['49.9', 4990],
    ['49', 4900],
    [19.95, 1995],
    [0.1 + 0.2, 30],
  ])('parses %p to %p minor units', (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });

  it.each(['', '49.999', '-5', '$49', 'free', null])('rejects %p', (input) => {
    expect(parsePrice(input)).toBeNull();
  });
});

describe('richTextToPlain', () => {
  it('joins inline marks inside a block and separates headings and list items', () => {
    const doc = {
      nodeType: 'document',
      content: [
        { nodeType: 'heading-2', content: [{ nodeType: 'text', value: 'Before you start' }] },
        {
          nodeType: 'unordered-list',
          content: [
            { nodeType: 'list-item', content: [{ nodeType: 'paragraph', content: [{ nodeType: 'text', value: 'Find the ONT' }] }] },
          ],
        },
        { nodeType: 'paragraph', content: [{ nodeType: 'text', value: 'Then ' }, { nodeType: 'text', value: 'restart   it.' }] },
      ],
    };

    expect(richTextToPlain(doc)).toBe('Before you start\nFind the ONT\nThen restart it.');
    expect(richTextToPlain(richText('', '  '))).toBe('');
    expect(richTextToPlain(undefined)).toBe('');
  });
});
