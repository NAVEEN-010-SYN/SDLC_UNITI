<?php

declare(strict_types=1);

namespace App\Services\Mail;

use App\Exceptions\BusinessRuleException;
use InvalidArgumentException;

/**
 * Pure quota arithmetic for hosted email. Storage is pooled per domain:
 * capacity = plan pool + add-on blocks; individual mailbox quotas are
 * carved out of that pool and the sum may never exceed capacity.
 *
 * No I/O: callers pass the current allocations in, which keeps this class
 * trivially unit-testable.
 */
final class QuotaCalculator
{
    public const LEVEL_OK = 'OK';
    public const LEVEL_WARNING = 'WARNING';
    public const LEVEL_FULL = 'FULL';

    /**
     * @param array<string, array{pool_mb: int, max_mailboxes: int}> $plans
     */
    public function __construct(
        private readonly array $plans,
        private readonly int $addonBlockMb,
        private readonly int $addonBlockPriceMinor,
        private readonly string $currency,
        private readonly int $minMailboxQuotaMb,
        private readonly int $maxMailboxQuotaMb,
        private readonly int $warningPercent = 85,
    ) {
        if ($addonBlockMb <= 0) {
            throw new InvalidArgumentException('Add-on block size must be positive.');
        }
    }

    public static function fromConfig(array $mail): self
    {
        return new self(
            plans: $mail['plans'],
            addonBlockMb: (int) $mail['addon_block_mb'],
            addonBlockPriceMinor: (int) $mail['addon_block_price_minor'],
            currency: (string) $mail['currency'],
            minMailboxQuotaMb: (int) $mail['min_mailbox_quota_mb'],
            maxMailboxQuotaMb: (int) $mail['max_mailbox_quota_mb'],
            warningPercent: (int) $mail['quota_warning_percent'],
        );
    }

    public function capacityMb(string $planCode, int $addonBlocks): int
    {
        return $this->plan($planCode)['pool_mb'] + max(0, $addonBlocks) * $this->addonBlockMb;
    }

    /**
     * @param list<array{quota_mb: int, used_mb: int}> $mailboxes
     */
    public function summarise(string $planCode, int $addonBlocks, array $mailboxes): QuotaSummary
    {
        $plan = $this->plan($planCode);
        $addonBlocks = max(0, $addonBlocks);

        return new QuotaSummary(
            planCode: $planCode,
            planPoolMb: $plan['pool_mb'],
            addonBlocks: $addonBlocks,
            addonMb: $addonBlocks * $this->addonBlockMb,
            capacityMb: $this->capacityMb($planCode, $addonBlocks),
            allocatedMb: array_sum(array_column($mailboxes, 'quota_mb')),
            usedMb: array_sum(array_column($mailboxes, 'used_mb')),
            mailboxCount: count($mailboxes),
            maxMailboxes: $plan['max_mailboxes'],
            addonMonthlyCostMinor: $addonBlocks * $this->addonBlockPriceMinor,
            currency: $this->currency,
        );
    }

