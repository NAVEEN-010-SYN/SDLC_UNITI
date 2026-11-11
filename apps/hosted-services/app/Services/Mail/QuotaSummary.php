<?php

declare(strict_types=1);

namespace App\Services\Mail;

use JsonSerializable;

/**
 * Storage position of an email domain's pool. All sizes in MB, money in
 * integer minor units.
 */
final class QuotaSummary implements JsonSerializable
{
    public function __construct(
        public readonly string $planCode,
        public readonly int $planPoolMb,
        public readonly int $addonBlocks,
        public readonly int $addonMb,
        public readonly int $capacityMb,
        public readonly int $allocatedMb,
        public readonly int $usedMb,
        public readonly int $mailboxCount,
        public readonly int $maxMailboxes,
        public readonly int $addonMonthlyCostMinor,
        public readonly string $currency,
    ) {
    }

    public function unallocatedMb(): int
    {
        return max(0, $this->capacityMb - $this->allocatedMb);
    }

    public function allocationPercent(): float
    {
        return $this->capacityMb === 0 ? 0.0 : round($this->allocatedMb * 100 / $this->capacityMb, 1);
    }

    public function remainingMailboxSlots(): int
    {
        return max(0, $this->maxMailboxes - $this->mailboxCount);
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return [
            'planCode' => $this->planCode,
            'planPoolMb' => $this->planPoolMb,
            'addonBlocks' => $this->addonBlocks,
            'addonMb' => $this->addonMb,
            'capacityMb' => $this->capacityMb,
            'allocatedMb' => $this->allocatedMb,
            'unallocatedMb' => $this->unallocatedMb(),
            'allocationPercent' => $this->allocationPercent(),
            'usedMb' => $this->usedMb,
            'mailboxCount' => $this->mailboxCount,
            'maxMailboxes' => $this->maxMailboxes,
            'remainingMailboxSlots' => $this->remainingMailboxSlots(),
            'addonMonthlyCost' => ['amountMinor' => $this->addonMonthlyCostMinor, 'currency' => $this->currency],
        ];
    }
}
