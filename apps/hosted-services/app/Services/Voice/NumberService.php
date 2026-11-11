<?php

declare(strict_types=1);

namespace App\Services\Voice;

use App\Clients\VoicePlatformClient;
use App\Enums\ProvisioningStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ConflictException;
use App\Exceptions\ProvisioningException;
use App\Exceptions\ValidationFailedException;
use App\Models\Extension;
use App\Models\HostedNumber;
use App\Models\HuntGroup;
use App\Repositories\ExtensionRepository;
use App\Repositories\HostedNumberRepository;
use App\Support\Page;
use App\Support\PhoneNumber;
use App\Support\Principal;
use Illuminate\Support\Facades\Log;

/**
 * DID inventory for hosted voice: search, order, assign and release numbers.
 */
final class NumberService
{
    private const MAX_ORDER_QUANTITY = 20;

    public function __construct(
        private readonly HostedNumberRepository $numbers,
        private readonly ExtensionRepository $extensions,
        private readonly VoicePlatformClient $voice,
    ) {
    }

    /**
     * @return Page<HostedNumber>
     */
    public function list(string $accountId, int $page, int $pageSize, ?string $status, ?bool $assigned, ?string $contains): Page
    {
        return $this->numbers->search($accountId, $page, $pageSize, $status, $assigned, $contains);
    }

    public function get(string $accountId, string $numberId): HostedNumber
    {
        return $this->numbers->getForAccount($accountId, $numberId);
    }

    /**
     * @return list<string>
     */
    public function searchAvailable(string $accountId, string $npa, int $quantity): array
    {
        if (preg_match('/^[2-9]\d{2}$/', $npa) !== 1) {
            throw ValidationFailedException::forField('npa', 'Area code must be three digits starting 2-9.');
        }

        return $this->voice->searchAvailableNumbers($accountId, $npa, min(max(1, $quantity), self::MAX_ORDER_QUANTITY));
    }

    /**
     * Activate previously reserved numbers on the account. Each number is
     * activated independently so a partial failure leaves the successful
     * ones usable; the result reports both lists.
     *
     * @param list<string> $requested
     * @return array{activated: list<HostedNumber>, failed: list<array{number: string, reason: string}>}
     */
    public function order(string $accountId, array $requested, Principal $actor): array
    {
        if ($requested === [] || count($requested) > self::MAX_ORDER_QUANTITY) {
            throw new BusinessRuleException(
                sprintf('Order between 1 and %d numbers at a time.', self::MAX_ORDER_QUANTITY),
                'VOICE_ORDER_QUANTITY',
            );
        }

        $e164s = [];
        foreach ($requested as $i => $raw) {
            $number = PhoneNumber::tryParse($raw);
            if ($number === null || !$number->isNanp()) {
                throw ValidationFailedException::forField("numbers.$i", 'Not a valid North American number.');
            }
            $e164s[] = $number->e164;
        }

        $taken = $this->numbers->existingNumbers($e164s);
        if ($taken !== []) {
            throw new ConflictException('Some numbers are already in service.', ['numbers' => $taken]);
        }

        $activated = [];
        $failed = [];
        foreach (array_unique($e164s) as $e164) {
            try {
                $ref = $this->voice->activateNumber($accountId, $e164);
                $activated[] = $this->numbers->save(new HostedNumber([
                    'account_id' => $accountId,
                    'e164' => $e164,
                    'status' => ProvisioningStatus::Active,
                    'external_ref' => $ref,
                    'emergency_address_verified' => false,
                ]));
            } catch (ProvisioningException $e) {
                $failed[] = ['number' => $e164, 'reason' => $e->getMessage()];
            }
        }

        Log::info('voice.numbers_ordered', [
            'accountId' => $accountId,
            'activated' => count($activated),
            'failed' => count($failed),
            'actor' => $actor->auditId(),
        ]);

        return ['activated' => $activated, 'failed' => $failed];
    }

    /**
     * @param array{label?: ?string, extension_id?: ?string, emergency_address_verified?: bool} $changes
     */
    public function update(string $accountId, string $numberId, array $changes): HostedNumber
    {
        $number = $this->numbers->getForAccount($accountId, $numberId);
        $this->assertUsable($number);

        if (array_key_exists('label', $changes)) {
            $number->label = $changes['label'];
        }

        if (array_key_exists('emergency_address_verified', $changes)) {
            $number->emergency_address_verified = (bool) $changes['emergency_address_verified'];
        }

        if (array_key_exists('extension_id', $changes) && $changes['extension_id'] !== $number->extension_id) {
            $extensionRef = null;
            if ($changes['extension_id'] !== null) {
                $extension = $this->extensions->getForAccount($accountId, $changes['extension_id']);
                $extensionRef = $extension->external_ref;
            }
            $this->voice->routeNumber((string) $number->external_ref, $extensionRef);
            $number->extension_id = $changes['extension_id'];
        }

        return $this->numbers->save($number);
    }

    /**
     * Return a number to inventory. Numbers that are a hunt group pilot or
     * used as an extension's caller id must be reconfigured first.
     */
    public function release(string $accountId, string $numberId, Principal $actor): void
    {
        $number = $this->numbers->getForAccount($accountId, $numberId);
        $this->assertUsable($number);

        $pilotOf = HuntGroup::query()
            ->where('pilot_number_id', $number->id)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->value('name');
        if ($pilotOf !== null) {
            throw new BusinessRuleException(
                sprintf('The number is the pilot for hunt group "%s"; change the pilot first.', $pilotOf),
                'VOICE_NUMBER_IN_USE',
            );
        }

        $callerIdOf = Extension::query()->where('caller_id_number_id', $number->id)->value('number');
        if ($callerIdOf !== null) {
            throw new BusinessRuleException(
                sprintf('The number is the outbound caller id for extension %s.', $callerIdOf),
                'VOICE_NUMBER_IN_USE',
            );
        }

        $this->voice->releaseNumber((string) $number->external_ref);
        $number->status = ProvisioningStatus::Deprovisioned;
        $number->extension_id = null;
        $this->numbers->save($number);

        Log::info('voice.number_released', ['numberId' => $number->id, 'actor' => $actor->auditId()]);
    }

    private function assertUsable(HostedNumber $number): void
    {
        if ($number->status === ProvisioningStatus::Deprovisioned) {
            throw new BusinessRuleException('The number has been released.', 'VOICE_NUMBER_RELEASED');
        }
    }
}
