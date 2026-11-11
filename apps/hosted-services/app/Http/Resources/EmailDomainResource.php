<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\EmailDomain;
use App\Services\Mail\QuotaSummary;
use Illuminate\Http\Request;

/**
 * Wraps an email domain together with its pooled storage summary, which is
 * always computed by the caller (EmailDomainService::quotaFor) so the
 * resource performs no I/O of its own.
 */
final class EmailDomainResource extends ApiResource
{
    public function __construct(EmailDomain $domain, private readonly QuotaSummary $quota)
    {
        parent::__construct($domain);
    }

    public function toArray(Request $request): array
    {
        /** @var EmailDomain $domain */
        $domain = $this->resource;

        return [
            'id' => $domain->id,
            'domain' => $domain->domain,
            'planCode' => $domain->plan_code,
            'addonBlocks' => $domain->addon_blocks,
            'mxVerified' => (bool) $domain->mx_verified,
            'status' => $domain->status->value,
            'quota' => $this->quota->jsonSerialize(),
            'createdAt' => self::iso($domain->created_at),
        ];
    }
}
