<?php

declare(strict_types=1);

namespace App\Http\Requests\Hosting;

use App\Http\Requests\ApiFormRequest;
use Illuminate\Validation\Rule;

/**
 * Body for certificate lifecycle actions:
 *  - POST .../certificates/{id}/revoke  { "reason": "KEY_COMPROMISE" }
 *  - PATCH .../certificates/{id}        { "auto_renew": false }
 *
 * Revocation reasons are the RFC 5280 codes a customer may legitimately
 * assert; CA-only reasons (e.g. caCompromise) are not offered.
 */
final class CertificateChangeRequest extends ApiFormRequest
{
    public const REVOCATION_REASONS = [
        'UNSPECIFIED' => 'unspecified',
        'KEY_COMPROMISE' => 'keyCompromise',
        'SUPERSEDED' => 'superseded',
        'CESSATION_OF_OPERATION' => 'cessationOfOperation',
    ];

    public function rules(): array
    {
        if ($this->isMethod('PATCH')) {
            return ['auto_renew' => ['required', 'boolean']];
        }

        return ['reason' => ['required', Rule::in(array_keys(self::REVOCATION_REASONS))]];
    }

    public function rfc5280Reason(): string
    {
        return self::REVOCATION_REASONS[(string) $this->validated()['reason']];
    }

    public function autoRenew(): bool
    {
        return (bool) $this->validated()['auto_renew'];
    }
}
