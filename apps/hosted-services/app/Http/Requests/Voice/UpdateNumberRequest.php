<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Enums\Role;
use App\Exceptions\AccessDeniedException;
use App\Http\Middleware\AuthenticateJwt;
use App\Http\Requests\ApiFormRequest;

/**
 * PATCH /numbers/{id}. Marking the E911 address verified is a regulated
 * attestation performed by Uniti support after checking the dispatchable
 * address, so customers and partners may not set it themselves.
 */
final class UpdateNumberRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'label' => ['sometimes', 'nullable', 'string', 'max:60'],
            'extension_id' => ['sometimes', 'nullable', 'uuid'],
            'emergency_address_verified' => ['sometimes', 'boolean'],
        ];
    }

    protected function passedValidation(): void
    {
        if (!$this->has('emergency_address_verified')) {
            return;
        }

        if (!AuthenticateJwt::principal($this)->hasRole(Role::SupportAgent)) {
            throw new AccessDeniedException('Only Uniti support can change the emergency address verification.');
        }
    }
}
