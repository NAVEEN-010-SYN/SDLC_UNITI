<?php

declare(strict_types=1);

namespace App\Services\Dns;

use App\Enums\DnsRecordType;
use App\Exceptions\BusinessRuleException;
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
 */
final class DnsRecordValidator
{
    public const TXT_MAX_TOTAL_LENGTH = 4000;
    private const CAA_TAGS = ['issue', 'issuewild', 'iodef'];

    public function __construct(
        private readonly int $ttlMin = 60,
        private readonly int $ttlMax = 86400,
        private readonly int $maxRecordsPerZone = 500,
    ) {
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

        [$value, $valueErrors] = $this->checkValue($record, $name, $zone);
        foreach ($valueErrors as $field => $messages) {
            foreach ($messages as $message) {
                $errors[$field][] = $message;
            }
        }

        if ($errors !== []) {
            throw ValidationFailedException::withErrors($errors);
        }

        $normalised = $record->with($name, $value);
        $others = array_values(array_filter(
            $existing,
            static fn (DnsRecordData $r) => $ignoreId === null || $r->id !== $ignoreId,
        ));

        $this->checkZoneConflicts($normalised, $zone, $others, $ignoreId === null);

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

        if ($type === DnsRecordType::SRV) {
            $labels = explode('.', Hostname::relativise($name, $zone));
            if (count($labels) < 2 || !str_starts_with($labels[0], '_') || !in_array($labels[1], ['_tcp', '_udp', '_tls'], true)) {
                return 'SRV names must take the form _service._proto, e.g. _sip._tcp.';
            }
        }

        return null;
    }

    /**
     * @return array{0: string, 1: array<string, list<string>>}
     */
    private function checkValue(DnsRecordData $record, string $name, string $zone): array
    {
        $value = trim($record->value);
        $errors = [];

        if ($record->type->requiresPriority()) {
            if ($record->priority === null) {
                $errors['priority'][] = 'Priority is required for ' . $record->type->value . ' records.';
            } elseif (!$this->isUint16($record->priority)) {
                $errors['priority'][] = 'Priority must be between 0 and 65535.';
            }
        }

        switch ($record->type) {
            case DnsRecordType::A:
                if (filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_RES_RANGE) === false) {
                    $errors['value'][] = 'Value must be a public IPv4 address.';
                }
                break;

            case DnsRecordType::AAAA:
                if (filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6 | FILTER_FLAG_NO_RES_RANGE) === false) {
                    $errors['value'][] = 'Value must be a public IPv6 address.';
                } else {
                    $value = strtolower((string) inet_ntop((string) inet_pton($value)));
                }
                break;

            case DnsRecordType::CNAME:
            case DnsRecordType::NS:
                $value = Hostname::normalise($value);
                $error = $this->checkTargetHostname($value);
                if ($error !== null) {
                    $errors['value'][] = $error;
                } elseif ($value === $name) {
                    $errors['value'][] = 'A record cannot point at itself.';
                }
                break;

            case DnsRecordType::MX:
                $value = Hostname::normalise($value);
                // RFC 7505 null MX: "." with priority 0 declares the domain accepts no mail.
                if ($value === '') {
                    if ($record->priority !== 0) {
                        $errors['priority'][] = 'A null MX record must have priority 0.';
                    }
                    $value = '.';
                    break;
                }
                $error = $this->checkTargetHostname($value);
                if ($error !== null) {
                    $errors['value'][] = $error;
                }
                break;

            case DnsRecordType::SRV:
                foreach (['weight' => $record->weight, 'port' => $record->port] as $field => $number) {
                    if ($number === null || !$this->isUint16($number)) {
                        $errors[$field][] = ucfirst($field) . ' must be between 0 and 65535.';
                    }
                }
                $value = Hostname::normalise($value);
                if ($value === '') {
                    $value = '.';
                } else {
                    $error = $this->checkTargetHostname($value);
                    if ($error !== null) {
                        $errors['value'][] = $error;
                    }
                }
                break;

            case DnsRecordType::TXT:
                [$value, $error] = $this->normaliseTxt($value);
                if ($error !== null) {
                    $errors['value'][] = $error;
                }
                break;

