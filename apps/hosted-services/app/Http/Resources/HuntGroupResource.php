<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\HuntGroup;
use App\Models\HuntGroupMember;
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

        return [
            'id' => $group->id,
            'name' => $group->name,
            'pilotExtension' => $group->pilot_extension,
            'pilotNumberId' => $group->pilot_number_id,
            'strategy' => $group->strategy->value,
            'ordered' => $group->strategy->isOrdered(),
            'ringSeconds' => $group->ring_seconds,
            'members' => $members->map(static fn (HuntGroupMember $m) => [
                'extensionId' => $m->extension_id,
                'position' => $m->position,
                'ringSeconds' => $m->ring_seconds,
            ])->all(),
            'maxWaitSeconds' => HuntGroupService::maxWaitSeconds(
                $group->strategy,
                $group->ring_seconds,
                $members->map(static fn (HuntGroupMember $m) => $m->ring_seconds ?? $group->ring_seconds)->all(),
            ),
            'noAnswer' => [
                'type' => $group->no_answer_type,
                'destination' => $group->no_answer_destination,
            ],
            'status' => $group->status->value,
        ];
    }
}
