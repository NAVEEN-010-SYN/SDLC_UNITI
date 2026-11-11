<?php

declare(strict_types=1);

namespace App\Services\Dns;

use App\Enums\DnsRecordType;
use App\Models\DnsRecord;

/**
 * Immutable DNS record value used by the validator, zone serializer and
 * provisioning client, independent of persistence.
 */
final class DnsRecordData
{
    public function __construct(
        public readonly string $name,
        public readonly DnsRecordType $type,
        public readonly string $value,
        public readonly int $ttl,
        public readonly ?int $priority = null,
        public readonly ?int $weight = null,
        public readonly ?int $port = null,
        public readonly ?string $id = null,
    ) {
    }

    /**
     * @param array<string, mixed> $input Validated request payload.
     */
    public static function fromArray(array $input, int $defaultTtl): self
    {
        return new self(
            name: (string) ($input['name'] ?? '@'),
            type: DnsRecordType::from(strtoupper((string) $input['type'])),
            value: (string) $input['value'],
            ttl: isset($input['ttl']) ? (int) $input['ttl'] : $defaultTtl,
            priority: isset($input['priority']) ? (int) $input['priority'] : null,
            weight: isset($input['weight']) ? (int) $input['weight'] : null,
            port: isset($input['port']) ? (int) $input['port'] : null,
            id: isset($input['id']) ? (string) $input['id'] : null,
        );
    }

    public static function fromModel(DnsRecord $record): self
    {
        return new self(
            name: $record->name,
            type: $record->type,
            value: $record->value,
            ttl: $record->ttl,
            priority: $record->priority,
            weight: $record->weight,
            port: $record->port,
            id: $record->id,
        );
    }

    public function with(string $name, string $value): self
    {
        return new self($name, $this->type, $value, $this->ttl, $this->priority, $this->weight, $this->port, $this->id);
    }

    /**
     * Identity used for duplicate detection: two records are the same RR if
     * name, type and rdata match (TTL differences do not make a new record).
     */
    public function identity(): string
    {
        return implode('|', [
            $this->name,
            $this->type->value,
            $this->priority ?? '',
            $this->weight ?? '',
            $this->port ?? '',
            strtolower($this->value),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function toAttributes(): array
    {
        return [
            'name' => $this->name,
            'type' => $this->type,
            'value' => $this->value,
            'ttl' => $this->ttl,
            'priority' => $this->priority,
            'weight' => $this->weight,
            'port' => $this->port,
        ];
    }
}
