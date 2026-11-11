<?php

declare(strict_types=1);

namespace App\Exceptions;

final class AuthenticationFailedException extends ApiException
{
    public function status(): int
    {
        return 401;
    }

    public function problemType(): string
    {
        return 'unauthenticated';
    }

    public function title(): string
    {
        return 'Authentication required';
    }
}
