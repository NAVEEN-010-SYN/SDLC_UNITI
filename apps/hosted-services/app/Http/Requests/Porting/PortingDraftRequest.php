<?php

declare(strict_types=1);

namespace App\Http\Requests\Porting;

use App\Http\Requests\ApiFormRequest;

/**
 * Body for creating (POST) or editing (PATCH) a draft port-in request.
 * Business-day lead time, duplicate numbers across open requests and LOA
 * presence at submit time are enforced by PortingService / state machine.
 */
final class PortingDraftRequest extends ApiFormRequest
{
    public function rules(): array
    {
        $maxNumbers = (int) config('hosted.porting.max_numbers_per_request', 100);

        $rules = [
            'numbers' => ['required', 'array', 'list', 'min:1', 'max:' . $maxNumbers],
            'numbers.*' => ['required', 'string', 'max:20', 'distinct'],
            'losing_carrier' => ['required', 'string', 'min:2', 'max:80'],
            'carrier_account_number' => ['required', 'string', 'max:40'],
            'carrier_pin' => ['nullable', 'string', 'max:20'],
            'billing_telephone_number' => ['required', 'string', 'max:20'],
            'authorised_name' => ['required', 'string', 'min:2', 'max:120'],
            'service_address' => ['required', 'array:line1,line2,city,region,postal_code,country'],
            'service_address.line1' => ['required', 'string', 'max:120'],
            'service_address.line2' => ['nullable', 'string', 'max:120'],
            'service_address.city' => ['required', 'string', 'max:80'],
            'service_address.region' => ['required', 'string', 'size:2', 'alpha'],
            'service_address.postal_code' => ['required', 'string', 'regex:/^\d{5}(-\d{4})?$/'],
            'service_address.country' => ['required', 'string', 'in:US,CA'],
            'requested_port_date' => ['required', 'date_format:Y-m-d'],
            'loa_document_ref' => ['nullable', 'string', 'max:120'],
        ];

        return $this->isMethod('PATCH') ? self::partial($rules) : $rules;
    }
}
