<?php

declare(strict_types=1);

namespace Uniti\Support\Status;

use Uniti\Support\ApiClient;
use Uniti\Support\Settings\Options;

/**
 * Fetches incidents from the status API with a transient cache. On API
 * failure the last good copy is served (stale-if-error) so an outage of
 * the status service never hides an outage banner.
 */
final class StatusClient
{
    public const CACHE_KEY = 'uniti_support_status';
    private const STALE_KEY = 'uniti_support_status_stale';

    public function __construct(private readonly ApiClient $api, private readonly Options $options)
    {
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function incidents(): array
    {
        $cached = get_transient(self::CACHE_KEY);
        if (is_array($cached)) {
            return $cached;
        }

        $body = $this->api->get('/status/incidents', ['state' => 'open']);
        if ($body === null || !isset($body['items']) || !is_array($body['items'])) {
            $stale = get_option(self::STALE_KEY, []);

            return is_array($stale) ? $stale : [];
        }

        $items = [];
        foreach ($body['items'] as $item) {
            if (is_array($item)) {
                $items[] = $item;
            }
        }
        set_transient(self::CACHE_KEY, $items, $this->options->int('status_cache_seconds'));
        update_option(self::STALE_KEY, $items, false);

        return $items;
    }
}
