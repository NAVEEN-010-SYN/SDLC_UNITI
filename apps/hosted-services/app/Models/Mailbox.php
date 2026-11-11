<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ProvisioningStatus;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string                       $id
 * @property string                       $account_id
 * @property string                       $email_domain_id
 * @property string                       $local_part
 * @property string                       $display_name
 * @property int                          $quota_mb
 * @property int                          $used_mb
 * @property \Carbon\CarbonImmutable|null $usage_synced_at
 * @property bool                         $forwarding_enabled
 * @property string|null                  $forwarding_address
 * @property bool                         $keep_forwarded_copy
 * @property ProvisioningStatus           $status
 * @property string|null                  $external_ref
 */
class Mailbox extends BaseModel
{
    protected $table = 'mailboxes';

    protected $fillable = [
        'account_id',
        'email_domain_id',
        'local_part',
        'display_name',
        'quota_mb',
        'used_mb',
        'usage_synced_at',
        'forwarding_enabled',
        'forwarding_address',
        'keep_forwarded_copy',
        'status',
        'external_ref',
    ];

    protected $casts = [
        'status' => ProvisioningStatus::class,
        'quota_mb' => 'integer',
        'used_mb' => 'integer',
        'usage_synced_at' => 'immutable_datetime',
        'forwarding_enabled' => 'boolean',
        'keep_forwarded_copy' => 'boolean',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function emailDomain(): BelongsTo
    {
        return $this->belongsTo(EmailDomain::class);
    }

    public function address(): string
    {
        return $this->local_part . '@' . $this->emailDomain->domain;
    }
}
