<?php

declare(strict_types=1);

/*
 * Business rules for hosted services. Values that product management tunes
 * per market live here rather than inside service classes.
 */
return [
    'voice' => [
        'extension_min_digits' => 3,
        'extension_max_digits' => 6,
        'reserved_extensions' => ['911', '933', '411', '611', '711', '811'],
        'hunt_group_max_members' => 32,
        'hunt_group_ring_seconds_min' => 5,
        'hunt_group_ring_seconds_max' => 120,
        'forward_no_answer_seconds_min' => 5,
        'forward_no_answer_seconds_max' => 60,
        'forward_max_chain_depth' => 5,
        'voicemail_pin_min_length' => 4,
        'voicemail_pin_max_length' => 8,
        'voicemail_max_message_seconds' => 300,
    ],

    'porting' => [
        'cancel_cutoff_hours' => (int) env('PORTING_CANCEL_CUTOFF_HOURS', 48),
        'min_lead_days' => (int) env('PORTING_MIN_LEAD_DAYS', 5),
        'max_numbers_per_request' => 100,
        'max_resubmissions' => 3,
    ],

    'mail' => [
        'default_mailbox_quota_mb' => (int) env('MAIL_DEFAULT_MAILBOX_QUOTA_MB', 10240),
        'min_mailbox_quota_mb' => 512,
        'max_mailbox_quota_mb' => 102400,
        'quota_warning_percent' => (int) env('MAIL_QUOTA_WARNING_PERCENT', 85),
        'allow_external_forwarding' => filter_var(env('MAIL_ALLOW_EXTERNAL_FORWARDING', true), FILTER_VALIDATE_BOOL),
        'max_alias_destinations' => 50,
        'reserved_local_parts' => ['postmaster', 'abuse', 'hostmaster', 'webmaster', 'mailer-daemon'],

        /*
         * Storage pools per hosted email plan, in MB. Add-on storage blocks are
         * priced in minor units (cents) per block per month.
         */
        'plans' => [
            'EMAIL_ESSENTIALS' => ['pool_mb' => 51200, 'max_mailboxes' => 10],
            'EMAIL_BUSINESS' => ['pool_mb' => 256000, 'max_mailboxes' => 50],
            'EMAIL_ENTERPRISE' => ['pool_mb' => 1024000, 'max_mailboxes' => 500],
        ],
        'addon_block_mb' => 10240,
        'addon_block_price_minor' => 299,
        'currency' => 'USD',
    ],

    'dns' => [
        'ttl_min' => 60,
        'ttl_max' => 86400,
        'ttl_default' => 3600,
        'max_records_per_zone' => 500,
    ],

    'ssl' => [
        'renewal_window_days' => 30,
        'validation_timeout_hours' => 72,
        'max_sans' => 20,
    ],

    'pagination' => [
        'default_page_size' => 25,
        'max_page_size' => 100,
    ],
];
