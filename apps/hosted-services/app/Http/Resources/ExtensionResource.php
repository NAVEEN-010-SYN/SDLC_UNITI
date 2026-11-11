<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Extension;
use Illuminate\Http\Request;

/**
 * @property Extension $resource
 */
final class ExtensionResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $extension = $this->resource;

        return [
            'id' => $extension->id,
            'accountId' => $extension->account_id,
            'number' => $extension->number,
            'displayName' => $extension->display_name,
            'email' => $extension->email,
            'callerIdNumberId' => $extension->caller_id_number_id,
            'doNotDisturb' => (bool) $extension->do_not_disturb,
            'status' => $extension->status->value,
            'createdAt' => self::iso($extension->created_at),
            'updatedAt' => self::iso($extension->updated_at),
        ];
    }
}
