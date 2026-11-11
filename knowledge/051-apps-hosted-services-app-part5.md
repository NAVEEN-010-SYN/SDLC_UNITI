# Hosted Services (hosted voice, email, web hosting): apps/hosted-services/app (part 5 of 6)

- **Application:** Hosted Services (hosted voice, email, web hosting)
- **Tech stack:** PHP 8 (Laravel-style)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 11

## Files

- `apps/hosted-services/app/Services/Porting/PortingService.php` (300 lines)
- `apps/hosted-services/app/Services/Porting/PortingStateMachine.php` (195 lines)
- `apps/hosted-services/app/Services/Voice/DialPlanPolicy.php` (93 lines)
- `apps/hosted-services/app/Services/Voice/ExtensionService.php` (195 lines)
- `apps/hosted-services/app/Services/Voice/ForwardingRuleValidator.php` (173 lines)
- `apps/hosted-services/app/Services/Voice/HuntGroupService.php` (275 lines)
- `apps/hosted-services/app/Services/Voice/NumberService.php` (192 lines)
- `apps/hosted-services/app/Services/Voice/VoicemailPinPolicy.php` (96 lines)
- `apps/hosted-services/app/Services/Voice/VoicemailService.php` (141 lines)
- `apps/hosted-services/app/Support/FieldCase.php` (63 lines)
- `apps/hosted-services/app/Support/Hostname.php` (147 lines)

## apps/hosted-services/app/Services/Porting/PortingService.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Porting/PortingService.php`.

```php
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
        $request = $this->requests->findByCarrierReference($carrierReference)
            ?? throw ValidationFailedException::forField('reference', 'Unknown carrier reference.');

        if ($request->status === $to && $to !== PortingStatus::FocReceived) {
            return $request;
        }
        if ($request->status === $to && $request->foc_at?->equalTo($focAt) === true) {
            return $request;
        }

        $now = $this->now();
        $ctx = new PortingContext($now, $request->numbers, $focAt ?? $request->foc_at, $request->resubmission_count, true, $reason);
        $this->machine->assertTransition($request->status, $to, $ctx);

        $changes = match ($to) {
            PortingStatus::FocReceived => ['foc_at' => $focAt],
            PortingStatus::Rejected, PortingStatus::Failed => ['rejection_reason' => $reason],
            default => [],
        };

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

        return [
            'cancelDeadline' => $this->machine->cancelDeadline($request->status, $request->foc_at)?->toIso8601ZuluString(),
            'earliestPortDate' => $this->machine->earliestPortDate($now)->toDateString(),
            'allowedTransitions' => array_map(static fn (PortingStatus $s) => $s->value, $this->machine->allowedTransitions($request->status)),
        ];
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
```

## apps/hosted-services/app/Services/Porting/PortingStateMachine.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Porting/PortingStateMachine.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Porting;

use App\Enums\PortingStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\InvalidStateTransitionException;
use Carbon\CarbonImmutable;

/**
 * Number port-in lifecycle rules. The transition table defines which moves
 * exist at all; guards encode the business conditions that must hold for a
 * particular move (LOA present, FOC date known, cancel cut-off respected...).
 */
final class PortingStateMachine
{
    /** @var array<string, list<PortingStatus>> */
    private const TRANSITIONS = [
        'DRAFT' => [PortingStatus::Submitted, PortingStatus::Cancelled],
        'SUBMITTED' => [PortingStatus::PendingFoc, PortingStatus::Rejected, PortingStatus::Cancelled],
        'PENDING_FOC' => [PortingStatus::FocReceived, PortingStatus::Rejected, PortingStatus::Cancelled],
        'FOC_RECEIVED' => [PortingStatus::Completed, PortingStatus::Failed, PortingStatus::Cancelled, PortingStatus::FocReceived],
        'REJECTED' => [PortingStatus::Draft, PortingStatus::Cancelled],
        'COMPLETED' => [],
        'CANCELLED' => [],
        'FAILED' => [],
    ];

