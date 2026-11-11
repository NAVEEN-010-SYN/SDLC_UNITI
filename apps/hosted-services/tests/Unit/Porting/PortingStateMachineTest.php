<?php

declare(strict_types=1);

namespace Tests\Unit\Porting;

use App\Enums\PortingStatus;
use App\Exceptions\InvalidStateTransitionException;
use App\Services\Porting\PortingContext;
use App\Services\Porting\PortingStateMachine;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Unit\AssertsApiExceptions;

final class PortingStateMachineTest extends TestCase
{
    use AssertsApiExceptions;

    /** Wednesday 10:00 UTC. */
    private const NOW = '2026-03-04T10:00:00Z';

    private PortingStateMachine $machine;
    private CarbonImmutable $now;

    protected function setUp(): void
    {
        $this->machine = new PortingStateMachine(cancelCutoffHours: 48, maxResubmissions: 3, maxNumbersPerRequest: 3, minLeadBusinessDays: 5);
        $this->now = CarbonImmutable::parse(self::NOW);
    }

    public function testTerminalStatesAllowNoTransitions(): void
    {
        foreach ([PortingStatus::Completed, PortingStatus::Cancelled, PortingStatus::Failed] as $status) {
            self::assertTrue($status->isTerminal());
            self::assertSame([], $this->machine->allowedTransitions($status));
        }
    }

    public function testMoveOutsideTheTableIsAConflict(): void
    {
        $this->expectException(InvalidStateTransitionException::class);

        $this->machine->assertTransition(PortingStatus::Draft, PortingStatus::Completed, $this->context());
    }

    public function testSubmitRequiresNumbersAndASignedLoa(): void
    {
        $this->assertBusinessRule('PORT_NO_NUMBERS', fn () => $this->submit($this->context(numbers: [])));
        $this->assertBusinessRule('PORT_LOA_MISSING', fn () => $this->submit($this->context(hasLoa: false)));

        $this->submit($this->context());
        $this->addToAssertionCount(1);
    }

    public function testSubmitRejectsDuplicateAndExcessNumbers(): void
    {
        $this->assertBusinessRule(
            'PORT_DUPLICATE_NUMBER',
            fn () => $this->submit($this->context(numbers: ['+14155550101', '+14155550101'])),
        );
        $this->assertBusinessRule(
            'PORT_TOO_MANY_NUMBERS',
            fn () => $this->submit($this->context(numbers: ['+14155550101', '+14155550102', '+14155550103', '+14155550104'])),
        );
    }

    public function testFocMustBeInTheFuture(): void
    {
        $this->assertBusinessRule(
            'PORT_FOC_MISSING',
            fn () => $this->machine->assertTransition(PortingStatus::PendingFoc, PortingStatus::FocReceived, $this->context()),
        );
        $this->assertBusinessRule(
            'PORT_FOC_IN_PAST',
            fn () => $this->machine->assertTransition(
                PortingStatus::PendingFoc,
                PortingStatus::FocReceived,
                $this->context(focAt: $this->now->subMinute()),
            ),
        );
    }

    public function testFocMayBeRescheduledWhileFocReceived(): void
    {
        $this->machine->assertTransition(
            PortingStatus::FocReceived,
            PortingStatus::FocReceived,
            $this->context(focAt: $this->now->addDays(3)),
        );
        $this->addToAssertionCount(1);
    }

    public function testCompletionCannotPrecedeFoc(): void
    {
        $this->assertBusinessRule(
            'PORT_COMPLETE_BEFORE_FOC',
            fn () => $this->machine->assertTransition(
                PortingStatus::FocReceived,
                PortingStatus::Completed,
                $this->context(focAt: $this->now->addHour()),
            ),
        );

        $this->machine->assertTransition(PortingStatus::FocReceived, PortingStatus::Completed, $this->context(focAt: $this->now));
        $this->addToAssertionCount(1);
    }

