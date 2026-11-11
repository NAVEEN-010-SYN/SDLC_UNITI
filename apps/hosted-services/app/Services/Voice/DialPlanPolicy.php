<?php

declare(strict_types=1);

namespace App\Services\Voice;

use App\Exceptions\BusinessRuleException;
use App\Exceptions\ConflictException;
use App\Exceptions\ValidationFailedException;

/**
 * Rules for short-dial numbers shared by extensions and hunt group pilots.
 */
final class DialPlanPolicy
{
    /**
     * @param list<string> $reserved Emergency and N11 service codes.
     */
    public function __construct(
        private readonly int $minDigits = 3,
        private readonly int $maxDigits = 6,
        private readonly array $reserved = [],
    ) {
    }

    /**
     * @param list<string> $inUse Numbers already in the account's dial plan.
     */
    public function assertAvailable(string $number, array $inUse, string $field = 'number'): void
    {
        if (preg_match(sprintf('/^\d{%d,%d}$/', $this->minDigits, $this->maxDigits), $number) !== 1) {
            throw ValidationFailedException::forField(
                $field,
                sprintf('Extension numbers must be %d to %d digits.', $this->minDigits, $this->maxDigits),
            );
        }

        if ($number[0] === '0' || $number[0] === '9') {
            throw new BusinessRuleException(
                'Extension numbers cannot start with 0 (operator) or 9 (outside line).',
                'VOICE_EXTENSION_RESERVED_PREFIX',
            );
        }

        foreach ($this->reserved as $code) {
            if (str_starts_with($number, $code)) {
                throw new BusinessRuleException(
                    sprintf('Extension numbers cannot start with the service code %s.', $code),
                    'VOICE_EXTENSION_RESERVED',
                );
            }
        }

        if (in_array($number, $inUse, true)) {
            throw new ConflictException(sprintf('Extension %s is already in use on this account.', $number));
        }

        foreach ($inUse as $existing) {
            if (str_starts_with($existing, $number) || str_starts_with($number, $existing)) {
                throw new BusinessRuleException(
                    sprintf('Extension %s overlaps with existing extension %s and would make dialling ambiguous.', $number, $existing),
                    'VOICE_EXTENSION_PREFIX_OVERLAP',
                );
            }
        }
    }

    /**
     * Suggest the lowest free number of the given length.
     *
     * @param list<string> $inUse
     */
    public function suggest(array $inUse, int $digits): ?string
    {
        $digits = max($this->minDigits, min($digits, $this->maxDigits));
        $start = (int) ('1' . str_repeat('0', $digits - 1));
        $end = (int) ('8' . str_repeat('9', $digits - 1));

        for ($n = $start; $n <= $end; $n++) {
            $candidate = (string) $n;
            try {
                $this->assertAvailable($candidate, $inUse);

                return $candidate;
            } catch (BusinessRuleException | ConflictException) {
                continue;
            }
        }

        return null;
    }
}
