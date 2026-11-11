<?php
/**
 * Plugin Name:       Uniti Support
 * Description:       Service status banner, address availability checker and support knowledge base for Uniti marketing sites.
 * Version:           1.0.0
 * Requires at least: 6.4
 * Requires PHP:      8.1
 * Author:            Uniti Digital
 * License:           Proprietary
 * Text Domain:       uniti-support
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

define('UNITI_SUPPORT_VERSION', '1.0.0');
define('UNITI_SUPPORT_FILE', __FILE__);
define('UNITI_SUPPORT_DIR', plugin_dir_path(__FILE__));
define('UNITI_SUPPORT_URL', plugin_dir_url(__FILE__));

/*
 * PSR-4 autoloader for the Uniti\Support namespace so the plugin works
 * without a Composer install on the WordPress host.
 */
spl_autoload_register(static function (string $class): void {
    $prefix = 'Uniti\\Support\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }

    $relative = str_replace('\\', DIRECTORY_SEPARATOR, substr($class, strlen($prefix)));
    $file = UNITI_SUPPORT_DIR . 'src' . DIRECTORY_SEPARATOR . $relative . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});

register_activation_hook(__FILE__, [Uniti\Support\Plugin::class, 'activate']);
register_deactivation_hook(__FILE__, [Uniti\Support\Plugin::class, 'deactivate']);

add_action('plugins_loaded', static function (): void {
    (new Uniti\Support\Plugin())->register();
});
