<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Http\Requests\ApiFormRequest;

/**
 * POST /numbers/orders: activate numbers previously reserved by a search.
 */
final class OrderNumbersRequest extends ApiFormRequest
{
    public const MAX_PER_ORDER = 20;

    public function rules(): array
    {
        return [
            'numbers' => ['required', 'array', 'list', 'min:1', 'max:' . self::MAX_PER_ORDER],
            'numbers.*' => ['required', 'string', 'max:20', 'distinct'],
        ];
    }

    /**
     * @return list<string>
     */
    public function numbers(): array
    {
        return array_values($this->validated()['numbers']);
    }
}
