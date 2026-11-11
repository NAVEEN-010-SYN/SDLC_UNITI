<?php

declare(strict_types=1);

namespace App\Services\Dns;

use App\Enums\DnsRecordType;
use App\Exceptions\BusinessRuleException;

/**
 * Zone-level consistency rules for a DNS record: record limit, duplicates,
 * CNAME coexistence, single SPF and null MX. Raises BusinessRuleException.
 */
final class DnsZoneConflictChecker
{
    public function __construct(private readonly int $maxRecordsPerZone)
    {
    }

    /**
     * @param list<DnsRecordData> $others
     */
    public function check(DnsRecordData $record, string $zone, array $others, bool $isCreate): void
    {
        if ($isCreate && count($others) >= $this->maxRecordsPerZone) {
            throw new BusinessRuleException(
                sprintf('The zone %s already holds the maximum of %d records.', $zone, $this->maxRecordsPerZone),
                'DNS_ZONE_RECORD_LIMIT',
            );
        }

        $sameName = [];
        foreach ($others as $other) {
            if ($other->name === $record->name) {
                $sameName[] = $other;
            }
        }

        $this->checkDuplicatesAndCname($record, $sameName);

        if ($record->type === DnsRecordType::TXT && $this->isSpf($record->value)) {
            $this->checkSingleSpf($sameName);
        }

        if ($record->type === DnsRecordType::MX && $record->value === '.') {
            $this->checkNullMx($sameName);
        }
    }

    /**
     * @param list<DnsRecordData> $sameName
     */
    private function checkDuplicatesAndCname(DnsRecordData $record, array $sameName): void
    {
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
    }

    /**
     * @param list<DnsRecordData> $sameName
     */
    private function checkSingleSpf(array $sameName): void
    {
        foreach ($sameName as $other) {
            if ($other->type === DnsRecordType::TXT && $this->isSpf($other->value)) {
                throw new BusinessRuleException(
                    'Only one SPF (v=spf1) record is allowed per name; merge the mechanisms into the existing record.',
                    'DNS_DUPLICATE_SPF',
                );
            }
        }
    }

    /**
     * @param list<DnsRecordData> $sameName
     */
    private function checkNullMx(array $sameName): void
    {
        foreach ($sameName as $other) {
            if ($other->type === DnsRecordType::MX) {
                throw new BusinessRuleException('A null MX record must be the only MX record for the name.', 'DNS_NULL_MX_CONFLICT');
            }
        }
    }

    private function isSpf(string $txt): bool
    {
        return str_starts_with(strtolower($txt), 'v=spf1');
    }
}
