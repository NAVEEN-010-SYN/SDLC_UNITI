<?php

declare(strict_types=1);

namespace App\Http\Requests\Mail;

use App\Http\Requests\ApiFormRequest;

/**
 * PUT /email-domains/{id}/storage — sets the absolute number of purchased
 * add-on storage blocks (not a delta, so retries are idempotent).
 */
final class AddonBlocksRequest extends ApiFormRequest
{
    public const MAX_BLOCKS = 500;

    public function rules(): array
    {
        return [
            'addon_blocks' => ['required', 'integer', 'min:0', 'max:' . self::MAX_BLOCKS],
        ];
    }

    public function blocks(): int
    {
        return (int) $this->validated()['addon_blocks'];
    }
}
