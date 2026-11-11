<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Lifecycle of a number port-in request.
 *
 *   DRAFT -> SUBMITTED -> PENDING_FOC -> FOC_RECEIVED -> COMPLETED
 *                \             \              \
 *                 -> REJECTED   -> REJECTED    -> FAILED
 *   REJECTED -> DRAFT (customer corrects and resubmits)
 *   Any non-terminal state -> CANCELLED (subject to FOC cut-off)
 *
 * FOC = Firm Order Commitment: the date/time the losing carrier commits to
 * release the numbers.
 */
enum PortingStatus: string
{
    case Draft = 'DRAFT';
    case Submitted = 'SUBMITTED';
    case PendingFoc = 'PENDING_FOC';
    case FocReceived = 'FOC_RECEIVED';
    case Completed = 'COMPLETED';
    case Rejected = 'REJECTED';
    case Cancelled = 'CANCELLED';
    case Failed = 'FAILED';

    public function isTerminal(): bool
    {
        return match ($this) {
            self::Completed, self::Cancelled, self::Failed => true,
            default => false,
        };
    }

    /**
     * Whether the customer may still edit numbers, LOA and billing details.
     */
    public function isEditable(): bool
    {
        return $this === self::Draft;
    }
}
