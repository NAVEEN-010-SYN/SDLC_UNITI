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
        add_action('rest_api_init', [$this, 'registerRoutes']);
    }

    public function registerRoutes(): void
    {
        register_rest_route(self::NAMESPACE, '/kb/search', [
            'methods' => 'GET',
            'callback' => [$this, 'search'],
            'permission_callback' => '__return_true',
            'args' => [
                'q' => ['type' => 'string', 'required' => true, 'sanitize_callback' => 'sanitize_text_field',
                    'validate_callback' => [self::class, 'isValidQuery']],
                'topic' => ['type' => 'string', 'sanitize_callback' => 'sanitize_title'],
                'product' => ['type' => 'string', 'sanitize_callback' => 'sanitize_title'],
                'audience' => ['type' => 'string', 'enum' => ['consumer', 'business'], 'default' => 'consumer'],
                'page' => ['type' => 'integer', 'minimum' => 1, 'default' => 1],
                'pageSize' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50],
            ],
        ]);
    }

    public static function isValidQuery(mixed $value): bool
    {
        return is_string($value) && SearchQuery::terms($value) !== [] && mb_strlen($value) <= 200;
    }

    public function search(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $terms = SearchQuery::terms((string) $request['q']);
        $page = (int) $request['page'];
        $pageSize = (int) ($request['pageSize'] ?? 0);
        if ($pageSize === 0) {
            $pageSize = (new Options())->int('kb_results_per_page');
        }

        $query = new WP_Query($this->queryArgs($request, $terms, $page, $pageSize));

        $items = [];
        foreach ($query->posts as $post) {
            $items[] = $this->present($post, $terms);
        }
        usort($items, [self::class, 'compareScore']);

        $response = new WP_REST_Response([
            'items' => $items,
            'page' => $page,
            'pageSize' => $pageSize,
            'total' => (int) $query->found_posts,
        ]);
        $response->header('Cache-Control', 'public, max-age=300');

        return $response;
    }

    /** Highest score first. */
    public static function compareScore(array $a, array $b): int
    {
        return $b['score'] <=> $a['score'];
    }

    /**
     * @param list<string> $terms
     * @return array<string, mixed>
     */
    private function queryArgs(WP_REST_Request $request, array $terms, int $page, int $pageSize): array
    {
        $taxQuery = [];
        $filters = [PostTypes::TOPIC => 'topic', PostTypes::PRODUCT => 'product'];
        foreach ($filters as $taxonomy => $param) {
            if (!empty($request[$param])) {
                $taxQuery[] = ['taxonomy' => $taxonomy, 'field' => 'slug', 'terms' => (string) $request[$param], 'include_children' => true];
            }
        }

        return [
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
        ];
    }

    /**
     * @param list<string> $terms
     * @return array<string, mixed>
     */
    private function present(WP_Post $post, array $terms): array
    {
        $topicSlugs = [];
        $topics = get_the_terms($post, PostTypes::TOPIC);
        if (is_array($topics)) {
            foreach ($topics as $topic) {
                $topicSlugs[] = $topic->slug;
            }
        }

        $text = $post->post_excerpt !== '' ? $post->post_excerpt : $post->post_content;

        return [
            'id' => $post->ID,
            'title' => wp_strip_all_tags(get_the_title($post)),
            'url' => esc_url_raw((string) get_permalink($post)),
            'snippet' => SearchQuery::snippet($text, $terms),
            'topics' => $topicSlugs,
            'updatedAt' => get_post_modified_time('Y-m-d\TH:i:s\Z', true, $post),
            'score' => SearchQuery::score($post->post_title, $post->post_content, $terms),
        ];
    }
}
