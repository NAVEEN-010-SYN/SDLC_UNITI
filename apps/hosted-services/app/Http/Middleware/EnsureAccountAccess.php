<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\AccessDeniedException;
use App\Exceptions\ValidationFailedException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforces that the {accountId} route parameter is well formed and that the
 * caller is entitled to act on it. Denials are logged for audit.
 */
final class EnsureAccountAccess
{
    public const ACCOUNT_ID_PATTERN = '/^ACC-\d{8}$/';

    public function handle(Request $request, Closure $next): Response
    {
        $accountId = $request->route('accountId');
        if (!is_string($accountId) || preg_match(self::ACCOUNT_ID_PATTERN, $accountId) !== 1) {
            throw ValidationFailedException::forField('accountId', 'Account id must look like ACC-12345678.');
        }

        $principal = AuthenticateJwt::principal($request);
        if (!$principal->canAccessAccount($accountId)) {
            Log::warning('account.access_denied', [
                'requestedAccountId' => $accountId,
                'subject' => $principal->subject,
            ]);

            throw new AccessDeniedException('You do not have access to this account.');
        }

        return $next($request);
    }
}
