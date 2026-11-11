<?php

declare(strict_types=1);

namespace Tests\Unit\Mail;

use App\Exceptions\BusinessRuleException;
use App\Services\Mail\QuotaCalculator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Unit\AssertsApiExceptions;

final class QuotaCalculatorTest extends TestCase
{
    use AssertsApiExceptions;

    private QuotaCalculator $calculator;

    protected function setUp(): void
    {
        $this->calculator = new QuotaCalculator(
            plans: [
                'EMAIL_ESSENTIALS' => ['pool_mb' => 51200, 'max_mailboxes' => 10],
                'EMAIL_BUSINESS' => ['pool_mb' => 256000, 'max_mailboxes' => 50],
            ],
            addonBlockMb: 10240,
            addonBlockPriceMinor: 299,
            currency: 'USD',
            minMailboxQuotaMb: 512,
            maxMailboxQuotaMb: 102400,
            warningPercent: 85,
        );
    }

    public function testCapacityAddsAddonBlocksToPlanPoolAndIgnoresNegativeBlocks(): void
    {
        self::assertSame(51200 + 3 * 10240, $this->calculator->capacityMb('EMAIL_ESSENTIALS', 3));
        self::assertSame(51200, $this->calculator->capacityMb('EMAIL_ESSENTIALS', -2));
    }

    public function testSummaryAggregatesMailboxesAndPricesAddonsInMinorUnits(): void
    {
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 2, [
            ['quota_mb' => 10240, 'used_mb' => 4000],
            ['quota_mb' => 20480, 'used_mb' => 512],
        ]);

