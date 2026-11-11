<?php

declare(strict_types=1);

namespace App\Services\Dns;

use App\Enums\DnsRecordType;
use App\Support\Hostname;

/**
 * Renders records into RFC 1035 master-file syntax. Used for the
 * "export zone" download and for the payload pushed to the DNS platform,
 * so customers see exactly what is served.
 */
final class ZoneSerializer
{
    private const TXT_CHUNK = 255;

    /**
     * @param list<DnsRecordData> $records
     * @param list<string>        $nameservers
     */
    public function serialize(string $zone, int $serial, array $records, array $nameservers, int $defaultTtl = 3600): string
    {
        $zone = Hostname::normalise($zone);
        $lines = [
            sprintf('$ORIGIN %s.', $zone),
            sprintf('$TTL %d', $defaultTtl),
            sprintf(
                '@ IN SOA %s. hostmaster.%s. ( %d 3600 900 1209600 300 )',
                Hostname::normalise($nameservers[0] ?? 'ns1.' . $zone),
                $zone,
                $serial,
            ),
        ];

        foreach ($nameservers as $ns) {
            $lines[] = sprintf('@ IN NS %s.', Hostname::normalise($ns));
        }

        usort($records, [self::class, 'compareRecords']);

        foreach ($records as $record) {
            $lines[] = $this->line($record, $zone);
        }

        return implode("\n", $lines) . "\n";
    }

    /**
     * Sort order: name, then type, then priority.
     */
    public static function compareRecords(DnsRecordData $a, DnsRecordData $b): int
    {
        $byName = $a->name <=> $b->name;
        if ($byName !== 0) {
            return $byName;
        }

        $byType = $a->type->value <=> $b->type->value;
        if ($byType !== 0) {
            return $byType;
        }

        return ($a->priority ?? 0) <=> ($b->priority ?? 0);
    }

    public function line(DnsRecordData $record, string $zone): string
    {
        $owner = Hostname::relativise($record->name, $zone);

        return sprintf('%s %d IN %s %s', $owner, $record->ttl, $record->type->value, $this->rdata($record));
    }

    public function rdata(DnsRecordData $record): string
    {
        switch ($record->type) {
            case DnsRecordType::MX:
                return sprintf('%d %s', $record->priority ?? 0, $this->fqdn($record->value));
            case DnsRecordType::SRV:
                return sprintf(
                    '%d %d %d %s',
                    $record->priority ?? 0,
                    $record->weight ?? 0,
                    $record->port ?? 0,
                    $this->fqdn($record->value),
                );
            case DnsRecordType::CNAME:
            case DnsRecordType::NS:
                return $this->fqdn($record->value);
            case DnsRecordType::TXT:
                return $this->quoteTxt($record->value);
            default:
                return $record->value;
        }
    }

    /**
     * Split long TXT data into <=255 byte character-strings (RFC 1035 3.3).
     */
    public function quoteTxt(string $value): string
    {
        $quoted = [];
        foreach (str_split($value, self::TXT_CHUNK) as $chunk) {
            $escaped = str_replace(['\\', '"'], ['\\\\', '\\"'], $chunk);
            $quoted[] = '"' . $escaped . '"';
        }

        return implode(' ', $quoted);
    }

    private function fqdn(string $host): string
    {
        return $host === '.' ? '.' : rtrim($host, '.') . '.';
    }

    /**
     * Next SOA serial in YYYYMMDDnn form; falls back to +1 once the day's
     * 99 revisions are exhausted or the stored serial is ahead of today.
     */
    public static function nextSerial(int $current, \DateTimeInterface $now): int
    {
        $base = (int) ($now->format('Ymd') . '00');

        return $current >= $base ? $current + 1 : $base;
    }
}
