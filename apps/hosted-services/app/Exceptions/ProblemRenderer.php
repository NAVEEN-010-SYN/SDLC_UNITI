<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Http\Middleware\CorrelationId;
use App\Support\FieldCase;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * Converts any throwable into an RFC 7807 application/problem+json response.
 *
 * Known ApiException subclasses carry their own status/type/title; framework
 * exceptions are mapped explicitly; anything else becomes an opaque 500 so
 * internals never leak to the portals.
 */
final class ProblemRenderer
{
    public const CONTENT_TYPE = 'application/problem+json';

    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly string $typeBaseUri = 'https://errors.uniti.example/hosted-services/',
        private readonly bool $debug = false,
    ) {
    }

    public function render(Throwable $e, Request $request): JsonResponse
    {
        $problem = $this->toProblem($e);
        $problem['instance'] = $request->getPathInfo();

        $correlationId = $request->attributes->get(CorrelationId::ATTRIBUTE);
        if (is_string($correlationId)) {
            $problem['correlationId'] = $correlationId;
        }

        $this->log($e, $problem);

        $response = new JsonResponse($problem, $problem['status'], [
            'Content-Type' => self::CONTENT_TYPE,
        ]);

        if ($e instanceof HttpExceptionInterface) {
            foreach ($e->getHeaders() as $name => $value) {
                $response->headers->set($name, $value);
            }
        }

        return $response;
    }

    /**
     * @return array<string, mixed>
     */
    public function toProblem(Throwable $e): array
    {
        if ($e instanceof ApiException) {
            $extensions = $e->extensions();
            if (isset($extensions['errors']) && is_array($extensions['errors'])) {
                $extensions['errors'] = FieldCase::camelErrors($extensions['errors']);
            }

            return [
                'type' => $this->typeBaseUri . $e->problemType(),
                'title' => $e->title(),
                'status' => $e->status(),
                'detail' => $e->detail(),
            ] + $extensions;
        }

        if ($e instanceof ValidationException) {
            return [
                'type' => $this->typeBaseUri . 'validation-error',
                'title' => 'Invalid request',
                'status' => 400,
                'detail' => 'One or more fields are invalid.',
                'errors' => FieldCase::camelErrors($e->errors()),
            ];
        }

        if ($e instanceof ModelNotFoundException) {
            $model = class_basename($e->getModel());

            return [
                'type' => $this->typeBaseUri . 'not-found',
                'title' => 'Resource not found',
                'status' => 404,
                'detail' => sprintf('%s was not found.', $model),
            ];
        }

        if ($e instanceof AuthorizationException) {
            return [
                'type' => $this->typeBaseUri . 'forbidden',
                'title' => 'Access denied',
                'status' => 403,
                'detail' => 'You are not permitted to perform this action.',
            ];
        }

        if ($e instanceof HttpExceptionInterface) {
            $status = $e->getStatusCode();

            return [
                'type' => 'about:blank',
                'title' => JsonResponse::$statusTexts[$status] ?? 'Error',
                'status' => $status,
                'detail' => $e->getMessage() !== '' ? $e->getMessage() : (JsonResponse::$statusTexts[$status] ?? 'Error'),
            ];
        }

        $problem = [
            'type' => $this->typeBaseUri . 'internal-error',
            'title' => 'Internal server error',
            'status' => 500,
            'detail' => 'An unexpected error occurred. Quote the correlation id when contacting support.',
        ];

        if ($this->debug) {
            $problem['exception'] = $e::class;
            $problem['debugMessage'] = $e->getMessage();
        }

        return $problem;
    }

    /**
     * @param array<string, mixed> $problem
     */
    private function log(Throwable $e, array $problem): void
    {
        $context = [
            'problemType' => $problem['type'],
            'status' => $problem['status'],
            'correlationId' => $problem['correlationId'] ?? null,
            'exception' => $e::class,
        ];

        if ($problem['status'] >= 500) {
            $this->logger->error($e->getMessage(), $context + ['trace' => $e->getTraceAsString()]);
            return;
        }

        $this->logger->info('Request rejected: ' . $problem['detail'], $context);
    }
}
