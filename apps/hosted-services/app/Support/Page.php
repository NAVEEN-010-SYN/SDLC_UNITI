<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Http\Request;
use JsonSerializable;

/**
 * Pagination envelope required by the API conventions:
 * { items, page, pageSize, total }.
 *
 * @template T
 */
final class Page implements JsonSerializable
{
    /**
     * @param list<T> $items
     */
    public function __construct(
        public readonly array $items,
        public readonly int $page,
        public readonly int $pageSize,
        public readonly int $total,
    ) {
    }

    /**
     * Read and clamp ?page=&pageSize= from the request.
     *
     * @return array{0: int, 1: int} [page, pageSize]
     */
    public static function paramsFrom(Request $request): array
    {
        $default = (int) config('hosted.pagination.default_page_size', 25);
        $max = (int) config('hosted.pagination.max_page_size', 100);

        $page = max(1, (int) $request->query('page', '1'));
        $pageSize = (int) $request->query('pageSize', (string) $default);
        $pageSize = $pageSize < 1 ? $default : min($pageSize, $max);

        return [$page, $pageSize];
    }

    /**
     * @template U
     * @param callable(T): U $mapper
     * @return Page<U>
     */
    public function map(callable $mapper): self
    {
        return new self(array_map($mapper, $this->items), $this->page, $this->pageSize, $this->total);
    }

    public function totalPages(): int
    {
        return $this->pageSize === 0 ? 0 : (int) ceil($this->total / $this->pageSize);
    }

    /**
     * @return array{items: list<T>, page: int, pageSize: int, total: int}
     */
    public function jsonSerialize(): array
    {
        return [
            'items' => $this->items,
            'page' => $this->page,
            'pageSize' => $this->pageSize,
            'total' => $this->total,
        ];
    }
}
