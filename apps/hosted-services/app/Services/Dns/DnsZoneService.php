<?php

declare(strict_types=1);

namespace App\Services\Dns;

use App\Clients\WebHostingClient;
use App\Enums\DnsRecordType;
use App\Exceptions\BusinessRuleException;
use App\Models\DnsRecord;
use App\Models\HostedDomain;
use App\Repositories\HostedDomainRepository;
use App\Support\Page;
use App\Support\Principal;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Psr\Clock\ClockInterface;

/**
 * Customer-facing DNS zone management. Each mutation validates against the
 * whole zone, bumps the SOA serial and republishes the zone atomically, so
 * the database and the authoritative servers never diverge for long.
 */
final class DnsZoneService
{
    public function __construct(
        private readonly HostedDomainRepository $domains,
        private readonly DnsRecordValidator $validator,
        private readonly ZoneSerializer $serializer,
        private readonly WebHostingClient $hosting,
        private readonly ClockInterface $clock,
        private readonly int $defaultTtl = 3600,
    ) {
    }

    /**
     * @return Page<DnsRecord>
     */
    public function list(string $accountId, string $domainId, int $page, int $pageSize, ?DnsRecordType $type): Page
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);

        return $this->domains->records($domain->id, $page, $pageSize, $type);
    }

    /**
     * @param array<string, mixed> $input
     */
    public function create(string $accountId, string $domainId, array $input, Principal $actor): DnsRecord
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $data = $this->validator->validate(
            DnsRecordData::fromArray($input, $this->defaultTtl),
            $domain->name,
            $this->domains->recordData($domain->id),
        );

        return $this->mutate($domain, function () use ($domain, $data, $actor): DnsRecord {
            $record = new DnsRecord($data->toAttributes() + [
                'hosted_domain_id' => $domain->id,
                'system_managed' => false,
                'created_by' => $actor->auditId(),
            ]);
            $record->save();

            return $record;
        });
    }

    /**
     * @param array<string, mixed> $input
     */
    public function update(string $accountId, string $domainId, string $recordId, array $input): DnsRecord
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $record = $this->domains->getRecord($domain->id, $recordId);
        $this->assertCustomerEditable($record);

        $merged = array_merge(
            ['name' => $record->name, 'type' => $record->type->value, 'value' => $record->value, 'ttl' => $record->ttl,
             'priority' => $record->priority, 'weight' => $record->weight, 'port' => $record->port],
            $input,
            ['type' => $record->type->value],
        );

        $data = $this->validator->validate(
            DnsRecordData::fromArray($merged, $this->defaultTtl),
            $domain->name,
            $this->domains->recordData($domain->id),
            $record->id,
        );

        return $this->mutate($domain, function () use ($record, $data): DnsRecord {
            $record->fill($data->toAttributes());
            $record->save();

            return $record;
        });
    }

    public function delete(string $accountId, string $domainId, string $recordId): void
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $record = $this->domains->getRecord($domain->id, $recordId);
        $this->assertCustomerEditable($record);

        $this->mutate($domain, static function () use ($record): void {
            $record->delete();
        });
    }

    /**
     * Platform-owned records (ACME challenges, mail routing). These bypass
     * the customer-editability check but still go through validation.
     */
    public function upsertSystemRecord(HostedDomain $domain, string $name, DnsRecordType $type, string $value, int $ttl = 300): void
    {
        $data = new DnsRecordData($name, $type, $value, $ttl);
        $existing = [];
        foreach ($this->domains->recordData($domain->id) as $other) {
            if ($other->name === $name && $other->type === $type) {
                continue;
            }
            $existing[] = $other;
        }
        $data = $this->validator->validate($data, $domain->name, $existing);

        $this->mutate($domain, function () use ($domain, $data): void {
            $this->domains->deleteRecordsByName($domain->id, $data->name, $data->type);
            (new DnsRecord($data->toAttributes() + ['hosted_domain_id' => $domain->id, 'system_managed' => true]))->save();
        });
    }

    public function removeSystemRecords(HostedDomain $domain, string $name, DnsRecordType $type): void
    {
        $this->mutate($domain, function () use ($domain, $name, $type): void {
            $this->domains->deleteRecordsByName($domain->id, $name, $type);
        });
    }

    public function export(string $accountId, string $domainId): string
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);

        return $this->serializer->serialize(
            $domain->name,
            $domain->zone_serial,
            $this->domains->recordData($domain->id),
            $this->hosting->nameservers(),
            $this->defaultTtl,
        );
    }

    /**
     * Run a change inside a transaction, bump the serial and publish. If
     * publishing fails the transaction rolls back and the error surfaces as
     * a 502, leaving the stored zone equal to the served zone.
     *
     * @template T
     * @param callable(): T $change
     * @return T
     */
    private function mutate(HostedDomain $domain, callable $change): mixed
    {
        return DB::transaction(function () use ($domain, $change): mixed {
            /** @var HostedDomain $locked */
            $locked = HostedDomain::query()->whereKey($domain->id)->lockForUpdate()->firstOrFail();

            $result = $change();
            $this->bumpAndPublish($locked);
            $domain->zone_serial = $locked->zone_serial;

            return $result;
        });
    }

    private function bumpAndPublish(HostedDomain $locked): void
    {
        $locked->zone_serial = ZoneSerializer::nextSerial($locked->zone_serial, CarbonImmutable::instance($this->clock->now()));
        $locked->save();

        $zoneFile = $this->serializer->serialize(
            $locked->name,
            $locked->zone_serial,
            $this->domains->recordData($locked->id),
            $this->hosting->nameservers(),
            $this->defaultTtl,
        );
        $this->hosting->publishZone($locked->name, $locked->zone_serial, $zoneFile);

        Log::info('dns.zone_published', ['hostedDomainId' => $locked->id, 'serial' => $locked->zone_serial]);
    }

    private function assertCustomerEditable(DnsRecord $record): void
    {
        if ($record->system_managed) {
            throw new BusinessRuleException(
                'This record is managed by Uniti (for example mail routing or certificate validation) and cannot be changed.',
                'DNS_SYSTEM_RECORD',
            );
        }
    }
}
