<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ProvisioningStatus;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A mail domain on the hosted email platform. Storage is pooled at domain
 * level according to the plan, plus purchased add-on blocks.
 *
 * @property string             $id
 * @property string             $account_id
 * @property string             $domain
 * @property string             $plan_code
 * @property int                $addon_blocks
 * @property bool               $mx_verified
 * @property ProvisioningStatus $status
 * @property string|null        $external_ref
 */
class EmailDomain extends BaseModel
{
    protected $table = 'email_domains';

    protected $fillable = ['account_id', 'domain', 'plan_code', 'addon_blocks', 'mx_verified', 'status', 'external_ref'];

    protected $casts = [
        'status' => ProvisioningStatus::class,
        'addon_blocks' => 'integer',
        'mx_verified' => 'boolean',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function mailboxes(): HasMany
    {
        return $this->hasMany(Mailbox::class);
    }

    public function aliases(): HasMany
    {
        return $this->hasMany(MailAlias::class);
    }
}
