<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\PortingStatus;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only audit trail of porting status changes.
 *
 * @property string                  $id
 * @property string                  $porting_request_id
 * @property PortingStatus|null      $from_status
 * @property PortingStatus           $to_status
 * @property string                  $actor        Subject id or "carrier".
 * @property string|null             $note
 * @property \Carbon\CarbonImmutable $occurred_at
 */
class PortingEvent extends BaseModel
{
    public const UPDATED_AT = null;

    protected $table = 'porting_events';

    protected $fillable = ['porting_request_id', 'from_status', 'to_status', 'actor', 'note', 'occurred_at'];

    protected $casts = [
        'from_status' => PortingStatus::class,
        'to_status' => PortingStatus::class,
        'occurred_at' => 'immutable_datetime',
        'created_at' => 'immutable_datetime',
    ];

    public function portingRequest(): BelongsTo
    {
        return $this->belongsTo(PortingRequest::class);
    }
}
