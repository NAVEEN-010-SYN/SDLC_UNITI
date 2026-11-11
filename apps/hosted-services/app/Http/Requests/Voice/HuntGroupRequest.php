<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Enums\HuntGroupStrategy;
use App\Http\Requests\ApiFormRequest;
use App\Models\HuntGroup;
use Illuminate\Validation\Rule;

/**
 * Hunt groups are written as a whole (POST and PUT) because member order,
 * strategy and ring times are only meaningful together.
 */
final class HuntGroupRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:1', 'max:60'],
            'pilot_extension' => ['required', 'string', 'regex:/^\d{3,6}$/'],
            'pilot_number_id' => ['nullable', 'uuid'],
            'strategy' => ['required', Rule::enum(HuntGroupStrategy::class)],
            'ring_seconds' => ['required', 'integer'],
            'members' => ['required', 'array', 'list', 'min:1'],
            'members.*' => ['array:extension_id,ring_seconds'],
            'members.*.extension_id' => ['required', 'uuid'],
            'members.*.ring_seconds' => ['nullable', 'integer'],
            'no_answer_type' => ['required', Rule::in(HuntGroup::NO_ANSWER_TYPES)],
            'no_answer_destination' => [
                'nullable',
                'string',
                'max:32',
                Rule::requiredIf(fn () => in_array($this->input('no_answer_type'), ['EXTENSION', 'EXTERNAL'], true)),
            ],
        ];
    }
}
