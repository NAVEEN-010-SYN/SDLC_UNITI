<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\ProvisioningStatus;
use App\Models\Mailbox;
use App\Support\Page;
use Carbon\CarbonImmutable;

/**
 * @extends AccountScopedRepository<Mailbox>
 */
class MailboxRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return Mailbox::class;
    }

    protected function resourceName(): string
    {
        return 'Mailbox';
    }

    /**
     * @return Page<Mailbox>
     */
    public function listForDomain(string $accountId, string $emailDomainId, int $page, int $pageSize, ?string $search = null): Page
    {
        $query = $this->forAccount($accountId)
            ->where('email_domain_id', $emailDomainId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->with('emailDomain')
            ->orderBy('local_part');

        if ($search !== null && $search !== '') {
            $query->where(function ($q) use ($search): void {
                $q->where('local_part', 'like', $search . '%')->orWhere('display_name', 'like', '%' . $search . '%');
            });
        }

        return $this->paginate($query, $page, $pageSize);
    }

    /**
     * Apply usage figures fetched from the mail platform in one pass.
     *
     * @param array<string, int> $usageByRef external_ref => used MB
     * @return int Mailboxes updated.
     */
    public function applyUsage(string $emailDomainId, array $usageByRef, CarbonImmutable $syncedAt): int
    {
        $updated = 0;
        $mailboxes = Mailbox::query()
            ->where('email_domain_id', $emailDomainId)
            ->whereIn('external_ref', array_keys($usageByRef))
            ->get();

        foreach ($mailboxes as $mailbox) {
            $mailbox->used_mb = $usageByRef[$mailbox->external_ref];
            $mailbox->usage_synced_at = $syncedAt;
            $mailbox->save();
            $updated++;
        }

        return $updated;
    }

    /**
     * Mailboxes at or above the warning threshold, for notification jobs.
     *
     * @return list<Mailbox>
     */
    public function nearQuota(int $warningPercent): array
    {
        return Mailbox::query()
            ->where('status', ProvisioningStatus::Active->value)
            ->where('quota_mb', '>', 0)
            ->whereRaw('used_mb * 100 >= quota_mb * ?', [$warningPercent])
            ->with('emailDomain')
            ->get()
            ->all();
    }
}