            case DnsRecordType::CAA:
                [$value, $error] = $this->normaliseCaa($value);
                if ($error !== null) {
                    $errors['value'][] = $error;
                }
                break;
        }

        return [$value, $errors];
    }

    private function checkTargetHostname(string $target): ?string
    {
        if (filter_var($target, FILTER_VALIDATE_IP) !== false) {
            return 'Target must be a hostname, not an IP address.';
        }

        if (!Hostname::isValid($target, allowWildcard: false, allowUnderscore: true)) {
            return 'Target is not a valid hostname.';
        }

        if (!str_contains($target, '.')) {
            return 'Target must be a fully qualified hostname.';
        }

        return null;
    }

    /**
     * Strip wrapping quotes (users paste values from registrar UIs) and
     * enforce printable ASCII. Long values are split into 255-byte strings
     * by the zone serializer, not here.
     *
     * @return array{0: string, 1: string|null}
     */
    private function normaliseTxt(string $value): array
    {
        if (strlen($value) >= 2 && $value[0] === '"' && str_ends_with($value, '"')) {
            $value = substr($value, 1, -1);
        }
        $value = str_replace('" "', '', $value);

        if ($value === '') {
            return [$value, 'TXT value cannot be empty.'];
        }
        if (strlen($value) > self::TXT_MAX_TOTAL_LENGTH) {
            return [$value, sprintf('TXT value cannot exceed %d characters.', self::TXT_MAX_TOTAL_LENGTH)];
        }
        if (preg_match('/^[\x20-\x7E]+$/', $value) !== 1) {
            return [$value, 'TXT value may contain printable ASCII characters only.'];
        }

        return [$value, null];
    }

    /**
     * CAA rdata: `<flags> <tag> "<value>"`, e.g. `0 issue "letsencrypt.org"`.
     *
     * @return array{0: string, 1: string|null}
     */
    private function normaliseCaa(string $value): array
    {
        if (preg_match('/^(\d{1,3})\s+([a-z0-9]+)\s+"?([^"]*)"?$/i', $value, $m) !== 1) {
            return [$value, 'CAA value must look like: 0 issue "ca.example.net".'];
        }

        $flags = (int) $m[1];
        $tag = strtolower($m[2]);
        $tagValue = trim($m[3]);

        if ($flags !== 0 && $flags !== 128) {
            return [$value, 'CAA flags must be 0 or 128.'];
        }
        if (!in_array($tag, self::CAA_TAGS, true)) {
            return [$value, 'CAA tag must be one of: ' . implode(', ', self::CAA_TAGS) . '.'];
        }
        if ($tag === 'iodef' && !preg_match('#^(mailto:[^@\s]+@[^@\s]+|https://\S+)$#i', $tagValue)) {
            return [$value, 'CAA iodef value must be a mailto: or https:// URL.'];
        }
        if ($tag !== 'iodef' && $tagValue !== ';' && $tagValue !== '' && !Hostname::isValid(explode(';', $tagValue)[0])) {
            return [$value, 'CAA issuer must be a certificate authority domain or ";".'];
        }

        return [sprintf('%d %s "%s"', $flags, $tag, $tagValue), null];
    }

    /**
     * @param list<DnsRecordData> $others
     */
    private function checkZoneConflicts(DnsRecordData $record, string $zone, array $others, bool $isCreate): void
    {
        if ($isCreate && count($others) >= $this->maxRecordsPerZone) {
            throw new BusinessRuleException(
                sprintf('The zone %s already holds the maximum of %d records.', $zone, $this->maxRecordsPerZone),
                'DNS_ZONE_RECORD_LIMIT',
            );
        }

        $sameName = array_filter($others, static fn (DnsRecordData $r) => $r->name === $record->name);

        foreach ($sameName as $other) {
            if ($other->identity() === $record->identity()) {
                throw new BusinessRuleException('An identical record already exists.', 'DNS_DUPLICATE_RECORD');
            }

            // RFC 1034 3.6.2: a CNAME owner may have no other data.
            if ($record->type === DnsRecordType::CNAME || $other->type === DnsRecordType::CNAME) {
                throw new BusinessRuleException(
                    sprintf('%s already has %s data; a CNAME cannot coexist with other records.', $record->name, $other->type->value),
                    'DNS_CNAME_CONFLICT',
                );
            }
        }

        if ($record->type === DnsRecordType::TXT && $this->isSpf($record->value)) {
            foreach ($sameName as $other) {
                if ($other->type === DnsRecordType::TXT && $this->isSpf($other->value)) {
                    throw new BusinessRuleException(
                        'Only one SPF (v=spf1) record is allowed per name; merge the mechanisms into the existing record.',
                        'DNS_DUPLICATE_SPF',
                    );
                }
            }
        }

        if ($record->type === DnsRecordType::MX && $record->value === '.') {
            foreach ($sameName as $other) {
                if ($other->type === DnsRecordType::MX) {
                    throw new BusinessRuleException('A null MX record must be the only MX record for the name.', 'DNS_NULL_MX_CONFLICT');
                }
            }
        }
    }

    private function isSpf(string $txt): bool
    {
        return str_starts_with(strtolower($txt), 'v=spf1');
    }

    private function isUint16(int $value): bool
    {
        return $value >= 0 && $value <= 65535;
    }
}
