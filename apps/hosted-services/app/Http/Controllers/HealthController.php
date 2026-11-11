<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Unauthenticated liveness/readiness probe used by the container
 * HEALTHCHECK and the load balancer. Downstream provisioning platforms are
 * deliberately not probed: their outages degrade features, not the API.
 */
final class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $checks = ['database' => $this->database()];
        $healthy = !in_array(false, $checks, true);

        $checkStatus = [];
        foreach ($checks as $name => $ok) {
            $checkStatus[$name] = $ok ? 'UP' : 'DOWN';
        }

        return new JsonResponse([
            'status' => $healthy ? 'UP' : 'DOWN',
            'checks' => $checkStatus,
            'time' => gmdate('Y-m-d\TH:i:s\Z'),
        ], $healthy ? 200 : 503, ['Cache-Control' => 'no-store']);
    }

    private function database(): bool
    {
        try {
            DB::select('select 1');

            return true;
        } catch (Throwable $e) {
            Log::error('health.database_unreachable', ['exception' => $e::class]);

            return false;
        }
    }
}
