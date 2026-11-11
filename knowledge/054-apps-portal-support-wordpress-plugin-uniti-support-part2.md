# Portal Support (WordPress plugin + Contentful CMS sync): apps/portal-support/wordpress-plugin/uniti-support (part 2 of 2)

- **Application:** Portal Support (WordPress plugin + Contentful CMS sync)
- **Tech stack:** PHP (WordPress), Node.js TypeScript
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 16

## Files

- `apps/portal-support/wordpress-plugin/uniti-support/src/Availability/AvailabilityChecker.php` (109 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/src/KnowledgeBase/PostTypes.php` (72 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/src/KnowledgeBase/SearchEndpoint.php` (107 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/src/KnowledgeBase/SearchQuery.php` (88 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/src/Plugin.php` (49 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/src/Settings/Options.php` (94 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/src/Settings/SettingsPage.php` (100 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/src/Status/IncidentFilter.php` (105 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/src/Status/StatusBanner.php` (76 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/src/Status/StatusClient.php` (48 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/tests/Unit/AddressNormaliserTest.php` (77 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/tests/Unit/IncidentFilterTest.php` (98 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/tests/Unit/OptionsTest.php` (56 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/tests/Unit/SearchQueryTest.php` (49 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/uninstall.php` (28 lines)
- `apps/portal-support/wordpress-plugin/uniti-support/uniti-support.php` (47 lines)

## apps/portal-support/wordpress-plugin/uniti-support/src/Availability/AvailabilityChecker.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/src/Availability/AvailabilityChecker.php`.

```php
<?php

declare(strict_types=1);

namespace Uniti\Support\Availability;

use Uniti\Support\ApiClient;

/**
 * [uniti_availability_checker] shortcode plus the admin-ajax handler it
 * posts to. Anonymous visitors use it, so every request carries a nonce,
 * input is unslashed and sanitised before use, and lookups are rate
 * limited per client IP to protect the upstream address database.
 */
final class AvailabilityChecker
{
    private const ACTION = 'uniti_check_availability';
    private const NONCE = 'uniti_availability';
    private const RATE_LIMIT = 10;
    private const RATE_WINDOW_SECONDS = 300;

    public function __construct(
        private readonly ApiClient $api,
        private readonly AddressNormaliser $normaliser = new AddressNormaliser(),
    ) {
    }

    public function register(): void
    {
        add_shortcode('uniti_availability_checker', [$this, 'render']);
        add_action('wp_ajax_' . self::ACTION, [$this, 'handle']);
        add_action('wp_ajax_nopriv_' . self::ACTION, [$this, 'handle']);
        add_action('wp_enqueue_scripts', static function (): void {
            wp_register_script('uniti-availability', UNITI_SUPPORT_URL . 'assets/availability.js', [], UNITI_SUPPORT_VERSION, true);
        });
    }

    public function render(): string
    {
        wp_enqueue_script('uniti-availability');
        wp_localize_script('uniti-availability', 'UnitiAvailability', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'action' => self::ACTION,
            'nonce' => wp_create_nonce(self::NONCE),
            'messages' => [
                'checking' => __('Checking your address…', 'uniti-support'),
                'error' => __('We could not check this address right now. Please try again shortly.', 'uniti-support'),
                'unavailable' => __('Uniti fibre is not available at this address yet.', 'uniti-support'),
            ],
        ]);

        $field = static fn (string $name, string $label, string $autocomplete, bool $required) => sprintf(
            '<p><label for="uniti-av-%1$s">%2$s</label><input id="uniti-av-%1$s" name="%1$s" type="text" autocomplete="%3$s" %4$s /></p>',
            esc_attr($name),
            esc_html($label),
            esc_attr($autocomplete),
            $required ? 'required' : '',
        );

        return '<form class="uniti-availability" novalidate>'
            . $field('line1', __('Street address', 'uniti-support'), 'address-line1', true)
            . $field('unit', __('Apartment / unit (optional)', 'uniti-support'), 'address-line2', false)
            . $field('zip', __('ZIP code', 'uniti-support'), 'postal-code', true)
            . '<button type="submit">' . esc_html__('Check availability', 'uniti-support') . '</button>'
            . '<div class="uniti-availability__result" aria-live="polite"></div></form>';
    }

    public function handle(): void
    {
        if (!check_ajax_referer(self::NONCE, 'nonce', false)) {
            wp_send_json_error(['message' => __('Your session expired. Reload the page and try again.', 'uniti-support')], 403);
        }

        if ($this->rateLimited()) {
            wp_send_json_error(['message' => __('Too many checks. Please wait a few minutes.', 'uniti-support')], 429);
        }

        $input = [];
        foreach (['line1', 'unit', 'zip'] as $key) {
            $input[$key] = sanitize_text_field(wp_unslash((string) ($_POST[$key] ?? '')));
        }

        $result = $this->normaliser->normalise($input);
        if ($result['address'] === null) {
            wp_send_json_error(['errors' => $result['errors']], 422);
        }

        $body = $this->api->get('/availability', array_filter($result['address'], static fn ($v) => $v !== null));
        if ($body === null) {
            wp_send_json_error(['message' => __('Availability service unavailable.', 'uniti-support')], 502);
        }

        wp_send_json_success($this->normaliser->summarise($body));
    }

    private function rateLimited(): bool
    {
        $ip = isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash((string) $_SERVER['REMOTE_ADDR'])) : 'unknown';
        $key = 'uniti_av_rl_' . md5($ip);
        $count = (int) get_transient($key);
        if ($count >= self::RATE_LIMIT) {
            return true;
        }
        set_transient($key, $count + 1, self::RATE_WINDOW_SECONDS);

        return false;
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/src/KnowledgeBase/PostTypes.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/src/KnowledgeBase/PostTypes.php`.

```php
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
```

## apps/portal-support/wordpress-plugin/uniti-support/src/KnowledgeBase/SearchEndpoint.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/src/KnowledgeBase/SearchEndpoint.php`.

```php
<?php

declare(strict_types=1);

namespace Uniti\Support\KnowledgeBase;

use Uniti\Support\Settings\Options;
use WP_Error;
use WP_Post;
use WP_Query;
use WP_REST_Request;
use WP_REST_Response;

/**
 * GET /wp-json/uniti-support/v1/kb/search?q=&topic=&product=&audience=&page=&pageSize=
 *
 * Public, read-only. Returns the monorepo pagination envelope
 * { items, page, pageSize, total }; results are re-ranked by SearchQuery
 * so title matches lead.
 */
final class SearchEndpoint
{
    private const NAMESPACE = 'uniti-support/v1';

    public function register(): void
    {
        add_action('rest_api_init', function (): void {
            register_rest_route(self::NAMESPACE, '/kb/search', [
                'methods' => 'GET',
                'callback' => [$this, 'search'],
                'permission_callback' => '__return_true',
                'args' => [
                    'q' => ['type' => 'string', 'required' => true, 'sanitize_callback' => 'sanitize_text_field',
                        'validate_callback' => static fn ($v) => is_string($v) && SearchQuery::terms($v) !== [] && mb_strlen($v) <= 200],
                    'topic' => ['type' => 'string', 'sanitize_callback' => 'sanitize_title'],
                    'product' => ['type' => 'string', 'sanitize_callback' => 'sanitize_title'],
                    'audience' => ['type' => 'string', 'enum' => ['consumer', 'business'], 'default' => 'consumer'],
                    'page' => ['type' => 'integer', 'minimum' => 1, 'default' => 1],
                    'pageSize' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50],
                ],
            ]);
        });
    }

    public function search(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $terms = SearchQuery::terms((string) $request['q']);
        $page = (int) $request['page'];
        $pageSize = (int) ($request['pageSize'] ?? 0) ?: (new Options())->int('kb_results_per_page');

        $taxQuery = [];
        foreach ([PostTypes::TOPIC => 'topic', PostTypes::PRODUCT => 'product'] as $taxonomy => $param) {
            if (!empty($request[$param])) {
                $taxQuery[] = ['taxonomy' => $taxonomy, 'field' => 'slug', 'terms' => (string) $request[$param], 'include_children' => true];
            }
        }

        $query = new WP_Query([
            'post_type' => PostTypes::POST_TYPE,
            'post_status' => 'publish',
            's' => implode(' ', $terms),
            'posts_per_page' => $pageSize,
            'paged' => $page,
            'tax_query' => $taxQuery,
            'meta_query' => [[
                'key' => PostTypes::AUDIENCE_META,
                'value' => ['all', (string) $request['audience']],
                'compare' => 'IN',
            ]],
            'no_found_rows' => false,
            'ignore_sticky_posts' => true,
        ]);

        $items = array_map(fn (WP_Post $post) => $this->present($post, $terms), $query->posts);
        usort($items, static fn (array $a, array $b) => $b['score'] <=> $a['score']);

        $response = new WP_REST_Response([
            'items' => $items,
            'page' => $page,
            'pageSize' => $pageSize,
            'total' => (int) $query->found_posts,
        ]);
        $response->header('Cache-Control', 'public, max-age=300');

        return $response;
    }

    /**
     * @param list<string> $terms
     * @return array<string, mixed>
     */
    private function present(WP_Post $post, array $terms): array
    {
        $topics = get_the_terms($post, PostTypes::TOPIC);

        return [
            'id' => $post->ID,
            'title' => wp_strip_all_tags(get_the_title($post)),
            'url' => esc_url_raw((string) get_permalink($post)),
            'snippet' => SearchQuery::snippet($post->post_excerpt !== '' ? $post->post_excerpt : $post->post_content, $terms),
            'topics' => is_array($topics) ? array_map(static fn ($t) => $t->slug, $topics) : [],
            'updatedAt' => get_post_modified_time('Y-m-d\TH:i:s\Z', true, $post),
            'score' => SearchQuery::score($post->post_title, $post->post_content, $terms),
        ];
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/src/KnowledgeBase/SearchQuery.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/src/KnowledgeBase/SearchQuery.php`.

```php
<?php

declare(strict_types=1);

namespace Uniti\Support\KnowledgeBase;

/**
 * Pure search helpers: normalising the search term and producing a
 * plain-text snippet centred on the first matching term. Kept free of
 * WordPress so ranking/snippet behaviour is unit tested.
 */
final class SearchQuery
{
    public const MIN_TERM_LENGTH = 2;
    public const MAX_TERMS = 8;

    private const STOP_WORDS = ['a', 'an', 'and', 'how', 'i', 'is', 'my', 'of', 'on', 'or', 'the', 'to', 'do', 'can', 'what', 'why'];

    /**
     * @return list<string> Lower-case distinct terms, stop words removed.
     */
    public static function terms(string $query): array
    {
        $words = preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($query), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $terms = [];
        foreach ($words as $word) {
            if (mb_strlen($word) < self::MIN_TERM_LENGTH || in_array($word, self::STOP_WORDS, true)) {
                continue;
            }
            $terms[$word] = true;
        }

        return array_slice(array_keys($terms), 0, self::MAX_TERMS);
    }

    /**
     * @param list<string> $terms
     */
    public static function snippet(string $html, array $terms, int $length = 180): string
    {
        $text = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');
        if (mb_strlen($text) <= $length) {
            return $text;
        }

        $position = null;
        $lower = mb_strtolower($text);
        foreach ($terms as $term) {
            $found = mb_strpos($lower, $term);
            if ($found !== false && ($position === null || $found < $position)) {
                $position = $found;
            }
        }

        $start = $position === null ? 0 : max(0, $position - intdiv($length, 3));
        if ($start > 0) {
            $space = mb_strpos($text, ' ', $start);
            $start = $space === false ? $start : $space + 1;
        }

        $excerpt = mb_substr($text, $start, $length);
        $cut = mb_strrpos($excerpt, ' ');
        if ($start + $length < mb_strlen($text) && $cut !== false && $cut > intdiv($length, 2)) {
            $excerpt = mb_substr($excerpt, 0, $cut);
        }

        return ($start > 0 ? '…' : '') . $excerpt . ($start + mb_strlen($excerpt) < mb_strlen($text) ? '…' : '');
    }

    /**
     * Title matches outrank body matches; every term found counts.
     *
     * @param list<string> $terms
     */
    public static function score(string $title, string $body, array $terms): int
    {
        $title = mb_strtolower($title);
        $body = mb_strtolower(strip_tags($body));
        $score = 0;
        foreach ($terms as $term) {
            $score += str_contains($title, $term) ? 5 : 0;
            $score += min(3, substr_count($body, $term));
        }

        return $score;
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/src/Plugin.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/src/Plugin.php`.

```php
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

        add_action('init', static function (): void {
            load_plugin_textdomain('uniti-support', false, dirname(plugin_basename(UNITI_SUPPORT_FILE)) . '/languages');
        });
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
```

## apps/portal-support/wordpress-plugin/uniti-support/src/Settings/Options.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/src/Settings/Options.php`.

```php
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
```

## apps/portal-support/wordpress-plugin/uniti-support/src/Settings/SettingsPage.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/src/Settings/SettingsPage.php`.

```php
<?php

declare(strict_types=1);

namespace Uniti\Support\Settings;

/**
 * Settings > Uniti Support, built on the Settings API so nonces,
 * capability checks and option persistence are handled by core.
 */
final class SettingsPage
{
    private const PAGE = 'uniti-support';
    private const GROUP = 'uniti_support';

    public function __construct(private readonly Options $options)
    {
    }

    public function register(): void
    {
        add_action('admin_init', [$this, 'registerSettings']);
        add_action('admin_menu', [$this, 'addMenu']);
    }

    public function addMenu(): void
    {
        add_options_page(
            __('Uniti Support', 'uniti-support'),
            __('Uniti Support', 'uniti-support'),
            'manage_options',
            self::PAGE,
            [$this, 'render'],
        );
    }

    public function registerSettings(): void
    {
        register_setting(self::GROUP, Options::OPTION_NAME, [
            'type' => 'object',
            'show_in_rest' => false,
            'sanitize_callback' => static function (mixed $input): array {
                $current = get_option(Options::OPTION_NAME, []);

                return Options::sanitize($input, is_array($current) ? $current : []);
            },
        ]);

        add_settings_section('api', __('Content API', 'uniti-support'), '__return_false', self::PAGE);
        add_settings_section('display', __('Display', 'uniti-support'), '__return_false', self::PAGE);

        $this->field('api', 'api_base_url', __('API base URL (https)', 'uniti-support'), 'url');
        $this->field('api', 'api_key', __('API key', 'uniti-support'), 'password');
        $this->field('display', 'status_cache_seconds', __('Status cache (seconds)', 'uniti-support'), 'number');
        $this->field('display', 'kb_results_per_page', __('Knowledge base results per page', 'uniti-support'), 'number');

        add_settings_field('banner_min_severity', __('Show banner from severity', 'uniti-support'), function (): void {
            $current = $this->options->get('banner_min_severity');
            printf('<select name="%s[banner_min_severity]">', esc_attr(Options::OPTION_NAME));
            foreach (['minor', 'major', 'critical'] as $severity) {
                printf('<option value="%1$s" %2$s>%3$s</option>', esc_attr($severity), selected($current, $severity, false), esc_html(ucfirst($severity)));
            }
            echo '</select>';
        }, self::PAGE, 'display');
    }

    public function render(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have permission to manage these settings.', 'uniti-support'), 403);
        }

        echo '<div class="wrap"><h1>' . esc_html(get_admin_page_title()) . '</h1><form method="post" action="options.php">';
        settings_fields(self::GROUP);
        do_settings_sections(self::PAGE);
        submit_button();
        echo '</form></div>';
    }

    private function field(string $section, string $key, string $label, string $type): void
    {
        add_settings_field($key, $label, function () use ($key, $type): void {
            $isSecret = $type === 'password';
            $value = $isSecret ? '' : $this->options->get($key);
            $placeholder = $isSecret && $this->options->get($key) !== ''
                ? __('Stored - leave blank to keep', 'uniti-support')
                : '';

            printf(
                '<input type="%1$s" class="regular-text" name="%2$s[%3$s]" value="%4$s" placeholder="%5$s" autocomplete="off" />',
                esc_attr($type),
                esc_attr(Options::OPTION_NAME),
                esc_attr($key),
                esc_attr($value),
                esc_attr($placeholder),
            );
        }, self::PAGE, $section);
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/src/Status/IncidentFilter.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/src/Status/IncidentFilter.php`.

```php
<?php

declare(strict_types=1);

namespace Uniti\Support\Status;

use DateTimeImmutable;
use DateTimeZone;

/**
 * Pure selection logic for the outage banner: which incidents are live,
 * relevant to the visitor's region and severe enough to show, in what
 * order. No WordPress calls, so it is unit tested directly.
 */
final class IncidentFilter
{
    private const SEVERITY_RANK = ['minor' => 1, 'major' => 2, 'critical' => 3];

    /**
     * @param list<array<string, mixed>> $incidents Raw status API items.
     * @return list<array{id: string, title: string, severity: string, regions: list<string>, startsAt: DateTimeImmutable, endsAt: ?DateTimeImmutable, url: ?string, planned: bool}>
     */
    public function select(array $incidents, DateTimeImmutable $now, string $minSeverity, ?string $region = null): array
    {
        $threshold = self::SEVERITY_RANK[$minSeverity] ?? 1;
        $selected = [];

        foreach ($incidents as $raw) {
            $incident = $this->parse($raw);
            if ($incident === null || self::SEVERITY_RANK[$incident['severity']] < $threshold) {
                continue;
            }
            if (!$this->isLive($incident, $now)) {
                continue;
            }
            if ($region !== null && $incident['regions'] !== [] && !in_array(strtoupper($region), $incident['regions'], true)) {
                continue;
            }
            $selected[] = $incident;
        }

        usort($selected, static fn (array $a, array $b) => [self::SEVERITY_RANK[$b['severity']], $a['planned'], $b['startsAt']]
            <=> [self::SEVERITY_RANK[$a['severity']], $b['planned'], $a['startsAt']]);

        return $selected;
    }

    /**
     * Planned maintenance is announced 24 hours ahead; unplanned incidents
     * show from their start. Anything ended is hidden.
     *
     * @param array{startsAt: DateTimeImmutable, endsAt: ?DateTimeImmutable, planned: bool} $incident
     */
    private function isLive(array $incident, DateTimeImmutable $now): bool
    {
        if ($incident['endsAt'] !== null && $incident['endsAt'] <= $now) {
            return false;
        }

        $showFrom = $incident['planned'] ? $incident['startsAt']->modify('-24 hours') : $incident['startsAt'];

        return $showFrom <= $now;
    }

    /**
     * @param mixed $raw
     * @return array{id: string, title: string, severity: string, regions: list<string>, startsAt: DateTimeImmutable, endsAt: ?DateTimeImmutable, url: ?string, planned: bool}|null
     */
    private function parse(mixed $raw): ?array
    {
        if (!is_array($raw) || !isset($raw['id'], $raw['title'], $raw['severity'], $raw['startsAt'])) {
            return null;
        }

        $severity = strtolower((string) $raw['severity']);
        $startsAt = self::date($raw['startsAt']);
        if (!isset(self::SEVERITY_RANK[$severity]) || $startsAt === null) {
            return null;
        }

        $url = isset($raw['url']) && is_string($raw['url']) && str_starts_with($raw['url'], 'https://') ? $raw['url'] : null;

        return [
            'id' => (string) $raw['id'],
            'title' => trim((string) $raw['title']),
            'severity' => $severity,
            'regions' => array_values(array_map(static fn ($r) => strtoupper((string) $r), (array) ($raw['regions'] ?? []))),
            'startsAt' => $startsAt,
            'endsAt' => isset($raw['endsAt']) ? self::date($raw['endsAt']) : null,
            'url' => $url,
            'planned' => (bool) ($raw['planned'] ?? false),
        ];
    }

    private static function date(mixed $value): ?DateTimeImmutable
    {
        if (!is_string($value)) {
            return null;
        }
        $parsed = DateTimeImmutable::createFromFormat(DATE_ATOM, str_replace('Z', '+00:00', $value));

        return $parsed === false ? null : $parsed->setTimezone(new DateTimeZone('UTC'));
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/src/Status/StatusBanner.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/src/Status/StatusBanner.php`.

```php
<?php

declare(strict_types=1);

namespace Uniti\Support\Status;

use DateTimeImmutable;
use DateTimeZone;
use Uniti\Support\Settings\Options;

/**
 * [uniti_status_banner region="TX" limit="3"]
 *
 * Renders live incidents as an accessible alert region. Output is fully
 * escaped; incident text comes from an external API and is untrusted.
 */
final class StatusBanner
{
    public function __construct(
        private readonly StatusClient $client,
        private readonly Options $options,
        private readonly IncidentFilter $filter = new IncidentFilter(),
    ) {
    }

    public function register(): void
    {
        add_shortcode('uniti_status_banner', [$this, 'render']);
    }

    /**
     * @param array<string, string>|string $atts
     */
    public function render(array|string $atts = []): string
    {
        $atts = shortcode_atts(['region' => '', 'limit' => '3'], is_array($atts) ? $atts : [], 'uniti_status_banner');
        $region = preg_match('/^[A-Za-z]{2}$/', (string) $atts['region']) === 1 ? (string) $atts['region'] : null;
        $limit = max(1, min(10, (int) $atts['limit']));

        $incidents = $this->filter->select(
            $this->client->incidents(),
            new DateTimeImmutable('now', new DateTimeZone('UTC')),
            $this->options->get('banner_min_severity'),
            $region,
        );
        if ($incidents === []) {
            return '';
        }

        $items = '';
        foreach (array_slice($incidents, 0, $limit) as $incident) {
            $label = $incident['planned'] ? __('Planned maintenance', 'uniti-support') : __('Service issue', 'uniti-support');
            $when = wp_date(get_option('date_format') . ' ' . get_option('time_format'), $incident['startsAt']->getTimestamp());
            $link = $incident['url'] === null ? '' : sprintf(
                ' <a href="%s">%s</a>',
                esc_url($incident['url']),
                esc_html__('Details', 'uniti-support'),
            );

            $items .= sprintf(
                '<li class="uniti-status__item uniti-status__item--%1$s"><strong>%2$s:</strong> %3$s <time datetime="%4$s">%5$s</time>%6$s</li>',
                esc_attr($incident['severity']),
                esc_html($label),
                esc_html($incident['title']),
                esc_attr($incident['startsAt']->format('Y-m-d\TH:i:s\Z')),
                esc_html((string) $when),
                $link,
            );
        }

        $role = $incidents[0]['severity'] === 'critical' ? 'alert' : 'status';

        return sprintf('<div class="uniti-status" role="%s"><ul class="uniti-status__list">%s</ul></div>', esc_attr($role), $items);
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/src/Status/StatusClient.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/src/Status/StatusClient.php`.

```php
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

        $items = array_values(array_filter($body['items'], 'is_array'));
        set_transient(self::CACHE_KEY, $items, $this->options->int('status_cache_seconds'));
        update_option(self::STALE_KEY, $items, false);

        return $items;
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/tests/Unit/AddressNormaliserTest.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/tests/Unit/AddressNormaliserTest.php`.

```php
<?php

declare(strict_types=1);

namespace Uniti\Support\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Uniti\Support\Availability\AddressNormaliser;

final class AddressNormaliserTest extends TestCase
{
    private AddressNormaliser $normaliser;

    protected function setUp(): void
    {
        $this->normaliser = new AddressNormaliser();
    }

    public function testNormalisesAddressForLookup(): void
    {
        $result = $this->normaliser->normalise(['line1' => '  120   Main  Street ', 'unit' => '#4b', 'zip' => '78701-1234']);

        self::assertSame([], $result['errors']);
        self::assertSame(['line1' => '120 MAIN ST', 'unit' => '4B', 'zip' => '78701'], $result['address']);
    }

    public function testReportsEveryInvalidField(): void
    {
        $result = $this->normaliser->normalise(['line1' => 'Main Street', 'unit' => '<script>', 'zip' => '7870']);

        self::assertNull($result['address']);
        self::assertSame(['line1', 'zip', 'unit'], array_keys($result['errors']));
    }

    public function testEmptyUnitBecomesNull(): void
    {
        $result = $this->normaliser->normalise(['line1' => '9 Oak Ln', 'zip' => '73301']);

        self::assertNull($result['address']['unit'] ?? 'missing');
    }

    public function testSummarisesServiceablePlansSortedBySpeedWithIntegerMoney(): void
    {
        $summary = $this->normaliser->summarise([
            'status' => 'SERVICEABLE',
            'earliestInstallDate' => '2026-06-02',
            'plans' => [
                ['name' => 'Fibre 1G', 'downMbps' => 1000, 'monthlyPrice' => ['amountMinor' => 6500, 'currency' => 'USD']],
                ['name' => 'Fibre 500', 'downMbps' => 500, 'monthlyPrice' => ['amountMinor' => 4999, 'currency' => 'USD']],
                ['name' => 'Broken', 'downMbps' => 100],
            ],
        ]);

        self::assertTrue($summary['serviceable']);
        self::assertSame('2026-06-02', $summary['installWindow']);
        self::assertSame([
            ['name' => 'Fibre 500', 'speed' => '500 Mbps', 'price' => '$49.99/mo'],
            ['name' => 'Fibre 1G', 'speed' => '1 Gbps', 'price' => '$65.00/mo'],
        ], $summary['plans']);
    }

    public function testNotServiceableWhenStatusSaysSoOrNoPlansParse(): void
    {
        self::assertFalse($this->normaliser->summarise(['status' => 'PLANNED', 'plans' => []])['serviceable']);
        self::assertFalse($this->normaliser->summarise(['status' => 'SERVICEABLE', 'plans' => [['name' => 'x']]])['serviceable']);
    }

    public function testMoneyFormatting(): void
    {
        self::assertSame('$1,234.05', AddressNormaliser::money(123405, 'usd'));
        self::assertSame('-$0.99', AddressNormaliser::money(-99, 'USD'));
        self::assertSame('JPY 12.00', AddressNormaliser::money(1200, 'JPY'));
        self::assertSame('2 Gbps', AddressNormaliser::speed(2000));
        self::assertSame('2500 Mbps', AddressNormaliser::speed(2500));
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/tests/Unit/IncidentFilterTest.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/tests/Unit/IncidentFilterTest.php`.

```php
<?php

declare(strict_types=1);

namespace Uniti\Support\Tests\Unit;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;
use Uniti\Support\Status\IncidentFilter;

final class IncidentFilterTest extends TestCase
{
    private IncidentFilter $filter;
    private DateTimeImmutable $now;

    protected function setUp(): void
    {
        $this->filter = new IncidentFilter();
        $this->now = new DateTimeImmutable('2026-05-10T12:00:00Z');
    }

    public function testOrdersBySeverityThenUnplannedThenNewest(): void
    {
        $selected = $this->filter->select([
            $this->incident('a', 'minor', '2026-05-10T11:00:00Z'),
            $this->incident('b', 'critical', '2026-05-10T09:00:00Z'),
            $this->incident('c', 'major', '2026-05-10T13:00:00Z', planned: true),
            $this->incident('d', 'major', '2026-05-10T10:00:00Z'),
            $this->incident('e', 'major', '2026-05-10T11:30:00Z'),
        ], $this->now, 'minor');

        self::assertSame(['b', 'e', 'd', 'c', 'a'], array_column($selected, 'id'));
    }

    public function testHidesEndedFutureUnplannedAndFarFuturePlannedIncidents(): void
    {
        $selected = $this->filter->select([
            $this->incident('ended', 'major', '2026-05-10T08:00:00Z', endsAt: '2026-05-10T11:59:59Z'),
            $this->incident('future', 'major', '2026-05-10T12:30:00Z'),
            $this->incident('maintenance-next-week', 'major', '2026-05-17T02:00:00Z', planned: true),
            $this->incident('maintenance-tonight', 'major', '2026-05-11T02:00:00Z', planned: true),
        ], $this->now, 'minor');

        self::assertSame(['maintenance-tonight'], array_column($selected, 'id'));
    }

    public function testAppliesSeverityThreshold(): void
    {
        $selected = $this->filter->select([
            $this->incident('minor', 'minor', '2026-05-10T11:00:00Z'),
            $this->incident('major', 'MAJOR', '2026-05-10T11:00:00Z'),
        ], $this->now, 'major');

        self::assertSame(['major'], array_column($selected, 'id'));
    }

    public function testRegionFilterKeepsNationwideIncidents(): void
    {
        $selected = $this->filter->select([
            $this->incident('tx', 'major', '2026-05-10T11:00:00Z', regions: ['tx']),
            $this->incident('ca', 'major', '2026-05-10T11:00:00Z', regions: ['CA']),
            $this->incident('national', 'minor', '2026-05-10T11:00:00Z'),
        ], $this->now, 'minor', 'TX');

        self::assertSame(['tx', 'national'], array_column($selected, 'id'));
    }

    public function testMalformedItemsAndUnsafeLinksAreDropped(): void
    {
        $selected = $this->filter->select([
            ['id' => 'x', 'title' => 'No date', 'severity' => 'major'],
            ['id' => 'y', 'title' => 'Bad severity', 'severity' => 'apocalyptic', 'startsAt' => '2026-05-10T11:00:00Z'],
            'not-an-array',
            $this->incident('ok', 'major', '2026-05-10T11:00:00Z') + ['url' => 'javascript:alert(1)'],
        ], $this->now, 'minor');

        self::assertCount(1, $selected);
        self::assertNull($selected[0]['url']);
    }

    /**
     * @param list<string> $regions
     * @return array<string, mixed>
     */
    private function incident(string $id, string $severity, string $startsAt, bool $planned = false, ?string $endsAt = null, array $regions = []): array
    {
        return array_filter([
            'id' => $id,
            'title' => "Incident $id",
            'severity' => $severity,
            'startsAt' => $startsAt,
            'endsAt' => $endsAt,
            'planned' => $planned,
            'regions' => $regions,
        ], static fn ($v) => $v !== null);
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/tests/Unit/OptionsTest.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/tests/Unit/OptionsTest.php`.

```php
<?php

declare(strict_types=1);

namespace Uniti\Support\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Uniti\Support\Settings\Options;

final class OptionsTest extends TestCase
{
    public function testSanitizeAcceptsValidInputAndClampsNumbers(): void
    {
        $clean = Options::sanitize([
            'api_base_url' => ' https://content-api.uniti.example/v1/ ',
            'api_key' => 'abcDEF1234567890_-.',
            'status_cache_seconds' => '5',
            'banner_min_severity' => 'major',
            'kb_results_per_page' => '500',
            'injected' => 'value',
        ]);

        self::assertSame([
            'api_base_url' => 'https://content-api.uniti.example/v1',
            'api_key' => 'abcDEF1234567890_-.',
            'status_cache_seconds' => 30,
            'banner_min_severity' => 'major',
            'kb_results_per_page' => 50,
        ], $clean);
    }

    public function testRejectsInsecureOrCredentialBearingUrls(): void
    {
        self::assertSame('', Options::sanitize(['api_base_url' => 'http://content-api.uniti.example'])['api_base_url']);
        self::assertSame('', Options::sanitize(['api_base_url' => 'https://user:pw@content-api.uniti.example'])['api_base_url']);
        self::assertSame('', Options::sanitize(['api_base_url' => 'javascript:alert(1)'])['api_base_url']);
    }

    public function testBlankApiKeyKeepsStoredSecret(): void
    {
        $current = Options::defaults();
        $current['api_key'] = 'stored-secret-value-123';

        self::assertSame('stored-secret-value-123', Options::sanitize(['api_key' => ''], $current)['api_key']);
        self::assertSame('stored-secret-value-123', Options::sanitize(['api_key' => 'bad key!'], $current)['api_key']);
    }

    public function testNonArrayInputFallsBackToDefaults(): void
    {
        $clean = Options::sanitize('garbage');

        self::assertSame('minor', $clean['banner_min_severity']);
        self::assertSame(120, $clean['status_cache_seconds']);
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/tests/Unit/SearchQueryTest.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/tests/Unit/SearchQueryTest.php`.

```php
<?php

declare(strict_types=1);

namespace Uniti\Support\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Uniti\Support\KnowledgeBase\SearchQuery;

final class SearchQueryTest extends TestCase
{
    public function testTermsDropStopWordsShortWordsAndDuplicates(): void
    {
        self::assertSame(['reset', 'router', 'wi', 'fi'], SearchQuery::terms('How do I reset my ROUTER router? Wi-Fi x'));
        self::assertSame([], SearchQuery::terms('how to'));
    }

    public function testTermsAreCapped(): void
    {
        self::assertCount(SearchQuery::MAX_TERMS, SearchQuery::terms('alpha bravo charlie delta echo foxtrot golf hotel india juliet'));
    }

    public function testShortContentIsReturnedAsPlainText(): void
    {
        self::assertSame('Restart the ONT & router.', SearchQuery::snippet('<p>Restart the <b>ONT</b> &amp; router.</p>', ['ont']));
    }

    public function testSnippetCentresOnFirstMatchOnWordBoundaries(): void
    {
        $body = str_repeat('filler words here ', 30) . 'To change your billing date open Account settings. ' . str_repeat('more text after ', 30);

        $snippet = SearchQuery::snippet($body, ['billing'], 120);

        self::assertStringStartsWith('…', $snippet);
        self::assertStringEndsWith('…', $snippet);
        self::assertStringContainsString('billing date', $snippet);
        self::assertLessThanOrEqual(122, mb_strlen($snippet));
    }

    public function testTitleMatchesOutrankRepeatedBodyMatches(): void
    {
        $titleHit = SearchQuery::score('Router lights explained', 'Green means online.', ['router']);
        $bodyHits = SearchQuery::score('Lights explained', 'router router router router router', ['router']);

        self::assertSame(5, $titleHit);
        self::assertSame(3, $bodyHits);
    }
}
```

## apps/portal-support/wordpress-plugin/uniti-support/uninstall.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/uninstall.php`.

```php
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
```

## apps/portal-support/wordpress-plugin/uniti-support/uniti-support.php

Application: Portal Support (WordPress plugin + Contentful CMS sync). Stack: PHP (WordPress), Node.js TypeScript. Language: php. Path: `apps/portal-support/wordpress-plugin/uniti-support/uniti-support.php`.

```php
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
```
