<?php

declare(strict_types=1);

namespace App\Http\Requests\Hosting;

use App\Http\Requests\ApiFormRequest;
use App\Services\Hosting\DomainService;
use Illuminate\Validation\Rule;

final class HostedDomainRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:253'],
            'hosting_plan' => ['required', Rule::in(DomainService::PLANS)],
        ];
    }
}
