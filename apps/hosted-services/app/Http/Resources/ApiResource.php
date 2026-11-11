<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Support\Page;
use DateTimeInterface;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Base for API representations. Resources decide exactly which attributes
 * leave the service: provisioning references, hashes and carrier secrets
 * are never serialised.
 */
abstract class ApiResource extends JsonResource
{
    /**
     * ISO-8601 UTC with a "Z" designator, as required on the wire.
     */
    protected static function iso(?DateTimeInterface $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return \DateTimeImmutable::createFromInterface($value)
            ->setTimezone(new \DateTimeZone('UTC'))
            ->format('Y-m-d\TH:i:s\Z');
    }

    /**
     * Render a service-layer page through this resource.
     *
     * @param Page<mixed> $page
     * @return array{items: list<array<string, mixed>>, page: int, pageSize: int, total: int}
     */
    public static function page(Page $page, Request $request): array
    {
        return $page->map(static fn ($model) => (new static($model))->resolve($request))->jsonSerialize();
    }

    /**
     * @param iterable<mixed> $models
     * @return list<array<string, mixed>>
     */
    public static function list(iterable $models, Request $request): array
    {
        $items = [];
        foreach ($models as $model) {
            $items[] = (new static($model))->resolve($request);
        }

        return $items;
    }
}
