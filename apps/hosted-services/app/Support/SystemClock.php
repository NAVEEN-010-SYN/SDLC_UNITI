<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\CarbonImmutable;
use DateTimeImmutable;
use Psr\Clock\ClockInterface;

/**
 * Wall clock pinned to UTC. Services depend on ClockInterface so tests can
 * substitute a fixed instant.
 */
final class SystemClock implements ClockInterface
{
    public function now(): DateTimeImmutable
    {
        return CarbonImmutable::now('UTC');
    }
}
