<?php

declare(strict_types=1);

namespace Uniti\Support\Tests\Unit;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;
use Uniti\Support\Status\IncidentFilter;

final class IncidentFilterTest extends TestCase
{
    private IncidentFilter $filter;
    private DateTimeImmutable $now;

    protected function setUp(): void
    {
        $this->filter = new IncidentFilter();
        $this->now = new DateTimeImmutable('2026-05-10T12:00:00Z');
    }

    public function testOrdersBySeverityThenUnplannedThenNewest(): void
    {
        $selected = $this->filter->select([
            $this->incident('a', 'minor', '2026-05-10T11:00:00Z'),
            $this->incident('b', 'critical', '2026-05-10T09:00:00Z'),
            $this->incident('c', 'major', '2026-05-10T13:00:00Z', planned: true),
            $this->incident('d', 'major', '2026-05-10T10:00:00Z'),
            $this->incident('e', 'major', '2026-05-10T11:30:00Z'),
        ], $this->now, 'minor');

        self::assertSame(['b', 'e', 'd', 'c', 'a'], array_column($selected, 'id'));
    }

    public function testHidesEndedFutureUnplannedAndFarFuturePlannedIncidents(): void
    {
        $selected = $this->filter->select([
            $this->incident('ended', 'major', '2026-05-10T08:00:00Z', endsAt: '2026-05-10T11:59:59Z'),
            $this->incident('future', 'major', '2026-05-10T12:30:00Z'),
            $this->incident('maintenance-next-week', 'major', '2026-05-17T02:00:00Z', planned: true),
            $this->incident('maintenance-tonight', 'major', '2026-05-11T02:00:00Z', planned: true),
        ], $this->now, 'minor');

        self::assertSame(['maintenance-tonight'], array_column($selected, 'id'));
    }

    public function testAppliesSeverityThreshold(): void
    {
        $selected = $this->filter->select([
            $this->incident('minor', 'minor', '2026-05-10T11:00:00Z'),
            $this->incident('major', 'MAJOR', '2026-05-10T11:00:00Z'),
        ], $this->now, 'major');

        self::assertSame(['major'], array_column($selected, 'id'));
    }

    public function testRegionFilterKeepsNationwideIncidents(): void
    {
        $selected = $this->filter->select([
            $this->incident('tx', 'major', '2026-05-10T11:00:00Z', regions: ['tx']),
            $this->incident('ca', 'major', '2026-05-10T11:00:00Z', regions: ['CA']),
            $this->incident('national', 'minor', '2026-05-10T11:00:00Z'),
        ], $this->now, 'minor', 'TX');

        self::assertSame(['tx', 'national'], array_column($selected, 'id'));
    }

    public function testMalformedItemsAndUnsafeLinksAreDropped(): void
    {
        $selected = $this->filter->select([
            ['id' => 'x', 'title' => 'No date', 'severity' => 'major'],
            ['id' => 'y', 'title' => 'Bad severity', 'severity' => 'apocalyptic', 'startsAt' => '2026-05-10T11:00:00Z'],
            'not-an-array',
            $this->incident('ok', 'major', '2026-05-10T11:00:00Z') + ['url' => 'javascript:alert(1)'],
        ], $this->now, 'minor');

        self::assertCount(1, $selected);
        self::assertNull($selected[0]['url']);
    }

    /**
     * @param list<string> $regions
     * @return array<string, mixed>
     */
    private function incident(string $id, string $severity, string $startsAt, bool $planned = false, ?string $endsAt = null, array $regions = []): array
    {
        return array_filter([
            'id' => $id,
            'title' => "Incident $id",
            'severity' => $severity,
            'startsAt' => $startsAt,
            'endsAt' => $endsAt,
            'planned' => $planned,
            'regions' => $regions,
        ], static fn ($v) => $v !== null);
    }
}
