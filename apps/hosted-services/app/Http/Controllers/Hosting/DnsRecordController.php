<?php

declare(strict_types=1);

namespace App\Http\Controllers\Hosting;

use App\Enums\DnsRecordType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hosting\DnsRecordRequest;
use App\Http\Resources\DnsRecordResource;
use App\Services\Dns\DnsZoneService;
use App\Services\Hosting\DomainService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class DnsRecordController extends Controller
{
    public function __construct(
        private readonly DnsZoneService $zones,
        private readonly DomainService $domains,
    ) {
    }

    public function index(Request $request, string $accountId, string $domainId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);
        $type = $this->enumQuery($request, 'type', DnsRecordType::class);

        return $this->ok(DnsRecordResource::page($this->zones->list($accountId, $domainId, $page, $pageSize, $type), $request));
    }

    public function store(DnsRecordRequest $request, string $accountId, string $domainId): JsonResponse
    {
        $record = $this->zones->create($accountId, $domainId, $request->validated(), $this->principal($request));

        return $this->created(
            (new DnsRecordResource($record))->resolve($request),
            sprintf('/api/v1/accounts/%s/domains/%s/dns-records/%s', $accountId, $domainId, $record->id),
        );
    }

    public function update(DnsRecordRequest $request, string $accountId, string $domainId, string $recordId): JsonResponse
    {
        $record = $this->zones->update($accountId, $domainId, $recordId, $request->payload());

        return $this->ok((new DnsRecordResource($record))->resolve($request));
    }

    public function destroy(string $accountId, string $domainId, string $recordId): Response
    {
        $this->zones->delete($accountId, $domainId, $recordId);

        return $this->noContent();
    }

    /**
     * Download the zone in RFC 1035 master-file format.
     */
    public function export(string $accountId, string $domainId): Response
    {
        $domain = $this->domains->get($accountId, $domainId);

        return new Response($this->zones->export($accountId, $domainId), 200, [
            'Content-Type' => 'text/dns; charset=utf-8',
            'Content-Disposition' => sprintf('attachment; filename="%s.zone"', $domain->name),
        ]);
    }
}