    public function __construct(
        private readonly int $cancelCutoffHours = 48,
        private readonly int $maxResubmissions = 3,
        private readonly int $maxNumbersPerRequest = 100,
        private readonly int $minLeadBusinessDays = 5,
    ) {
    }

    /**
     * @return list<PortingStatus>
     */
    public function allowedTransitions(PortingStatus $from): array
    {
        return self::TRANSITIONS[$from->value];
    }

    public function canTransition(PortingStatus $from, PortingStatus $to): bool
    {
        return in_array($to, self::TRANSITIONS[$from->value], true);
    }

    /**
     * Throws when the move is not in the table or a guard fails.
     */
    public function assertTransition(PortingStatus $from, PortingStatus $to, PortingContext $ctx): void
    {
        if (!$this->canTransition($from, $to)) {
            throw InvalidStateTransitionException::between('Porting request', $from->value, $to->value);
        }

        match ($to) {
            PortingStatus::Submitted => $this->guardSubmit($ctx),
            PortingStatus::FocReceived => $this->guardFoc($ctx),
            PortingStatus::Completed => $this->guardComplete($ctx),
            PortingStatus::Rejected, PortingStatus::Failed => $this->guardReason($to, $ctx),
            PortingStatus::Draft => $this->guardResubmit($ctx),
            PortingStatus::Cancelled => $this->guardCancel($from, $ctx),
            default => null,
        };
    }

    /**
     * Customer-visible cancel deadline, or null when cancellation is not
     * time-limited in the current state.
     */
    public function cancelDeadline(PortingStatus $status, ?CarbonImmutable $focAt): ?CarbonImmutable
    {
        if ($status !== PortingStatus::FocReceived || $focAt === null) {
            return null;
        }

        return $focAt->subHours($this->cancelCutoffHours);
    }

    /**
     * Earliest port date the customer may request: N business days out,
     * never on a weekend.
     */
    public function earliestPortDate(CarbonImmutable $now): CarbonImmutable
    {
        $date = $now->startOfDay();
        $added = 0;
        while ($added < $this->minLeadBusinessDays) {
            $date = $date->addDay();
            if (!$date->isWeekend()) {
                $added++;
            }
        }

        return $date;
    }

    public function assertRequestedPortDate(CarbonImmutable $requested, CarbonImmutable $now): void
    {
        if ($requested->isWeekend()) {
            throw new BusinessRuleException('Ports can only be scheduled on business days.', 'PORT_DATE_WEEKEND');
        }

        $earliest = $this->earliestPortDate($now);
        if ($requested->startOfDay()->lt($earliest)) {
            throw new BusinessRuleException(
                sprintf('The earliest available port date is %s.', $earliest->toDateString()),
                'PORT_DATE_TOO_SOON',
                ['earliestPortDate' => $earliest->toDateString()],
            );
        }
    }

    private function guardSubmit(PortingContext $ctx): void
    {
        $count = count($ctx->numbers);
        if ($count === 0) {
            throw new BusinessRuleException('Add at least one number before submitting.', 'PORT_NO_NUMBERS');
        }
        if ($count > $this->maxNumbersPerRequest) {
            throw new BusinessRuleException(
                sprintf('A single request may port at most %d numbers.', $this->maxNumbersPerRequest),
                'PORT_TOO_MANY_NUMBERS',
            );
        }
        if (count(array_unique($ctx->numbers)) !== $count) {
            throw new BusinessRuleException('The request lists the same number more than once.', 'PORT_DUPLICATE_NUMBER');
        }
        if (!$ctx->hasLoa) {
            throw new BusinessRuleException(
                'A signed Letter of Authorization must be uploaded before submitting.',
                'PORT_LOA_MISSING',
            );
        }
    }

    private function guardFoc(PortingContext $ctx): void
    {
        if ($ctx->focAt === null) {
            throw new BusinessRuleException('A FOC date is required.', 'PORT_FOC_MISSING');
        }
        if ($ctx->focAt->lte($ctx->now)) {
            throw new BusinessRuleException('The FOC date must be in the future.', 'PORT_FOC_IN_PAST');
        }
    }

