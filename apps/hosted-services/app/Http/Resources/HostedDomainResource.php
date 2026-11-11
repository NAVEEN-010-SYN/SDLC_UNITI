<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\HostedDomain;
use Illuminate\Http\Request;

/**
 * @property HostedDomain $resource
 */
final class HostedDomainResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $domain = $this->resource;

        return [
            'id' => $domain->id,
            'name' => $domain->name,
            'hostingPlan' => $domain->hosting_plan,
            'delegationVerified' => (bool) $domain->delegation_verified,
            'zoneSerial' => $domain->zone_serial,
            'status' => $domain->status->value,
            'createdAt' => self::iso($domain->created_at),
        ];
    }
}
