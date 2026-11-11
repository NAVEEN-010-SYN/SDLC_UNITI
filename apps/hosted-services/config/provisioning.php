<?php

declare(strict_types=1);

/*
 * Downstream provisioning platforms. Each platform is a separate internal
 * HTTP API; credentials are injected through the environment only.
 */
return [
    'timeout_seconds' => (float) env('PROVISIONING_TIMEOUT_SECONDS', 10),
    'max_retries' => (int) env('PROVISIONING_MAX_RETRIES', 2),
    'retry_backoff_ms' => 250,

    'voice' => [
        'base_url' => env('VOICE_PLATFORM_BASE_URL'),
        'api_key' => env('VOICE_PLATFORM_API_KEY'),
    ],
    'mail' => [
        'base_url' => env('MAIL_PLATFORM_BASE_URL'),
        'api_key' => env('MAIL_PLATFORM_API_KEY'),
    ],
    'webhosting' => [
        'base_url' => env('WEBHOSTING_BASE_URL'),
        'api_key' => env('WEBHOSTING_API_KEY'),
    ],
    'certificates' => [
        'base_url' => env('CERT_AUTHORITY_BASE_URL'),
        'api_key' => env('CERT_AUTHORITY_API_KEY'),
    ],
];
