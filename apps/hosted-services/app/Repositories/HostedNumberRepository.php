<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\ProvisioningStatus;
use App\Models\HostedNumber;
use App\Support\Page;

/**
 * @extends AccountScopedRepository<HostedNumber>
 */
class HostedNumberRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return HostedNumber::class;
    }

    protected function resourceName(): string
    {
        return 'Number';
    }

    /**
     * @return Page<HostedNumber>
     */
    public function search(string $accountId, int $page, int $pageSize, ?string $status = null, ?bool $assigned = null, ?string $contains = null): Page
    {
        $query = $this->forAccount($accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->orderBy('e164');

        if ($status !== null) {
            $query->where('status', $status);
        }
        if ($assigned !== null) {
            $assigned ? $query->whereNotNull('extension_id') : $query->whereNull('extension_id');
        }
        if ($contains !== null && $contains !== '') {
            $query->where('e164', 'like', '%' . preg_replace('/\D+/', '', $contains) . '%');
        }

        return $this->paginate($query, $page, $pageSize);
    }

    public function findActiveByE164(string $e164): ?HostedNumber
    {
        return $this->query()
            ->where('e164', $e164)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->first();
    }

    /**
     * @param list<string> $e164s
     * @return list<string> The subset already held on any account.
     */
    public function existingNumbers(array $e164s): array
    {
        if ($e164s === []) {
            return [];
        }

        return $this->query()
            ->whereIn('e164', $e164s)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->pluck('e164')
            ->all();
    }

    /**
     * @return list<HostedNumber>
     */
    public function assignedTo(string $extensionId): array
    {
        return $this->query()->where('extension_id', $extensionId)->get()->all();
    }

    public function unassignAllFrom(string $extensionId): int
    {
        return $this->query()->where('extension_id', $extensionId)->update(['extension_id' => null]);
    }
}