    private function guardComplete(PortingContext $ctx): void
    {
        if ($ctx->focAt === null || $ctx->now->lt($ctx->focAt)) {
            throw new BusinessRuleException('A port cannot complete before its FOC date.', 'PORT_COMPLETE_BEFORE_FOC');
        }
    }

    private function guardReason(PortingStatus $to, PortingContext $ctx): void
    {
        if ($ctx->reason === null || trim($ctx->reason) === '') {
            throw new BusinessRuleException(
                sprintf('A reason is required when marking a port %s.', $to->value),
                'PORT_REASON_REQUIRED',
            );
        }
    }

    private function guardResubmit(PortingContext $ctx): void
    {
        if ($ctx->resubmissionCount >= $this->maxResubmissions) {
            throw new BusinessRuleException(
                sprintf('This request has been rejected %d times; please contact support.', $ctx->resubmissionCount),
                'PORT_RESUBMISSION_LIMIT',
            );
        }
    }

    private function guardCancel(PortingStatus $from, PortingContext $ctx): void
    {
        $deadline = $this->cancelDeadline($from, $ctx->focAt);
        if ($deadline !== null && $ctx->now->gte($deadline)) {
            throw new BusinessRuleException(
                sprintf(
                    'Ports cannot be cancelled within %d hours of the FOC date (%s).',
                    $this->cancelCutoffHours,
                    $ctx->focAt?->toIso8601ZuluString(),
                ),
                'PORT_CANCEL_CUTOFF',
                ['cancelDeadline' => $deadline->toIso8601ZuluString()],
            );
        }
    }
}
```

## apps/hosted-services/app/Services/Voice/DialPlanPolicy.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Voice/DialPlanPolicy.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Voice;

use App\Exceptions\BusinessRuleException;
use App\Exceptions\ConflictException;
use App\Exceptions\ValidationFailedException;

/**
 * Rules for short-dial numbers shared by extensions and hunt group pilots.
 */
final class DialPlanPolicy
{
    /**
     * @param list<string> $reserved Emergency and N11 service codes.
     */
    public function __construct(
        private readonly int $minDigits = 3,
        private readonly int $maxDigits = 6,
        private readonly array $reserved = [],
    ) {
    }

    /**
     * @param list<string> $inUse Numbers already in the account's dial plan.
     */
    public function assertAvailable(string $number, array $inUse, string $field = 'number'): void
    {
        if (preg_match(sprintf('/^\d{%d,%d}$/', $this->minDigits, $this->maxDigits), $number) !== 1) {
            throw ValidationFailedException::forField(
                $field,
                sprintf('Extension numbers must be %d to %d digits.', $this->minDigits, $this->maxDigits),
            );
        }

        if ($number[0] === '0' || $number[0] === '9') {
            throw new BusinessRuleException(
                'Extension numbers cannot start with 0 (operator) or 9 (outside line).',
                'VOICE_EXTENSION_RESERVED_PREFIX',
            );
        }

        foreach ($this->reserved as $code) {
            if (str_starts_with($number, $code)) {
                throw new BusinessRuleException(
                    sprintf('Extension numbers cannot start with the service code %s.', $code),
                    'VOICE_EXTENSION_RESERVED',
                );
            }
        }

        if (in_array($number, $inUse, true)) {
            throw new ConflictException(sprintf('Extension %s is already in use on this account.', $number));
        }

        foreach ($inUse as $existing) {
            if (str_starts_with($existing, $number) || str_starts_with($number, $existing)) {
                throw new BusinessRuleException(
                    sprintf('Extension %s overlaps with existing extension %s and would make dialling ambiguous.', $number, $existing),
                    'VOICE_EXTENSION_PREFIX_OVERLAP',
                );
            }
        }
    }

    /**
     * Suggest the lowest free number of the given length.
     *
     * @param list<string> $inUse
     */
    public function suggest(array $inUse, int $digits): ?string
    {
        $digits = max($this->minDigits, min($digits, $this->maxDigits));
        $start = (int) ('1' . str_repeat('0', $digits - 1));
        $end = (int) ('8' . str_repeat('9', $digits - 1));

        for ($n = $start; $n <= $end; $n++) {
            $candidate = (string) $n;
            try {
                $this->assertAvailable($candidate, $inUse);

                return $candidate;
            } catch (BusinessRuleException | ConflictException) {
                continue;
            }
        }

        return null;
    }
}
```

