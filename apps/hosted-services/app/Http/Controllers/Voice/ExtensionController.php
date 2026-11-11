<?php

declare(strict_types=1);

namespace App\Http\Controllers\Voice;

use App\Http\Controllers\Controller;
use App\Http\Requests\Voice\ExtensionRequest;
use App\Http\Requests\Voice\ReplaceForwardingRulesRequest;
use App\Http\Resources\ExtensionResource;
use App\Http\Resources\ForwardingRuleResource;
use App\Services\Voice\ExtensionService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class ExtensionController extends Controller
{
    public function __construct(private readonly ExtensionService $extensions)
    {
    }

    public function index(Request $request, string $accountId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);
        $result = $this->extensions->list($accountId, $page, $pageSize, $this->stringQuery($request, 'q'));

        return $this->ok(ExtensionResource::page($result, $request));
    }

    public function show(Request $request, string $accountId, string $extensionId): JsonResponse
    {
        return $this->ok((new ExtensionResource($this->extensions->get($accountId, $extensionId)))->resolve($request));
    }

    public function store(ExtensionRequest $request, string $accountId): JsonResponse
    {
        $extension = $this->extensions->create($accountId, $request->payload(), $this->principal($request));

        return $this->created(
            (new ExtensionResource($extension))->resolve($request),
            sprintf('/api/v1/accounts/%s/extensions/%s', $accountId, $extension->id),
        );
    }

    public function update(ExtensionRequest $request, string $accountId, string $extensionId): JsonResponse
    {
        $extension = $this->extensions->update($accountId, $extensionId, $request->payload());

        return $this->ok((new ExtensionResource($extension))->resolve($request));
    }

    public function destroy(Request $request, string $accountId, string $extensionId): Response
    {
        $this->extensions->delete($accountId, $extensionId, $this->principal($request));

        return $this->noContent();
    }

    public function forwardingRules(Request $request, string $accountId, string $extensionId): JsonResponse
    {
        $rules = $this->extensions->forwardingRules($accountId, $extensionId);

        return $this->ok(['items' => ForwardingRuleResource::list($rules, $request)]);
    }

    public function replaceForwardingRules(ReplaceForwardingRulesRequest $request, string $accountId, string $extensionId): JsonResponse
    {
        $rules = $this->extensions->replaceForwardingRules($accountId, $extensionId, $request->forwardingRules());

        return $this->ok(['items' => ForwardingRuleResource::list($rules, $request)]);
    }
}
