<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ProvisioningStatus;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A hosted PBX extension (user seat) on an account.
 *
 * @property string             $id
 * @property string             $account_id
 * @property string             $number            Short dial number, e.g. "2001".
 * @property string             $display_name
 * @property string|null        $email
 * @property string|null        $caller_id_number_id
 * @property bool               $do_not_disturb
 * @property ProvisioningStatus $status
 * @property string|null        $external_ref
 */
class Extension extends BaseModel
{
    protected $table = 'extensions';

    protected $fillable = [
        'account_id',
        'number',
        'display_name',
        'email',
        'caller_id_number_id',
        'do_not_disturb',
        'status',
        'external_ref',
    ];

    protected $casts = [
        'status' => ProvisioningStatus::class,
        'do_not_disturb' => 'boolean',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function callerIdNumber(): BelongsTo
    {
        return $this->belongsTo(HostedNumber::class, 'caller_id_number_id');
    }

    public function forwardingRules(): HasMany
    {
        return $this->hasMany(CallForwardingRule::class);
    }

    public function voicemailBox(): HasOne
    {
        return $this->hasOne(VoicemailBox::class);
    }

    public function directNumbers(): HasMany
    {
        return $this->hasMany(HostedNumber::class);
    }
}