## apps/hosted-services/app/Services/Voice/ExtensionService.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Voice/ExtensionService.php`.

```php
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

        $forwardedFrom = CallForwardingRule::query()
            ->join('extensions', 'extensions.id', '=', 'call_forwarding_rules.extension_id')
            ->where('extensions.account_id', $accountId)
            ->where('call_forwarding_rules.destination_type', CallForwardingRule::DEST_EXTENSION)
            ->where('call_forwarding_rules.destination', $extension->number)
            ->pluck('extensions.number')
            ->all();
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
```

## apps/hosted-services/app/Services/Voice/ForwardingRuleValidator.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Voice/ForwardingRuleValidator.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Voice;

use App\Enums\ForwardingCondition;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ValidationFailedException;
use App\Models\CallForwardingRule;
use App\Support\PhoneNumber;

/**
 * Validates a complete forwarding rule set for one extension and detects
 * forwarding loops across the account's internal forwarding graph.
 *
 * Pure: the caller supplies the dial plan and the current graph.
 */
final class ForwardingRuleValidator
{
    public function __construct(
        private readonly int $noAnswerMinSeconds = 5,
        private readonly int $noAnswerMaxSeconds = 60,
        private readonly int $maxChainDepth = 5,
        private readonly bool $allowInternational = false,
    ) {
    }

    /**
     * @param list<array{condition: string, destination_type: string, destination?: ?string, ring_seconds?: ?int, enabled?: bool}> $rules
     * @param string                        $extensionNumber Owner of the rules.
     * @param list<string>                  $dialPlan        Extension numbers that exist on the account.
     * @param array<string, list<string>>   $graph           Current internal forwarding edges.
     * @return list<array{condition: ForwardingCondition, destination_type: string, destination: ?string, ring_seconds: ?int, enabled: bool}>
     */
    public function validate(array $rules, string $extensionNumber, array $dialPlan, array $graph): array
    {
        $errors = [];
        $normalised = [];
        $seen = [];

        foreach ($rules as $i => $rule) {
            $prefix = "rules.$i";
            $condition = ForwardingCondition::tryFrom((string) ($rule['condition'] ?? ''));
            if ($condition === null) {
                $errors["$prefix.condition"][] = 'Unknown forwarding condition.';
                continue;
            }
            if (isset($seen[$condition->value])) {
                $errors["$prefix.condition"][] = sprintf('Only one %s rule is allowed.', $condition->value);
                continue;
            }
            $seen[$condition->value] = true;

            $type = (string) ($rule['destination_type'] ?? '');
            $destination = isset($rule['destination']) ? trim((string) $rule['destination']) : null;
            $ringSeconds = isset($rule['ring_seconds']) ? (int) $rule['ring_seconds'] : null;

            switch ($type) {
                case CallForwardingRule::DEST_VOICEMAIL:
                    $destination = null;
                    break;

                case CallForwardingRule::DEST_EXTENSION:
                    if ($destination === null || !in_array($destination, $dialPlan, true)) {
                        $errors["$prefix.destination"][] = 'Destination extension does not exist on this account.';
                    } elseif ($destination === $extensionNumber) {
                        $errors["$prefix.destination"][] = 'An extension cannot forward to itself.';
                    }
                    break;

                case CallForwardingRule::DEST_EXTERNAL:
                    $number = $destination === null ? null : PhoneNumber::tryParse($destination);
                    if ($number === null) {
                        $errors["$prefix.destination"][] = 'Destination must be a valid phone number.';
                    } elseif ($number->isPremiumRate()) {
                        $errors["$prefix.destination"][] = 'Forwarding to premium-rate numbers is not permitted.';
                    } elseif (!$number->isNanp() && !$this->allowInternational) {
                        $errors["$prefix.destination"][] = 'International forwarding is not enabled on this account.';
                    } else {
                        $destination = $number->e164;
                    }
                    break;

                default:
                    $errors["$prefix.destination_type"][] = 'Destination type must be EXTENSION, EXTERNAL or VOICEMAIL.';
            }

            if ($condition === ForwardingCondition::NoAnswer) {
                if ($ringSeconds === null) {
                    $errors["$prefix.ring_seconds"][] = 'Ring time is required for NO_ANSWER forwarding.';
                } elseif ($ringSeconds < $this->noAnswerMinSeconds || $ringSeconds > $this->noAnswerMaxSeconds || $ringSeconds % 5 !== 0) {
                    $errors["$prefix.ring_seconds"][] = sprintf(
                        'Ring time must be a multiple of 5 between %d and %d seconds.',
                        $this->noAnswerMinSeconds,
                        $this->noAnswerMaxSeconds,
                    );
                }
            } else {
                $ringSeconds = null;
            }

            $normalised[] = [
                'condition' => $condition,
                'destination_type' => $type,
                'destination' => $destination,
                'ring_seconds' => $ringSeconds,
                'enabled' => (bool) ($rule['enabled'] ?? true),
            ];
        }

        if ($errors !== []) {
            throw ValidationFailedException::withErrors($errors);
        }

        $this->assertNoLoop($extensionNumber, $normalised, $graph);

        usort($normalised, static fn (array $a, array $b) => $a['condition']->precedence() <=> $b['condition']->precedence());

        return $normalised;
    }

