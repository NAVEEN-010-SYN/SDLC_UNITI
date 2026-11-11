<?php

declare(strict_types=1);

namespace App\Enums;

enum ForwardingCondition: string
{
    case Always = 'ALWAYS';
    case Busy = 'BUSY';
    case NoAnswer = 'NO_ANSWER';
    case Unreachable = 'UNREACHABLE';

    /**
     * Evaluation order used by the switch: unconditional forwarding wins,
     * then device state, then timeout.
     */
    public function precedence(): int
    {
        return match ($this) {
            self::Always => 0,
            self::Unreachable => 1,
            self::Busy => 2,
            self::NoAnswer => 3,
        };
    }
}
