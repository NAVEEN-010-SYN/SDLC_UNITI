<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\ProvisioningStatus;
use App\Models\CallForwardingRule;
use App\Models\Extension;
use App\Support\Page;
use Illuminate\Support\Facades\DB;

/**
 * @extends AccountScopedRepository<Extension>
 */
class ExtensionRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return Extension::class;
    }

    protected function resourceName(): string
    {
        return 'Extension';
    }

    /**
     * @return Page<Extension>
     */
    public function search(string $accountId, int $page, int $pageSize, ?string $query = null): Page
    {
        $builder = $this->forAccount($accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->with(['callerIdNumber', 'voicemailBox'])
            ->orderBy('number');

        if ($query !== null && $query !== '') {
            $builder->where(function ($q) use ($query): void {
                $q->where('number', 'like', $query . '%')
                    ->orWhere('display_name', 'like', '%' . $query . '%');
            });
        }

        return $this->paginate($builder, $page, $pageSize);
    }

    public function findByNumber(string $accountId, string $number): ?Extension
    {
        return $this->forAccount($accountId)
            ->where('number', $number)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->first();
    }

    /**
     * All short-dial numbers in use on the account (extensions and hunt
     * group pilots share one dial plan).
     *
     * @return list<string>
     */
    public function dialPlanNumbers(string $accountId): array
    {
        $extensions = $this->forAccount($accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->pluck('number')
            ->all();

        $pilots = DB::table('hunt_groups')
            ->where('account_id', $accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->pluck('pilot_extension')
            ->all();

        return array_values(array_unique(array_merge($extensions, $pilots)));
    }

    /**
     * Forwarding edges between extensions on the account, used for loop
     * detection: extension number => list of extension numbers it forwards to.
     *
     * @return array<string, list<string>>
     */
    public function internalForwardingGraph(string $accountId): array
    {
        $rows = DB::table('call_forwarding_rules as r')
            ->join('extensions as e', 'e.id', '=', 'r.extension_id')
            ->where('e.account_id', $accountId)
            ->where('r.enabled', true)
            ->where('r.destination_type', CallForwardingRule::DEST_EXTENSION)
            ->get(['e.number as source', 'r.destination as target']);

        $graph = [];
        foreach ($rows as $row) {
            $graph[(string) $row->source][] = (string) $row->target;
        }

        return $graph;
    }

    /**
     * @return list<CallForwardingRule>
     */
    public function forwardingRules(string $extensionId): array
    {
        return CallForwardingRule::query()
            ->where('extension_id', $extensionId)
            ->get()
            ->sortBy(static fn (CallForwardingRule $r) => $r->condition->precedence())
            ->values()
            ->all();
    }

    /**
     * @param list<array<string, mixed>> $rules
     */
    public function replaceForwardingRules(string $extensionId, array $rules): void
    {
        DB::transaction(function () use ($extensionId, $rules): void {
            CallForwardingRule::query()->where('extension_id', $extensionId)->delete();
            foreach ($rules as $rule) {
                CallForwardingRule::query()->create(['extension_id' => $extensionId] + $rule);
            }
        });
    }
}
