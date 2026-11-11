<?php

declare(strict_types=1);

namespace App\Services\Mail;

use App\Clients\MailPlatformClient;
use App\Enums\ProvisioningStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ConflictException;
use App\Exceptions\ValidationFailedException;
use App\Models\EmailDomain;
use App\Repositories\EmailDomainRepository;
use App\Support\Hostname;
use App\Support\Principal;
use Illuminate\Support\Facades\Log;

/**
 * Hosted email domains: onboarding, MX verification and storage add-ons.
 */
final class EmailDomainService
{
    public function __construct(
        private readonly EmailDomainRepository $domains,
        private readonly QuotaCalculator $quota,
        private readonly MailPlatformClient $mail,
    ) {
    }

    /**
     * @return list<array{domain: EmailDomain, quota: QuotaSummary}>
     */
    public function listWithQuota(string $accountId): array
    {
        $rows = [];
        foreach ($this->domains->allForAccount($accountId) as $domain) {
            $rows[] = ['domain' => $domain, 'quota' => $this->quotaFor($domain)];
        }

        return $rows;
    }

    public function get(string $accountId, string $domainId): EmailDomain
    {
        return $this->domains->getForAccount($accountId, $domainId);
    }

    public function quotaFor(EmailDomain $domain): QuotaSummary
    {
        return $this->quota->summarise($domain->plan_code, $domain->addon_blocks, $this->domains->allocations($domain->id));
    }

    public function register(string $accountId, string $domainName, string $planCode, Principal $actor): EmailDomain
    {
        $domainName = Hostname::normalise($domainName);
        if (!Hostname::isRegistrableDomain($domainName)) {
            throw ValidationFailedException::forField('domain', 'Enter a domain such as example.com.');
        }
        if ($this->domains->domainExists($domainName)) {
            throw new ConflictException(sprintf('%s is already set up for hosted email.', $domainName));
        }

        // Validates the plan code; throws for unknown plans.
        $this->quota->capacityMb($planCode, 0);

        $domain = new EmailDomain([
            'account_id' => $accountId,
            'domain' => $domainName,
            'plan_code' => $planCode,
            'addon_blocks' => 0,
            'mx_verified' => false,
            'status' => ProvisioningStatus::Pending,
        ]);
        $this->domains->save($domain);

        $domain->external_ref = $this->mail->createDomain($domain);
        $this->domains->save($domain);

        Log::info('mail.domain_registered', ['emailDomainId' => $domain->id, 'actor' => $actor->auditId()]);

        return $domain;
    }

    /**
     * Check the public MX records; the domain becomes ACTIVE once they
     * point at the Uniti mail platform.
     *
     * @return array{domain: EmailDomain, observedMx: list<string>}
     */
    public function verifyMx(string $accountId, string $domainId): array
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $result = $this->mail->verifyMx((string) $domain->external_ref);

        $domain->mx_verified = $result['verified'];
        if ($result['verified'] && $domain->status === ProvisioningStatus::Pending) {
            $domain->status = ProvisioningStatus::Active;
        }
        $this->domains->save($domain);

        return ['domain' => $domain, 'observedMx' => $result['observedMx']];
    }

    /**
     * Change the number of purchased storage blocks. Reductions are refused
     * when mailbox quotas would no longer fit in the pool.
     */
    public function setAddonBlocks(string $accountId, string $domainId, int $blocks, Principal $actor): EmailDomain
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        if ($domain->status === ProvisioningStatus::Deprovisioned) {
            throw new BusinessRuleException('The domain has been removed.', 'MAIL_DOMAIN_REMOVED');
        }

        $this->quota->assertCanChangeAddonBlocks($this->quotaFor($domain), $blocks);

        $this->mail->setDomainStorage((string) $domain->external_ref, $this->quota->capacityMb($domain->plan_code, $blocks));

        $previous = $domain->addon_blocks;
        $domain->addon_blocks = $blocks;
        $this->domains->save($domain);

        Log::info('mail.addon_blocks_changed', [
            'emailDomainId' => $domain->id,
            'from' => $previous,
            'to' => $blocks,
            'actor' => $actor->auditId(),
        ]);

        return $domain;
    }
}
