<?php

declare(strict_types=1);

namespace App\Http\Requests\Porting;

use App\Http\Requests\ApiFormRequest;

final class CancelPortingRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function reason(): ?string
    {
        $reason = $this->validated()['reason'] ?? null;

        return $reason === null || trim($reason) === '' ? null : trim($reason);
    }
}
