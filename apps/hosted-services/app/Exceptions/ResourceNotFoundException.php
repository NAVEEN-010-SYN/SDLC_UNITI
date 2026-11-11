<?php

declare(strict_types=1);

namespace App\Exceptions;

final class ResourceNotFoundException extends ApiException
{
    public static function of(string $resource, string|int $id): self
    {
        return new self(sprintf('%s "%s" was not found.', $resource, $id), ['resource' => $resource]);
    }

    public function status(): int
    {
        return 404;
    }

    public function problemType(): string
    {
        return 'not-found';
    }

    public function title(): string
    {
        return 'Resource not found';
    }
}
