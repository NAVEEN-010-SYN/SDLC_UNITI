<?php

declare(strict_types=1);

use App\Exceptions\ProblemRenderer;
use App\Http\Middleware\AuthenticateJwt;
use App\Http\Middleware\CorrelationId;
use App\Http\Middleware\EnsureAccountAccess;
use App\Http\Middleware\RequireRole;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__ . '/../routes/api.php',
        apiPrefix: 'api/v1',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(CorrelationId::class);
        $middleware->alias([
            'auth.jwt' => AuthenticateJwt::class,
            'role' => RequireRole::class,
            'account' => EnsureAccountAccess::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (Throwable $e, Request $request) {
            return app(ProblemRenderer::class)->render($e, $request);
        });
    })
    ->withProviders([
        App\Providers\AppServiceProvider::class,
    ])
    ->create();
