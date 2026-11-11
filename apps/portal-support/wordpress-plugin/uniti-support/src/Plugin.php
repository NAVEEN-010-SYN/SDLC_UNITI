<?php

declare(strict_types=1);

namespace Uniti\Support;

use Uniti\Support\Availability\AvailabilityChecker;
use Uniti\Support\KnowledgeBase\PostTypes;
use Uniti\Support\KnowledgeBase\SearchEndpoint;
use Uniti\Support\Settings\Options;
use Uniti\Support\Settings\SettingsPage;
use Uniti\Support\Status\StatusBanner;
use Uniti\Support\Status\StatusClient;

/**
 * Composition root: builds collaborators once and attaches them to hooks.
 */
final class Plugin
{
    public function register(): void
    {
        $options = new Options();
        $api = new ApiClient($options);

        (new PostTypes())->register();
        (new SettingsPage($options))->register();
        (new StatusBanner(new StatusClient($api, $options), $options))->register();
        (new AvailabilityChecker($api))->register();
        (new SearchEndpoint())->register();

        add_action('init', [self::class, 'loadTextDomain']);
    }

    public static function loadTextDomain(): void
    {
        load_plugin_textdomain('uniti-support', false, dirname(plugin_basename(UNITI_SUPPORT_FILE)) . '/languages');
    }

    public static function activate(): void
    {
        (new PostTypes())->registerTypes();
        flush_rewrite_rules();
        add_option(Options::OPTION_NAME, Options::defaults(), '', false);
    }

    public static function deactivate(): void
    {
        delete_transient(StatusClient::CACHE_KEY);
        flush_rewrite_rules();
    }
}
