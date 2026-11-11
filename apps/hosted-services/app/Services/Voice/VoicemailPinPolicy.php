<?php

declare(strict_types=1);

namespace App\Services\Voice;

use App\Exceptions\ValidationFailedException;

/**
 * Voicemail PIN rules. Toll fraud via weak voicemail PINs (remote
 * call-forward abuse) is a real attack, so trivially guessable PINs are
 * refused even though customers ask for them.
 */
final class VoicemailPinPolicy
{
    public function __construct(
        private readonly int $minLength = 4,
        private readonly int $maxLength = 8,
    ) {
    }

    /**
     * @param list<string> $forbidden Values the PIN must not equal or contain
     *                                (extension number, DID tail digits).
     */
    public function assertAcceptable(string $pin, array $forbidden = []): void
    {
        $problem = $this->problem($pin, $forbidden);
        if ($problem !== null) {
            throw ValidationFailedException::forField('pin', $problem);
        }
    }

    /**
     * @param list<string> $forbidden
     */
    public function problem(string $pin, array $forbidden = []): ?string
    {
        if (preg_match('/^\d+$/', $pin) !== 1) {
            return 'PIN must contain digits only.';
        }

        $length = strlen($pin);
        if ($length < $this->minLength || $length > $this->maxLength) {
            return sprintf('PIN must be %d to %d digits.', $this->minLength, $this->maxLength);
        }

        if (count(array_unique(str_split($pin))) === 1) {
            return 'PIN cannot be a single repeated digit.';
        }

        if ($this->isSequential($pin)) {
            return 'PIN cannot be an ascending or descending sequence.';
        }

        if ($length % 2 === 0 && substr($pin, 0, intdiv($length, 2)) === substr($pin, intdiv($length, 2))) {
            return 'PIN cannot be a repeated pattern.';
        }

        foreach ($forbidden as $value) {
            $value = preg_replace('/\D+/', '', $value) ?? '';
            if ($value === '') {
                continue;
            }
            if ($pin === $value || (strlen($value) >= $this->minLength && str_contains($value, $pin))) {
                return 'PIN cannot match your extension or phone number.';
            }
        }

        return null;
    }

    public function hash(string $pin): string
    {
        return password_hash($pin, PASSWORD_ARGON2ID);
    }

    public function verify(string $pin, string $hash): bool
    {
        return password_verify($pin, $hash);
    }

    private function isSequential(string $pin): bool
    {
        $ascending = true;
        $descending = true;
        for ($i = 1, $n = strlen($pin); $i < $n; $i++) {
            $diff = ((int) $pin[$i] - (int) $pin[$i - 1] + 10) % 10;
            $ascending = $ascending && $diff === 1;
            $descending = $descending && $diff === 9;
        }

        return $ascending || $descending;
    }
}
