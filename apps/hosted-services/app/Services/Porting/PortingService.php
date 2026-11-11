<?php

declare(strict_types=1);

namespace App\Services\Porting;

use App\Clients\VoicePlatformClient;
use App\Enums\PortingStatus;
use App\Enums\ProvisioningStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ConflictException;
use App\Exceptions\ValidationFailedException;
use App\Models\HostedNumber;
use App\Models\PortingRequest;
use App\Repositories\HostedNumberRepository;
use App\Repositories\PortingRequestRepository;
use App\Support\Page;
use App\Support\PhoneNumber;
use App\Support\Principal;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Psr\Clock\ClockInterface;

/**
 * Orchestrates number port-in requests: customer edits in DRAFT, submission
 * to the portability gateway, carrier status callbacks, and completion
 * (which materialises the ported numbers on the account).
 */
final class PortingService
{
    public const ACTOR_CARRIER = 'carrier';

    public function __construct(
        private readonly PortingRequestRepository $requests,
        private readonly HostedNumberRepository $numbers,
        private readonly PortingStateMachine $machine,
        private readonly VoicePlatformClient $voice,
        private readonly ClockInterface $clock,
    ) {
    }

    /**
     * @return Page<PortingRequest>
     */
    public function list(string $accountId, int $page, int $pageSize, ?PortingStatus $status): Page
    {
        return $this->requests->list($accountId, $page, $pageSize, $status);
    }

    public function get(string $accountId, string $requestId): PortingRequest
    {
        return $this->requests->getForAccount($accountId, $requestId);
    }

    /**
     * @param array<string, mixed> $data Validated StorePortingRequest payload.
     */
    public function createDraft(string $accountId, array $data, Principal $actor): PortingRequest
    {
        $now = $this->now();
        $numbers = $this->normaliseNumbers($data['numbers']);
        $this->assertNumbersPortable($numbers, null);

        $requestedDate = CarbonImmutable::parse($data['requested_port_date']);
        $this->machine->assertRequestedPortDate($requestedDate, $now);

        $request = new PortingRequest([
            'account_id' => $accountId,
            'status' => PortingStatus::Draft,
            'numbers' => $numbers,
            'losing_carrier' => $data['losing_carrier'],
            'carrier_account_number' => $data['carrier_account_number'],
            'carrier_pin' => $data['carrier_pin'] ?? null,
            'billing_telephone_number' => PhoneNumber::parse($data['billing_telephone_number'])->e164,
            'authorised_name' => $data['authorised_name'],
            'service_address' => $data['service_address'],
            'requested_port_date' => $requestedDate,
            'loa_document_ref' => $data['loa_document_ref'] ?? null,
            'resubmission_count' => 0,
            'created_by' => $actor->auditId(),
        ]);

        return $this->requests->recordTransition($request, PortingStatus::Draft, $actor->auditId(), 'Created', $now);
    }

    /**
     * @param array<string, mixed> $changes
     */
    public function updateDraft(string $accountId, string $requestId, array $changes): PortingRequest
    {
        $request = $this->requests->getForAccount($accountId, $requestId);
        if (!$request->status->isEditable()) {
            throw new ConflictException(
                sprintf('Only draft requests can be edited; this request is %s.', $request->status->value),
                ['currentStatus' => $request->status->value],
            );
        }

        if (isset($changes['numbers'])) {
            $changes['numbers'] = $this->normaliseNumbers($changes['numbers']);
            $this->assertNumbersPortable($changes['numbers'], $request->id);
        }
        if (isset($changes['requested_port_date'])) {
            $changes['requested_port_date'] = CarbonImmutable::parse($changes['requested_port_date']);
            $this->machine->assertRequestedPortDate($changes['requested_port_date'], $this->now());
        }
        if (isset($changes['billing_telephone_number'])) {
            $changes['billing_telephone_number'] = PhoneNumber::parse($changes['billing_telephone_number'])->e164;
        }

        $request->fill(array_intersect_key($changes, array_flip([
            'numbers', 'losing_carrier', 'carrier_account_number', 'carrier_pin', 'billing_telephone_number',
            'authorised_name', 'service_address', 'requested_port_date', 'loa_document_ref',
        ])));

        return $this->requests->save($request);
    }

    public function submit(string $accountId, string $requestId, Principal $actor): PortingRequest
    {
        $request = $this->requests->getForAccount($accountId, $requestId);
        $now = $this->now();

        $this->machine->assertTransition($request->status, PortingStatus::Submitted, $this->context($request, $now));
        $this->machine->assertRequestedPortDate($request->requested_port_date, $now);
        $this->assertNumbersPortable($request->numbers, $request->id);

        $reference = $this->voice->submitPortOrder($request);

        return $this->requests->recordTransition(
            $request,
            PortingStatus::Submitted,
            $actor->auditId(),
            'Submitted to portability gateway',
            $now,
            ['carrier_reference' => $reference, 'rejection_reason' => null],
        );
    }

    public function cancel(string $accountId, string $requestId, Principal $actor, ?string $reason): PortingRequest
    {
        $request = $this->requests->getForAccount($accountId, $requestId);
        $now = $this->now();

        $this->machine->assertTransition($request->status, PortingStatus::Cancelled, $this->context($request, $now, $reason));

        if ($request->carrier_reference !== null && $request->status !== PortingStatus::Draft && $request->status !== PortingStatus::Rejected) {
            $this->voice->cancelPortOrder($request->carrier_reference);
        }

        return $this->requests->recordTransition($request, PortingStatus::Cancelled, $actor->auditId(), $reason, $now);
    }

