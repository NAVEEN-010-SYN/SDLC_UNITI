<?php

declare(strict_types=1);

namespace App\Services\Mail;

use App\Exceptions\BusinessRuleException;
use App\Exceptions\ValidationFailedException;

/**
 * Rules for the part of an address before "@". Deliberately stricter than
 * RFC 5321 (no quoted strings, no "+" since we use sub-addressing) so that
 * addresses work with every client and spam filter.
 */
final class LocalPartPolicy
{
    private const MAX_LENGTH = 64;

    /**
     * @param list<string> $reserved Role addresses the platform owns.
     */
    public function __construct(private readonly array $reserved = [])
    {
    }

    public function normalise(string $localPart, string $field = 'local_part'): string
    {
        $value = strtolower(trim($localPart));

        if ($value === '' || strlen($value) > self::MAX_LENGTH) {
            throw ValidationFailedException::forField($field, sprintf('Must be 1 to %d characters.', self::MAX_LENGTH));
        }

        if (preg_match('/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/', $value) !== 1) {
            throw ValidationFailedException::forField(
                $field,
                'Use letters, digits, dots, hyphens and underscores; start and end with a letter or digit.',
            );
        }

        if (str_contains($value, '..')) {
            throw ValidationFailedException::forField($field, 'Consecutive dots are not allowed.');
        }

        if (in_array($value, $this->reserved, true)) {
            throw new BusinessRuleException(sprintf('"%s" is a reserved address.', $value), 'MAIL_RESERVED_LOCAL_PART');
        }

        return $value;
    }
}
