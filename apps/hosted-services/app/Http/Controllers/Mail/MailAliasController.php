<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mail;

use App\Http\Controllers\Controller;
use App\Http\Requests\Mail\MailAliasRequest;
use App\Http\Resources\MailAliasResource;
use App\Services\Mail\MailAliasService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class MailAliasController extends Controller
{
    public function __construct(private readonly MailAliasService $aliases)
    {
    }

    public function index(Request $request, string $accountId, string $domainId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);

        return $this->ok(MailAliasResource::page($this->aliases->list($accountId, $domainId, $page, $pageSize), $request));
    }

    public function store(MailAliasRequest $request, string $accountId, string $domainId): JsonResponse
    {
        $alias = $this->aliases->create($accountId, $domainId, $request->validated());

        return $this->created(
            (new MailAliasResource($alias))->resolve($request),
            sprintf('/api/v1/accounts/%s/email-domains/%s/aliases/%s', $accountId, $domainId, $alias->id),
        );
    }

    public function update(MailAliasRequest $request, string $accountId, string $domainId, string $aliasId): JsonResponse
    {
        $alias = $this->aliases->update($accountId, $domainId, $aliasId, $request->payload());

        return $this->ok((new MailAliasResource($alias))->resolve($request));
    }

    public function destroy(string $accountId, string $domainId, string $aliasId): Response
    {
        $this->aliases->delete($accountId, $domainId, $aliasId);

        return $this->noContent();
    }
}