        self::assertSame(71680, $summary->capacityMb);
        self::assertSame(30720, $summary->allocatedMb);
        self::assertSame(4512, $summary->usedMb);
        self::assertSame(40960, $summary->unallocatedMb());
        self::assertSame(8, $summary->remainingMailboxSlots());
        self::assertSame(598, $summary->addonMonthlyCostMinor);
        self::assertSame('USD', $summary->currency);
    }

    public function testUnknownPlanIsABusinessRuleViolation(): void
    {
        $this->assertBusinessRule('MAIL_UNKNOWN_PLAN', fn () => $this->calculator->capacityMb('EMAIL_GOLD', 0));
    }

    public function testAllocationWithinPoolIsAccepted(): void
    {
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 0, [['quota_mb' => 40960, 'used_mb' => 0]]);

        $this->calculator->assertCanAllocate($summary, 10240, isNewMailbox: true);
        $this->addToAssertionCount(1);
    }

    public function testExhaustedPoolSuggestsEnoughAddonBlocksAndTheirMonthlyCost(): void
    {
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 0, [['quota_mb' => 46080, 'used_mb' => 0]]);

        $extensions = $this->assertBusinessRule(
            'MAIL_POOL_EXHAUSTED',
            fn () => $this->calculator->assertCanAllocate($summary, 20480, isNewMailbox: true),
        );

        self::assertSame(15360, $extensions['shortfallMb']);
        self::assertSame(2, $extensions['suggestedAddonBlocks']);
        self::assertSame(['amountMinor' => 598, 'currency' => 'USD'], $extensions['suggestedAddonMonthlyCost']);
    }

    public function testGrowingAnExistingMailboxOnlyCountsTheDelta(): void
    {
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 0, [['quota_mb' => 51200, 'used_mb' => 100]]);

        $this->assertBusinessRule(
            'MAIL_POOL_EXHAUSTED',
            fn () => $this->calculator->assertCanAllocate($summary, 51712, currentQuotaMb: 51200, currentUsedMb: 100),
        );
        $this->calculator->assertCanAllocate($summary, 40960, currentQuotaMb: 51200, currentUsedMb: 100);
        $this->addToAssertionCount(1);
    }

    public function testQuotaCannotShrinkBelowCurrentUsage(): void
    {
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 0, [['quota_mb' => 10240, 'used_mb' => 9000]]);

        $extensions = $this->assertBusinessRule(
            'MAIL_QUOTA_BELOW_USAGE',
            fn () => $this->calculator->assertCanAllocate($summary, 8192, currentQuotaMb: 10240, currentUsedMb: 9000),
        );
        self::assertSame(9000, $extensions['usedMb']);
    }

    public function testMailboxLimitAppliesOnlyToNewMailboxes(): void
    {
        $full = array_fill(0, 10, ['quota_mb' => 1024, 'used_mb' => 0]);
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 0, $full);

        $this->assertBusinessRule('MAIL_MAILBOX_LIMIT', fn () => $this->calculator->assertCanAllocate($summary, 1024, isNewMailbox: true));
        $this->calculator->assertCanAllocate($summary, 2048, currentQuotaMb: 1024);
        $this->addToAssertionCount(1);
    }

    #[DataProvider('outOfRangeQuotas')]
    public function testQuotaOutsideConfiguredRangeIsRejected(int $quotaMb): void
    {
        $summary = $this->calculator->summarise('EMAIL_BUSINESS', 0, []);

        $this->assertBusinessRule('MAIL_QUOTA_OUT_OF_RANGE', fn () => $this->calculator->assertCanAllocate($summary, $quotaMb, isNewMailbox: true));
    }

    /**
     * @return iterable<string, array{int}>
     */
    public static function outOfRangeQuotas(): iterable
    {
        yield 'below minimum' => [511];
        yield 'above maximum' => [102401];
    }

    public function testRemovingAddonBlocksMayNotStrandAllocatedQuota(): void
    {
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 3, [['quota_mb' => 70000, 'used_mb' => 0]]);

        $extensions = $this->assertBusinessRule(
            'MAIL_ADDON_BELOW_ALLOCATION',
            fn () => $this->calculator->assertCanChangeAddonBlocks($summary, 1),
        );
        self::assertSame(2, $extensions['minimumAddonBlocks']);

        $this->calculator->assertCanChangeAddonBlocks($summary, 2);
        $this->expectException(BusinessRuleException::class);
        $this->calculator->assertCanChangeAddonBlocks($summary, -1);
    }

    #[DataProvider('usageLevels')]
    public function testMailboxUsageLevel(int $used, int $quota, float $percent, string $level): void
    {
        $usage = $this->calculator->mailboxUsage($used, $quota);

        self::assertSame($percent, $usage['percent']);
        self::assertSame($level, $usage['level']);
    }

    /**
     * @return iterable<string, array{int, int, float, string}>
     */
    public static function usageLevels(): iterable
    {
        yield 'comfortable' => [1000, 10240, 9.8, QuotaCalculator::LEVEL_OK];
        yield 'at warning threshold' => [8704, 10240, 85.0, QuotaCalculator::LEVEL_WARNING];
        yield 'exactly full' => [10240, 10240, 100.0, QuotaCalculator::LEVEL_FULL];
        yield 'over quota is capped at 100 percent' => [12000, 10240, 100.0, QuotaCalculator::LEVEL_FULL];
        yield 'zero quota' => [0, 0, 100.0, QuotaCalculator::LEVEL_FULL];
    }

    public function testEvenSplitRoundsDownTo256MbUnitsWithinBounds(): void
    {
        self::assertSame(16896, $this->calculator->evenSplitMb(51200, 3));
        self::assertSame(512, $this->calculator->evenSplitMb(1000, 10));
        self::assertSame(102400, $this->calculator->evenSplitMb(1024000, 2));
        self::assertSame(0, $this->calculator->evenSplitMb(51200, 0));
    }

    public function testBlocksForRoundsUp(): void
    {
        self::assertSame(0, $this->calculator->blocksFor(0));
        self::assertSame(1, $this->calculator->blocksFor(1));
        self::assertSame(1, $this->calculator->blocksFor(10240));
        self::assertSame(2, $this->calculator->blocksFor(10241));
    }
}
