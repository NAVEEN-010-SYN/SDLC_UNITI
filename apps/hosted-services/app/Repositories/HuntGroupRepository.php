<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\ProvisioningStatus;
use App\Models\HuntGroup;
use App\Models\HuntGroupMember;
use App\Support\Page;
use Illuminate\Support\Facades\DB;

/**
 * @extends AccountScopedRepository<HuntGroup>
 */
class HuntGroupRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return HuntGroup::class;
    }

    protected function resourceName(): string
    {
        return 'Hunt group';
    }

    /**
     * @return Page<HuntGroup>
     */
    public function list(string $accountId, int $page, int $pageSize): Page
    {
        $query = $this->forAccount($accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->with('members.extension')
            ->orderBy('name');

        return $this->paginate($query, $page, $pageSize);
    }

    /**
     * @param list<array{extension_id: string, ring_seconds: ?int}> $members In ring order.
     */
    public function saveWithMembers(HuntGroup $group, array $members): HuntGroup
    {
        return DB::transaction(function () use ($group, $members): HuntGroup {
            $group->save();
            HuntGroupMember::query()->where('hunt_group_id', $group->id)->delete();

            foreach ($members as $position => $member) {
                HuntGroupMember::query()->create([
                    'hunt_group_id' => $group->id,
                    'extension_id' => $member['extension_id'],
                    'ring_seconds' => $member['ring_seconds'],
                    'position' => $position + 1,
                ]);
            }

            return $group->load('members.extension');
        });
    }

    /**
     * Hunt groups an extension belongs to (blocks extension deletion).
     *
     * @return list<string> Group names.
     */
    public function groupNamesContaining(string $extensionId): array
    {
        return HuntGroup::query()
            ->whereIn('id', HuntGroupMember::query()->select('hunt_group_id')->where('extension_id', $extensionId))
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->pluck('name')
            ->all();
    }
}
