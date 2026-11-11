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
