<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Exceptions\ResourceNotFoundException;
use App\Models\BaseModel;
use App\Support\Page;
use Illuminate\Database\Eloquent\Builder;

/**
 * Base for repositories whose table carries an account_id column. Every
 * lookup is scoped by account so an id from another account is
 * indistinguishable from a missing one (no enumeration oracle).
 *
 * @template TModel of BaseModel
 */
abstract class AccountScopedRepository
{
    /**
     * @return class-string<TModel>
     */
    abstract protected function modelClass(): string;

    /**
     * Human-readable resource name used in 404 problems.
     */
    abstract protected function resourceName(): string;

    /**
     * @return Builder<TModel>
     */
    protected function query(): Builder
    {
        $class = $this->modelClass();

        return $class::query();
    }

    /**
     * @return Builder<TModel>
     */
    protected function forAccount(string $accountId): Builder
    {
        return $this->query()->where('account_id', $accountId);
    }

    /**
     * @return TModel
     */
    public function getForAccount(string $accountId, string $id): BaseModel
    {
        $model = $this->forAccount($accountId)->whereKey($id)->first();
        if ($model === null) {
            throw ResourceNotFoundException::of($this->resourceName(), $id);
        }

        return $model;
    }

    /**
     * @param TModel $model
     * @return TModel
     */
    public function save(BaseModel $model): BaseModel
    {
        $model->save();

        return $model;
    }

    /**
     * @param TModel $model
     */
    public function delete(BaseModel $model): void
    {
        $model->delete();
    }

    /**
     * @param Builder<TModel> $query
     * @return Page<TModel>
     */
    protected function paginate(Builder $query, int $page, int $pageSize): Page
    {
        $total = (clone $query)->count();
        $items = $query->forPage($page, $pageSize)->get()->all();

        return new Page(array_values($items), $page, $pageSize, $total);
    }
}
