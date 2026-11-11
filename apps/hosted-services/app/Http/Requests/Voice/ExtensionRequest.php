<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Http\Requests\ApiFormRequest;

/**
 * POST /extensions creates; PATCH /extensions/{id} reuses the same rules as
 * optional fields. The short-dial number is fixed once provisioned because
 * desk phones and hunt groups reference it.
 */
final class ExtensionRequest extends ApiFormRequest
{
    public function rules(): array
    {
        $rules = [
            'number' => ['nullable', 'string', 'regex:/^\d{3,6}$/'],
            'display_name' => ['required', 'string', 'min:1', 'max:80'],
            'email' => ['nullable', 'string', 'email:rfc', 'max:254'],
            'caller_id_number_id' => ['nullable', 'uuid'],
            'do_not_disturb' => ['boolean'],
        ];

        if ($this->isMethod('PATCH')) {
            return self::partial($rules, immutable: ['number']);
        }

        unset($rules['do_not_disturb']);

        return $rules;
    }
}
