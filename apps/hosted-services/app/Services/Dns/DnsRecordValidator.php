<?php

declare(strict_types=1);

namespace App\Services\Dns;

use App\Enums\DnsRecordType;
use App\Exceptions\ValidationFailedException;
use App\Support\Hostname;

/**
 * Validates and normalises customer DNS records against RFC syntax rules
 * and zone-level consistency rules before they reach the authoritative
 * DNS platform.
 *
 * Syntax problems raise ValidationFailedException (400, field errors).
 * Zone conflicts (CNAME coexistence, duplicate SPF, record limit) raise
 * BusinessRuleException (422) with a stable rule code.
 *
 * Value checks live in DnsValueNormaliser, zone checks in DnsZoneConflictChecker.
 */
final class DnsRecordValidator
{
    public const TXT_MAX_TOTAL_LENGTH = 4000;

    private DnsValueNormaliser $values;
    private DnsZoneConflictChecker $conflicts;

    public function __construct(
        private readonly int $ttlMin = 60,
        private readonly int $ttlMax = 86400,
        private readonly int $maxRecordsPerZone = 500,
    ) {
        $this->values = new DnsValueNormaliser();
        $this->conflicts = new DnsZoneConflictChecker($this->maxRecordsPerZone);
    }

    /**
     * @param list<DnsRecordData> $existing Records already in the zone.
     * @param string|null         $ignoreId Record being updated, excluded from conflict checks.
     */
    public function validate(DnsRecordData $record, string $zone, array $existing, ?string $ignoreId = null): DnsRecordData
    {
        $zone = Hostname::normalise($zone);
        $errors = [];

        $name = Hostname::qualify($record->name, $zone);
        $nameError = $this->checkName($name, $zone, $record->type);
        if ($nameError !== null) {
            $errors['name'][] = $nameError;
        }

        if ($record->ttl < $this->ttlMin || $record->ttl > $this->ttlMax) {
            $errors['ttl'][] = sprintf('TTL must be between %d and %d seconds.', $this->ttlMin, $this->ttlMax);
        }

        [$value, $valueErrors] = $this->values->check($record, $name);
        foreach ($valueErrors as $field => $messages) {
            foreach ($messages as $message) {
                $errors[$field][] = $message;
            }
        }

        if ($errors !== []) {
            throw ValidationFailedException::withErrors($errors);
        }

        $normalised = $record->with($name, $value);

        $others = [];
        foreach ($existing as $other) {
            if ($ignoreId === null || $other->id !== $ignoreId) {
                $others[] = $other;
            }
        }

        $this->conflicts->check($normalised, $zone, $others, $ignoreId === null);

        return $normalised;
    }

    private function checkName(string $name, string $zone, DnsRecordType $type): ?string
    {
        if (!Hostname::isWithinZone($name, $zone)) {
            return sprintf('Record name must be within the zone %s.', $zone);
        }

        $allowWildcard = $type !== DnsRecordType::SRV && $type !== DnsRecordType::NS;
        if (!Hostname::isValid($name, $allowWildcard, allowUnderscore: true)) {
            return 'Record name is not a valid DNS name.';
        }

        if ($type === DnsRecordType::CNAME && $name === $zone) {
            return 'A CNAME cannot be created at the zone apex; use an A/AAAA record instead.';
        }

        if ($type === DnsRecordType::NS && $name === $zone) {
            return 'Apex NS records are managed by Uniti and cannot be changed.';
        }

        if ($type === DnsRecordType::SRV && !$this->isSrvName($name, $zone)) {
            return 'SRV names must take the form _service._proto, e.g. _sip._tcp.';
        }

        return null;
    }

    private function isSrvName(string $name, string $zone): bool
    {
        $labels = explode('.', Hostname::relativise($name, $zone));
        if (count($labels) < 2) {
            return false;
        }
        if (!str_starts_with($labels[0], '_')) {
            return false;
        }

        return in_array($labels[1], ['_tcp', '_udp', '_tls'], true);
    }
}
