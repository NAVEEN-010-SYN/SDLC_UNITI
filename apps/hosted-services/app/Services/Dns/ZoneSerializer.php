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

        usort($records, static fn (DnsRecordData $a, DnsRecordData $b) => [$a->name, $a->type->value, $a->priority ?? 0]
            <=> [$b->name, $b->type->value, $b->priority ?? 0]);

        foreach ($records as $record) {
            $lines[] = $this->line($record, $zone);
        }

        return implode("\n", $lines) . "\n";
    }

    public function line(DnsRecordData $record, string $zone): string
    {
        $owner = Hostname::relativise($record->name, $zone);

        return sprintf('%s %d IN %s %s', $owner, $record->ttl, $record->type->value, $this->rdata($record));
    }

    public function rdata(DnsRecordData $record): string
    {
        return match ($record->type) {
            DnsRecordType::MX => sprintf('%d %s', $record->priority ?? 0, $this->fqdn($record->value)),
            DnsRecordType::SRV => sprintf(
                '%d %d %d %s',
                $record->priority ?? 0,
                $record->weight ?? 0,
                $record->port ?? 0,
                $this->fqdn($record->value),
            ),
            DnsRecordType::CNAME, DnsRecordType::NS => $this->fqdn($record->value),
            DnsRecordType::TXT => $this->quoteTxt($record->value),
            default => $record->value,
        };
    }

    /**
     * Split long TXT data into <=255 byte character-strings (RFC 1035 3.3).
     */
    public function quoteTxt(string $value): string
    {
        $chunks = str_split($value, self::TXT_CHUNK);

        return implode(' ', array_map(
            static fn (string $chunk) => '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $chunk) . '"',
            $chunks,
        ));
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
