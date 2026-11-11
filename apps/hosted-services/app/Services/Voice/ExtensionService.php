<?php

declare(strict_types=1);

namespace App\Services\Voice;

use App\Clients\VoicePlatformClient;
use App\Enums\ProvisioningStatus;
use App\Exceptions\BusinessRuleException;
use App\Models\CallForwardingRule;
use App\Models\Extension;
use App\Repositories\ExtensionRepository;
use App\Repositories\HostedNumberRepository;
use App\Repositories\HuntGroupRepository;
use App\Support\Page;
use App\Support\Principal;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Extension lifecycle and call forwarding configuration.
 */
final class ExtensionService
{
    public function __construct(
        private readonly ExtensionRepository $extensions,
        private readonly HostedNumberRepository $numbers,
        private readonly HuntGroupRepository $huntGroups,
        private readonly DialPlanPolicy $dialPlan,
        private readonly ForwardingRuleValidator $forwardingValidator,
        private readonly VoicePlatformClient $voice,
    ) {
    }

    /**
     * @return Page<Extension>
     */
    public function list(string $accountId, int $page, int $pageSize, ?string $query): Page
    {
        return $this->extensions->search($accountId, $page, $pageSize, $query);
    }

    public function get(string $accountId, string $extensionId): Extension
    {
        return $this->extensions->getForAccount($accountId, $extensionId);
    }

    /**
     * @param array{number?: ?string, display_name: string, email?: ?string, caller_id_number_id?: ?string} $data
     */
    public function create(string $accountId, array $data, Principal $actor): Extension
    {
        $inUse = $this->extensions->dialPlanNumbers($accountId);
        $number = $data['number'] ?? null;
        if ($number === null || $number === '') {
            $number = $this->dialPlan->suggest($inUse, 4);
            if ($number === null) {
                throw new BusinessRuleException('No free extension numbers remain.', 'VOICE_DIAL_PLAN_FULL');
            }
        } else {
            $this->dialPlan->assertAvailable($number, $inUse);
        }

        $callerIdNumberId = $data['caller_id_number_id'] ?? null;
        if ($callerIdNumberId !== null) {
            $this->assertCallerIdUsable($accountId, $callerIdNumberId);
        }

        $extension = new Extension([
            'account_id' => $accountId,
            'number' => $number,
            'display_name' => $data['display_name'],
            'email' => $data['email'] ?? null,
            'caller_id_number_id' => $callerIdNumberId,
            'do_not_disturb' => false,
            'status' => ProvisioningStatus::Pending,
        ]);
        $this->extensions->save($extension);

        $extension->external_ref = $this->voice->createExtension($extension);
        $extension->status = ProvisioningStatus::Active;
        $this->extensions->save($extension);

        Log::info('voice.extension_created', ['extensionId' => $extension->id, 'number' => $number, 'actor' => $actor->auditId()]);

        return $extension;
    }

    /**
     * @param array{display_name?: string, email?: ?string, caller_id_number_id?: ?string, do_not_disturb?: bool} $changes
     */
    public function update(string $accountId, string $extensionId, array $changes): Extension
    {
        $extension = $this->extensions->getForAccount($accountId, $extensionId);

        if (array_key_exists('caller_id_number_id', $changes) && $changes['caller_id_number_id'] !== null) {
            $this->assertCallerIdUsable($accountId, $changes['caller_id_number_id']);
        }

        $extension->fill(array_intersect_key($changes, array_flip(['display_name', 'email', 'caller_id_number_id', 'do_not_disturb'])));
        $callerId = $extension->caller_id_number_id === null
            ? null
            : $this->numbers->getForAccount($accountId, $extension->caller_id_number_id)->e164;

        $this->voice->updateExtension($extension, $callerId);

        return $this->extensions->save($extension);
    }

    public function delete(string $accountId, string $extensionId, Principal $actor): void
    {
        $extension = $this->extensions->getForAccount($accountId, $extensionId);

        $groups = $this->huntGroups->groupNamesContaining($extension->id);
        if ($groups !== []) {
            throw new BusinessRuleException(
                'Remove the extension from its hunt groups first: ' . implode(', ', $groups) . '.',
                'VOICE_EXTENSION_IN_HUNT_GROUP',
                ['huntGroups' => $groups],
            );
        }

        $forwardedFrom = $this->extensionsForwardingTo($accountId, $extension->number);
        if ($forwardedFrom !== []) {
            throw new BusinessRuleException(
                'Other extensions forward calls to this one: ' . implode(', ', $forwardedFrom) . '.',
                'VOICE_EXTENSION_IS_FORWARD_TARGET',
                ['extensions' => $forwardedFrom],
            );
        }

        $this->voice->deleteExtension((string) $extension->external_ref);

        DB::transaction(function () use ($extension): void {
            $this->numbers->unassignAllFrom($extension->id);
            CallForwardingRule::query()->where('extension_id', $extension->id)->delete();
            $extension->status = ProvisioningStatus::Deprovisioned;
            $this->extensions->save($extension);
        });

        Log::info('voice.extension_deleted', ['extensionId' => $extension->id, 'actor' => $actor->auditId()]);
    }

    /**
     * @return list<CallForwardingRule>
     */
    public function forwardingRules(string $accountId, string $extensionId): array
    {
        $extension = $this->extensions->getForAccount($accountId, $extensionId);

        return $this->extensions->forwardingRules($extension->id);
    }

    /**
     * Replace the extension's forwarding rules as a set.
     *
     * @param list<array<string, mixed>> $rules
     * @return list<CallForwardingRule>
     */
    public function replaceForwardingRules(string $accountId, string $extensionId, array $rules): array
    {
        $extension = $this->extensions->getForAccount($accountId, $extensionId);

        $normalised = $this->forwardingValidator->validate(
            $rules,
            $extension->number,
            $this->extensions->dialPlanNumbers($accountId),
            $this->extensions->internalForwardingGraph($accountId),
        );

        $this->extensions->replaceForwardingRules($extension->id, $normalised);
        $saved = $this->extensions->forwardingRules($extension->id);
        $this->voice->replaceForwardingRules((string) $extension->external_ref, $saved);

        return $saved;
    }

    /**
     * @return list<string> Numbers of extensions that forward to $number.
     */
    private function extensionsForwardingTo(string $accountId, string $number): array
    {
        $query = CallForwardingRule::query()
            ->join('extensions', 'extensions.id', '=', 'call_forwarding_rules.extension_id')
            ->where('extensions.account_id', $accountId)
            ->where('call_forwarding_rules.destination_type', CallForwardingRule::DEST_EXTENSION)
            ->where('call_forwarding_rules.destination', $number);

        return $query->pluck('extensions.number')->all();
    }

    private function assertCallerIdUsable(string $accountId, string $numberId): void
    {
        $number = $this->numbers->getForAccount($accountId, $numberId);
        if (!$number->canBeOutboundCallerId()) {
            throw new BusinessRuleException(
                'A number can be used as caller id only once it is active and its E911 address is verified.',
                'VOICE_CALLER_ID_NOT_ELIGIBLE',
            );
        }
    }
}
