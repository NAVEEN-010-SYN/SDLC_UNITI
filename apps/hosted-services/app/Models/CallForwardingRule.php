<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ForwardingCondition;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string              $id
 * @property string              $extension_id
 * @property ForwardingCondition $condition
 * @property string              $destination_type  EXTENSION | EXTERNAL | VOICEMAIL
 * @property string|null         $destination       Extension number or E.164.
 * @property int|null            $ring_seconds      Only for NO_ANSWER.
 * @property bool                $enabled
 */
class CallForwardingRule extends BaseModel
{
    public const DEST_EXTENSION = 'EXTENSION';
    public const DEST_EXTERNAL = 'EXTERNAL';
    public const DEST_VOICEMAIL = 'VOICEMAIL';

    public const DESTINATION_TYPES = [self::DEST_EXTENSION, self::DEST_EXTERNAL, self::DEST_VOICEMAIL];

    protected $table = 'call_forwarding_rules';

    protected $fillable = [
        'extension_id',
        'condition',
        'destination_type',
        'destination',
        'ring_seconds',
        'enabled',
    ];

    protected $casts = [
        'condition' => ForwardingCondition::class,
        'ring_seconds' => 'integer',
        'enabled' => 'boolean',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function extension(): BelongsTo
    {
        return $this->belongsTo(Extension::class);
    }
}
