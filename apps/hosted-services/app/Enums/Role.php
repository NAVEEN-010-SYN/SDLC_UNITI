<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Platform roles as defined in the monorepo conventions. Only the subset
 * listed in config('auth_jwt.allowed_roles') may call this API.
 */
enum Role: string
{
    case Consumer = 'CONSUMER';
    case BusinessAdmin = 'BUSINESS_ADMIN';
    case BusinessUser = 'BUSINESS_USER';
    case PartnerAdmin = 'PARTNER_ADMIN';
    case PartnerAgent = 'PARTNER_AGENT';
    case WholesaleBuyer = 'WHOLESALE_BUYER';
    case SupportAgent = 'SUPPORT_AGENT';

    /**
     * Whether the role may change configuration (as opposed to read-only use).
     */
    public function canManage(): bool
    {
        return match ($this) {
            self::BusinessAdmin, self::PartnerAdmin, self::SupportAgent => true,
            default => false,
        };
    }

    /**
     * Whether the role acts on behalf of accounts it does not own.
     */
    public function isDelegated(): bool
    {
        return match ($this) {
            self::PartnerAdmin, self::PartnerAgent => true,
            default => false,
        };
    }
}
