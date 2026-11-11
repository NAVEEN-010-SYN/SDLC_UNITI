<?php

declare(strict_types=1);

namespace App\Enums;

enum CertificateStatus: string
{
    case PendingValidation = 'PENDING_VALIDATION';
    case Issued = 'ISSUED';
    case Expired = 'EXPIRED';
    case Revoked = 'REVOKED';
    case Failed = 'FAILED';

    public function isActive(): bool
    {
        return $this === self::Issued;
    }
}
