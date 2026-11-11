<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Provisioning state of any hosted resource mirrored from a downstream
 * platform (number, extension, mailbox, domain).
 */
enum ProvisioningStatus: string
{
    case Pending = 'PENDING';
    case Active = 'ACTIVE';
    case Suspended = 'SUSPENDED';
    case Failed = 'FAILED';
    case Deprovisioned = 'DEPROVISIONED';
}
