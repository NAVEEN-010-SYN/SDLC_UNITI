<?php

declare(strict_types=1);

namespace App\Exceptions;

final class InvalidStateTransitionException extends ApiException
{
    public static function between(string $entity, string $from, string $to): self
    {
        return new self(
            sprintf('%s cannot move from %s to %s.', $entity, $from, $to),
            ['currentStatus' => $from, 'requestedStatus' => $to],
        );
    }

    public function status(): int
    {
        return 409;
    }

    public function problemType(): string
    {
        return 'invalid-state-transition';
    }

    public function title(): string
    {
        return 'Invalid state transition';
    }
}
