<?php

declare(strict_types=1);

namespace App\Http\Requests\Mail;

use App\Http\Requests\ApiFormRequest;

/**
 * POST creates a mailbox; PATCH changes quota, forwarding or suspension.
 * The address (local part) cannot be renamed in place because mail clients
 * and the platform key on it; customers create a new mailbox plus an alias.
 */
final class MailboxRequest extends ApiFormRequest
{
    public function rules(): array
    {
        $quotaMin = (int) config('hosted.mail.min_mailbox_quota_mb', 512);
        $quotaMax = (int) config('hosted.mail.max_mailbox_quota_mb', 102400);

        $rules = [
            'local_part' => ['required', 'string', 'max:64'],
            'display_name' => ['required', 'string', 'min:1', 'max:120'],
            'quota_mb' => ['nullable', 'integer', "between:$quotaMin,$quotaMax"],
        ];

        if (!$this->isMethod('PATCH')) {
            return $rules;
        }

        return self::partial($rules + [
            'forwarding_enabled' => ['boolean'],
            'forwarding_address' => ['nullable', 'string', 'email:rfc', 'max:254', 'required_if:forwarding_enabled,true'],
            'keep_forwarded_copy' => ['boolean'],
            'suspended' => ['boolean'],
        ], immutable: ['local_part']);
    }
}
