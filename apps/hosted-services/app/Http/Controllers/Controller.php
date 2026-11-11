<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Exceptions\ValidationFailedException;
use App\Http\Middleware\AuthenticateJwt;
use App\Support\Principal;
use BackedEnum;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Thin HTTP adapters: controllers translate requests into service calls
 * and service results into resources. They hold no business rules.
 * Account scoping and role checks have already run as route middleware.
 */
abstract class Controller
{
    protected function principal(Request $request): Principal
    {
        return AuthenticateJwt::principal($request);
    }

    /**
     * @param array<mixed> $body
     */
    protected function ok(array $body): JsonResponse
    {
        return new JsonResponse($body, 200);
    }

    /**
     * @param array<mixed> $body
     */
    protected function created(array $body, string $location): JsonResponse
    {
        return new JsonResponse($body, 201, ['Location' => $location]);
    }

    /**
     * Provisioning continues asynchronously (certificate validation, port
     * submission); the client polls the resource at $location.
     *
     * @param array<mixed> $body
     */
    protected function accepted(array $body, string $location): JsonResponse
    {
        return new JsonResponse($body, 202, ['Location' => $location]);
    }

    protected function noContent(): Response
    {
        return new Response('', 204);
    }

    /**
     * Optional enum-valued query filter (?status=ACTIVE). Unknown values are
     * a client error rather than an empty result.
     *
     * @template T of BackedEnum
     * @param class-string<T> $enum
     * @return T|null
     */
    protected function enumQuery(Request $request, string $name, string $enum): ?BackedEnum
    {
        $raw = $request->query($name);
        if ($raw === null || $raw === '') {
            return null;
        }

        $value = is_string($raw) ? $enum::tryFrom(strtoupper($raw)) : null;
        if ($value === null) {
            $allowed = implode(', ', array_map(static fn (BackedEnum $c) => (string) $c->value, $enum::cases()));
            throw ValidationFailedException::forField($name, sprintf('Must be one of: %s.', $allowed));
        }

        return $value;
    }

    protected function boolQuery(Request $request, string $name): ?bool
    {
        $raw = $request->query($name);
        if ($raw === null || $raw === '') {
            return null;
        }

        $value = filter_var($raw, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
        if ($value === null) {
            throw ValidationFailedException::forField($name, 'Must be true or false.');
        }

        return $value;
    }

    protected function stringQuery(Request $request, string $name, int $maxLength = 64): ?string
    {
        $raw = $request->query($name);
        if ($raw === null || $raw === '') {
            return null;
        }
        if (!is_string($raw) || mb_strlen($raw) > $maxLength) {
            throw ValidationFailedException::forField($name, sprintf('Must be a string of at most %d characters.', $maxLength));
        }

        return trim($raw);
    }
}
