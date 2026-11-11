<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mail;

use App\Http\Controllers\Controller;
use App\Http\Requests\Mail\AddonBlocksRequest;
use App\Http\Requests\Mail\EmailDomainRequest;
use App\Http\Resources\EmailDomainResource;
use App\Models\EmailDomain;
use App\Services\Mail\EmailDomainService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class EmailDomainController extends Controller
{
    public function __construct(private readonly EmailDomainService $domains)
    {
    }

    /**
     * An account holds a handful of email domains, so the list is returned
     * whole (still in the standard envelope) with each domain's quota.
     */
    public function index(Request $request, string $accountId): JsonResponse
    {
        $items = [];
        foreach ($this->domains->listWithQuota($accountId) as $row) {
            $resource = new EmailDomainResource($row['domain'], $row['quota']);
            $items[] = $resource->resolve($request);
        }

        return $this->ok(['items' => $items, 'page' => 1, 'pageSize' => count($items), 'total' => count($items)]);
    }

    public function show(Request $request, string $accountId, string $domainId): JsonResponse
    {
        return $this->ok($this->present($this->domains->get($accountId, $domainId), $request));
    }

    public function store(EmailDomainRequest $request, string $accountId): JsonResponse
    {
        $data = $request->validated();
        $domain = $this->domains->register($accountId, (string) $data['domain'], (string) $data['plan_code'], $this->principal($request));

        return $this->created(
            $this->present($domain, $request),
            sprintf('/api/v1/accounts/%s/email-domains/%s', $accountId, $domain->id),
        );
    }

    public function verifyMx(Request $request, string $accountId, string $domainId): JsonResponse
    {
        $result = $this->domains->verifyMx($accountId, $domainId);

        return $this->ok($this->present($result['domain'], $request) + ['observedMx' => $result['observedMx']]);
    }

    public function setStorage(AddonBlocksRequest $request, string $accountId, string $domainId): JsonResponse
    {
        $domain = $this->domains->setAddonBlocks($accountId, $domainId, $request->blocks(), $this->principal($request));

        return $this->ok($this->present($domain, $request));
    }

    /**
     * @return array<string, mixed>
     */
    private function present(EmailDomain $domain, Request $request): array
    {
        return (new EmailDomainResource($domain, $this->domains->quotaFor($domain)))->resolve($request);
    }
}
