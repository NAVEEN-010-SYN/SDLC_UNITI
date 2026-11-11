<?php

declare(strict_types=1);

namespace App\Services\Dns;

use App\Enums\DnsRecordType;
use App\Support\Hostname;

/**
 * Checks and normalises the value (rdata) part of a DNS record.
 * Used by DnsRecordValidator; returns field errors instead of throwing.
 */
final class DnsValueNormaliser
{
    private const CAA_TAGS = ['issue', 'issuewild', 'iodef'];

    /**
     * @return array{0: string, 1: array<string, list<string>>}
     */
    public function check(DnsRecordData $record, string $name): array
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
                $this->checkIpv4($value, $errors);
                break;

            case DnsRecordType::AAAA:
                $value = $this->checkIpv6($value, $errors);
                break;

            case DnsRecordType::CNAME:
            case DnsRecordType::NS:
                $value = $this->checkAlias($value, $name, $errors);
                break;

            case DnsRecordType::MX:
                $value = $this->checkMx($record, $value, $errors);
                break;

            case DnsRecordType::SRV:
                $value = $this->checkSrv($record, $value, $errors);
                break;

            case DnsRecordType::TXT:
                [$value, $error] = $this->normaliseTxt($value);
                $this->addError($errors, 'value', $error);
                break;

            case DnsRecordType::CAA:
                [$value, $error] = $this->normaliseCaa($value);
                $this->addError($errors, 'value', $error);
                break;
        }

        return [$value, $errors];
    }

    /**
     * @param array<string, list<string>> $errors
     */
    private function checkIpv4(string $value, array &$errors): void
    {
        if (filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_RES_RANGE) === false) {
            $errors['value'][] = 'Value must be a public IPv4 address.';
        }
    }

    /**
     * @param array<string, list<string>> $errors
     */
    private function checkIpv6(string $value, array &$errors): string
    {
        if (filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6 | FILTER_FLAG_NO_RES_RANGE) === false) {
            $errors['value'][] = 'Value must be a public IPv6 address.';
            return $value;
        }

        return strtolower((string) inet_ntop((string) inet_pton($value)));
    }

    /**
     * CNAME and NS targets.
     *
     * @param array<string, list<string>> $errors
     */
    private function checkAlias(string $value, string $name, array &$errors): string
    {
        $value = Hostname::normalise($value);
        $error = $this->checkTargetHostname($value);
        if ($error !== null) {
            $errors['value'][] = $error;
        } elseif ($value === $name) {
            $errors['value'][] = 'A record cannot point at itself.';
        }

        return $value;
    }

    /**
     * @param array<string, list<string>> $errors
     */
    private function checkMx(DnsRecordData $record, string $value, array &$errors): string
    {
        $value = Hostname::normalise($value);

        // RFC 7505 null MX: "." with priority 0 declares the domain accepts no mail.
        if ($value === '') {
            if ($record->priority !== 0) {
                $errors['priority'][] = 'A null MX record must have priority 0.';
            }
            return '.';
        }

        $this->addError($errors, 'value', $this->checkTargetHostname($value));

        return $value;
    }

    /**
     * @param array<string, list<string>> $errors
     */
    private function checkSrv(DnsRecordData $record, string $value, array &$errors): string
    {
        $numbers = ['weight' => $record->weight, 'port' => $record->port];
        foreach ($numbers as $field => $number) {
            if ($number === null || !$this->isUint16($number)) {
                $errors[$field][] = ucfirst($field) . ' must be between 0 and 65535.';
            }
        }

        $value = Hostname::normalise($value);
        if ($value === '') {
            return '.';
        }

        $this->addError($errors, 'value', $this->checkTargetHostname($value));

        return $value;
    }

    /**
     * @param array<string, list<string>> $errors
     */
    private function addError(array &$errors, string $field, ?string $error): void
    {
        if ($error !== null) {
            $errors[$field][] = $error;
        }
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
        if (strlen($value) > DnsRecordValidator::TXT_MAX_TOTAL_LENGTH) {
            return [$value, sprintf('TXT value cannot exceed %d characters.', DnsRecordValidator::TXT_MAX_TOTAL_LENGTH)];
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
        if ($tag === 'iodef' && !$this->isIodefUrl($tagValue)) {
            return [$value, 'CAA iodef value must be a mailto: or https:// URL.'];
        }
        if ($tag !== 'iodef' && !$this->isIssuer($tagValue)) {
            return [$value, 'CAA issuer must be a certificate authority domain or ";".'];
        }

        return [sprintf('%d %s "%s"', $flags, $tag, $tagValue), null];
    }

    private function isIodefUrl(string $value): bool
    {
        if (preg_match('/^mailto:[^@\s]+@[^@\s]+$/i', $value) === 1) {
            return true;
        }

        return preg_match('/^https:\/\/\S+$/i', $value) === 1;
    }

    private function isIssuer(string $value): bool
    {
        if ($value === ';' || $value === '') {
            return true;
        }

        $domain = explode(';', $value)[0];

        return Hostname::isValid($domain);
    }

    private function isUint16(int $value): bool
    {
        return $value >= 0 && $value <= 65535;
    }
}
