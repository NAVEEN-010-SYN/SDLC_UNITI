<?php

declare(strict_types=1);

namespace App\Enums;

enum HuntGroupStrategy: string
{
    /** Ring every member at once; first to answer takes the call. */
    case Simultaneous = 'SIMULTANEOUS';
    /** Ring members in configured order, each for its ring timeout. */
    case Sequential = 'SEQUENTIAL';
    /** Start with the member after the one who answered last. */
    case RoundRobin = 'ROUND_ROBIN';
    /** Ring the member who has been idle the longest. */
    case LongestIdle = 'LONGEST_IDLE';

    /**
     * Whether member order is meaningful for this strategy.
     */
    public function isOrdered(): bool
    {
        return $this === self::Sequential || $this === self::RoundRobin;
    }
}
