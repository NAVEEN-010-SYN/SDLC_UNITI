<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\SslCertificate;
use App\Services\Hosting\SslCertificateService;
use Illuminate\Http\Request;

/**
 * While validation is pending the DNS-01 challenge records are exposed so
 * customers whose zone is not hosted with Uniti can publish them manually.
 *
 * @property SslCertificate $resource
 */
final class SslCertificateResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $certificate = $this->resource;
        $pending = !$certificate->status->isActive() && $certificate->validation_expires_at !== null;

        return [
            'id' => $certificate->id,
            'commonName' => $certificate->common_name,
            'subjectAltNames' => array_values($certificate->subject_alt_names),
            'status' => $certificate->status->value,
            'health' => app(SslCertificateService::class)->health($certificate),
            'autoRenew' => (bool) $certificate->auto_renew,
            'issuer' => $certificate->issuer,
            'serialNumber' => $certificate->serial_number,
            'notBefore' => self::iso($certificate->not_before),
            'notAfter' => self::iso($certificate->not_after),
            'validation' => $pending ? [
                'expiresAt' => self::iso($certificate->validation_expires_at),
                'challenges' => array_map(
                    static fn (string $fqdn, string $token) => ['name' => $fqdn, 'type' => 'TXT', 'value' => $token],
                    array_keys($certificate->challenges ?? []),
                    array_values($certificate->challenges ?? []),
                ),
            ] : null,
            'failureReason' => $certificate->failure_reason,
            'renewedFromId' => $certificate->renewed_from_id,
        ];
    }
}
