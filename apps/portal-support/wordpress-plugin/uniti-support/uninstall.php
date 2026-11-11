<?php
/**
 * Removes plugin options and caches. Knowledge base articles are content
 * owned by the site and are intentionally kept.
 */

declare(strict_types=1);

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

$uniti_support_options = ['uniti_support_options', 'uniti_support_status_stale'];

foreach ($uniti_support_options as $uniti_support_option) {
    delete_option($uniti_support_option);
}
delete_transient('uniti_support_status');

global $wpdb;
$wpdb->query(
    $wpdb->prepare(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
        $wpdb->esc_like('_transient_uniti_av_rl_') . '%',
        $wpdb->esc_like('_transient_timeout_uniti_av_rl_') . '%',
    ),
);
