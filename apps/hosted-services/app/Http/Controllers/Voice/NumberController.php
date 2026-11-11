<?php

declare(strict_types=1);

namespace App\Http\Controllers\Voice;

use App\Enums\ProvisioningStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Voice\OrderNumbersRequest;
use App\Http\Requests\Voice\SearchNumbersRequest;
use App\Http\Requests\Voice\UpdateNumberRequest;
use App\Http\Resources\HostedNumberResource;
use App\Services\Voice\NumberService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class NumberController extends Controller
{
    public function __construct(private readonly NumberService $numbers)
    {
    }

    /**
     * GET /numbers?status=ACTIVE&assigned=false&contains=555
     */
    public function index(Request $request, string $accountId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);
        $contains = $this->stringQuery($request, 'contains', 15);
        $result = $this->numbers->list(
            $accountId,
            $page,
            $pageSize,
            $this->enumQuery($request, 'status', ProvisioningStatus::class)?->value,
            $this->boolQuery($request, 'assigned'),
            $contains === null ? null : preg_replace('/\D+/', '', $contains),
        );

        return $this->ok(HostedNumberResource::page($result, $request));
    }

    public function available(SearchNumbersRequest $request, string $accountId): JsonResponse
    {
        return $this->ok([
            'npa' => $request->npa(),
            'items' => $this->numbers->searchAvailable($accountId, $request->npa(), $request->quantity()),
        ]);
    }

    /**
     * Partial success is a normal outcome: 201 when every number activated,
     * 207 when some failed so the portal can show a mixed result.
     */
    public function order(OrderNumbersRequest $request, string $accountId): JsonResponse
    {
        $result = $this->numbers->order($accountId, $request->numbers(), $this->principal($request));
        $status = $result['failed'] === [] ? 201 : 207;

        return new JsonResponse([
            'activated' => HostedNumberResource::list($result['activated'], $request),
            'failed' => $result['failed'],
        ], $status);
    }

    public function show(Request $request, string $accountId, string $numberId): JsonResponse
    {
        return $this->ok((new HostedNumberResource($this->numbers->get($accountId, $numberId)))->resolve($request));
    }

    public function update(UpdateNumberRequest $request, string $accountId, string $numberId): JsonResponse
    {
        $number = $this->numbers->update($accountId, $numberId, $request->payload());

        return $this->ok((new HostedNumberResource($number))->resolve($request));
    }

    public function destroy(Request $request, string $accountId, string $numberId): Response
    {
        $this->numbers->release($accountId, $numberId, $this->principal($request));

        return $this->noContent();
    }
}
