<?php

declare(strict_types=1);

namespace App\Http\Requests\Hosting;

use App\Enums\DnsRecordType;
use App\Http\Requests\ApiFormRequest;
use Illuminate\Validation\Rule;

/**
 * Shape validation for DNS records. RDATA semantics (address families,
 * CNAME exclusivity, TXT length, zone limits) belong to DnsRecordValidator.
 * The record type is fixed after creation: changing it is delete + create.
 */
final class DnsRecordRequest extends ApiFormRequest
{
    public function rules(): array
    {
        $customerTypes = array_values(array_filter(
            DnsRecordType::cases(),
            static fn (DnsRecordType $t) => $t->isCustomerManaged(),
        ));

        $rules = [
            'name' => ['nullable', 'string', 'max:253'],
            'type' => ['required', Rule::in(array_map(static fn (DnsRecordType $t) => $t->value, $customerTypes))],
            'value' => ['required', 'string', 'max:4000'],
            'ttl' => ['nullable', 'integer'],
            'priority' => ['nullable', 'integer', 'between:0,65535'],
            'weight' => ['nullable', 'integer', 'between:0,65535'],
            'port' => ['nullable', 'integer', 'between:0,65535'],
        ];

        return $this->isMethod('PATCH') ? self::partial($rules, immutable: ['type']) : $rules;
    }

    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        if (is_string($this->input('type'))) {
            $this->merge(['type' => strtoupper($this->input('type'))]);
        }
    }
}
