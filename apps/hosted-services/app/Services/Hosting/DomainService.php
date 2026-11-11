<?php

declare(strict_types=1);

namespace App\Services\Hosting;

use App\Clients\WebHostingClient;
use App\Enums\CertificateStatus;
use App\Enums\ProvisioningStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ConflictException;
use App\Exceptions\ValidationFailedException;
use App\Models\HostedDomain;
use App\Repositories\HostedDomainRepository;
use App\Support\Hostname;
use App\Support\Page;
use App\Support\Principal;
use Illuminate\Support\Facades\Log;

/**
 * Web hosting domains: onboarding, delegation checks and removal.
 */
final class DomainService
{
    public const PLANS = ['WEB_STARTER', 'WEB_BUSINESS', 'WEB_PREMIUM'];

    public function __construct(
        private readonly HostedDomainRepository $domains,
        private readonly WebHostingClient $hosting,
    ) {
    }

    /**
     * @return Page<HostedDomain>
     */
    public function list(string $accountId, int $page, int $pageSize): Page
    {
        return $this->domains->list($accountId, $page, $pageSize);
    }

    public function get(string $accountId, string $domainId): HostedDomain
    {
        return $this->domains->getForAccount($accountId, $domainId);
    }

    /**
     * @return array{domain: HostedDomain, nameservers: list<string>}
     */
    public function add(string $accountId, string $name, string $plan, Principal $actor): array
    {
        $name = Hostname::normalise($name);
        if (!Hostname::isRegistrableDomain($name)) {
            throw ValidationFailedException::forField('name', 'Enter a domain such as example.com.');
        }
        if (!in_array($plan, self::PLANS, true)) {
            throw ValidationFailedException::forField('hosting_plan', 'Unknown hosting plan.');
        }
        if ($this->domains->nameExists($name)) {
            throw new ConflictException(sprintf('%s is already hosted with Uniti.', $name));
        }

        $domain = new HostedDomain([
            'account_id' => $accountId,
            'name' => $name,
            'hosting_plan' => $plan,
            'delegation_verified' => false,
            'zone_serial' => 0,
            'status' => ProvisioningStatus::Pending,
        ]);
        $this->domains->save($domain);

        $domain->external_ref = $this->hosting->createSite($domain);
        $this->domains->save($domain);

        Log::info('hosting.domain_added', ['hostedDomainId' => $domain->id, 'actor' => $actor->auditId()]);

        return ['domain' => $domain, 'nameservers' => $this->hosting->nameservers()];
    }

    /**
     * Confirm the registrar delegates the domain to Uniti nameservers.
     */
    public function checkDelegation(string $accountId, string $domainId): HostedDomain
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $delegated = $this->hosting->checkDelegation($domain->name);

        $domain->delegation_verified = $delegated;
        if ($delegated && $domain->status === ProvisioningStatus::Pending) {
            $domain->status = ProvisioningStatus::Active;
        }

        return $this->domains->save($domain);
    }

    public function remove(string $accountId, string $domainId, Principal $actor): void
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);

        foreach ($this->domains->certificates($domain->id) as $certificate) {
            if ($certificate->status === CertificateStatus::PendingValidation) {
                throw new BusinessRuleException(
                    'A certificate order is in progress; wait for it to finish or cancel it first.',
                    'HOSTING_CERTIFICATE_IN_PROGRESS',
                );
            }
        }

        $this->hosting->deleteZone($domain->name);
        $this->hosting->deleteSite((string) $domain->external_ref);

        $domain->status = ProvisioningStatus::Deprovisioned;
        $this->domains->save($domain);

        Log::info('hosting.domain_removed', ['hostedDomainId' => $domain->id, 'actor' => $actor->auditId()]);
    }
}
