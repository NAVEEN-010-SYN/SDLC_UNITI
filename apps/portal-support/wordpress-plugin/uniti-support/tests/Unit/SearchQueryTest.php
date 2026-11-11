<?php

declare(strict_types=1);

namespace Uniti\Support\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Uniti\Support\KnowledgeBase\SearchQuery;

final class SearchQueryTest extends TestCase
{
    public function testTermsDropStopWordsShortWordsAndDuplicates(): void
    {
        self::assertSame(['reset', 'router', 'wi', 'fi'], SearchQuery::terms('How do I reset my ROUTER router? Wi-Fi x'));
        self::assertSame([], SearchQuery::terms('how to'));
    }

    public function testTermsAreCapped(): void
    {
        self::assertCount(SearchQuery::MAX_TERMS, SearchQuery::terms('alpha bravo charlie delta echo foxtrot golf hotel india juliet'));
    }

    public function testShortContentIsReturnedAsPlainText(): void
    {
        self::assertSame('Restart the ONT & router.', SearchQuery::snippet('<p>Restart the <b>ONT</b> &amp; router.</p>', ['ont']));
    }

    public function testSnippetCentresOnFirstMatchOnWordBoundaries(): void
    {
        $body = str_repeat('filler words here ', 30) . 'To change your billing date open Account settings. ' . str_repeat('more text after ', 30);

        $snippet = SearchQuery::snippet($body, ['billing'], 120);

        self::assertStringStartsWith('…', $snippet);
        self::assertStringEndsWith('…', $snippet);
        self::assertStringContainsString('billing date', $snippet);
        self::assertLessThanOrEqual(122, mb_strlen($snippet));
    }

    public function testTitleMatchesOutrankRepeatedBodyMatches(): void
    {
        $titleHit = SearchQuery::score('Router lights explained', 'Green means online.', ['router']);
        $bodyHits = SearchQuery::score('Lights explained', 'router router router router router', ['router']);

        self::assertSame(5, $titleHit);
        self::assertSame(3, $bodyHits);
    }
}
