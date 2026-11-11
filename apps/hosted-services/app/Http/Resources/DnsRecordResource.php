<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\DnsRecord;
use Illuminate\Http\Request;

/**
 * @property DnsRecord $resource
 */
final class DnsRecordResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $record = $this->resource;

        return [
            'id' => $record->id,
            'name' => $record->name,
            'type' => $record->type->value,
            'value' => $record->value,
            'ttl' => $record->ttl,
            'priority' => $record->priority,
            'weight' => $record->weight,
            'port' => $record->port,
            'systemManaged' => (bool) $record->system_managed,
            'editable' => !$record->system_managed && $record->type->isCustomerManaged(),
        ];
    }
}
