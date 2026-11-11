<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * Field-level validation failure raised from service code (FormRequests use
 * the framework ValidationException, which the renderer maps to the same
 * shape). The "errors" extension maps field name to a list of messages.
 */
final class ValidationFailedException extends ApiException
{
    /**
     * @param array<string, list<string>> $errors
     */
    public static function withErrors(array $errors): self
    {
        return new self('One or more fields are invalid.', ['errors' => $errors]);
    }

    public static function forField(string $field, string $message): self
    {
        return self::withErrors([$field => [$message]]);
    }

    public function status(): int
    {
        return 400;
    }

    public function problemType(): string
    {
        return 'validation-error';
    }

    public function title(): string
    {
        return 'Invalid request';
    }
}
