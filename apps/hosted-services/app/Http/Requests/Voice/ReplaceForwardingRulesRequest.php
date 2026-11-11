<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Enums\ForwardingCondition;
use App\Http\Requests\ApiFormRequest;
use App\Models\CallForwardingRule;
use Illuminate\Validation\Rule;

/**
 * PUT replaces the whole rule set. Shape checks only; per-condition rules,
 * loop detection and number policy live in ForwardingRuleValidator.
 */
final class ReplaceForwardingRulesRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'rules' => ['present', 'array', 'list', 'max:' . count(ForwardingCondition::cases())],
            'rules.*' => ['array:condition,destination_type,destination,ring_seconds,enabled'],
            'rules.*.condition' => ['required', Rule::enum(ForwardingCondition::class)],
            'rules.*.destination_type' => ['required', Rule::in(CallForwardingRule::DESTINATION_TYPES)],
            'rules.*.destination' => ['nullable', 'string', 'max:32'],
            'rules.*.ring_seconds' => ['nullable', 'integer'],
            'rules.*.enabled' => ['boolean'],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function forwardingRules(): array
    {
        return array_values($this->validated()['rules']);
    }
}
