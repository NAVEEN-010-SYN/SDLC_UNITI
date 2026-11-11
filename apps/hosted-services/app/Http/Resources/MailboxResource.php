<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Mailbox;
use App\Services\Mail\QuotaCalculator;
use Illuminate\Http\Request;

/**
 * @property Mailbox $resource
 */
final class MailboxResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $mailbox = $this->resource;
        $usage = app(QuotaCalculator::class)->mailboxUsage((int) $mailbox->used_mb, (int) $mailbox->quota_mb);

        return [
            'id' => $mailbox->id,
            'emailDomainId' => $mailbox->email_domain_id,
            'address' => $mailbox->address(),
            'displayName' => $mailbox->display_name,
            'quotaMb' => $usage['quotaMb'],
            'usedMb' => $usage['usedMb'],
            'usagePercent' => $usage['percent'],
            'usageLevel' => $usage['level'],
            'usageSyncedAt' => self::iso($mailbox->usage_synced_at),
            'forwarding' => [
                'enabled' => (bool) $mailbox->forwarding_enabled,
                'address' => $mailbox->forwarding_address,
                'keepCopy' => (bool) $mailbox->keep_forwarded_copy,
            ],
            'status' => $mailbox->status->value,
            'createdAt' => self::iso($mailbox->created_at),
        ];
    }
}
