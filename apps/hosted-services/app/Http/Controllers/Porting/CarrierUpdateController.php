<?php

declare(strict_types=1);

namespace App\Http\Controllers\Porting;

use App\Http\Controllers\Controller;
use App\Http\Requests\Porting\CarrierUpdateRequest;
use App\Http\Resources\PortingRequestResource;
use App\Services\Porting\PortingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

/**
 * Internal endpoint used by the portability gateway integration (and by
 * support agents correcting a stuck port). It is not account scoped: the
 * carrier reference identifies the request.
 */
final class CarrierUpdateController extends Controller
{
    public function __construct(private readonly PortingService $porting)
    {
    }

    public function __invoke(CarrierUpdateRequest $request): JsonResponse
    {
        $data = $request->validated();
        $port = $this->porting->applyCarrierUpdate(
            (string) $data['reference'],
            $request->status(),
            $request->focAt(),
            $data['reason'] ?? null,
        );

        Log::info('porting.carrier_update_applied', [
            'portingRequestId' => $port->id,
            'status' => $port->status->value,
            'actor' => $this->principal($request)->auditId(),
        ]);

        return $this->ok((new PortingRequestResource($port))->resolve($request));
    }
}
