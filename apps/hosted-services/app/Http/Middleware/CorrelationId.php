<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Accepts or generates an X-Correlation-Id, exposes it to the logger context
 * and downstream HTTP clients, and echoes it on the response.
 */
final class CorrelationId
{
    public const HEADER = 'X-Correlation-Id';
    public const ATTRIBUTE = 'correlation_id';

    /** Accept caller ids that are UUID-ish or short opaque tokens only. */
    private const ACCEPTED_PATTERN = '/^[A-Za-z0-9._:-]{8,128}$/';

    public function handle(Request $request, Closure $next): Response
    {
        $incoming = $request->headers->get(self::HEADER);
        $correlationId = is_string($incoming) && preg_match(self::ACCEPTED_PATTERN, $incoming) === 1
            ? $incoming
            : (string) Str::uuid();

        $request->attributes->set(self::ATTRIBUTE, $correlationId);
        app()->instance(self::ATTRIBUTE, $correlationId);
        Log::withContext([
            'correlationId' => $correlationId,
            'method' => $request->getMethod(),
            'path' => $request->getPathInfo(),
        ]);

        $startedAt = hrtime(true);

        /** @var Response $response */
        $response = $next($request);
        $response->headers->set(self::HEADER, $correlationId);

        Log::info('request.completed', [
            'status' => $response->getStatusCode(),
            'durationMs' => round((hrtime(true) - $startedAt) / 1_000_000, 2),
        ]);

        return $response;
    }

    /**
     * Current correlation id for code running outside the request object
     * (HTTP clients, queued jobs). Falls back to a fresh id.
     */
    public static function current(): string
    {
        return app()->bound(self::ATTRIBUTE) ? (string) app(self::ATTRIBUTE) : (string) Str::uuid();
    }
}
