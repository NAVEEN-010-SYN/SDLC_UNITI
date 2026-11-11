<?php

declare(strict_types=1);

namespace App\Exceptions;

final class AccessDeniedException extends ApiException
{
    public function status(): int
    {
        return 403;
    }

    public function problemType(): string
    {
        return 'forbidden';
    }

    public function title(): string
    {
        return 'Access denied';
    }
}
