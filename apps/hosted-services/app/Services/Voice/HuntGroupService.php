<?php

declare(strict_types=1);

namespace App\Services\Voice;

use App\Clients\VoicePlatformClient;
use App\Enums\HuntGroupStrategy;
use App\Enums\ProvisioningStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ValidationFailedException;
use App\Models\Extension;
use App\Models\HuntGroup;
use App\Repositories\ExtensionRepository;
use App\Repositories\HostedNumberRepository;
use App\Repositories\HuntGroupRepository;
use App\Support\Page;
use App\Support\PhoneNumber;
use App\Support\Principal;
use Illuminate\Support\Facades\Log;

/**
 * Hunt (ring) groups: membership, strategy and overflow handling.
 */
final class HuntGroupService
{
    public function __construct(
        private readonly HuntGroupRepository $groups,
        private readonly ExtensionRepository $extensions,
        private readonly HostedNumberRepository $numbers,
        private readonly DialPlanPolicy $dialPlan,
        private readonly VoicePlatformClient $voice,
        private readonly int $maxMembers = 32,
        private readonly int $ringSecondsMin = 5,
        private readonly int $ringSecondsMax = 120,
    ) {
    }

    /**
     * @return Page<HuntGroup>
     */
    public function list(string $accountId, int $page, int $pageSize): Page
    {
        return $this->groups->list($accountId, $page, $pageSize);
    }

    public function get(string $accountId, string $groupId): HuntGroup
    {
        return $this->groups->getForAccount($accountId, $groupId)->load('members.extension');
    }

    /**
     * @param array{name: string, pilot_extension: string, pilot_number_id?: ?string, strategy: string,
     *              ring_seconds: int, no_answer_type: string, no_answer_destination?: ?string,
     *              members: list<array{extension_id: string, ring_seconds?: ?int}>} $data
     */
    public function create(string $accountId, array $data, Principal $actor): HuntGroup
    {
        $this->dialPlan->assertAvailable($data['pilot_extension'], $this->extensions->dialPlanNumbers($accountId), 'pilot_extension');

        $group = new HuntGroup(['account_id' => $accountId, 'status' => ProvisioningStatus::Pending]);
        $saved = $this->apply($accountId, $group, $data);

        Log::info('voice.hunt_group_created', ['huntGroupId' => $saved->id, 'actor' => $actor->auditId()]);

        return $saved;
    }

    /**
     * Full replacement update (PUT semantics). The pilot extension may be
     * changed only to another free dial plan number.
     *
     * @param array<string, mixed> $data Same shape as create().
     */
    public function update(string $accountId, string $groupId, array $data): HuntGroup
    {
        $group = $this->groups->getForAccount($accountId, $groupId);

        if ($data['pilot_extension'] !== $group->pilot_extension) {
            $inUse = array_values(array_diff($this->extensions->dialPlanNumbers($accountId), [$group->pilot_extension]));
            $this->dialPlan->assertAvailable($data['pilot_extension'], $inUse, 'pilot_extension');
        }

        return $this->apply($accountId, $group, $data);
    }

    public function delete(string $accountId, string $groupId, Principal $actor): void
    {
        $group = $this->groups->getForAccount($accountId, $groupId);
        $this->voice->deleteHuntGroup($group->id);
        $group->status = ProvisioningStatus::Deprovisioned;
        $group->pilot_number_id = null;
        $this->groups->save($group);

        Log::info('voice.hunt_group_deleted', ['huntGroupId' => $group->id, 'actor' => $actor->auditId()]);
    }

    /**
     * Expected worst-case time a caller waits before overflow, which the
     * portal shows next to the configuration.
     *
     * @param list<int> $memberRingSeconds
     */
    public static function maxWaitSeconds(HuntGroupStrategy $strategy, int $groupRingSeconds, array $memberRingSeconds): int
    {
        if ($memberRingSeconds === []) {
            return 0;
        }

        return match ($strategy) {
            HuntGroupStrategy::Simultaneous => $groupRingSeconds,
            default => array_sum($memberRingSeconds),
        };
    }

    /**
     * @param array<string, mixed> $data
     */
    private function apply(string $accountId, HuntGroup $group, array $data): HuntGroup
    {
        $strategy = HuntGroupStrategy::tryFrom((string) $data['strategy'])
            ?? throw ValidationFailedException::forField('strategy', 'Unknown hunt group strategy.');

        $ringSeconds = (int) $data['ring_seconds'];
        $this->assertRingSeconds('ring_seconds', $ringSeconds);

        $members = $this->resolveMembers($accountId, $data['members'] ?? [], $strategy, $ringSeconds);
        [$noAnswerType, $noAnswerDestination] = $this->resolveNoAnswer($accountId, $data, $group->pilot_extension);

        $pilotNumberRef = null;
        $pilotNumberId = $data['pilot_number_id'] ?? null;
        if ($pilotNumberId !== null) {
            $number = $this->numbers->getForAccount($accountId, $pilotNumberId);
            if ($number->isAssigned()) {
                throw new BusinessRuleException('The pilot number is already routed to an extension.', 'VOICE_PILOT_NUMBER_ASSIGNED');
            }
            $pilotNumberRef = $number->external_ref;
        }

        $group->fill([
            'name' => trim((string) $data['name']),
            'pilot_extension' => $data['pilot_extension'],
            'pilot_number_id' => $pilotNumberId,
            'strategy' => $strategy,
            'ring_seconds' => $ringSeconds,
            'no_answer_type' => $noAnswerType,
            'no_answer_destination' => $noAnswerDestination,
        ]);

        $saved = $this->groups->saveWithMembers($group, array_map(
            static fn (array $m) => ['extension_id' => $m['extension']->id, 'ring_seconds' => $m['ring_seconds']],
            $members,
        ));

        $this->voice->upsertHuntGroup($saved, array_map(
            static fn (array $m) => [
                'extensionRef' => (string) $m['extension']->external_ref,
                'ringSeconds' => $m['ring_seconds'] ?? $ringSeconds,
            ],
            $members,
        ), $pilotNumberRef);

        $saved->status = ProvisioningStatus::Active;

        return $this->groups->save($saved);
    }

