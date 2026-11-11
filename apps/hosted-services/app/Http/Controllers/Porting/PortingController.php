<?php

declare(strict_types=1);

namespace App\Http\Controllers\Porting;

use App\Enums\PortingStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Porting\CancelPortingRequest;
use App\Http\Requests\Porting\PortingDraftRequest;
use App\Http\Resources\PortingRequestResource;
use App\Models\PortingRequest;
use App\Services\Porting\PortingService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Customer-facing number port-in lifecycle. Status changes are explicit
 * action endpoints (submit, cancel, reopen) rather than a writable status
 * field, so every move goes through the state machine guards.
 */
final class PortingController extends Controller
{
    public function __construct(private readonly PortingService $porting)
    {
    }

    public function index(Request $request, string $accountId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);
        $status = $this->enumQuery($request, 'status', PortingStatus::class);

        return $this->ok(PortingRequestResource::page($this->porting->list($accountId, $page, $pageSize, $status), $request));
    }

    public function show(Request $request, string $accountId, string $requestId): JsonResponse
    {
        $port = $this->porting->get($accountId, $requestId);
        $port->loadMissing('events');

        return $this->ok($this->present($port, $request));
    }

    public function store(PortingDraftRequest $request, string $accountId): JsonResponse
    {
        $port = $this->porting->createDraft($accountId, $request->validated(), $this->principal($request));

        return $this->created($this->present($port, $request), $this->location($accountId, $port));
    }

    public function update(PortingDraftRequest $request, string $accountId, string $requestId): JsonResponse
    {
        return $this->ok($this->present($this->porting->updateDraft($accountId, $requestId, $request->payload()), $request));
    }

    public function submit(Request $request, string $accountId, string $requestId): JsonResponse
    {
        $port = $this->porting->submit($accountId, $requestId, $this->principal($request));

        return $this->accepted($this->present($port, $request), $this->location($accountId, $port));
    }

    public function cancel(CancelPortingRequest $request, string $accountId, string $requestId): JsonResponse
    {
        $port = $this->porting->cancel($accountId, $requestId, $this->principal($request), $request->reason());

        return $this->ok($this->present($port, $request));
    }

    public function reopen(Request $request, string $accountId, string $requestId): JsonResponse
    {
        return $this->ok($this->present($this->porting->reopen($accountId, $requestId, $this->principal($request)), $request));
    }

    /**
     * @return array<string, mixed>
     */
    private function present(PortingRequest $port, Request $request): array
    {
        return (new PortingRequestResource($port))->resolve($request);
    }

    private function location(string $accountId, PortingRequest $port): string
    {
        return sprintf('/api/v1/accounts/%s/porting-requests/%s', $accountId, $port->id);
    }
}
