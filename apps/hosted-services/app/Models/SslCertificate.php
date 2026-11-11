<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\CertificateStatus;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string                $id
 * @property string                $hosted_domain_id
 * @property string                $common_name
 * @property list<string>          $subject_alt_names
 * @property CertificateStatus     $status
 * @property bool                  $auto_renew
 * @property string|null           $issuer
 * @property string|null           $serial_number
 * @property CarbonImmutable|null  $not_before
 * @property CarbonImmutable|null  $not_after
 * @property string|null           $order_ref       Certificate authority order id.
 * @property array<string, string> $challenges      FQDN => TXT token for DNS-01.
 * @property CarbonImmutable|null  $validation_expires_at
 * @property string|null           $failure_reason
 * @property string|null           $renewed_from_id
 */
class SslCertificate extends BaseModel
{
    protected $table = 'ssl_certificates';

    protected $fillable = [
        'hosted_domain_id',
        'common_name',
        'subject_alt_names',
        'status',
        'auto_renew',
        'issuer',
        'serial_number',
        'not_before',
        'not_after',
        'order_ref',
        'challenges',
        'validation_expires_at',
        'failure_reason',
        'renewed_from_id',
    ];

    protected $casts = [
        'status' => CertificateStatus::class,
        'subject_alt_names' => 'array',
        'challenges' => 'array',
        'auto_renew' => 'boolean',
        'not_before' => 'immutable_datetime',
        'not_after' => 'immutable_datetime',
        'validation_expires_at' => 'immutable_datetime',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function hostedDomain(): BelongsTo
    {
        return $this->belongsTo(HostedDomain::class);
    }

    /**
     * Every name the certificate covers (CN first, de-duplicated).
     *
     * @return list<string>
     */
    public function allNames(): array
    {
        return array_values(array_unique([$this->common_name, ...($this->subject_alt_names ?? [])]));
    }

    public function daysUntilExpiry(CarbonImmutable $now): ?int
    {
        return $this->not_after === null ? null : (int) floor($now->diffInDays($this->not_after, false));
    }
}
