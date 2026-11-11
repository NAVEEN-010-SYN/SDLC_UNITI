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
            'sanitize_callback' => [self::class, 'sanitizeOptions'],
        ]);

        add_settings_section('api', __('Content API', 'uniti-support'), '__return_false', self::PAGE);
        add_settings_section('display', __('Display', 'uniti-support'), '__return_false', self::PAGE);

        $this->field('api', 'api_base_url', __('API base URL (https)', 'uniti-support'), 'url');
        $this->field('api', 'api_key', __('API key', 'uniti-support'), 'password');
        $this->field('display', 'status_cache_seconds', __('Status cache (seconds)', 'uniti-support'), 'number');
        $this->field('display', 'kb_results_per_page', __('Knowledge base results per page', 'uniti-support'), 'number');

        add_settings_field('banner_min_severity', __('Show banner from severity', 'uniti-support'), [$this, 'renderSeverityField'], self::PAGE, 'display');
    }

    public static function sanitizeOptions(mixed $input): array
    {
        $current = get_option(Options::OPTION_NAME, []);

        return Options::sanitize($input, is_array($current) ? $current : []);
    }

    public function renderSeverityField(): void
    {
        $current = $this->options->get('banner_min_severity');
        printf('<select name="%s[banner_min_severity]">', esc_attr(Options::OPTION_NAME));
        foreach (['minor', 'major', 'critical'] as $severity) {
            printf('<option value="%1$s" %2$s>%3$s</option>', esc_attr($severity), selected($current, $severity, false), esc_html(ucfirst($severity)));
        }
        echo '</select>';
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
        // WordPress passes the args array to the callback.
        $args = ['key' => $key, 'type' => $type];
        add_settings_field($key, $label, [$this, 'renderInputField'], self::PAGE, $section, $args);
    }

    /** @param array{key: string, type: string} $args */
    public function renderInputField(array $args): void
    {
        $key = $args['key'];
        $type = $args['type'];
        $isSecret = $type === 'password';

        $value = $isSecret ? '' : $this->options->get($key);
        $placeholder = '';
        if ($isSecret && $this->options->get($key) !== '') {
            $placeholder = __('Stored - leave blank to keep', 'uniti-support');
        }

        printf(
            '<input type="%1$s" class="regular-text" name="%2$s[%3$s]" value="%4$s" placeholder="%5$s" autocomplete="off" />',
            esc_attr($type),
            esc_attr(Options::OPTION_NAME),
            esc_attr($key),
            esc_attr($value),
            esc_attr($placeholder),
        );
    }
}
