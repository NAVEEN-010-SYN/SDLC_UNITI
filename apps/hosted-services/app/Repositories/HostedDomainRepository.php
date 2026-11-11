<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\CertificateStatus;
use App\Enums\DnsRecordType;
use App\Enums\ProvisioningStatus;
use App\Exceptions\ResourceNotFoundException;
use App\Models\DnsRecord;
use App\Models\HostedDomain;
use App\Models\SslCertificate;
use App\Services\Dns\DnsRecordData;
use App\Support\Page;
use Carbon\CarbonImmutable;

/**
 * Web hosting domains plus their DNS records and certificates, which are
 * always accessed through the owning domain.
 *
 * @extends AccountScopedRepository<HostedDomain>
 */
class HostedDomainRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return HostedDomain::class;
    }

    protected function resourceName(): string
    {
        return 'Domain';
    }

    /**
     * @return Page<HostedDomain>
     */
    public function list(string $accountId, int $page, int $pageSize): Page
    {
        $query = $this->forAccount($accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->orderBy('name');

        return $this->paginate($query, $page, $pageSize);
    }

    public function nameExists(string $name): bool
    {
        return $this->query()
            ->where('name', $name)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->exists();
    }

    /**
     * @return Page<DnsRecord>
     */
    public function records(string $domainId, int $page, int $pageSize, ?DnsRecordType $type = null): Page
    {
        $query = DnsRecord::query()->where('hosted_domain_id', $domainId)->orderBy('name')->orderBy('type');
        if ($type !== null) {
            $query->where('type', $type->value);
        }
        $total = (clone $query)->count();

        return new Page($query->forPage($page, $pageSize)->get()->all(), $page, $pageSize, $total);
    }

    /**
     * @return list<DnsRecordData>
     */
    public function recordData(string $domainId): array
    {
        return DnsRecord::query()
            ->where('hosted_domain_id', $domainId)
            ->get()
            ->map(static fn (DnsRecord $r) => DnsRecordData::fromModel($r))
            ->all();
    }

    public function getRecord(string $domainId, string $recordId): DnsRecord
    {
        $record = DnsRecord::query()->where('hosted_domain_id', $domainId)->whereKey($recordId)->first();
        if ($record === null) {
            throw ResourceNotFoundException::of('DNS record', $recordId);
        }

        return $record;
    }

    public function deleteRecordsByName(string $domainId, string $name, DnsRecordType $type): int
    {
        return DnsRecord::query()
            ->where('hosted_domain_id', $domainId)
            ->where('name', $name)
            ->where('type', $type->value)
            ->delete();
    }

    /**
     * @return list<SslCertificate>
     */
    public function certificates(string $domainId): array
    {
        return SslCertificate::query()
            ->where('hosted_domain_id', $domainId)
            ->orderByDesc('created_at')
            ->get()
            ->all();
    }

    public function getCertificate(string $domainId, string $certificateId): SslCertificate
    {
        $certificate = SslCertificate::query()->where('hosted_domain_id', $domainId)->whereKey($certificateId)->first();
        if ($certificate === null) {
            throw ResourceNotFoundException::of('Certificate', $certificateId);
        }

        return $certificate;
    }

    /**
     * Issued, auto-renewing certificates expiring before the cut-off that
     * do not yet have a renewal in flight.
     *
     * @return list<SslCertificate>
     */
    public function certificatesDueForRenewal(CarbonImmutable $before): array
    {
        $inFlight = SslCertificate::query()
            ->whereNotNull('renewed_from_id')
            ->whereIn('status', [CertificateStatus::PendingValidation->value, CertificateStatus::Issued->value])
            ->select('renewed_from_id');

        return SslCertificate::query()
            ->where('status', CertificateStatus::Issued->value)
            ->where('auto_renew', true)
            ->where('not_after', '<', $before)
            ->whereNotIn('id', $inFlight)
            ->with('hostedDomain')
            ->get()
            ->all();
    }

    /**
     * @return list<SslCertificate>
     */
    public function pendingValidations(): array
    {
        return SslCertificate::query()
            ->where('status', CertificateStatus::PendingValidation->value)
            ->with('hostedDomain')
            ->get()
            ->all();
    }
}
