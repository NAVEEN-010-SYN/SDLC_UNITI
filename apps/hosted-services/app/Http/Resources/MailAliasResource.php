<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\MailAlias;
use Illuminate\Http\Request;

/**
 * @property MailAlias $resource
 */
final class MailAliasResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $alias = $this->resource;

        return [
            'id' => $alias->id,
            'emailDomainId' => $alias->email_domain_id,
            'localPart' => $alias->local_part,
            'destinations' => array_values($alias->destinations),
            'description' => $alias->description,
        ];
    }
}
