<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\HostedNumber;
use App\Support\PhoneNumber;
use Illuminate\Http\Request;

/**
 * @property HostedNumber $resource
 */
final class HostedNumberResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $number = $this->resource;

        return [
            'id' => $number->id,
            'e164' => $number->e164,
            'areaCode' => PhoneNumber::tryParse($number->e164)?->npa(),
            'label' => $number->label,
            'status' => $number->status->value,
            'extensionId' => $number->extension_id,
            'portingRequestId' => $number->porting_request_id,
            'emergencyAddressVerified' => (bool) $number->emergency_address_verified,
            'usableAsCallerId' => $number->canBeOutboundCallerId(),
        ];
    }
}
