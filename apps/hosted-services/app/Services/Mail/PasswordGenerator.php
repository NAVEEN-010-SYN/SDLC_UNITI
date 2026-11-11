<?php

declare(strict_types=1);

namespace App\Services\Mail;

/**
 * Generates temporary mailbox passwords that satisfy the mail platform's
 * complexity policy and avoid visually ambiguous characters.
 */
final class PasswordGenerator
{
    private const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    private const LOWER = 'abcdefghijkmnpqrstuvwxyz';
    private const DIGITS = '23456789';
    private const SYMBOLS = '!@#$%*-_=+?';

    public function __construct(private readonly int $length = 16)
    {
    }

    public function generate(): string
    {
        $all = self::UPPER . self::LOWER . self::DIGITS . self::SYMBOLS;

        $chars = [
            $this->pick(self::UPPER),
            $this->pick(self::LOWER),
            $this->pick(self::DIGITS),
            $this->pick(self::SYMBOLS),
        ];

        for ($i = count($chars); $i < $this->length; $i++) {
            $chars[] = $this->pick($all);
        }

        // Fisher-Yates with a CSPRNG so the guaranteed classes are not positional.
        for ($i = count($chars) - 1; $i > 0; $i--) {
            $j = random_int(0, $i);
            [$chars[$i], $chars[$j]] = [$chars[$j], $chars[$i]];
        }

        return implode('', $chars);
    }

    private function pick(string $alphabet): string
    {
        return $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
}