    /**
     * @param list<array{extension_id: string, ring_seconds?: ?int}> $input
     * @return list<array{extension: Extension, ring_seconds: ?int}>
     */
    private function resolveMembers(string $accountId, array $input, HuntGroupStrategy $strategy, int $groupRingSeconds): array
    {
        if ($input === []) {
            throw new BusinessRuleException('A hunt group needs at least one member.', 'VOICE_HUNT_GROUP_EMPTY');
        }
        if (count($input) > $this->maxMembers) {
            throw new BusinessRuleException(
                sprintf('A hunt group may have at most %d members.', $this->maxMembers),
                'VOICE_HUNT_GROUP_TOO_LARGE',
            );
        }

        $resolved = [];
        $seen = [];
        foreach ($input as $i => $member) {
            $id = (string) $member['extension_id'];
            if (isset($seen[$id])) {
                throw ValidationFailedException::forField("members.$i.extension_id", 'An extension may appear only once.');
            }
            $seen[$id] = true;

            $extension = $this->extensions->getForAccount($accountId, $id);
            if ($extension->status !== ProvisioningStatus::Active) {
                throw ValidationFailedException::forField("members.$i.extension_id", 'Only active extensions can join a hunt group.');
            }

            $ring = isset($member['ring_seconds']) ? (int) $member['ring_seconds'] : null;
            if ($ring !== null) {
                if ($strategy === HuntGroupStrategy::Simultaneous) {
                    throw ValidationFailedException::forField(
                        "members.$i.ring_seconds",
                        'Per-member ring time does not apply to simultaneous ringing.',
                    );
                }
                $this->assertRingSeconds("members.$i.ring_seconds", $ring);
            }

            $resolved[] = ['extension' => $extension, 'ring_seconds' => $ring];
        }

        $wait = self::maxWaitSeconds(
            $strategy,
            $groupRingSeconds,
            array_map(static fn (array $m) => $m['ring_seconds'] ?? $groupRingSeconds, $resolved),
        );
        if ($wait > 600) {
            throw new BusinessRuleException(
                sprintf('Callers could wait %d seconds before overflow; reduce ring times to keep it under 10 minutes.', $wait),
                'VOICE_HUNT_GROUP_WAIT_TOO_LONG',
            );
        }

        return $resolved;
    }

    /**
     * @param array<string, mixed> $data
     * @return array{0: string, 1: ?string}
     */
    private function resolveNoAnswer(string $accountId, array $data, ?string $currentPilot): array
    {
        $type = (string) $data['no_answer_type'];
        $destination = isset($data['no_answer_destination']) ? trim((string) $data['no_answer_destination']) : null;

        switch ($type) {
            case 'DISCONNECT':
            case 'VOICEMAIL':
                return [$type, null];

            case 'EXTENSION':
                if ($destination === null || $destination === $data['pilot_extension'] || $destination === $currentPilot) {
                    throw ValidationFailedException::forField('no_answer_destination', 'Overflow cannot route back to the hunt group itself.');
                }
                if ($this->extensions->findByNumber($accountId, $destination) === null
                    && !in_array($destination, $this->extensions->dialPlanNumbers($accountId), true)) {
                    throw ValidationFailedException::forField('no_answer_destination', 'Overflow extension does not exist.');
                }

                return [$type, $destination];

            case 'EXTERNAL':
                $number = $destination === null ? null : PhoneNumber::tryParse($destination);
                if ($number === null || $number->isPremiumRate()) {
                    throw ValidationFailedException::forField('no_answer_destination', 'Overflow must be a valid, non premium-rate number.');
                }

                return [$type, $number->e164];

            default:
                throw ValidationFailedException::forField('no_answer_type', 'Unknown overflow type.');
        }
    }

    private function assertRingSeconds(string $field, int $seconds): void
    {
        if ($seconds < $this->ringSecondsMin || $seconds > $this->ringSecondsMax) {
            throw ValidationFailedException::forField(
                $field,
                sprintf('Ring time must be between %d and %d seconds.', $this->ringSecondsMin, $this->ringSecondsMax),
            );
        }
    }
}
