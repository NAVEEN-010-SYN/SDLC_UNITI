<?php

declare(strict_types=1);

namespace App\Support;

use InvalidArgumentException;

/**
 * Minimal NANP-aware E.164 value object. Hosted voice numbers are North
 * American (+1) DIDs; international numbers are accepted only as forwarding
 * destinations, where the caller decides whether to allow them.
 */
final class PhoneNumber
{
    private function __construct(public readonly string $e164)
    {
    }

    /**
     * Normalise common user input ("(555) 201-0199", "1-555-201-0199",
     * "+44 20 7946 0000") into E.164.
     */
    public static function parse(string $input): self
    {
        $trimmed = trim($input);
        $hasPlus = str_starts_with($trimmed, '+');
        $digits = preg_replace('/\D+/', '', $trimmed) ?? '';

        if ($digits === '') {
            throw new InvalidArgumentException('Phone number contains no digits.');
        }

        if (!$hasPlus) {
            if (strlen($digits) === 10) {
                $digits = '1' . $digits;
            } elseif (!(strlen($digits) === 11 && $digits[0] === '1')) {
                throw new InvalidArgumentException('National numbers must have 10 digits.');
            }
        }

        if (strlen($digits) < 8 || strlen($digits) > 15) {
            throw new InvalidArgumentException('E.164 numbers have between 8 and 15 digits.');
        }

        $number = new self('+' . $digits);

        if ($number->isNanp() && !self::isValidNanp(substr($digits, 1))) {
            throw new InvalidArgumentException('Not a valid North American number.');
        }

        return $number;
    }

    public static function tryParse(string $input): ?self
    {
        try {
            return self::parse($input);
        } catch (InvalidArgumentException) {
            return null;
        }
    }

    public function isNanp(): bool
    {
        return str_starts_with($this->e164, '+1') && strlen($this->e164) === 12;
    }

    /**
     * Premium-rate and directory services that hosted voice must never
     * forward to (fraud vector).
     */
    public function isPremiumRate(): bool
    {
        if (!$this->isNanp()) {
            return false;
        }

        $npa = substr($this->e164, 2, 3);
        $nxx = substr($this->e164, 5, 3);

        return $npa === '900' || $npa === '976' || $nxx === '976';
    }

    public function npa(): ?string
    {
        return $this->isNanp() ? substr($this->e164, 2, 3) : null;
    }

    public function equals(self $other): bool
    {
        return $this->e164 === $other->e164;
    }

    public function __toString(): string
    {
        return $this->e164;
    }

    /**
     * NANP: NPA and NXX both start 2-9; N11 codes are service codes.
     */
    private static function isValidNanp(string $tenDigits): bool
    {
        if (strlen($tenDigits) !== 10) {
            return false;
        }

        $npa = substr($tenDigits, 0, 3);
        $nxx = substr($tenDigits, 3, 3);

        if ($npa[0] < '2' || $nxx[0] < '2') {
            return false;
        }

        return !($npa[1] === '1' && $npa[2] === '1') && !($nxx[1] === '1' && $nxx[2] === '1');
    }
}