    /**
     * Guard for creating a mailbox or changing its quota.
     *
     * @param int  $currentQuotaMb Quota of the mailbox being changed (0 when creating).
     * @param int  $currentUsedMb  Used storage of the mailbox being changed.
     * @param bool $isNewMailbox   Whether a mailbox slot is consumed.
     */
    public function assertCanAllocate(
        QuotaSummary $summary,
        int $requestedQuotaMb,
        int $currentQuotaMb = 0,
        int $currentUsedMb = 0,
        bool $isNewMailbox = false,
    ): void {
        if ($requestedQuotaMb < $this->minMailboxQuotaMb || $requestedQuotaMb > $this->maxMailboxQuotaMb) {
            throw new BusinessRuleException(
                sprintf('Mailbox quota must be between %d MB and %d MB.', $this->minMailboxQuotaMb, $this->maxMailboxQuotaMb),
                'MAIL_QUOTA_OUT_OF_RANGE',
            );
        }

        if ($isNewMailbox && $summary->remainingMailboxSlots() === 0) {
            throw new BusinessRuleException(
                sprintf('The %s plan allows at most %d mailboxes.', $summary->planCode, $summary->maxMailboxes),
                'MAIL_MAILBOX_LIMIT',
            );
        }

        if ($requestedQuotaMb < $currentUsedMb) {
            throw new BusinessRuleException(
                sprintf('The mailbox already uses %d MB; the quota cannot be set below current usage.', $currentUsedMb),
                'MAIL_QUOTA_BELOW_USAGE',
                ['usedMb' => $currentUsedMb],
            );
        }

        $delta = $requestedQuotaMb - $currentQuotaMb;
        if ($delta > $summary->unallocatedMb()) {
            $shortfall = $delta - $summary->unallocatedMb();
            $blocks = $this->blocksFor($shortfall);

            throw new BusinessRuleException(
                sprintf('The storage pool has %d MB unallocated but %d MB is needed.', $summary->unallocatedMb(), $delta),
                'MAIL_POOL_EXHAUSTED',
                [
                    'shortfallMb' => $shortfall,
                    'suggestedAddonBlocks' => $blocks,
                    'suggestedAddonMonthlyCost' => [
                        'amountMinor' => $blocks * $this->addonBlockPriceMinor,
                        'currency' => $this->currency,
                    ],
                ],
            );
        }
    }

    /**
     * Guard for removing add-on blocks: capacity must still cover the sum
     * of allocated mailbox quotas.
     */
    public function assertCanChangeAddonBlocks(QuotaSummary $summary, int $newAddonBlocks): void
    {
        if ($newAddonBlocks < 0) {
            throw new BusinessRuleException('Add-on block count cannot be negative.', 'MAIL_ADDON_NEGATIVE');
        }

        $newCapacity = $summary->planPoolMb + $newAddonBlocks * $this->addonBlockMb;
        if ($newCapacity < $summary->allocatedMb) {
            throw new BusinessRuleException(
                sprintf(
                    'Mailbox quotas total %d MB; reducing to %d add-on blocks would leave only %d MB.',
                    $summary->allocatedMb,
                    $newAddonBlocks,
                    $newCapacity,
                ),
                'MAIL_ADDON_BELOW_ALLOCATION',
                ['minimumAddonBlocks' => $this->blocksFor($summary->allocatedMb - $summary->planPoolMb)],
            );
        }
    }

    /**
     * Usage level for a single mailbox, used for portal badges and the
     * warning notification job.
     *
     * @return array{usedMb: int, quotaMb: int, percent: float, level: string}
     */
    public function mailboxUsage(int $usedMb, int $quotaMb): array
    {
        $percent = $quotaMb <= 0 ? 100.0 : round(min($usedMb, $quotaMb) * 100 / $quotaMb, 1);
        $level = match (true) {
            $usedMb >= $quotaMb => self::LEVEL_FULL,
            $percent >= $this->warningPercent => self::LEVEL_WARNING,
            default => self::LEVEL_OK,
        };

        return ['usedMb' => $usedMb, 'quotaMb' => $quotaMb, 'percent' => $percent, 'level' => $level];
    }

    /**
     * Distribute capacity evenly across N mailboxes, rounded down to whole
     * 256 MB units so the remainder stays visible as unallocated.
     */
    public function evenSplitMb(int $capacityMb, int $mailboxCount): int
    {
        if ($mailboxCount <= 0) {
            return 0;
        }

        $share = intdiv($capacityMb, $mailboxCount);
        $share -= $share % 256;

        return max($this->minMailboxQuotaMb, min($share, $this->maxMailboxQuotaMb));
    }

    public function blocksFor(int $shortfallMb): int
    {
        return $shortfallMb <= 0 ? 0 : intdiv($shortfallMb + $this->addonBlockMb - 1, $this->addonBlockMb);
    }

    /**
     * @return array{pool_mb: int, max_mailboxes: int}
     */
    private function plan(string $planCode): array
    {
        if (!isset($this->plans[$planCode])) {
            throw new BusinessRuleException(sprintf('Unknown hosted email plan "%s".', $planCode), 'MAIL_UNKNOWN_PLAN');
        }

        return $this->plans[$planCode];
    }
}
