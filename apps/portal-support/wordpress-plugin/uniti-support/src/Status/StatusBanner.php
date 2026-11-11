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