    /**
     * Replace this extension's outgoing edges with the proposed ones and
     * walk the graph. A cycle, or a chain deeper than the switch will
     * follow, is rejected.
     *
     * @param list<array{condition: ForwardingCondition, destination_type: string, destination: ?string, enabled: bool}> $rules
     * @param array<string, list<string>> $graph
     */
    private function assertNoLoop(string $extensionNumber, array $rules, array $graph): void
    {
        $graph[$extensionNumber] = [];
        foreach ($rules as $rule) {
            if ($rule['enabled'] && $rule['destination_type'] === CallForwardingRule::DEST_EXTENSION && $rule['destination'] !== null) {
                $graph[$extensionNumber][] = $rule['destination'];
            }
        }

        $path = [$extensionNumber];
        $this->walk($extensionNumber, $graph, $path);
    }

    /**
     * @param array<string, list<string>> $graph
     * @param list<string>                $path
     */
    private function walk(string $node, array $graph, array $path): void
    {
        foreach ($graph[$node] ?? [] as $next) {
            if (in_array($next, $path, true)) {
                $cycle = [...array_slice($path, (int) array_search($next, $path, true)), $next];
                throw new BusinessRuleException(
                    'These forwarding rules would create a loop: ' . implode(' -> ', $cycle) . '.',
                    'VOICE_FORWARDING_LOOP',
                    ['cycle' => $cycle],
                );
            }

            $nextPath = [...$path, $next];
            if (count($nextPath) - 1 > $this->maxChainDepth) {
                throw new BusinessRuleException(
                    sprintf('Forwarding chains may not exceed %d hops.', $this->maxChainDepth),
                    'VOICE_FORWARDING_TOO_DEEP',
                    ['chain' => $nextPath],
                );
            }

            $this->walk($next, $graph, $nextPath);
        }
    }
}
```

## apps/hosted-services/app/Services/Voice/HuntGroupService.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Voice/HuntGroupService.php`.

```php
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
```

## apps/hosted-services/app/Services/Voice/NumberService.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Voice/NumberService.php`.

```php
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
```

## apps/hosted-services/app/Services/Voice/VoicemailPinPolicy.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Voice/VoicemailPinPolicy.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Voice;

use App\Exceptions\ValidationFailedException;