    /**
     * Move a REJECTED request back to DRAFT so the customer can fix it.
     */
    public function reopen(string $accountId, string $requestId, Principal $actor): PortingRequest
    {
        $request = $this->requests->getForAccount($accountId, $requestId);
        $now = $this->now();

        $this->machine->assertTransition($request->status, PortingStatus::Draft, $this->context($request, $now));

        return $this->requests->recordTransition(
            $request,
            PortingStatus::Draft,
            $actor->auditId(),
            'Reopened for correction',
            $now,
            ['resubmission_count' => $request->resubmission_count + 1, 'foc_at' => null],
        );
    }

    /**
     * Apply an asynchronous status update from the portability gateway.
     * Duplicate deliveries of the same status are acknowledged idempotently.
     */
    public function applyCarrierUpdate(string $carrierReference, PortingStatus $to, ?CarbonImmutable $focAt, ?string $reason): PortingRequest
    {
        $request = $this->requests->findByCarrierReference($carrierReference);
        if ($request === null) {
            throw ValidationFailedException::forField('reference', 'Unknown carrier reference.');
        }

        if ($this->isDuplicateUpdate($request, $to, $focAt)) {
            return $request;
        }

        $now = $this->now();
        $ctx = new PortingContext($now, $request->numbers, $focAt ?? $request->foc_at, $request->resubmission_count, true, $reason);
        $this->machine->assertTransition($request->status, $to, $ctx);

        $changes = [];
        if ($to === PortingStatus::FocReceived) {
            $changes = ['foc_at' => $focAt];
        } elseif ($to === PortingStatus::Rejected || $to === PortingStatus::Failed) {
            $changes = ['rejection_reason' => $reason];
        }

        if ($to === PortingStatus::Completed) {
            return DB::transaction(function () use ($request, $now, $changes): PortingRequest {
                $this->materialiseNumbers($request);

                return $this->requests->recordTransition($request, PortingStatus::Completed, self::ACTOR_CARRIER, 'Port completed', $now, $changes);
            });
        }

        Log::info('porting.carrier_update', ['portingRequestId' => $request->id, 'to' => $to->value]);

        return $this->requests->recordTransition($request, $to, self::ACTOR_CARRIER, $reason, $now, $changes);
    }

    /**
     * @return array{cancelDeadline: ?string, earliestPortDate: string, allowedTransitions: list<string>}
     */
    public function timeline(PortingRequest $request): array
    {
        $now = $this->now();

        $deadline = $this->machine->cancelDeadline($request->status, $request->foc_at);
        $allowed = [];
        foreach ($this->machine->allowedTransitions($request->status) as $status) {
            $allowed[] = $status->value;
        }

        return [
            'cancelDeadline' => $deadline === null ? null : $deadline->toIso8601ZuluString(),
            'earliestPortDate' => $this->machine->earliestPortDate($now)->toDateString(),
            'allowedTransitions' => $allowed,
        ];
    }

    /**
     * Same status delivered again (for FOC, only when the date is unchanged).
     */
    private function isDuplicateUpdate(PortingRequest $request, PortingStatus $to, ?CarbonImmutable $focAt): bool
    {
        if ($request->status !== $to) {
            return false;
        }
        if ($to !== PortingStatus::FocReceived) {
            return true;
        }
        if ($request->foc_at === null) {
            return false;
        }

        return $request->foc_at->equalTo($focAt) === true;
    }

    private function materialiseNumbers(PortingRequest $request): void
    {
        foreach ($request->numbers as $e164) {
            $ref = $this->voice->activateNumber($request->account_id, $e164);
            $this->numbers->save(new HostedNumber([
                'account_id' => $request->account_id,
                'e164' => $e164,
                'status' => ProvisioningStatus::Active,
                'porting_request_id' => $request->id,
                'external_ref' => $ref,
                'emergency_address_verified' => false,
            ]));
        }
    }

    /**
     * @param list<string> $raw
     * @return list<string>
     */
    private function normaliseNumbers(array $raw): array
    {
        $errors = [];
        $numbers = [];
        foreach ($raw as $i => $value) {
            $number = PhoneNumber::tryParse((string) $value);
            if ($number === null || !$number->isNanp()) {
                $errors["numbers.$i"][] = 'Not a valid North American number.';
                continue;
            }
            $numbers[] = $number->e164;
        }

        if ($errors !== []) {
            throw ValidationFailedException::withErrors($errors);
        }

        return array_values(array_unique($numbers));
    }

    /**
     * @param list<string> $numbers
     */
    private function assertNumbersPortable(array $numbers, ?string $excludeRequestId): void
    {
        $alreadyHere = $this->numbers->existingNumbers($numbers);
        if ($alreadyHere !== []) {
            throw new BusinessRuleException('Some numbers are already on the Uniti network.', 'PORT_NUMBER_ALREADY_HOSTED', ['numbers' => $alreadyHere]);
        }

        $inFlight = $this->requests->numbersInFlight($numbers, $excludeRequestId);
        if ($inFlight !== []) {
            throw new ConflictException('Some numbers are already part of an open porting request.', ['numbers' => $inFlight]);
        }
    }

    private function context(PortingRequest $request, CarbonImmutable $now, ?string $reason = null): PortingContext
    {
        return new PortingContext(
            now: $now,
            numbers: $request->numbers,
            focAt: $request->foc_at,
            resubmissionCount: $request->resubmission_count,
            hasLoa: $request->loa_document_ref !== null && $request->loa_document_ref !== '',
            reason: $reason,
        );
    }

    private function now(): CarbonImmutable
    {
        return CarbonImmutable::instance($this->clock->now())->utc();
    }
}
