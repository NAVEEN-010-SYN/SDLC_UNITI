<?php

declare(strict_types=1);

namespace Uniti\Support;

use Uniti\Support\Settings\Options;

/**
 * Minimal JSON client for the Uniti public content API. Sends a
 * correlation id on every call and logs failures as single-line JSON so
 * they can be shipped alongside the other platform logs.
 */
final class ApiClient
{
    public function __construct(private readonly Options $options)
    {
    }

    /**
     * @param array<string, scalar> $query
     * @return array<string, mixed>|null Decoded body, or null on any failure.
     */
    public function get(string $path, array $query = [], int $timeoutSeconds = 4): ?array
    {
        $base = $this->options->get('api_base_url');
        if ($base === '') {
            return null;
        }

        $encoded = [];
        foreach ($query as $key => $value) {
            $encoded[$key] = rawurlencode((string) $value);
        }
        $url = add_query_arg($encoded, rtrim($base, '/') . '/' . ltrim($path, '/'));
        $correlationId = wp_generate_uuid4();
        $headers = ['Accept' => 'application/json', 'X-Correlation-Id' => $correlationId];
        $apiKey = $this->options->get('api_key');
        if ($apiKey !== '') {
            $headers['Authorization'] = 'Bearer ' . $apiKey;
        }

        $response = wp_remote_get($url, ['timeout' => $timeoutSeconds, 'headers' => $headers, 'redirection' => 0]);
        if (is_wp_error($response)) {
            self::log('api.transport_error', ['path' => $path, 'correlationId' => $correlationId, 'error' => $response->get_error_message()]);

            return null;
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $decoded = json_decode((string) wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || !is_array($decoded)) {
            self::log('api.bad_response', ['path' => $path, 'correlationId' => $correlationId, 'status' => $status]);

            return null;
        }

        return $decoded;
    }

    /**
     * @param array<string, mixed> $context
     */
    public static function log(string $event, array $context = []): void
    {
        error_log((string) wp_json_encode(['level' => 'warning', 'event' => $event, 'time' => gmdate('Y-m-d\TH:i:s\Z')] + $context));
    }
}
