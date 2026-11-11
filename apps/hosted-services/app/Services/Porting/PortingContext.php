<?php

declare(strict_types=1);

namespace App\Services\Porting;

use Carbon\CarbonImmutable;

/**
 * Facts the porting state machine needs to evaluate guards, decoupled from
 * the Eloquent model so transitions can be tested in isolation.
 */
final class PortingContext
{
    /**
     * @param list<string> $numbers
     */
    public function __construct(
        public readonly CarbonImmutable $now,
        public readonly array $numbers,
        public readonly ?CarbonImmutable $focAt = null,
        public readonly int $resubmissionCount = 0,
        public readonly bool $hasLoa = false,
        public readonly ?string $reason = null,
    ) {
    }
}
