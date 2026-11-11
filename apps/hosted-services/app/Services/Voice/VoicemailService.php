<?php

declare(strict_types=1);

namespace App\Services\Voice;

use App\Clients\VoicePlatformClient;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ValidationFailedException;
use App\Models\VoicemailBox;
use App\Repositories\ExtensionRepository;
use App\Repositories\HostedNumberRepository;

/**
 * Voicemail box settings per extension. PINs are stored only as hashes and
 * pushed to the platform in clear exactly once, at the time of change.
 */
final class VoicemailService
{
    public function __construct(
        private readonly ExtensionRepository $extensions,
        private readonly HostedNumberRepository $numbers,
        private readonly VoicemailPinPolicy $pinPolicy,
        private readonly VoicePlatformClient $voice,
        private readonly int $maxMessageSeconds = 300,
    ) {
    }

    public function get(string $accountId, string $extensionId): VoicemailBox
    {
        $extension = $this->extensions->getForAccount($accountId, $extensionId);
        $box = $extension->voicemailBox;
        if ($box === null) {
            throw new BusinessRuleException('Voicemail is not enabled on this extension.', 'VOICE_VOICEMAIL_DISABLED');
        }

        return $box;
    }

    /**
     * Create or update the voicemail box.
     *
     * @param array{pin?: string, greeting_type?: string, notification_email?: ?string, attach_audio?: bool,
     *              delete_after_email?: bool, transcription_enabled?: bool, max_message_seconds?: int} $settings
     */
    public function configure(string $accountId, string $extensionId, array $settings): VoicemailBox
    {
        $extension = $this->extensions->getForAccount($accountId, $extensionId);
        $box = $extension->voicemailBox ?? new VoicemailBox([
            'extension_id' => $extension->id,
            'greeting_type' => 'STANDARD',
            'attach_audio' => true,
            'delete_after_email' => false,
            'transcription_enabled' => false,
            'max_message_seconds' => 120,
            'unread_count' => 0,
        ]);

        $isNew = !$box->exists;
        if ($isNew && !isset($settings['pin'])) {
            throw ValidationFailedException::forField('pin', 'A PIN is required when enabling voicemail.');
        }

        $platformPayload = [];
        if (isset($settings['pin'])) {
            $forbidden = [$extension->number];
            foreach ($this->numbers->assignedTo($extension->id) as $did) {
                $forbidden[] = substr($did->e164, -7);
            }
            $this->pinPolicy->assertAcceptable($settings['pin'], $forbidden);
            $box->pin_hash = $this->pinPolicy->hash($settings['pin']);
            $platformPayload['pin'] = $settings['pin'];
        }

        if (isset($settings['greeting_type']) && !in_array($settings['greeting_type'], VoicemailBox::GREETING_TYPES, true)) {
            throw ValidationFailedException::forField('greeting_type', 'Unknown greeting type.');
        }

        if (isset($settings['max_message_seconds'])
            && ($settings['max_message_seconds'] < 30 || $settings['max_message_seconds'] > $this->maxMessageSeconds)) {
            throw ValidationFailedException::forField(
                'max_message_seconds',
                sprintf('Maximum message length must be between 30 and %d seconds.', $this->maxMessageSeconds),
            );
        }

        $box->fill(array_intersect_key($settings, array_flip([
            'greeting_type',
            'notification_email',
            'attach_audio',
            'delete_after_email',
            'transcription_enabled',
            'max_message_seconds',
        ])));

        if ($box->delete_after_email && ($box->notification_email === null || !$box->attach_audio)) {
            throw new BusinessRuleException(
                'Messages can be deleted after emailing only when they are emailed with the audio attached.',
                'VOICE_VOICEMAIL_DELETE_WITHOUT_COPY',
            );
        }

        $this->voice->configureVoicemail((string) $extension->external_ref, $platformPayload + [
            'enabled' => true,
            'greetingType' => $box->greeting_type,
            'notificationEmail' => $box->notification_email,
            'attachAudio' => $box->attach_audio,
            'deleteAfterEmail' => $box->delete_after_email,
            'transcription' => $box->transcription_enabled,
            'maxMessageSeconds' => $box->max_message_seconds,
        ]);

        $box->save();

        return $box;
    }

    public function disable(string $accountId, string $extensionId): void
    {
        $extension = $this->extensions->getForAccount($accountId, $extensionId);
        $box = $extension->voicemailBox;
        if ($box === null) {
            return;
        }

        $forwardsToVoicemail = $extension->forwardingRules()
            ->where('destination_type', 'VOICEMAIL')
            ->where('enabled', true)
            ->exists();
        if ($forwardsToVoicemail) {
            throw new BusinessRuleException(
                'Call forwarding rules send calls to voicemail; change them before disabling voicemail.',
                'VOICE_VOICEMAIL_IN_USE',
            );
        }

        $this->voice->configureVoicemail((string) $extension->external_ref, ['enabled' => false]);
        $box->delete();
    }
}
