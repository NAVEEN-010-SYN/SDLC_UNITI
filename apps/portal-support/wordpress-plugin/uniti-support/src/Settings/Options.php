<?php

declare(strict_types=1);

namespace Uniti\Support\Settings;

/**
 * Typed access to the single serialised plugin option plus the pure
 * sanitiser used by the Settings API. Secrets (API key) live in the
 * option, never in code; the UNITI_SUPPORT_API_KEY constant in
 * wp-config.php takes precedence when defined.
 */
final class Options
{
    public const OPTION_NAME = 'uniti_support_options';

    private const MIN_CACHE_SECONDS = 30;
    private const MAX_CACHE_SECONDS = 3600;

    /**
     * @return array{api_base_url: string, api_key: string, status_cache_seconds: int, banner_min_severity: string, kb_results_per_page: int}
     */
    public static function defaults(): array
    {
        return [
            'api_base_url' => '',
            'api_key' => '',
            'status_cache_seconds' => 120,
            'banner_min_severity' => 'minor',
            'kb_results_per_page' => 10,
        ];
    }

    public function get(string $key): string
    {
        if ($key === 'api_key' && defined('UNITI_SUPPORT_API_KEY')) {
            return (string) constant('UNITI_SUPPORT_API_KEY');
        }

        $stored = get_option(self::OPTION_NAME, []);
        $values = array_merge(self::defaults(), is_array($stored) ? $stored : []);

        return (string) ($values[$key] ?? '');
    }

    public function int(string $key): int
    {
        return (int) $this->get($key);
    }

    /**
     * Settings API sanitize_callback. Unknown keys are dropped; an empty
     * API key field keeps the stored key so it is never echoed back into
     * the form.
     *
     * @param mixed                $input
     * @param array<string, mixed> $current
     * @return array<string, mixed>
     */
    public static function sanitize(mixed $input, array $current = []): array
    {
        $input = is_array($input) ? $input : [];
        $clean = array_merge(self::defaults(), $current);

        $url = trim((string) ($input['api_base_url'] ?? ''));
        $clean['api_base_url'] = self::isHttpsUrl($url) ? rtrim($url, '/') : '';

        $key = trim((string) ($input['api_key'] ?? ''));
        if ($key !== '' && preg_match('/^[A-Za-z0-9._-]{16,256}$/', $key) === 1) {
            $clean['api_key'] = $key;
        }

        $seconds = (int) ($input['status_cache_seconds'] ?? $clean['status_cache_seconds']);
        $clean['status_cache_seconds'] = max(self::MIN_CACHE_SECONDS, min(self::MAX_CACHE_SECONDS, $seconds));

        $severity = (string) ($input['banner_min_severity'] ?? '');
        $clean['banner_min_severity'] = in_array($severity, ['minor', 'major', 'critical'], true) ? $severity : 'minor';

        $perPage = (int) ($input['kb_results_per_page'] ?? $clean['kb_results_per_page']);
        $clean['kb_results_per_page'] = max(1, min(50, $perPage));

        return array_intersect_key($clean, self::defaults());
    }

    private static function isHttpsUrl(string $url): bool
    {
        if (filter_var($url, FILTER_VALIDATE_URL) === false) {
            return false;
        }

        return strtolower((string) parse_url($url, PHP_URL_SCHEME)) === 'https' && parse_url($url, PHP_URL_USER) === null;
    }
}
