<?php

declare(strict_types=1);

/*
 * Bearer JWT validation settings. Tokens are issued by the Uniti OIDC provider;
 * this service only validates them and never mints its own.
 */
return [
    'issuer' => env('JWT_ISSUER'),
    'audience' => env('JWT_AUDIENCE', 'hosted-services-api'),
    'algorithm' => env('JWT_ALGORITHM', 'RS256'),
    'public_key' => env('JWT_PUBLIC_KEY'),
    'leeway_seconds' => (int) env('JWT_LEEWAY_SECONDS', 30),

    /*
     * Claim names used to build the authenticated principal.
     */
    'claims' => [
        'subject' => 'sub',
        'roles' => 'roles',
        'account_id' => 'account_id',
        'delegated_accounts' => 'delegated_accounts',
    ],

    /*
     * Roles permitted to use this API at all. Hosted services are a B2B
     * product, so consumer tokens are rejected outright.
     */
    'allowed_roles' => [
        'BUSINESS_ADMIN',
        'BUSINESS_USER',
        'PARTNER_ADMIN',
        'PARTNER_AGENT',
        'SUPPORT_AGENT',
    ],
];
