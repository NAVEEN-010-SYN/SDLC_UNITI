<?php

declare(strict_types=1);

namespace App\Http\Requests\Porting;

use App\Enums\PortingStatus;
use App\Http\Requests\ApiFormRequest;
use Carbon\CarbonImmutable;
use Illuminate\Validation\Rule;

/**
 * Status update relayed from the number portability gateway. Only the
 * statuses a carrier can drive are accepted; DRAFT/SUBMITTED/CANCELLED are
 * customer-driven.
 */
final class CarrierUpdateRequest extends ApiFormRequest
{
    private const CARRIER_STATUSES = [
        PortingStatus::PendingFoc,
        PortingStatus::FocReceived,
        PortingStatus::Completed,
        PortingStatus::Rejected,
        PortingStatus::Failed,
    ];

    public function rules(): array
    {
        return [
            'reference' => ['required', 'string', 'max:64'],
            'status' => ['required', Rule::in(array_map(static fn (PortingStatus $s) => $s->value, self::CARRIER_STATUSES))],
            'foc_at' => ['nullable', 'date', 'required_if:status,FOC_RECEIVED'],
            'reason' => ['nullable', 'string', 'max:500', 'required_if:status,REJECTED,FAILED'],
        ];
    }

    public function status(): PortingStatus
    {
        return PortingStatus::from((string) $this->validated()['status']);
    }

    public function focAt(): ?CarbonImmutable
    {
        $value = $this->validated()['foc_at'] ?? null;

        return $value === null ? null : CarbonImmutable::parse((string) $value)->utc();
    }
}
