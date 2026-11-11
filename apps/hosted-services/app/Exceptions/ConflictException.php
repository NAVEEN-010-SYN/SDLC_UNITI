<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * The resource already exists or is held by another entity.
 */
final class ConflictException extends ApiException
{
    public function status(): int
    {
        return 409;
    }

    public function problemType(): string
    {
        return 'conflict';
    }

    public function title(): string
    {
        return 'Conflict';
    }
}
