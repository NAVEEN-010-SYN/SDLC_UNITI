<?php

declare(strict_types=1);

namespace Uniti\Support\Status;

use DateTimeImmutable;
use DateTimeZone;

/**
 * Pure selection logic for the outage banner: which incidents are live,
 * relevant to the visitor's region and severe enough to show, in what
 * order. No WordPress calls, so it is unit tested directly.
 */
final class IncidentFilter
{
    private const SEVERITY_RANK = ['minor' => 1, 'major' => 2, 'critical' => 3];

    /**
     * @param list<array<string, mixed>> $incidents Raw status API items.
     * @return list<array{id: string, title: string, severity: string, regions: list<string>, startsAt: DateTimeImmutable, endsAt: ?DateTimeImmutable, url: ?string, planned: bool}>
     */
    public function select(array $incidents, DateTimeImmutable $now, string $minSeverity, ?string $region = null): array
    {
        $threshold = self::SEVERITY_RANK[$minSeverity] ?? 1;
        $selected = [];

        foreach ($incidents as $raw) {
            $incident = $this->parse($raw);
            if ($incident === null || self::SEVERITY_RANK[$incident['severity']] < $threshold) {
                continue;
            }
            if (!$this->isLive($incident, $now)) {
                continue;
            }
            if ($region !== null && $incident['regions'] !== [] && !in_array(strtoupper($region), $incident['regions'], true)) {
                continue;
            }
            $selected[] = $incident;
        }

        usort($selected, static fn (array $a, array $b) => [self::SEVERITY_RANK[$b['severity']], $a['planned'], $b['startsAt']]
            <=> [self::SEVERITY_RANK[$a['severity']], $b['planned'], $a['startsAt']]);

        return $selected;
    }

    /**
     * Planned maintenance is announced 24 hours ahead; unplanned incidents
     * show from their start. Anything ended is hidden.
     *
     * @param array{startsAt: DateTimeImmutable, endsAt: ?DateTimeImmutable, planned: bool} $incident
     */
    private function isLive(array $incident, DateTimeImmutable $now): bool
    {
        if ($incident['endsAt'] !== null && $incident['endsAt'] <= $now) {
            return false;
        }

        $showFrom = $incident['planned'] ? $incident['startsAt']->modify('-24 hours') : $incident['startsAt'];

        return $showFrom <= $now;
    }

    /**
     * @param mixed $raw
     * @return array{id: string, title: string, severity: string, regions: list<string>, startsAt: DateTimeImmutable, endsAt: ?DateTimeImmutable, url: ?string, planned: bool}|null
     */
    private function parse(mixed $raw): ?array
    {
        if (!is_array($raw) || !isset($raw['id'], $raw['title'], $raw['severity'], $raw['startsAt'])) {
            return null;
        }

        $severity = strtolower((string) $raw['severity']);
        $startsAt = self::date($raw['startsAt']);
        if (!isset(self::SEVERITY_RANK[$severity]) || $startsAt === null) {
            return null;
        }

        $url = isset($raw['url']) && is_string($raw['url']) && str_starts_with($raw['url'], 'https://') ? $raw['url'] : null;

        return [
            'id' => (string) $raw['id'],
            'title' => trim((string) $raw['title']),
            'severity' => $severity,
            'regions' => array_values(array_map(static fn ($r) => strtoupper((string) $r), (array) ($raw['regions'] ?? []))),
            'startsAt' => $startsAt,
            'endsAt' => isset($raw['endsAt']) ? self::date($raw['endsAt']) : null,
            'url' => $url,
            'planned' => (bool) ($raw['planned'] ?? false),
        ];
    }

    private static function date(mixed $value): ?DateTimeImmutable
    {
        if (!is_string($value)) {
            return null;
        }
        $parsed = DateTimeImmutable::createFromFormat(DATE_ATOM, str_replace('Z', '+00:00', $value));

        return $parsed === false ? null : $parsed->setTimezone(new DateTimeZone('UTC'));
    }
}
