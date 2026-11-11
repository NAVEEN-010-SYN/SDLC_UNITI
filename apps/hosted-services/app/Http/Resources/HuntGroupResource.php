<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\HuntGroup;
use App\Services\Voice\HuntGroupService;
use Illuminate\Http\Request;

/**
 * Includes the worst-case caller wait so the portal can warn before a
 * customer saves a configuration that leaves callers ringing for minutes.
 *
 * @property HuntGroup $resource
 */
final class HuntGroupResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $group = $this->resource;
        $members = $group->members->sortBy('position')->values();

        $memberRows = [];
        $ringTimes = [];
        foreach ($members as $m) {
            $memberRows[] = [
                'extensionId' => $m->extension_id,
                'position' => $m->position,
                'ringSeconds' => $m->ring_seconds,
            ];
            $ringTimes[] = $m->ring_seconds ?? $group->ring_seconds;
        }

        return [
            'id' => $group->id,
            'name' => $group->name,
            'pilotExtension' => $group->pilot_extension,
            'pilotNumberId' => $group->pilot_number_id,
            'strategy' => $group->strategy->value,
            'ordered' => $group->strategy->isOrdered(),
            'ringSeconds' => $group->ring_seconds,
            'members' => $memberRows,
            'maxWaitSeconds' => HuntGroupService::maxWaitSeconds($group->strategy, $group->ring_seconds, $ringTimes),
            'noAnswer' => [
                'type' => $group->no_answer_type,
                'destination' => $group->no_answer_destination,
            ],
            'status' => $group->status->value,
        ];
    }
}
