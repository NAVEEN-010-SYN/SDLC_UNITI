<?php

declare(strict_types=1);

namespace App\Clients;

use App\Exceptions\ProvisioningException;
use App\Http\Middleware\CorrelationId;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Exception\RequestException;
use JsonException;
use Psr\Http\Message\ResponseInterface;
use Psr\Log\LoggerInterface;

/**
 * Shared transport for the internal provisioning platforms.
 *
 * - Sends the API key and propagates X-Correlation-Id.
 * - Retries connection failures and 502/503/504 with linear backoff, but only
 *   for idempotent methods or when the caller supplies an Idempotency-Key.
 * - Translates every failure into ProvisioningException (502 to our caller)
 *   so no Guzzle type leaks above the client layer.
 */
class ProvisioningHttpClient
{
    private const RETRYABLE_STATUS = [502, 503, 504];
    private const IDEMPOTENT_METHODS = ['GET', 'PUT', 'DELETE', 'HEAD'];

    public function __construct(
        private readonly ClientInterface $http,
        private readonly LoggerInterface $logger,
        private readonly string $platform,
        private readonly string $baseUrl,
        private readonly string $apiKey,
        private readonly float $timeoutSeconds = 10.0,
        private readonly int $maxRetries = 2,
        private readonly int $backoffMs = 250,
    ) {
    }

    /**
     * @param array<string, mixed>|null $body
     * @param array<string, scalar>     $query
     * @return array<string, mixed> Decoded JSON body (empty for 204).
     */
    public function request(
        string $method,
        string $path,
        ?array $body = null,
        array $query = [],
        ?string $idempotencyKey = null,
    ): array {
        $method = strtoupper($method);
        $url = rtrim($this->baseUrl, '/') . '/' . ltrim($path, '/');
        $canRetry = in_array($method, self::IDEMPOTENT_METHODS, true) || $idempotencyKey !== null;

        $headers = [
            'Accept' => 'application/json',
            'X-Api-Key' => $this->apiKey,
            CorrelationId::HEADER => CorrelationId::current(),
        ];
        if ($idempotencyKey !== null) {
            $headers['Idempotency-Key'] = $idempotencyKey;
        }

        $options = [
            'headers' => $headers,
            'timeout' => $this->timeoutSeconds,
            'connect_timeout' => min(3.0, $this->timeoutSeconds),
            'http_errors' => false,
        ];
        if ($body !== null) {
            $options['json'] = $body;
        }
        if ($query !== []) {
            $options['query'] = $query;
        }

        $attempt = 0;
        while (true) {
            $attempt++;
            $started = hrtime(true);

            try {
                $response = $this->http->request($method, $url, $options);
            } catch (ConnectException $e) {
                if ($canRetry && $attempt <= $this->maxRetries) {
                    $this->backoff($attempt, $method, $path, 0);
                    continue;
                }
                throw ProvisioningException::fromPlatform($this->platform, "$method $path", 0, 'unreachable', $e);
            } catch (RequestException | GuzzleException $e) {
                throw ProvisioningException::fromPlatform($this->platform, "$method $path", 0, $e->getMessage(), $e);
            }

            $status = $response->getStatusCode();
            $this->logger->info('provisioning.call', [
                'platform' => $this->platform,
                'method' => $method,
                'path' => $path,
                'status' => $status,
                'attempt' => $attempt,
                'durationMs' => round((hrtime(true) - $started) / 1_000_000, 2),
            ]);

            if (in_array($status, self::RETRYABLE_STATUS, true) && $canRetry && $attempt <= $this->maxRetries) {
                $this->backoff($attempt, $method, $path, $status);
                continue;
            }

            return $this->decode($response, $method, $path);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function get(string $path, array $query = []): array
    {
        return $this->request('GET', $path, null, $query);
    }

    /**
     * @return array<string, mixed>
     */
    public function post(string $path, array $body, ?string $idempotencyKey = null): array
    {
        return $this->request('POST', $path, $body, [], $idempotencyKey);
    }

    /**
     * @return array<string, mixed>
     */
    public function put(string $path, array $body): array
    {
        return $this->request('PUT', $path, $body);
    }

    public function delete(string $path): void
    {
        $this->request('DELETE', $path);
    }

    /**
     * @return array<string, mixed>
     */
    private function decode(ResponseInterface $response, string $method, string $path): array
    {
        $status = $response->getStatusCode();
        $raw = (string) $response->getBody();

        if ($status === 204 || $raw === '') {
            if ($status >= 400) {
                throw ProvisioningException::fromPlatform($this->platform, "$method $path", $status, 'empty error response');
            }

            return [];
        }

        try {
            $decoded = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw ProvisioningException::fromPlatform($this->platform, "$method $path", $status, 'invalid JSON', $e);
        }

        if ($status >= 400) {
            $reason = is_array($decoded) ? (string) ($decoded['message'] ?? $decoded['detail'] ?? $decoded['error'] ?? 'error') : 'error';
            throw ProvisioningException::fromPlatform($this->platform, "$method $path", $status, $reason);
        }

        return is_array($decoded) ? $decoded : [];
    }

    private function backoff(int $attempt, string $method, string $path, int $status): void
    {
        $this->logger->warning('provisioning.retry', [
            'platform' => $this->platform,
            'method' => $method,
            'path' => $path,
            'status' => $status,
            'attempt' => $attempt,
        ]);

        usleep($this->backoffMs * $attempt * 1000);
    }
}
