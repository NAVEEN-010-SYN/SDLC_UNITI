<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\ProvisioningStatus;
use App\Models\EmailDomain;
use App\Models\MailAlias;
use App\Models\Mailbox;
use App\Support\Page;

/**
 * @extends AccountScopedRepository<EmailDomain>
 */
class EmailDomainRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return EmailDomain::class;
    }

    protected function resourceName(): string
    {
        return 'Email domain';
    }

    /**
     * @return list<EmailDomain>
     */
    public function allForAccount(string $accountId): array
    {
        return $this->forAccount($accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->orderBy('domain')
            ->get()
            ->all();
    }

    public function domainExists(string $domain): bool
    {
        return $this->query()
            ->where('domain', strtolower($domain))
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->exists();
    }

    /**
     * Quota allocations used by the QuotaCalculator.
     *
     * @return list<array{quota_mb: int, used_mb: int}>
     */
    public function allocations(string $emailDomainId, ?string $excludeMailboxId = null): array
    {
        $query = Mailbox::query()
            ->where('email_domain_id', $emailDomainId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value);

        if ($excludeMailboxId !== null) {
            $query->whereKeyNot($excludeMailboxId);
        }

        return $query->get(['quota_mb', 'used_mb'])
            ->map(static fn (Mailbox $m) => ['quota_mb' => $m->quota_mb, 'used_mb' => $m->used_mb])
            ->all();
    }

    /**
     * Local parts already taken by a mailbox or alias on the domain.
     */
    public function isLocalPartTaken(string $emailDomainId, string $localPart, ?string $ignoreAliasId = null): bool
    {
        $mailbox = Mailbox::query()
            ->where('email_domain_id', $emailDomainId)
            ->where('local_part', $localPart)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->exists();

        if ($mailbox) {
            return true;
        }

        $aliasQuery = MailAlias::query()->where('email_domain_id', $emailDomainId)->where('local_part', $localPart);
        if ($ignoreAliasId !== null) {
            $aliasQuery->whereKeyNot($ignoreAliasId);
        }

        return $aliasQuery->exists();
    }

    /**
     * @return Page<MailAlias>
     */
    public function aliases(string $emailDomainId, int $page, int $pageSize): Page
    {
        $query = MailAlias::query()->where('email_domain_id', $emailDomainId)->orderBy('local_part');
        $total = (clone $query)->count();

        return new Page($query->forPage($page, $pageSize)->get()->all(), $page, $pageSize, $total);
    }

    public function findAlias(string $emailDomainId, string $aliasId): ?MailAlias
    {
        return MailAlias::query()->where('email_domain_id', $emailDomainId)->whereKey($aliasId)->first();
    }
}
