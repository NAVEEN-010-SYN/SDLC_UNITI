<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\VoicemailBox;
use Illuminate\Http\Request;

/**
 * The PIN hash is never returned; "pinSet" lets the portal show whether a
 * PIN exists without exposing anything derived from it.
 *
 * @property VoicemailBox $resource
 */
final class VoicemailBoxResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $box = $this->resource;

        return [
            'extensionId' => $box->extension_id,
            'enabled' => $box->exists,
            'pinSet' => $box->pin_hash !== null && $box->pin_hash !== '',
            'greetingType' => $box->greeting_type,
            'notificationEmail' => $box->notification_email,
            'attachAudio' => (bool) $box->attach_audio,
            'deleteAfterEmail' => (bool) $box->delete_after_email,
            'transcriptionEnabled' => (bool) $box->transcription_enabled,
            'maxMessageSeconds' => (int) $box->max_message_seconds,
            'unreadCount' => (int) $box->unread_count,
        ];
    }
}
