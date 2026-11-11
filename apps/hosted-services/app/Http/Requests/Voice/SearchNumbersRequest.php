<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Http\Requests\ApiFormRequest;

/**
 * GET /numbers/available?npa=415&quantity=5
 */
final class SearchNumbersRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'npa' => ['required', 'string', 'regex:/^[2-9]\d{2}$/'],
            'quantity' => ['sometimes', 'integer', 'min:1', 'max:' . OrderNumbersRequest::MAX_PER_ORDER],
        ];
    }

    public function npa(): string
    {
        return (string) $this->validated()['npa'];
    }

    public function quantity(): int
    {
        return (int) ($this->validated()['quantity'] ?? 5);
    }
}
