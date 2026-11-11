<?php

declare(strict_types=1);

namespace App\Http\Requests\Mail;

use App\Http\Requests\ApiFormRequest;

/**
 * Aliases deliver to one or more destinations. Destinations may be bare
 * local parts (resolved within the domain) or full addresses; the service
 * decides whether external forwarding is allowed.
 */
final class MailAliasRequest extends ApiFormRequest
{
    public function rules(): array
    {
        $max = (int) config('hosted.mail.max_alias_destinations', 50);

        $rules = [
            'local_part' => ['required', 'string', 'max:64'],
            'destinations' => ['required', 'array', 'list', 'min:1', 'max:' . $max],
            'destinations.*' => ['required', 'string', 'max:254', 'distinct:ignore_case'],
            'description' => ['nullable', 'string', 'max:200'],
        ];

        return $this->isMethod('PATCH') ? self::partial($rules, immutable: ['local_part']) : $rules;
    }
}
