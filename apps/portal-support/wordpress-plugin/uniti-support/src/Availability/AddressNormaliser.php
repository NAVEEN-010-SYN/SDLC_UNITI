<?php

declare(strict_types=1);

namespace Uniti\Support\Availability;

/**
 * Pure validation/normalisation of the availability form and formatting of
 * the API answer. Returns either a normalised address or field errors.
 */
final class AddressNormaliser
{
    private const STREET_SUFFIXES = [
        'STREET' => 'ST', 'AVENUE' => 'AVE', 'ROAD' => 'RD', 'DRIVE' => 'DR', 'LANE' => 'LN',
        'BOULEVARD' => 'BLVD', 'COURT' => 'CT', 'PLACE' => 'PL', 'TERRACE' => 'TER', 'HIGHWAY' => 'HWY',
    ];

    // Pound and euro signs written as escapes to keep the file ASCII.
    private const CURRENCY_SYMBOLS = ['USD' => '$', 'CAD' => 'CA$', 'GBP' => "\u{00A3}", 'EUR' => "\u{20AC}"];

    /**
     * @param array<string, mixed> $input Already unslashed form input.
     * @return array{address: ?array{line1: string, unit: ?string, zip: string}, errors: array<string, string>}
     */
    public function normalise(array $input): array
    {
        $errors = [];
        $line1 = $this->collapse((string) ($input['line1'] ?? ''));
        $unit = $this->collapse((string) ($input['unit'] ?? ''));
        $zip = preg_replace('/\s+/', '', (string) ($input['zip'] ?? '')) ?? '';

        if ($line1 === '' || mb_strlen($line1) > 120) {
            $errors['line1'] = 'Enter your street address.';
        } elseif (preg_match('/^\d+[A-Z]?\s+\S+/u', strtoupper($line1)) !== 1) {
            $errors['line1'] = 'Start with the house number, for example "120 Main Street".';
        }

        if (preg_match('/^\d{5}(-\d{4})?$/', $zip) !== 1) {
            $errors['zip'] = 'Enter a 5-digit ZIP code.';
        }

        if (mb_strlen($unit) > 20 || preg_match('/^[A-Za-z0-9 #-]*$/', $unit) !== 1) {
            $errors['unit'] = 'Apartment or unit may contain letters, numbers, spaces, # and -.';
        }

        if ($errors !== []) {
            return ['address' => null, 'errors' => $errors];
        }

        return [
            'address' => [
                'line1' => $this->abbreviateSuffix(strtoupper($line1)),
                'unit' => $unit === '' ? null : strtoupper(ltrim($unit, '# ')),
                'zip' => substr($zip, 0, 5),
            ],
            'errors' => [],
        ];
    }

    /**
     * @param array<string, mixed> $response Availability API body.
     * @return array{serviceable: bool, plans: list<array{name: string, speed: string, price: string}>, installWindow: ?string}
     */
    public function summarise(array $response): array
    {
        $plans = [];
        foreach ((array) ($response['plans'] ?? []) as $plan) {
            if (!is_array($plan) || !isset($plan['name'], $plan['downMbps'], $plan['monthlyPrice']['amountMinor'], $plan['monthlyPrice']['currency'])) {
                continue;
            }
            $plans[] = [
                'name' => (string) $plan['name'],
                'speed' => self::speed((int) $plan['downMbps']),
                'price' => self::money((int) $plan['monthlyPrice']['amountMinor'], (string) $plan['monthlyPrice']['currency']) . '/mo',
                'sort' => (int) $plan['downMbps'],
            ];
        }
        usort($plans, [self::class, 'compareSort']);

        $publicPlans = [];
        foreach ($plans as $plan) {
            unset($plan['sort']);
            $publicPlans[] = $plan;
        }

        return [
            'serviceable' => ($response['status'] ?? '') === 'SERVICEABLE' && $plans !== [],
            'plans' => $publicPlans,
            'installWindow' => isset($response['earliestInstallDate']) ? (string) $response['earliestInstallDate'] : null,
        ];
    }

    /** Slowest plan first. */
    public static function compareSort(array $a, array $b): int
    {
        return $a['sort'] <=> $b['sort'];
    }

    public static function speed(int $mbps): string
    {
        if ($mbps >= 1000 && $mbps % 1000 === 0) {
            return ($mbps / 1000) . ' Gbps';
        }

        return $mbps . ' Mbps';
    }

    public static function money(int $amountMinor, string $currency): string
    {
        $currency = strtoupper($currency);
        $symbol = self::CURRENCY_SYMBOLS[$currency] ?? $currency . ' ';
        $sign = $amountMinor < 0 ? '-' : '';
        $abs = abs($amountMinor);

        return sprintf('%s%s%s.%02d', $sign, $symbol, number_format(intdiv($abs, 100)), $abs % 100);
    }

    private function collapse(string $value): string
    {
        return trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    }

    private function abbreviateSuffix(string $line1): string
    {
        $words = explode(' ', $line1);
        $last = count($words) - 1;
        $words[$last] = self::STREET_SUFFIXES[rtrim($words[$last], '.')] ?? $words[$last];

        return implode(' ', $words);
    }
}
