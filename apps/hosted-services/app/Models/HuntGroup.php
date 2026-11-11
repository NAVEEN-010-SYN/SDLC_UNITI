<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\HuntGroupStrategy;
use App\Enums\ProvisioningStatus;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A ring group reachable by a pilot extension and optionally a DID.
 *
 * @property string             $id
 * @property string             $account_id
 * @property string             $name
 * @property string             $pilot_extension
 * @property string|null        $pilot_number_id
 * @property HuntGroupStrategy  $strategy
 * @property int                $ring_seconds
 * @property string             $no_answer_type     VOICEMAIL | EXTENSION | EXTERNAL | DISCONNECT
 * @property string|null        $no_answer_destination
 * @property ProvisioningStatus $status
 */
class HuntGroup extends BaseModel
{
    public const NO_ANSWER_TYPES = ['VOICEMAIL', 'EXTENSION', 'EXTERNAL', 'DISCONNECT'];

    protected $table = 'hunt_groups';

    protected $fillable = [
        'account_id',
        'name',
        'pilot_extension',
        'pilot_number_id',
        'strategy',
        'ring_seconds',
        'no_answer_type',
        'no_answer_destination',
        'status',
    ];

    protected $casts = [
        'strategy' => HuntGroupStrategy::class,
        'status' => ProvisioningStatus::class,
        'ring_seconds' => 'integer',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function members(): HasMany
    {
        return $this->hasMany(HuntGroupMember::class)->orderBy('position');
    }

    public function pilotNumber(): BelongsTo
    {
        return $this->belongsTo(HostedNumber::class, 'pilot_number_id');
    }
}
