<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string   $id
 * @property string   $hunt_group_id
 * @property string   $extension_id
 * @property int      $position
 * @property int|null $ring_seconds  Overrides the group default when set.
 */
class HuntGroupMember extends BaseModel
{
    protected $table = 'hunt_group_members';

    protected $fillable = ['hunt_group_id', 'extension_id', 'position', 'ring_seconds'];

    protected $casts = [
        'position' => 'integer',
        'ring_seconds' => 'integer',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function huntGroup(): BelongsTo
    {
        return $this->belongsTo(HuntGroup::class);
    }

    public function extension(): BelongsTo
    {
        return $this->belongsTo(Extension::class);
    }
}
