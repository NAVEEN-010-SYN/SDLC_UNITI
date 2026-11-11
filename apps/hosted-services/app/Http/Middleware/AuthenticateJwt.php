<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\AuthenticationFailedException;
use App\Support\JwtDecoder;
use App\Support\Principal;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Requires a valid OAuth2 bearer token and attaches the resulting
 * Principal to the request under the "principal" attribute.
 */
final class AuthenticateJwt
{
    public const ATTRIBUTE = 'principal';

    public function __construct(private readonly JwtDecoder $decoder)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        if ($token === null || $token === '') {
            throw new AuthenticationFailedException('A bearer token is required.', ['scheme' => 'Bearer']);
        }

        $principal = $this->decoder->decode($token);
        $request->attributes->set(self::ATTRIBUTE, $principal);

        Log::withContext([
            'subject' => $principal->subject,
            'callerAccountId' => $principal->accountId,
        ]);

        return $next($request);
    }

    public static function principal(Request $request): Principal
    {
        $principal = $request->attributes->get(self::ATTRIBUTE);
        if (!$principal instanceof Principal) {
            throw new AuthenticationFailedException('Request is not authenticated.');
        }

        return $principal;
    }
}
