<?php

declare(strict_types=1);

namespace App\Http\Requests\Hosting;

use App\Http\Requests\ApiFormRequest;

/**
 * POST /domains/{id}/certificates orders a DNS-01 validated certificate.
 */
final class CertificateRequest extends ApiFormRequest
{
    public function rules(): array
    {
        $maxSans = (int) config('hosted.ssl.max_sans', 20);

        return [
            'common_name' => ['required', 'string', 'max:253'],
            'subject_alt_names' => ['sometimes', 'array', 'list', 'max:' . $maxSans],
            'subject_alt_names.*' => ['required', 'string', 'max:253', 'distinct:ignore_case'],
            'auto_renew' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return list<string>
     */
    public function subjectAltNames(): array
    {
        return array_values($this->validated()['subject_alt_names'] ?? []);
    }

    public function autoRenew(): bool
    {
        return (bool) ($this->validated()['auto_renew'] ?? true);
    }
}
