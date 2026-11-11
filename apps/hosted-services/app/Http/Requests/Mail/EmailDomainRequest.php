<?php

declare(strict_types=1);

namespace App\Http\Requests\Mail;

use App\Http\Requests\ApiFormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /email-domains registers a domain on a hosted email plan.
 */
final class EmailDomainRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'domain' => ['required', 'string', 'max:253'],
            'plan_code' => ['required', 'string', Rule::in(array_keys((array) config('hosted.mail.plans')))],
        ];
    }
}
