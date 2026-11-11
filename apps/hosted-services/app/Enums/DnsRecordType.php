<?php

declare(strict_types=1);

namespace App\Enums;

enum DnsRecordType: string
{
    case A = 'A';
    case AAAA = 'AAAA';
    case CNAME = 'CNAME';
    case MX = 'MX';
    case TXT = 'TXT';
    case SRV = 'SRV';
    case CAA = 'CAA';
    case NS = 'NS';

    /**
     * Record types that require a numeric priority field.
     */
    public function requiresPriority(): bool
    {
        return $this === self::MX || $this === self::SRV;
    }

    /**
     * Record types whose value is a hostname that must not be an IP literal.
     */
    public function targetsHostname(): bool
    {
        return match ($this) {
            self::CNAME, self::MX, self::NS, self::SRV => true,
            default => false,
        };
    }

    /**
     * Record types customers may manage. Apex NS/SOA are platform-owned.
     */
    public function isCustomerManaged(): bool
    {
        return $this !== self::NS;
    }
}
