<?php

declare(strict_types=1);

namespace App\Http\Controllers\Voice;

use App\Http\Controllers\Controller;
use App\Http\Requests\Voice\HuntGroupRequest;
use App\Http\Resources\HuntGroupResource;
use App\Services\Voice\HuntGroupService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class HuntGroupController extends Controller
{
    public function __construct(private readonly HuntGroupService $groups)
    {
    }

    public function index(Request $request, string $accountId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);

        return $this->ok(HuntGroupResource::page($this->groups->list($accountId, $page, $pageSize), $request));
    }

    public function show(Request $request, string $accountId, string $groupId): JsonResponse
    {
        return $this->ok((new HuntGroupResource($this->groups->get($accountId, $groupId)))->resolve($request));
    }

    public function store(HuntGroupRequest $request, string $accountId): JsonResponse
    {
        $group = $this->groups->create($accountId, $request->validated(), $this->principal($request));

        return $this->created(
            (new HuntGroupResource($group))->resolve($request),
            sprintf('/api/v1/accounts/%s/hunt-groups/%s', $accountId, $group->id),
        );
    }

    public function update(HuntGroupRequest $request, string $accountId, string $groupId): JsonResponse
    {
        $group = $this->groups->update($accountId, $groupId, $request->validated());

        return $this->ok((new HuntGroupResource($group))->resolve($request));
    }

    public function destroy(Request $request, string $accountId, string $groupId): Response
    {
        $this->groups->delete($accountId, $groupId, $this->principal($request));

        return $this->noContent();
    }
}