/**
 * Voicemail PIN rules. Toll fraud via weak voicemail PINs (remote
 * call-forward abuse) is a real attack, so trivially guessable PINs are
 * refused even though customers ask for them.
 */
final class VoicemailPinPolicy
{
    public function __construct(
        private readonly int $minLength = 4,
        private readonly int $maxLength = 8,
    ) {
    }

    /**
     * @param list<string> $forbidden Values the PIN must not equal or contain
     *                                (extension number, DID tail digits).
     */
    public function assertAcceptable(string $pin, array $forbidden = []): void
    {
        $problem = $this->problem($pin, $forbidden);
        if ($problem !== null) {
            throw ValidationFailedException::forField('pin', $problem);
        }
    }

    /**
     * @param list<string> $forbidden
     */
    public function problem(string $pin, array $forbidden = []): ?string
    {
        if (preg_match('/^\d+$/', $pin) !== 1) {
            return 'PIN must contain digits only.';
        }

        $length = strlen($pin);
        if ($length < $this->minLength || $length > $this->maxLength) {
            return sprintf('PIN must be %d to %d digits.', $this->minLength, $this->maxLength);
        }

        if (count(array_unique(str_split($pin))) === 1) {
            return 'PIN cannot be a single repeated digit.';
        }

        if ($this->isSequential($pin)) {
            return 'PIN cannot be an ascending or descending sequence.';
        }

        if ($length % 2 === 0 && substr($pin, 0, intdiv($length, 2)) === substr($pin, intdiv($length, 2))) {
            return 'PIN cannot be a repeated pattern.';
        }

        foreach ($forbidden as $value) {
            $value = preg_replace('/\D+/', '', $value) ?? '';
            if ($value === '') {
                continue;
            }
            if ($pin === $value || (strlen($value) >= $this->minLength && str_contains($value, $pin))) {
                return 'PIN cannot match your extension or phone number.';
            }
        }

        return null;
    }

    public function hash(string $pin): string
    {
        return password_hash($pin, PASSWORD_ARGON2ID);
    }

    public function verify(string $pin, string $hash): bool
    {
        return password_verify($pin, $hash);
    }

    private function isSequential(string $pin): bool
    {
        $ascending = true;
        $descending = true;
        for ($i = 1, $n = strlen($pin); $i < $n; $i++) {
            $diff = ((int) $pin[$i] - (int) $pin[$i - 1] + 10) % 10;
            $ascending = $ascending && $diff === 1;
            $descending = $descending && $diff === 9;
        }

        return $ascending || $descending;
    }
}
```

## apps/hosted-services/app/Services/Voice/VoicemailService.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Voice/VoicemailService.php`.

```php
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
```

## apps/hosted-services/app/Support/FieldCase.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Support/FieldCase.php`.

```php
<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Str;

/**
 * The wire format is camelCase JSON while services and models use
 * snake_case attribute names. Conversion happens exactly twice: request
 * bodies on the way in (ApiFormRequest) and field paths in validation
 * problems on the way out (ProblemRenderer).
 */
final class FieldCase
{
    /**
     * Recursively convert associative keys to snake_case; list keys are kept.
     *
     * @param array<mixed> $input
     * @return array<mixed>
     */
    public static function snake(array $input): array
    {
        $result = [];
        foreach ($input as $key => $value) {
            $converted = is_string($key) ? Str::snake($key) : $key;
            if (is_array($value)) {
                $value = self::snake($value);
            }
            $result[$converted] = $value;
        }

        return $result;
    }

    /**
     * "members.0.ring_seconds" -> "members.0.ringSeconds"
     */
    public static function camelPath(string $path): string
    {
        return implode('.', array_map(
            static fn (string $segment) => ctype_digit($segment) || $segment === '*' ? $segment : Str::camel($segment),
            explode('.', $path),
        ));
    }

    /**
     * @param array<string, list<string>> $errors
     * @return array<string, list<string>>
     */
    public static function camelErrors(array $errors): array
    {
        $result = [];
        foreach ($errors as $field => $messages) {
            $key = self::camelPath((string) $field);
            $result[$key] = array_values(array_merge($result[$key] ?? [], $messages));
        }

        return $result;
    }
}
```

