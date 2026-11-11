<?php

declare(strict_types=1);

namespace App\Services\Hosting;

use App\Clients\CertificateAuthorityClient;
use App\Clients\WebHostingClient;
use App\Enums\CertificateStatus;
use App\Enums\DnsRecordType;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ProvisioningException;
use App\Exceptions\ValidationFailedException;
use App\Models\HostedDomain;
use App\Models\SslCertificate;
use App\Repositories\HostedDomainRepository;
use App\Services\Dns\DnsZoneService;
use App\Support\Hostname;
use App\Support\Principal;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;
use Psr\Clock\ClockInterface;

/**
 * Domain-validated TLS certificates for hosted sites.
 *
 * Flow: order -> publish DNS-01 TXT records in the customer's zone ->
 * finalise with the CA -> install on the site -> remove challenge records.
 * A scheduled job calls processPending() and renewDue().
 */
final class SslCertificateService
{
    public function __construct(
        private readonly HostedDomainRepository $domains,
        private readonly DnsZoneService $dns,
        private readonly CertificateAuthorityClient $ca,
        private readonly WebHostingClient $hosting,
        private readonly ClockInterface $clock,
        private readonly int $maxSans = 20,
        private readonly int $renewalWindowDays = 30,
    ) {
    }

    /**
     * @return list<SslCertificate>
     */
    public function list(string $accountId, string $domainId): array
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);

        return $this->domains->certificates($domain->id);
    }

    /**
     * @param list<string> $subjectAltNames
     */
    public function request(string $accountId, string $domainId, string $commonName, array $subjectAltNames, bool $autoRenew, Principal $actor): SslCertificate
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        if (!$domain->delegation_verified) {
            throw new BusinessRuleException(
                'Point the domain at Uniti nameservers before requesting a certificate.',
                'SSL_DELEGATION_REQUIRED',
            );
        }

        $names = $this->normaliseNames($domain, $commonName, $subjectAltNames);

        foreach ($this->domains->certificates($domain->id) as $existing) {
            if ($existing->status === CertificateStatus::PendingValidation && $existing->allNames() === $names) {
                return $existing;
            }
        }

        $certificate = $this->order($domain, $names, $autoRenew, null);
        Log::info('ssl.requested', ['certificateId' => $certificate->id, 'names' => $names, 'actor' => $actor->auditId()]);

        return $certificate;
    }

    /**
     * Attempt to finalise every pending order. Returns how many changed state.
     */
    public function processPending(): int
    {
        $changed = 0;
        foreach ($this->domains->pendingValidations() as $certificate) {
            $before = $certificate->status;
            $this->finalise($certificate);
            if ($certificate->status !== $before) {
                $changed++;
            }
        }

        return $changed;
    }

    /**
     * Start renewal orders for certificates inside the renewal window.
     *
     * @return list<SslCertificate> The new renewal orders.
     */
    public function renewDue(): array
    {
        $cutoff = $this->now()->addDays($this->renewalWindowDays);
        $renewals = [];

        foreach ($this->domains->certificatesDueForRenewal($cutoff) as $certificate) {
            try {
                $renewals[] = $this->order($certificate->hostedDomain, $certificate->allNames(), true, $certificate->id);
            } catch (ProvisioningException $e) {
                Log::warning('ssl.renewal_order_failed', ['certificateId' => $certificate->id, 'error' => $e->getMessage()]);
            }
        }

        return $renewals;
    }

    public function revoke(string $accountId, string $domainId, string $certificateId, string $reason, Principal $actor): SslCertificate
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $certificate = $this->domains->getCertificate($domain->id, $certificateId);

        if ($certificate->status !== CertificateStatus::Issued) {
            throw new BusinessRuleException('Only issued certificates can be revoked.', 'SSL_NOT_ISSUED');
        }

        $this->ca->revoke((string) $certificate->order_ref, $reason);
        $certificate->status = CertificateStatus::Revoked;
        $certificate->auto_renew = false;
        $certificate->save();

        Log::notice('ssl.revoked', ['certificateId' => $certificate->id, 'reason' => $reason, 'actor' => $actor->auditId()]);

        return $certificate;
    }

    public function setAutoRenew(string $accountId, string $domainId, string $certificateId, bool $autoRenew): SslCertificate
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $certificate = $this->domains->getCertificate($domain->id, $certificateId);
        $certificate->auto_renew = $autoRenew;
        $certificate->save();

        return $certificate;
    }

    /**
     * Customer-facing health of a certificate.
     *
     * @return array{state: string, daysRemaining: ?int}
     */
    public function health(SslCertificate $certificate): array
    {
        $days = $certificate->daysUntilExpiry($this->now());

        if ($certificate->status !== CertificateStatus::Issued) {
            $state = $certificate->status->value;
        } elseif ($days !== null && $days < 0) {
            $state = 'EXPIRED';
        } elseif ($days !== null && $days <= $this->renewalWindowDays) {
            $state = 'EXPIRING_SOON';
        } else {
            $state = 'VALID';
        }

        return ['state' => $state, 'daysRemaining' => $days];
    }

    /**
     * @param list<string> $sans
     * @return list<string> CN first, then sorted unique SANs.
     */
    public function normaliseNames(HostedDomain $domain, string $commonName, array $sans): array
    {
        $commonName = Hostname::normalise($commonName);
        $all = [];
        foreach ($sans as $san) {
            $san = Hostname::normalise($san);
            if ($san !== $commonName && !in_array($san, $all, true)) {
                $all[] = $san;
            }
        }
        sort($all);

        if (count($all) > $this->maxSans) {
            throw ValidationFailedException::forField('subject_alt_names', sprintf('At most %d additional names are allowed.', $this->maxSans));
        }

        $names = array_merge([$commonName], $all);
        foreach ($names as $i => $name) {
            $field = $i === 0 ? 'common_name' : 'subject_alt_names.' . ($i - 1);
            if (!Hostname::isValid($name, allowWildcard: true)) {
                throw ValidationFailedException::forField($field, 'Not a valid hostname.');
            }
            if (!Hostname::isWithinZone(ltrim($name, '*.'), $domain->name)) {
                throw ValidationFailedException::forField($field, sprintf('Names must be within %s.', $domain->name));
            }
        }

        return $names;
    }

    /**
     * @param list<string> $names
     */
    private function order(HostedDomain $domain, array $names, bool $autoRenew, ?string $renewedFromId): SslCertificate
    {
        $certificate = new SslCertificate([
            'hosted_domain_id' => $domain->id,
            'common_name' => $names[0],
            'subject_alt_names' => array_slice($names, 1),
            'status' => CertificateStatus::PendingValidation,
            'auto_renew' => $autoRenew,
            'challenges' => [],
            'renewed_from_id' => $renewedFromId,
        ]);
        $certificate->save();

        $order = $this->ca->createOrder($names, 'cert-' . $certificate->id);
        $certificate->order_ref = $order['orderRef'];
        $certificate->challenges = $order['challenges'];
        $certificate->validation_expires_at = $order['expiresAt'];
        $certificate->save();

        foreach ($order['challenges'] as $recordName => $token) {
            $this->dns->upsertSystemRecord($domain, $recordName, DnsRecordType::TXT, $token, 60);
        }

        return $certificate;
    }

    private function finalise(SslCertificate $certificate): void
    {
        $domain = $certificate->hostedDomain;

        if ($certificate->validation_expires_at !== null && $this->now()->gte($certificate->validation_expires_at)) {
            $this->fail($certificate, 'Domain validation did not complete before the order expired.');

            return;
        }

        $result = $this->ca->finalise((string) $certificate->order_ref);

        if ($result['status'] === 'valid') {
            $this->markIssued($certificate, $domain, $result);

            return;
        }

        if ($result['status'] === 'invalid') {
            $this->fail($certificate, $result['error'] ?? 'The certificate authority rejected the order.');
        }
    }

    /**
     * @param array<string, mixed> $result Finalise result from the CA.
     */
    private function markIssued(SslCertificate $certificate, HostedDomain $domain, array $result): void
    {
        $certificate->fill([
            'status' => CertificateStatus::Issued,
            'issuer' => $result['issuer'],
            'serial_number' => $result['serialNumber'],
            'not_before' => $result['notBefore'],
            'not_after' => $result['notAfter'],
        ])->save();

        $this->hosting->installCertificate((string) $domain->external_ref, (string) $certificate->order_ref);
        $this->cleanupChallenges($certificate);
        $this->retirePredecessor($certificate);

        $notAfter = $result['notAfter'] === null ? null : $result['notAfter']->toIso8601ZuluString();
        Log::info('ssl.issued', ['certificateId' => $certificate->id, 'notAfter' => $notAfter]);
    }

    private function fail(SslCertificate $certificate, string $reason): void
    {
        $certificate->status = CertificateStatus::Failed;
        $certificate->failure_reason = $reason;
        $certificate->save();
        $this->cleanupChallenges($certificate);

        Log::warning('ssl.failed', ['certificateId' => $certificate->id, 'reason' => $reason]);
    }

    private function cleanupChallenges(SslCertificate $certificate): void
    {
        foreach (array_keys($certificate->challenges ?? []) as $recordName) {
            $this->dns->removeSystemRecords($certificate->hostedDomain, $recordName, DnsRecordType::TXT);
        }
    }

    private function retirePredecessor(SslCertificate $certificate): void
    {
        if ($certificate->renewed_from_id === null) {
            return;
        }

        $previous = SslCertificate::query()->find($certificate->renewed_from_id);
        if ($previous !== null && $previous->status === CertificateStatus::Issued) {
            $previous->status = CertificateStatus::Expired;
            $previous->auto_renew = false;
            $previous->save();
        }
    }

    private function now(): CarbonImmutable
    {
        return CarbonImmutable::instance($this->clock->now())->utc();
    }
}
