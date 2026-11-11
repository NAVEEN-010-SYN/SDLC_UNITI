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
