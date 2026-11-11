<?php

declare(strict_types=1);

namespace Uniti\Support\KnowledgeBase;

/**
 * Support knowledge base: an article post type, a hierarchical "topic"
 * taxonomy (Billing > Invoices) and a flat "product" taxonomy (Fibre,
 * Hosted Voice...), plus an audience meta used to hide business-only
 * articles from consumer search.
 */
final class PostTypes
{
    public const POST_TYPE = 'uniti_kb_article';
    public const TOPIC = 'uniti_kb_topic';
    public const PRODUCT = 'uniti_kb_product';
    public const AUDIENCE_META = 'uniti_kb_audience';
    public const AUDIENCES = ['all', 'consumer', 'business'];

    public function register(): void
    {
        add_action('init', [$this, 'registerTypes']);
    }

    public function registerTypes(): void
    {
        register_post_type(self::POST_TYPE, [
            'labels' => [
                'name' => __('Help articles', 'uniti-support'),
                'singular_name' => __('Help article', 'uniti-support'),
                'add_new_item' => __('Add help article', 'uniti-support'),
                'edit_item' => __('Edit help article', 'uniti-support'),
                'search_items' => __('Search help articles', 'uniti-support'),
            ],
            'public' => true,
            'has_archive' => 'help',
            'rewrite' => ['slug' => 'help', 'with_front' => false],
            'menu_icon' => 'dashicons-sos',
            'show_in_rest' => true,
            'supports' => ['title', 'editor', 'excerpt', 'revisions', 'custom-fields'],
            'capability_type' => 'post',
            'map_meta_cap' => true,
        ]);

        register_taxonomy(self::TOPIC, [self::POST_TYPE], [
            'labels' => ['name' => __('Topics', 'uniti-support'), 'singular_name' => __('Topic', 'uniti-support')],
            'hierarchical' => true,
            'show_in_rest' => true,
            'show_admin_column' => true,
            'rewrite' => ['slug' => 'help/topic', 'hierarchical' => true],
        ]);

        register_taxonomy(self::PRODUCT, [self::POST_TYPE], [
            'labels' => ['name' => __('Products', 'uniti-support'), 'singular_name' => __('Product', 'uniti-support')],
            'hierarchical' => false,
            'show_in_rest' => true,
            'show_admin_column' => true,
            'rewrite' => ['slug' => 'help/product'],
        ]);

        register_post_meta(self::POST_TYPE, self::AUDIENCE_META, [
            'type' => 'string',
            'single' => true,
            'default' => 'all',
            'show_in_rest' => ['schema' => ['enum' => self::AUDIENCES]],
            'sanitize_callback' => static fn ($value) => in_array($value, self::AUDIENCES, true) ? $value : 'all',
            'auth_callback' => static fn () => current_user_can('edit_posts'),
        ]);
    }
}