## apps/hosted-services/app/Support/Hostname.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Support/Hostname.php`.

```php
<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Hostname helpers shared by DNS, domain and certificate logic.
 * All comparisons are on the lower-cased, trailing-dot-free form.
 */
final class Hostname
{
    public const MAX_LENGTH = 253;
    public const MAX_LABEL_LENGTH = 63;

    public static function normalise(string $name): string
    {
        $name = strtolower(trim($name));

        return rtrim($name, '.');
    }

    /**
     * RFC 1123 hostname, optionally allowing a leading wildcard label and
     * underscore-prefixed labels (needed for SRV, DKIM, ACME challenges).
     */
    public static function isValid(string $name, bool $allowWildcard = false, bool $allowUnderscore = false): bool
    {
        $name = self::normalise($name);
        if ($name === '' || strlen($name) > self::MAX_LENGTH) {
            return false;
        }

        $labels = explode('.', $name);
        foreach ($labels as $index => $label) {
            if ($allowWildcard && $index === 0 && $label === '*') {
                continue;
            }
            if (!self::isValidLabel($label, $allowUnderscore)) {
                return false;
            }
        }

        return true;
    }

    public static function isValidLabel(string $label, bool $allowUnderscore = false): bool
    {
        $length = strlen($label);
        if ($length === 0 || $length > self::MAX_LABEL_LENGTH) {
            return false;
        }

        $pattern = $allowUnderscore
            ? '/^_?[a-z0-9]([a-z0-9-]*[a-z0-9])?$/'
            : '/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/';

        return preg_match($pattern, $label) === 1;
    }

    /**
     * A registrable domain needs at least two labels and an alphabetic TLD.
     */
    public static function isRegistrableDomain(string $name): bool
    {
        $name = self::normalise($name);
        if (!self::isValid($name)) {
            return false;
        }

        $labels = explode('.', $name);
        if (count($labels) < 2) {
            return false;
        }

        return preg_match('/^[a-z]{2,63}$/', end($labels)) === 1;
    }

    /**
     * Expand a record name relative to its zone: "@" and "" mean the apex,
     * a name already ending in the zone is accepted as fully qualified.
     */
    public static function qualify(string $name, string $zone): string
    {
        $zone = self::normalise($zone);
        $name = self::normalise($name);

        if ($name === '' || $name === '@') {
            return $zone;
        }

        if ($name === $zone || str_ends_with($name, '.' . $zone)) {
            return $name;
        }

        return $name . '.' . $zone;
    }

    /**
     * Inverse of qualify(): the label(s) relative to the zone, "@" for apex.
     */
    public static function relativise(string $fqdn, string $zone): string
    {
        $fqdn = self::normalise($fqdn);
        $zone = self::normalise($zone);

        if ($fqdn === $zone) {
            return '@';
        }

        return str_ends_with($fqdn, '.' . $zone)
            ? substr($fqdn, 0, -strlen('.' . $zone))
            : $fqdn;
    }

    public static function isWithinZone(string $fqdn, string $zone): bool
    {
        $fqdn = self::normalise($fqdn);
        $zone = self::normalise($zone);

        return $fqdn === $zone || str_ends_with($fqdn, '.' . $zone);
    }

    /**
     * Does a certificate name (possibly "*.example.com") cover the host?
     * Wildcards match exactly one label, per RFC 6125.
     */
    public static function matchesCertificateName(string $certName, string $host): bool
    {
        $certName = self::normalise($certName);
        $host = self::normalise($host);

        if (!str_starts_with($certName, '*.')) {
            return $certName === $host;
        }

        $suffix = substr($certName, 1);
        if (!str_ends_with($host, $suffix)) {
            return false;
        }

        $leftmost = substr($host, 0, -strlen($suffix));

        return $leftmost !== '' && !str_contains($leftmost, '.');
    }
}
```
