<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\CallForwardingRule;
use Illuminate\Http\Request;

/**
 * @property CallForwardingRule $resource
 */
final class ForwardingRuleResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $rule = $this->resource;

        return [
            'id' => $rule->id,
            'condition' => $rule->condition->value,
            'precedence' => $rule->condition->precedence(),
            'destinationType' => $rule->destination_type,
            'destination' => $rule->destination,
            'ringSeconds' => $rule->ring_seconds,
            'enabled' => (bool) $rule->enabled,
        ];
    }
}
