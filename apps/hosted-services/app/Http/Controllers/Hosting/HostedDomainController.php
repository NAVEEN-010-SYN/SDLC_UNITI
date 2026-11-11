<?php

declare(strict_types=1);

namespace App\Http\Controllers\Hosting;

use App\Http\Controllers\Controller;
use App\Http\Requests\Hosting\HostedDomainRequest;
use App\Http\Resources\HostedDomainResource;
use App\Services\Hosting\DomainService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class HostedDomainController extends Controller
{
    public function __construct(private readonly DomainService $domains)
    {
    }

    public function index(Request $request, string $accountId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);

        return $this->ok(HostedDomainResource::page($this->domains->list($accountId, $page, $pageSize), $request));
    }

    public function show(Request $request, string $accountId, string $domainId): JsonResponse
    {
        return $this->ok((new HostedDomainResource($this->domains->get($accountId, $domainId)))->resolve($request));
    }

    /**
     * The response carries the nameservers the customer must set at their
     * registrar; the domain stays PENDING until delegation is confirmed.
     */
    public function store(HostedDomainRequest $request, string $accountId): JsonResponse
    {
        $data = $request->validated();
        $result = $this->domains->add($accountId, (string) $data['name'], (string) $data['hosting_plan'], $this->principal($request));
        $domain = $result['domain'];

        return $this->created(
            (new HostedDomainResource($domain))->resolve($request) + ['requiredNameservers' => $result['nameservers']],
            sprintf('/api/v1/accounts/%s/domains/%s', $accountId, $domain->id),
        );
    }

    public function checkDelegation(Request $request, string $accountId, string $domainId): JsonResponse
    {
        return $this->ok((new HostedDomainResource($this->domains->checkDelegation($accountId, $domainId)))->resolve($request));
    }

    public function destroy(Request $request, string $accountId, string $domainId): Response
    {
        $this->domains->remove($accountId, $domainId, $this->principal($request));

        return $this->noContent();
    }
}
