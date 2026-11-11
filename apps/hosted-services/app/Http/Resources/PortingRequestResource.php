<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\PortingEvent;
use App\Models\PortingRequest;
use App\Services\Porting\PortingService;
use Illuminate\Http\Request;

/**
 * The carrier PIN is write-only. The account number is masked to its last
 * four characters so the portal can confirm which account was used.
 *
 * @property PortingRequest $resource
 */
final class PortingRequestResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $port = $this->resource;

        return [
            'id' => $port->id,
            'status' => $port->status->value,
            'numbers' => array_values($port->numbers),
            'losingCarrier' => $port->losing_carrier,
            'carrierAccountNumber' => self::mask($port->carrier_account_number),
            'carrierPinProvided' => $port->carrier_pin !== null && $port->carrier_pin !== '',
            'billingTelephoneNumber' => $port->billing_telephone_number,
            'authorisedName' => $port->authorised_name,
            'serviceAddress' => $port->service_address,
            'requestedPortDate' => $port->requested_port_date?->toDateString(),
            'focAt' => self::iso($port->foc_at),
            'carrierReference' => $port->carrier_reference,
            'rejectionReason' => $port->rejection_reason,
            'resubmissionCount' => $port->resubmission_count,
            'loaProvided' => $port->loa_document_ref !== null,
            'timeline' => app(PortingService::class)->timeline($port),
            'events' => $this->whenLoaded('events', fn () => $port->events->map(static fn (PortingEvent $e) => [
                'from' => $e->from_status?->value,
                'to' => $e->to_status->value,
                'actor' => $e->actor,
                'note' => $e->note,
                'occurredAt' => self::iso($e->occurred_at),
            ])->all()),
            'createdAt' => self::iso($port->created_at),
            'updatedAt' => self::iso($port->updated_at),
        ];
    }

    private static function mask(string $value): string
    {
        $visible = 4;
        $length = strlen($value);

        return $length <= $visible ? str_repeat('*', $length) : str_repeat('*', $length - $visible) . substr($value, -$visible);
    }
}