    #[DataProvider('reasonRequiredTransitions')]
    public function testRejectionAndFailureRequireAReason(PortingStatus $from, PortingStatus $to): void
    {
        $this->assertBusinessRule('PORT_REASON_REQUIRED', fn () => $this->machine->assertTransition($from, $to, $this->context(reason: '  ')));

        $this->machine->assertTransition($from, $to, $this->context(reason: 'Account number mismatch', focAt: $this->now->addDay()));
        $this->addToAssertionCount(1);
    }

    /**
     * @return iterable<string, array{PortingStatus, PortingStatus}>
     */
    public static function reasonRequiredTransitions(): iterable
    {
        yield 'carrier rejects submission' => [PortingStatus::Submitted, PortingStatus::Rejected];
        yield 'carrier rejects before FOC' => [PortingStatus::PendingFoc, PortingStatus::Rejected];
        yield 'port fails on the day' => [PortingStatus::FocReceived, PortingStatus::Failed];
    }

    public function testResubmissionIsLimited(): void
    {
        $this->machine->assertTransition(PortingStatus::Rejected, PortingStatus::Draft, $this->context(resubmissions: 2));

        $this->assertBusinessRule(
            'PORT_RESUBMISSION_LIMIT',
            fn () => $this->machine->assertTransition(PortingStatus::Rejected, PortingStatus::Draft, $this->context(resubmissions: 3)),
        );
    }

    public function testCancellationClosesFortyEightHoursBeforeFoc(): void
    {
        $focAt = $this->now->addHours(72);
        self::assertEquals($this->now->addHours(24), $this->machine->cancelDeadline(PortingStatus::FocReceived, $focAt));

        $this->machine->assertTransition(PortingStatus::FocReceived, PortingStatus::Cancelled, $this->context(focAt: $focAt));

        $extensions = $this->assertBusinessRule(
            'PORT_CANCEL_CUTOFF',
            fn () => $this->machine->assertTransition(
                PortingStatus::FocReceived,
                PortingStatus::Cancelled,
                $this->context(focAt: $this->now->addHours(47)),
            ),
        );
        self::assertSame('2026-03-04T09:00:00Z', $extensions['cancelDeadline']);
    }

    public function testCancelDeadlineOnlyAppliesOnceFocIsKnown(): void
    {
        self::assertNull($this->machine->cancelDeadline(PortingStatus::Submitted, $this->now->addDay()));
        self::assertNull($this->machine->cancelDeadline(PortingStatus::FocReceived, null));
    }

    public function testEarliestPortDateSkipsWeekends(): void
    {
        self::assertSame('2026-03-11', $this->machine->earliestPortDate($this->now)->toDateString());

        $friday = CarbonImmutable::parse('2026-03-06T16:00:00Z');
        self::assertSame('2026-03-13', $this->machine->earliestPortDate($friday)->toDateString());
    }

    public function testRequestedPortDateMustBeABusinessDayAfterLeadTime(): void
    {
        $this->assertBusinessRule(
            'PORT_DATE_WEEKEND',
            fn () => $this->machine->assertRequestedPortDate(CarbonImmutable::parse('2026-03-14'), $this->now),
        );

        $extensions = $this->assertBusinessRule(
            'PORT_DATE_TOO_SOON',
            fn () => $this->machine->assertRequestedPortDate(CarbonImmutable::parse('2026-03-10'), $this->now),
        );
        self::assertSame('2026-03-11', $extensions['earliestPortDate']);

        $this->machine->assertRequestedPortDate(CarbonImmutable::parse('2026-03-11'), $this->now);
    }

    private function submit(PortingContext $ctx): void
    {
        $this->machine->assertTransition(PortingStatus::Draft, PortingStatus::Submitted, $ctx);
    }

    /**
     * @param list<string>|null $numbers
     */
    private function context(
        ?array $numbers = null,
        ?CarbonImmutable $focAt = null,
        int $resubmissions = 0,
        bool $hasLoa = true,
        ?string $reason = null,
    ): PortingContext {
        return new PortingContext(
            now: $this->now,
            numbers: $numbers ?? ['+14155550101'],
            focAt: $focAt,
            resubmissionCount: $resubmissions,
            hasLoa: $hasLoa,
            reason: $reason,
        );
    }
}
