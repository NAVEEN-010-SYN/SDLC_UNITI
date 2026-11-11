<?php

declare(strict_types=1);

namespace App\Services\Mail;

use App\Clients\MailPlatformClient;
use App\Enums\ProvisioningStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ConflictException;
use App\Exceptions\ValidationFailedException;
use App\Models\EmailDomain;
use App\Models\Mailbox;
use App\Repositories\EmailDomainRepository;
use App\Repositories\MailboxRepository;
use App\Support\Page;
use App\Support\Principal;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;

/**
 * Mailbox lifecycle on hosted email, enforcing pooled storage quotas.
 */
final class MailboxService
{
    public function __construct(
        private readonly MailboxRepository $mailboxes,
        private readonly EmailDomainRepository $domains,
        private readonly QuotaCalculator $quota,
        private readonly LocalPartPolicy $localParts,
        private readonly MailPlatformClient $mail,
        private readonly PasswordGenerator $passwords,
        private readonly bool $allowExternalForwarding = true,
        private readonly int $defaultQuotaMb = 10240,
    ) {
    }

    /**
     * @return Page<Mailbox>
     */
    public function list(string $accountId, string $domainId, int $page, int $pageSize, ?string $search): Page
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);

        return $this->mailboxes->listForDomain($accountId, $domain->id, $page, $pageSize, $search);
    }

    public function get(string $accountId, string $mailboxId): Mailbox
    {
        return $this->mailboxes->getForAccount($accountId, $mailboxId);
    }

    /**
     * @param array{local_part: string, display_name: string, quota_mb?: ?int} $data
     * @return array{mailbox: Mailbox, temporaryPassword: string}
     */
    public function create(string $accountId, string $domainId, array $data, Principal $actor): array
    {
        $domain = $this->activeDomain($accountId, $domainId);
        $localPart = $this->localParts->normalise($data['local_part']);

        if ($this->domains->isLocalPartTaken($domain->id, $localPart)) {
            throw new ConflictException(sprintf('%s@%s is already in use.', $localPart, $domain->domain));
        }

        $summary = $this->quota->summarise($domain->plan_code, $domain->addon_blocks, $this->domains->allocations($domain->id));
        $quotaMb = $data['quota_mb'] ?? min($this->defaultQuotaMb, $summary->unallocatedMb());
        $this->quota->assertCanAllocate($summary, $quotaMb, isNewMailbox: true);

        $mailbox = new Mailbox([
            'account_id' => $accountId,
            'email_domain_id' => $domain->id,
            'local_part' => $localPart,
            'display_name' => trim($data['display_name']),
            'quota_mb' => $quotaMb,
            'used_mb' => 0,
            'forwarding_enabled' => false,
            'keep_forwarded_copy' => true,
            'status' => ProvisioningStatus::Pending,
        ]);
        $mailbox->setRelation('emailDomain', $domain);
        $this->mailboxes->save($mailbox);

        $temporaryPassword = $this->passwords->generate();
        $mailbox->external_ref = $this->mail->createMailbox($mailbox, $localPart . '@' . $domain->domain, $temporaryPassword);
        $mailbox->status = ProvisioningStatus::Active;
        $this->mailboxes->save($mailbox);

        Log::info('mail.mailbox_created', ['mailboxId' => $mailbox->id, 'quotaMb' => $quotaMb, 'actor' => $actor->auditId()]);

        return ['mailbox' => $mailbox, 'temporaryPassword' => $temporaryPassword];
    }

    /**
     * @param array{display_name?: string, quota_mb?: int, forwarding_enabled?: bool,
     *              forwarding_address?: ?string, keep_forwarded_copy?: bool, suspended?: bool} $changes
     */
    public function update(string $accountId, string $mailboxId, array $changes): Mailbox
    {
        $mailbox = $this->mailboxes->getForAccount($accountId, $mailboxId);
        $domain = $mailbox->emailDomain;

        if (isset($changes['quota_mb']) && $changes['quota_mb'] !== $mailbox->quota_mb) {
            $summary = $this->quota->summarise($domain->plan_code, $domain->addon_blocks, $this->domains->allocations($domain->id));
            $this->quota->assertCanAllocate($summary, (int) $changes['quota_mb'], $mailbox->quota_mb, $mailbox->used_mb);
            $mailbox->quota_mb = (int) $changes['quota_mb'];
        }

        if (isset($changes['display_name'])) {
            $mailbox->display_name = trim($changes['display_name']);
        }

        if (array_key_exists('forwarding_enabled', $changes) || array_key_exists('forwarding_address', $changes)) {
            $this->applyForwarding($mailbox, $domain, $changes);
        }

        if (isset($changes['suspended'])) {
            $mailbox->status = $changes['suspended'] ? ProvisioningStatus::Suspended : ProvisioningStatus::Active;
        }

        $this->mail->updateMailbox($mailbox);

        return $this->mailboxes->save($mailbox);
    }

    /**
     * @return string New temporary password, shown once to the administrator.
     */
    public function resetPassword(string $accountId, string $mailboxId, Principal $actor): string
    {
        $mailbox = $this->mailboxes->getForAccount($accountId, $mailboxId);
        $password = $this->passwords->generate();
        $this->mail->resetPassword((string) $mailbox->external_ref, $password);

        Log::notice('mail.password_reset', ['mailboxId' => $mailbox->id, 'actor' => $actor->auditId()]);

        return $password;
    }

    public function delete(string $accountId, string $mailboxId, Principal $actor): void
    {
        $mailbox = $this->mailboxes->getForAccount($accountId, $mailboxId);
        $address = $mailbox->address();

        $referencingAliases = $mailbox->emailDomain->aliases()
            ->get()
            ->filter(static fn ($alias) => in_array($address, $alias->destinations, true))
            ->pluck('local_part')
            ->all();
        if ($referencingAliases !== []) {
            throw new BusinessRuleException(
                'The mailbox is a destination of aliases: ' . implode(', ', $referencingAliases) . '.',
                'MAIL_MAILBOX_IS_ALIAS_TARGET',
                ['aliases' => $referencingAliases],
            );
        }

        $this->mail->deleteMailbox((string) $mailbox->external_ref);
        $mailbox->status = ProvisioningStatus::Deprovisioned;
        $this->mailboxes->save($mailbox);

        Log::info('mail.mailbox_deleted', ['mailboxId' => $mailbox->id, 'actor' => $actor->auditId()]);
    }

    /**
     * Refresh usage from the platform for a whole domain.
     */
    public function syncUsage(EmailDomain $domain, CarbonImmutable $now): int
    {
        $usage = $this->mail->fetchUsage((string) $domain->external_ref);

        return $this->mailboxes->applyUsage($domain->id, $usage, $now);
    }

    /**
     * @param array<string, mixed> $changes
     */
    private function applyForwarding(Mailbox $mailbox, EmailDomain $domain, array $changes): void
    {
        $enabled = (bool) ($changes['forwarding_enabled'] ?? $mailbox->forwarding_enabled);
        $address = $changes['forwarding_address'] ?? $mailbox->forwarding_address;

        if (!$enabled) {
            $mailbox->forwarding_enabled = false;
            $mailbox->forwarding_address = null;

            return;
        }

        if ($address === null || filter_var($address, FILTER_VALIDATE_EMAIL) === false) {
            throw ValidationFailedException::forField('forwarding_address', 'A valid forwarding address is required.');
        }
        $address = strtolower($address);

        if ($address === strtolower($mailbox->local_part . '@' . $domain->domain)) {
            throw ValidationFailedException::forField('forwarding_address', 'A mailbox cannot forward to itself.');
        }

        $isExternal = !str_ends_with($address, '@' . $domain->domain);
        if ($isExternal && !$this->allowExternalForwarding) {
            throw new BusinessRuleException('Forwarding outside the organisation is disabled.', 'MAIL_EXTERNAL_FORWARDING_DISABLED');
        }

        $mailbox->forwarding_enabled = true;
        $mailbox->forwarding_address = $address;
        $mailbox->keep_forwarded_copy = (bool) ($changes['keep_forwarded_copy'] ?? $mailbox->keep_forwarded_copy);
    }

    private function activeDomain(string $accountId, string $domainId): EmailDomain
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        if ($domain->status !== ProvisioningStatus::Active) {
            throw new BusinessRuleException(
                sprintf('The domain %s is %s; mailboxes can be added once it is active.', $domain->domain, $domain->status->value),
                'MAIL_DOMAIN_NOT_ACTIVE',
            );
        }

        return $domain;
    }
}
