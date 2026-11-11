<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string      $id
 * @property string      $extension_id
 * @property string      $pin_hash
 * @property string      $greeting_type        STANDARD | BUSY | UNAVAILABLE | NAME_ONLY
 * @property string|null $notification_email
 * @property bool        $attach_audio
 * @property bool        $delete_after_email
 * @property bool        $transcription_enabled
 * @property int         $max_message_seconds
 * @property int         $unread_count
 */
class VoicemailBox extends BaseModel
{
    public const GREETING_TYPES = ['STANDARD', 'BUSY', 'UNAVAILABLE', 'NAME_ONLY'];

    protected $table = 'voicemail_boxes';

    protected $fillable = [
        'extension_id',
        'pin_hash',
        'greeting_type',
        'notification_email',
        'attach_audio',
        'delete_after_email',
        'transcription_enabled',
        'max_message_seconds',
        'unread_count',
    ];

    protected $hidden = ['pin_hash'];

    protected $casts = [
        'attach_audio' => 'boolean',
        'delete_after_email' => 'boolean',
        'transcription_enabled' => 'boolean',
        'max_message_seconds' => 'integer',
        'unread_count' => 'integer',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function extension(): BelongsTo
    {
        return $this->belongsTo(Extension::class);
    }
}
