<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Enums\Role;
use App\Exceptions\AccessDeniedException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware: `role:BUSINESS_ADMIN,SUPPORT_AGENT` or the shorthand
 * `role:manage` meaning "any role allowed to change configuration".
 */
final class RequireRole
{
    public function handle(Request $request, Closure $next, string ...$required): Response
    {
        $principal = AuthenticateJwt::principal($request);

        if ($required === ['manage']) {
            if (!$principal->canManage()) {
                throw new AccessDeniedException('This action requires an administrator role.');
            }

            return $next($request);
        }

        $roles = [];
        foreach ($required as $name) {
            $role = Role::tryFrom($name);
            if ($role !== null) {
                $roles[] = $role;
            }
        }
        if ($roles !== [] && !$principal->hasRole(...$roles)) {
            throw new AccessDeniedException(
                'This action requires one of the roles: ' . implode(', ', $required) . '.',
            );
        }

        return $next($request);
    }
}
