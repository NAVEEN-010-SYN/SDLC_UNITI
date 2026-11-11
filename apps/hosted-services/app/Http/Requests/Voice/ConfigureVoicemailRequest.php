<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Http\Requests\ApiFormRequest;
use App\Models\VoicemailBox;
use Illuminate\Validation\Rule;

/**
 * PUT /extensions/{id}/voicemail. The PIN is accepted as a string so that
 * leading zeros survive; strength rules are applied by VoicemailPinPolicy.
 */
final class ConfigureVoicemailRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'pin' => ['sometimes', 'string', 'regex:/^\d+$/', 'max:16'],
            'greeting_type' => ['sometimes', Rule::in(VoicemailBox::GREETING_TYPES)],
            'notification_email' => ['sometimes', 'nullable', 'string', 'email:rfc', 'max:254'],
            'attach_audio' => ['sometimes', 'boolean'],
            'delete_after_email' => ['sometimes', 'boolean'],
            'transcription_enabled' => ['sometimes', 'boolean'],
            'max_message_seconds' => ['sometimes', 'integer'],
        ];
    }
}
