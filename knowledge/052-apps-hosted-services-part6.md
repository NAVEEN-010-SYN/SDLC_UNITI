# Hosted Services (hosted voice, email, web hosting): apps/hosted-services (part 6 of 6)

- **Application:** Hosted Services (hosted voice, email, web hosting)
- **Tech stack:** PHP 8 (Laravel-style)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 21

## Files

- `apps/hosted-services/app/Support/JwtDecoder.php` (134 lines)
- `apps/hosted-services/app/Support/Page.php` (74 lines)
- `apps/hosted-services/app/Support/PhoneNumber.php` (119 lines)
- `apps/hosted-services/app/Support/Principal.php` (79 lines)
- `apps/hosted-services/app/Support/SystemClock.php` (22 lines)
- `apps/hosted-services/bootstrap/app.php` (37 lines)
- `apps/hosted-services/composer.json` (45 lines)
- `apps/hosted-services/config/auth_jwt.php` (38 lines)
- `apps/hosted-services/config/hosted.php` (73 lines)
- `apps/hosted-services/config/provisioning.php` (31 lines)
- `apps/hosted-services/phpunit.xml` (30 lines)
- `apps/hosted-services/routes/api.php` (127 lines)
- `apps/hosted-services/tests/Unit/AssertsApiExceptions.php` (50 lines)
- `apps/hosted-services/tests/Unit/Dns/ZoneSerializerTest.php` (73 lines)
- `apps/hosted-services/tests/Unit/Http/ProblemRendererTest.php` (81 lines)
- `apps/hosted-services/tests/Unit/Mail/LocalPartPolicyTest.php` (54 lines)
- `apps/hosted-services/tests/Unit/Mail/QuotaCalculatorTest.php` (186 lines)
- `apps/hosted-services/tests/Unit/Porting/PortingStateMachineTest.php` (211 lines)
- `apps/hosted-services/tests/Unit/Voice/DialPlanPolicyTest.php` (98 lines)
- `apps/hosted-services/tests/Unit/Voice/ForwardingRuleValidatorTest.php` (165 lines)
- `apps/hosted-services/tests/Unit/Voice/VoicemailPinPolicyTest.php` (66 lines)

## apps/hosted-services/app/Support/JwtDecoder.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Support/JwtDecoder.php`.

```php
<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\Role;
use App\Exceptions\AuthenticationFailedException;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\SignatureInvalidException;
use Throwable;

/**
 * Validates bearer tokens issued by the Uniti OIDC provider and maps their
 * claims onto a Principal. Signature, expiry, issuer and audience are all
 * mandatory; unknown roles are dropped rather than trusted.
 */
final class JwtDecoder
{
    /**
     * @param list<string> $allowedRoles
     * @param array{subject: string, roles: string, account_id: string, delegated_accounts: string} $claimNames
     */
    public function __construct(
        private readonly string $key,
        private readonly string $algorithm,
        private readonly string $issuer,
        private readonly string $audience,
        private readonly array $allowedRoles,
        private readonly array $claimNames,
        private readonly int $leewaySeconds = 30,
    ) {
    }

    public static function fromConfig(array $config): self
    {
        $key = (string) ($config['public_key'] ?? '');
        if (str_starts_with($key, 'file://')) {
            $contents = @file_get_contents(substr($key, 7));
            $key = $contents === false ? '' : $contents;
        }

        return new self(
            key: str_replace('\n', "\n", $key),
            algorithm: (string) $config['algorithm'],
            issuer: (string) $config['issuer'],
            audience: (string) $config['audience'],
            allowedRoles: array_values($config['allowed_roles']),
            claimNames: $config['claims'],
            leewaySeconds: (int) ($config['leeway_seconds'] ?? 30),
        );
    }

    public function decode(string $token): Principal
    {
        if ($this->key === '') {
            throw new AuthenticationFailedException('Token validation is not configured.');
        }

        JWT::$leeway = $this->leewaySeconds;

        try {
            $claims = (array) JWT::decode($token, new Key($this->key, $this->algorithm));
        } catch (ExpiredException) {
            throw new AuthenticationFailedException('The access token has expired.');
        } catch (SignatureInvalidException) {
            throw new AuthenticationFailedException('The access token signature is invalid.');
        } catch (Throwable) {
            throw new AuthenticationFailedException('The access token could not be parsed.');
        }

        $this->assertIssuerAndAudience($claims);

        $subject = $claims[$this->claimNames['subject']] ?? null;
        if (!is_string($subject) || $subject === '') {
            throw new AuthenticationFailedException('The access token has no subject.');
        }

        $roles = $this->extractRoles($claims[$this->claimNames['roles']] ?? []);
        if ($roles === []) {
            throw new AuthenticationFailedException('The access token grants no role permitted on this API.');
        }

        $accountId = $claims[$this->claimNames['account_id']] ?? null;
        $delegated = $claims[$this->claimNames['delegated_accounts']] ?? [];

        return new Principal(
            subject: $subject,
            roles: $roles,
            accountId: is_string($accountId) ? $accountId : null,
            delegatedAccounts: is_array($delegated) ? array_values(array_filter($delegated, 'is_string')) : [],
        );
    }

    /**
     * @param array<string, mixed> $claims
     */
    private function assertIssuerAndAudience(array $claims): void
    {
        if (($claims['iss'] ?? null) !== $this->issuer) {
            throw new AuthenticationFailedException('The access token was issued by an untrusted issuer.');
        }

        $aud = $claims['aud'] ?? [];
        $audiences = is_array($aud) ? $aud : [$aud];
        if (!in_array($this->audience, $audiences, true)) {
            throw new AuthenticationFailedException('The access token is not intended for this API.');
        }
    }

    /**
     * @return list<Role>
     */
    private function extractRoles(mixed $raw): array
    {
        $names = is_string($raw) ? preg_split('/[\s,]+/', $raw, -1, PREG_SPLIT_NO_EMPTY) : (array) $raw;

        $roles = [];
        foreach ($names as $name) {
            if (!is_string($name) || !in_array($name, $this->allowedRoles, true)) {
                continue;
            }
            $role = Role::tryFrom($name);
            if ($role !== null && !in_array($role, $roles, true)) {
                $roles[] = $role;
            }
        }

        return $roles;
    }
}
```

## apps/hosted-services/app/Support/Page.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Support/Page.php`.

```php
<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Http\Request;
use JsonSerializable;

/**
 * Pagination envelope required by the API conventions:
 * { items, page, pageSize, total }.
 *
 * @template T
 */
final class Page implements JsonSerializable
{
    /**
     * @param list<T> $items
     */
    public function __construct(
        public readonly array $items,
        public readonly int $page,
        public readonly int $pageSize,
        public readonly int $total,
    ) {
    }

    /**
     * Read and clamp ?page=&pageSize= from the request.
     *
     * @return array{0: int, 1: int} [page, pageSize]
     */
    public static function paramsFrom(Request $request): array
    {
        $default = (int) config('hosted.pagination.default_page_size', 25);
        $max = (int) config('hosted.pagination.max_page_size', 100);

        $page = max(1, (int) $request->query('page', '1'));
        $pageSize = (int) $request->query('pageSize', (string) $default);
        $pageSize = $pageSize < 1 ? $default : min($pageSize, $max);

        return [$page, $pageSize];
    }

    /**
     * @template U
     * @param callable(T): U $mapper
     * @return Page<U>
     */
    public function map(callable $mapper): self
    {
        return new self(array_map($mapper, $this->items), $this->page, $this->pageSize, $this->total);
    }

    public function totalPages(): int
    {
        return $this->pageSize === 0 ? 0 : (int) ceil($this->total / $this->pageSize);
    }

    /**
     * @return array{items: list<T>, page: int, pageSize: int, total: int}
     */
    public function jsonSerialize(): array
    {
        return [
            'items' => $this->items,
            'page' => $this->page,
            'pageSize' => $this->pageSize,
            'total' => $this->total,
        ];
    }
}
```

## apps/hosted-services/app/Support/PhoneNumber.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Support/PhoneNumber.php`.

```php
<?php

declare(strict_types=1);

namespace App\Support;

use InvalidArgumentException;

/**
 * Minimal NANP-aware E.164 value object. Hosted voice numbers are North
 * American (+1) DIDs; international numbers are accepted only as forwarding
 * destinations, where the caller decides whether to allow them.
 */
final class PhoneNumber
{
    private function __construct(public readonly string $e164)
    {
    }

    /**
     * Normalise common user input ("(555) 201-0199", "1-555-201-0199",
     * "+44 20 7946 0000") into E.164.
     */
    public static function parse(string $input): self
    {
        $trimmed = trim($input);
        $hasPlus = str_starts_with($trimmed, '+');
        $digits = preg_replace('/\D+/', '', $trimmed) ?? '';

        if ($digits === '') {
            throw new InvalidArgumentException('Phone number contains no digits.');
        }

        if (!$hasPlus) {
            if (strlen($digits) === 10) {
                $digits = '1' . $digits;
            } elseif (!(strlen($digits) === 11 && $digits[0] === '1')) {
                throw new InvalidArgumentException('National numbers must have 10 digits.');
            }
        }

        if (strlen($digits) < 8 || strlen($digits) > 15) {
            throw new InvalidArgumentException('E.164 numbers have between 8 and 15 digits.');
        }

        $number = new self('+' . $digits);

        if ($number->isNanp() && !self::isValidNanp(substr($digits, 1))) {
            throw new InvalidArgumentException('Not a valid North American number.');
        }

        return $number;
    }

    public static function tryParse(string $input): ?self
    {
        try {
            return self::parse($input);
        } catch (InvalidArgumentException) {
            return null;
        }
    }

    public function isNanp(): bool
    {
        return str_starts_with($this->e164, '+1') && strlen($this->e164) === 12;
    }

    /**
     * Premium-rate and directory services that hosted voice must never
     * forward to (fraud vector).
     */
    public function isPremiumRate(): bool
    {
        if (!$this->isNanp()) {
            return false;
        }

        $npa = substr($this->e164, 2, 3);
        $nxx = substr($this->e164, 5, 3);

        return $npa === '900' || $npa === '976' || $nxx === '976';
    }

    public function npa(): ?string
    {
        return $this->isNanp() ? substr($this->e164, 2, 3) : null;
    }

    public function equals(self $other): bool
    {
        return $this->e164 === $other->e164;
    }

    public function __toString(): string
    {
        return $this->e164;
    }

    /**
     * NANP: NPA and NXX both start 2-9; N11 codes are service codes.
     */
    private static function isValidNanp(string $tenDigits): bool
    {
        if (strlen($tenDigits) !== 10) {
            return false;
        }

        $npa = substr($tenDigits, 0, 3);
        $nxx = substr($tenDigits, 3, 3);

        if ($npa[0] < '2' || $nxx[0] < '2') {
            return false;
        }

        return !($npa[1] === '1' && $npa[2] === '1') && !($nxx[1] === '1' && $nxx[2] === '1');
    }
}
```

## apps/hosted-services/app/Support/Principal.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Support/Principal.php`.

```php
<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\Role;

/**
 * The authenticated caller, built from validated JWT claims. Immutable and
 * attached to the request by the AuthenticateJwt middleware.
 */
final class Principal
{
    /**
     * @param list<Role>   $roles
     * @param list<string> $delegatedAccounts Accounts a partner may act on.
     */
    public function __construct(
        public readonly string $subject,
        public readonly array $roles,
        public readonly ?string $accountId,
        public readonly array $delegatedAccounts = [],
    ) {
    }

    public function hasRole(Role ...$roles): bool
    {
        foreach ($roles as $role) {
            if (in_array($role, $this->roles, true)) {
                return true;
            }
        }

        return false;
    }

    public function canManage(): bool
    {
        foreach ($this->roles as $role) {
            if ($role->canManage()) {
                return true;
            }
        }

        return false;
    }

    /**
     * Account scoping rule shared by every account-scoped route:
     * support agents see everything, partners see their delegated accounts,
     * business users see only their own account.
     */
    public function canAccessAccount(string $accountId): bool
    {
        if ($this->hasRole(Role::SupportAgent)) {
            return true;
        }

        if ($this->accountId !== null && hash_equals($this->accountId, $accountId)) {
            return true;
        }

        if ($this->hasRole(Role::PartnerAdmin, Role::PartnerAgent)) {
            return in_array($accountId, $this->delegatedAccounts, true);
        }

        return false;
    }

    /**
     * Identifier recorded in audit columns (created_by / updated_by).
     */
    public function auditId(): string
    {
        return $this->subject;
    }
}
```

## apps/hosted-services/app/Support/SystemClock.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Support/SystemClock.php`.

```php
<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\CarbonImmutable;
use DateTimeImmutable;
use Psr\Clock\ClockInterface;

/**
 * Wall clock pinned to UTC. Services depend on ClockInterface so tests can
 * substitute a fixed instant.
 */
final class SystemClock implements ClockInterface
{
    public function now(): DateTimeImmutable
    {
        return CarbonImmutable::now('UTC');
    }
}
```

## apps/hosted-services/bootstrap/app.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/bootstrap/app.php`.

```php
<?php

declare(strict_types=1);

use App\Exceptions\ProblemRenderer;
use App\Http\Middleware\AuthenticateJwt;
use App\Http\Middleware\CorrelationId;
use App\Http\Middleware\EnsureAccountAccess;
use App\Http\Middleware\RequireRole;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__ . '/../routes/api.php',
        apiPrefix: 'api/v1',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(CorrelationId::class);
        $middleware->alias([
            'auth.jwt' => AuthenticateJwt::class,
            'role' => RequireRole::class,
            'account' => EnsureAccountAccess::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (Throwable $e, Request $request) {
            return app(ProblemRenderer::class)->render($e, $request);
        });
    })
    ->withProviders([
        App\Providers\AppServiceProvider::class,
    ])
    ->create();
```

## apps/hosted-services/composer.json

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: json. Path: `apps/hosted-services/composer.json`.

```json
{
    "name": "uniti/hosted-services",
    "description": "Uniti Self-Care: Hosted Services API (hosted voice, hosted email, web hosting)",
    "type": "project",
    "license": "proprietary",
    "require": {
        "php": "^8.2",
        "ext-json": "*",
        "ext-openssl": "*",
        "firebase/php-jwt": "^6.10",
        "guzzlehttp/guzzle": "^7.8",
        "laravel/framework": "^11.0",
        "giggsey/libphonenumber-for-php": "^8.13"
    },
    "require-dev": {
        "fakerphp/faker": "^1.23",
        "mockery/mockery": "^1.6",
        "phpunit/phpunit": "^11.0",
        "phpstan/phpstan": "^1.11",
        "squizlabs/php_codesniffer": "^3.9"
    },
    "autoload": {
        "psr-4": {
            "App\\": "app/",
            "Database\\Factories\\": "database/factories/"
        }
    },
    "autoload-dev": {
        "psr-4": {
            "Tests\\": "tests/"
        }
    },
    "scripts": {
        "test": "phpunit",
        "lint": "phpcs --standard=PSR12 app tests",
        "analyse": "phpstan analyse app --level=6"
    },
    "config": {
        "optimize-autoloader": true,
        "sort-packages": true
    },
    "minimum-stability": "stable",
    "prefer-stable": true
}
```

## apps/hosted-services/config/auth_jwt.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/config/auth_jwt.php`.

```php
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
```

## apps/hosted-services/config/hosted.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/config/hosted.php`.

```php
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
```

## apps/hosted-services/config/provisioning.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/config/provisioning.php`.

```php
<?php

declare(strict_types=1);

/*
 * Downstream provisioning platforms. Each platform is a separate internal
 * HTTP API; credentials are injected through the environment only.
 */
return [
    'timeout_seconds' => (float) env('PROVISIONING_TIMEOUT_SECONDS', 10),
    'max_retries' => (int) env('PROVISIONING_MAX_RETRIES', 2),
    'retry_backoff_ms' => 250,

    'voice' => [
        'base_url' => env('VOICE_PLATFORM_BASE_URL'),
        'api_key' => env('VOICE_PLATFORM_API_KEY'),
    ],
    'mail' => [
        'base_url' => env('MAIL_PLATFORM_BASE_URL'),
        'api_key' => env('MAIL_PLATFORM_API_KEY'),
    ],
    'webhosting' => [
        'base_url' => env('WEBHOSTING_BASE_URL'),
        'api_key' => env('WEBHOSTING_API_KEY'),
    ],
    'certificates' => [
        'base_url' => env('CERT_AUTHORITY_BASE_URL'),
        'api_key' => env('CERT_AUTHORITY_API_KEY'),
    ],
];
```

## apps/hosted-services/phpunit.xml

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: xml. Path: `apps/hosted-services/phpunit.xml`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true"
         cacheDirectory=".phpunit.cache">
    <testsuites>
        <testsuite name="Unit">
            <directory>tests/Unit</directory>
        </testsuite>
        <testsuite name="Feature">
            <directory>tests/Feature</directory>
        </testsuite>
    </testsuites>
    <source>
        <include>
            <directory>app</directory>
        </include>
    </source>
    <php>
        <env name="APP_ENV" value="testing"/>
        <env name="DB_CONNECTION" value="sqlite"/>
        <env name="DB_DATABASE" value=":memory:"/>
        <env name="JWT_ALGORITHM" value="HS256"/>
        <env name="JWT_PUBLIC_KEY" value="test-signing-secret-at-least-32-bytes-long"/>
        <env name="JWT_ISSUER" value="https://login.test"/>
        <env name="JWT_AUDIENCE" value="hosted-services-api"/>
    </php>
</phpunit>
```

## apps/hosted-services/routes/api.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/routes/api.php`.

```php
<?php

declare(strict_types=1);

/*
 * Hosted Services API, mounted under /api/v1 (see bootstrap/app.php).
 *
 * Every account-scoped route runs auth.jwt (bearer token -> Principal) and
 * account (ACC-######## format + caller entitlement). Reads are open to any
 * role allowed by config/auth_jwt.php; writes additionally require
 * role:manage (BUSINESS_ADMIN, PARTNER_ADMIN or SUPPORT_AGENT).
 */

use App\Http\Controllers\HealthController;
use App\Http\Controllers\Hosting\CertificateController;
use App\Http\Controllers\Hosting\DnsRecordController;
use App\Http\Controllers\Hosting\HostedDomainController;
use App\Http\Controllers\Mail\EmailDomainController;
use App\Http\Controllers\Mail\MailAliasController;
use App\Http\Controllers\Mail\MailboxController;
use App\Http\Controllers\Porting\CarrierUpdateController;
use App\Http\Controllers\Porting\PortingController;
use App\Http\Controllers\Voice\ExtensionController;
use App\Http\Controllers\Voice\HuntGroupController;
use App\Http\Controllers\Voice\NumberController;
use App\Http\Controllers\Voice\VoicemailController;
use Illuminate\Support\Facades\Route;

$uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

Route::get('/health', HealthController::class);

Route::middleware('auth.jwt')->group(function () use ($uuid): void {
    Route::post('/internal/porting/carrier-updates', CarrierUpdateController::class)
        ->middleware('role:SUPPORT_AGENT');

    Route::prefix('/accounts/{accountId}')
        ->middleware('account')
        ->where([
            'extensionId' => $uuid,
            'groupId' => $uuid,
            'numberId' => $uuid,
            'requestId' => $uuid,
            'domainId' => $uuid,
            'mailboxId' => $uuid,
            'aliasId' => $uuid,
            'recordId' => $uuid,
            'certificateId' => $uuid,
        ])
        ->group(function (): void {
            // Hosted voice: extensions, forwarding, voicemail
            Route::get('/extensions', [ExtensionController::class, 'index']);
            Route::get('/extensions/{extensionId}', [ExtensionController::class, 'show']);
            Route::get('/extensions/{extensionId}/forwarding-rules', [ExtensionController::class, 'forwardingRules']);
            Route::get('/extensions/{extensionId}/voicemail', [VoicemailController::class, 'show']);

            // Hosted voice: hunt groups and numbers
            Route::get('/hunt-groups', [HuntGroupController::class, 'index']);
            Route::get('/hunt-groups/{groupId}', [HuntGroupController::class, 'show']);
            Route::get('/numbers', [NumberController::class, 'index']);
            Route::get('/numbers/available', [NumberController::class, 'available']);
            Route::get('/numbers/{numberId}', [NumberController::class, 'show']);

            // Number porting
            Route::get('/porting-requests', [PortingController::class, 'index']);
            Route::get('/porting-requests/{requestId}', [PortingController::class, 'show']);

            // Hosted email
            Route::get('/email-domains', [EmailDomainController::class, 'index']);
            Route::get('/email-domains/{domainId}', [EmailDomainController::class, 'show']);
            Route::get('/email-domains/{domainId}/mailboxes', [MailboxController::class, 'index']);
            Route::get('/email-domains/{domainId}/aliases', [MailAliasController::class, 'index']);
            Route::get('/mailboxes/{mailboxId}', [MailboxController::class, 'show']);

            // Web hosting, DNS and certificates
            Route::get('/domains', [HostedDomainController::class, 'index']);
            Route::get('/domains/{domainId}', [HostedDomainController::class, 'show']);
            Route::get('/domains/{domainId}/dns-records', [DnsRecordController::class, 'index']);
            Route::get('/domains/{domainId}/zone-file', [DnsRecordController::class, 'export']);
            Route::get('/domains/{domainId}/certificates', [CertificateController::class, 'index']);

            Route::middleware('role:manage')->group(function (): void {
                Route::post('/extensions', [ExtensionController::class, 'store']);
                Route::patch('/extensions/{extensionId}', [ExtensionController::class, 'update']);
                Route::delete('/extensions/{extensionId}', [ExtensionController::class, 'destroy']);
                Route::put('/extensions/{extensionId}/forwarding-rules', [ExtensionController::class, 'replaceForwardingRules']);
                Route::put('/extensions/{extensionId}/voicemail', [VoicemailController::class, 'update']);
                Route::delete('/extensions/{extensionId}/voicemail', [VoicemailController::class, 'destroy']);

                Route::post('/hunt-groups', [HuntGroupController::class, 'store']);
                Route::put('/hunt-groups/{groupId}', [HuntGroupController::class, 'update']);
                Route::delete('/hunt-groups/{groupId}', [HuntGroupController::class, 'destroy']);

                Route::post('/numbers/orders', [NumberController::class, 'order']);
                Route::patch('/numbers/{numberId}', [NumberController::class, 'update']);
                Route::delete('/numbers/{numberId}', [NumberController::class, 'destroy']);

                Route::post('/porting-requests', [PortingController::class, 'store']);
                Route::patch('/porting-requests/{requestId}', [PortingController::class, 'update']);
                Route::post('/porting-requests/{requestId}/submit', [PortingController::class, 'submit']);
                Route::post('/porting-requests/{requestId}/cancel', [PortingController::class, 'cancel']);
                Route::post('/porting-requests/{requestId}/reopen', [PortingController::class, 'reopen']);

                Route::post('/email-domains', [EmailDomainController::class, 'store']);
                Route::post('/email-domains/{domainId}/verify-mx', [EmailDomainController::class, 'verifyMx']);
                Route::put('/email-domains/{domainId}/storage', [EmailDomainController::class, 'setStorage']);
                Route::post('/email-domains/{domainId}/mailboxes', [MailboxController::class, 'store']);
                Route::post('/email-domains/{domainId}/aliases', [MailAliasController::class, 'store']);
                Route::patch('/email-domains/{domainId}/aliases/{aliasId}', [MailAliasController::class, 'update']);
                Route::delete('/email-domains/{domainId}/aliases/{aliasId}', [MailAliasController::class, 'destroy']);
                Route::patch('/mailboxes/{mailboxId}', [MailboxController::class, 'update']);
                Route::post('/mailboxes/{mailboxId}/reset-password', [MailboxController::class, 'resetPassword']);
                Route::delete('/mailboxes/{mailboxId}', [MailboxController::class, 'destroy']);

                Route::post('/domains', [HostedDomainController::class, 'store']);
                Route::post('/domains/{domainId}/check-delegation', [HostedDomainController::class, 'checkDelegation']);
                Route::delete('/domains/{domainId}', [HostedDomainController::class, 'destroy']);
                Route::post('/domains/{domainId}/dns-records', [DnsRecordController::class, 'store']);
                Route::patch('/domains/{domainId}/dns-records/{recordId}', [DnsRecordController::class, 'update']);
                Route::delete('/domains/{domainId}/dns-records/{recordId}', [DnsRecordController::class, 'destroy']);
                Route::post('/domains/{domainId}/certificates', [CertificateController::class, 'store']);
                Route::patch('/domains/{domainId}/certificates/{certificateId}', [CertificateController::class, 'update']);
                Route::post('/domains/{domainId}/certificates/{certificateId}/revoke', [CertificateController::class, 'revoke']);
            });
        });
});
```

## apps/hosted-services/tests/Unit/AssertsApiExceptions.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/tests/Unit/AssertsApiExceptions.php`.

```php
<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Exceptions\BusinessRuleException;
use App\Exceptions\ValidationFailedException;
use PHPUnit\Framework\Assert;

/**
 * Assertions on the stable machine-readable parts of API exceptions (rule
 * code, offending field) rather than on human-readable messages.
 */
trait AssertsApiExceptions
{
    /**
     * @return array<string, mixed> The exception's problem extensions.
     */
    protected function assertBusinessRule(string $expectedRule, callable $action): array
    {
        try {
            $action();
        } catch (BusinessRuleException $e) {
            Assert::assertSame($expectedRule, $e->rule());

            return $e->extensions();
        }

        Assert::fail(sprintf('Expected business rule %s to be violated.', $expectedRule));
    }

    /**
     * @return list<string> Messages reported for the field.
     */
    protected function assertFieldError(string $expectedField, callable $action): array
    {
        try {
            $action();
        } catch (ValidationFailedException $e) {
            $errors = $e->extensions()['errors'];
            Assert::assertArrayHasKey($expectedField, $errors, 'Fields with errors: ' . implode(', ', array_keys($errors)));

            return $errors[$expectedField];
        }

        Assert::fail(sprintf('Expected a validation error on %s.', $expectedField));
    }
}
```

## apps/hosted-services/tests/Unit/Dns/ZoneSerializerTest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/tests/Unit/Dns/ZoneSerializerTest.php`.

```php
<?php

declare(strict_types=1);

namespace Tests\Unit\Dns;

use App\Enums\DnsRecordType;
use App\Services\Dns\DnsRecordData;
use App\Services\Dns\ZoneSerializer;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

final class ZoneSerializerTest extends TestCase
{
    private ZoneSerializer $serializer;

    protected function setUp(): void
    {
        $this->serializer = new ZoneSerializer();
    }

    public function testSerializesSortedMasterFileWithRelativeOwners(): void
    {
        $records = [
            new DnsRecordData('www.example.com', DnsRecordType::CNAME, 'example.com', 300),
            new DnsRecordData('example.com', DnsRecordType::MX, 'mx2.uniti.example', 3600, priority: 20),
            new DnsRecordData('example.com', DnsRecordType::A, '203.0.113.10', 3600),
            new DnsRecordData('example.com', DnsRecordType::MX, 'mx1.uniti.example.', 3600, priority: 10),
            new DnsRecordData('_sip._tcp.example.com', DnsRecordType::SRV, 'sip.uniti.example', 3600, priority: 10, weight: 60, port: 5060),
        ];

        $zone = $this->serializer->serialize('Example.COM.', 2026030401, $records, ['ns1.uniti.example', 'ns2.uniti.example.']);

        self::assertSame(implode("\n", [
            '$ORIGIN example.com.',
            '$TTL 3600',
            '@ IN SOA ns1.uniti.example. hostmaster.example.com. ( 2026030401 3600 900 1209600 300 )',
            '@ IN NS ns1.uniti.example.',
            '@ IN NS ns2.uniti.example.',
            '_sip._tcp 3600 IN SRV 10 60 5060 sip.uniti.example.',
            '@ 3600 IN A 203.0.113.10',
            '@ 3600 IN MX 10 mx1.uniti.example.',
            '@ 3600 IN MX 20 mx2.uniti.example.',
            'www 300 IN CNAME example.com.',
        ]) . "\n", $zone);
    }

    public function testTxtValuesAreEscapedAndSplitIntoCharacterStrings(): void
    {
        self::assertSame('"v=spf1 \\"x\\" \\\\"', $this->serializer->quoteTxt('v=spf1 "x" \\'));

        $long = $this->serializer->quoteTxt(str_repeat('a', 300));
        self::assertSame('"' . str_repeat('a', 255) . '" "' . str_repeat('a', 45) . '"', $long);
    }

    public function testCaaAndAddressRecordsAreRenderedVerbatim(): void
    {
        $caa = new DnsRecordData('example.com', DnsRecordType::CAA, '0 issue "letsencrypt.org"', 3600);

        self::assertSame('@ 3600 IN CAA 0 issue "letsencrypt.org"', $this->serializer->line($caa, 'example.com'));
    }

    public function testNextSerialUsesDatePrefixAndNeverGoesBackwards(): void
    {
        $now = new DateTimeImmutable('2026-03-04T12:00:00Z');

        self::assertSame(2026030400, ZoneSerializer::nextSerial(2025123199, $now));
        self::assertSame(2026030406, ZoneSerializer::nextSerial(2026030405, $now));
        self::assertSame(2026031001, ZoneSerializer::nextSerial(2026031000, $now));
        self::assertSame(2026030400, ZoneSerializer::nextSerial(0, $now));
    }
}
```

## apps/hosted-services/tests/Unit/Http/ProblemRendererTest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/tests/Unit/Http/ProblemRendererTest.php`.

```php
<?php

declare(strict_types=1);

namespace Tests\Unit\Http;

use App\Exceptions\BusinessRuleException;
use App\Exceptions\ProblemRenderer;
use App\Exceptions\ValidationFailedException;
use App\Http\Middleware\CorrelationId;
use App\Support\FieldCase;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use RuntimeException;

final class ProblemRendererTest extends TestCase
{
    private ProblemRenderer $renderer;
    private Request $request;

    protected function setUp(): void
    {
        $this->renderer = new ProblemRenderer(new NullLogger(), 'https://errors.test/hosted/');
        $this->request = Request::create('/api/v1/accounts/ACC-12345678/hunt-groups', 'POST');
        $this->request->attributes->set(CorrelationId::ATTRIBUTE, 'corr-12345678');
    }

    public function testValidationProblemUsesCamelCaseFieldPaths(): void
    {
        $response = $this->renderer->render(ValidationFailedException::withErrors([
            'no_answer_destination' => ['Overflow cannot route back to the hunt group itself.'],
            'members.2.ring_seconds' => ['Ring time must be between 5 and 120 seconds.'],
        ]), $this->request);

        $body = $response->getData(true);
        self::assertSame(400, $response->getStatusCode());
        self::assertSame(ProblemRenderer::CONTENT_TYPE, $response->headers->get('Content-Type'));
        self::assertSame('https://errors.test/hosted/validation-error', $body['type']);
        self::assertSame('/api/v1/accounts/ACC-12345678/hunt-groups', $body['instance']);
        self::assertSame('corr-12345678', $body['correlationId']);
        self::assertSame(['noAnswerDestination', 'members.2.ringSeconds'], array_keys($body['errors']));
    }

    public function testBusinessRuleCarriesStableRuleCode(): void
    {
        $response = $this->renderer->render(
            new BusinessRuleException('Pool exhausted.', 'MAIL_POOL_EXHAUSTED', ['shortfallMb' => 512]),
            $this->request,
        );

        $body = $response->getData(true);
        self::assertSame(422, $response->getStatusCode());
        self::assertSame('MAIL_POOL_EXHAUSTED', $body['rule']);
        self::assertSame(512, $body['shortfallMb']);
    }

    public function testUnexpectedErrorsAreOpaque(): void
    {
        $response = $this->renderer->render(new RuntimeException('SQLSTATE[08006] password=hunter2'), $this->request);

        $body = $response->getData(true);
        self::assertSame(500, $response->getStatusCode());
        self::assertStringNotContainsString('hunter2', (string) $response->getContent());
        self::assertArrayNotHasKey('debugMessage', $body);
    }

    public function testFieldCaseRoundTrip(): void
    {
        self::assertSame(
            ['service_address' => ['postal_code' => '94107'], 'numbers' => ['+14155550101']],
            FieldCase::snake(['serviceAddress' => ['postalCode' => '94107'], 'numbers' => ['+14155550101']]),
        );
        self::assertSame('rules.0.destinationType', FieldCase::camelPath('rules.0.destination_type'));
        self::assertSame(
            ['quotaMb' => ['a', 'b']],
            FieldCase::camelErrors(['quota_mb' => ['a'], 'quotaMb' => ['b']]),
        );
    }
}
```

## apps/hosted-services/tests/Unit/Mail/LocalPartPolicyTest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/tests/Unit/Mail/LocalPartPolicyTest.php`.

```php
<?php

declare(strict_types=1);

namespace Tests\Unit\Mail;

use App\Services\Mail\LocalPartPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Unit\AssertsApiExceptions;

final class LocalPartPolicyTest extends TestCase
{
    use AssertsApiExceptions;

    private LocalPartPolicy $policy;

    protected function setUp(): void
    {
        $this->policy = new LocalPartPolicy(['postmaster', 'abuse']);
    }

    public function testNormalisesCaseAndWhitespace(): void
    {
        self::assertSame('jane.doe', $this->policy->normalise('  Jane.Doe '));
        self::assertSame('sales_team-2', $this->policy->normalise('Sales_Team-2'));
    }

    #[DataProvider('invalidLocalParts')]
    public function testInvalidLocalPartsAreFieldErrors(string $input): void
    {
        $this->assertFieldError('destinations.0', fn () => $this->policy->normalise($input, 'destinations.0'));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function invalidLocalParts(): iterable
    {
        yield 'empty' => ['   '];
        yield 'too long' => [str_repeat('a', 65)];
        yield 'plus addressing' => ['jane+news'];
        yield 'leading dot' => ['.jane'];
        yield 'trailing hyphen' => ['jane-'];
        yield 'consecutive dots' => ['jane..doe'];
        yield 'quoted string' => ['"jane doe"'];
    }

    public function testReservedRoleAddressesBelongToThePlatform(): void
    {
        $this->assertBusinessRule('MAIL_RESERVED_LOCAL_PART', fn () => $this->policy->normalise('PostMaster'));
    }
}
```

## apps/hosted-services/tests/Unit/Mail/QuotaCalculatorTest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/tests/Unit/Mail/QuotaCalculatorTest.php`.

```php
<?php

declare(strict_types=1);

namespace Tests\Unit\Mail;

use App\Exceptions\BusinessRuleException;
use App\Services\Mail\QuotaCalculator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Unit\AssertsApiExceptions;

final class QuotaCalculatorTest extends TestCase
{
    use AssertsApiExceptions;

    private QuotaCalculator $calculator;

    protected function setUp(): void
    {
        $this->calculator = new QuotaCalculator(
            plans: [
                'EMAIL_ESSENTIALS' => ['pool_mb' => 51200, 'max_mailboxes' => 10],
                'EMAIL_BUSINESS' => ['pool_mb' => 256000, 'max_mailboxes' => 50],
            ],
            addonBlockMb: 10240,
            addonBlockPriceMinor: 299,
            currency: 'USD',
            minMailboxQuotaMb: 512,
            maxMailboxQuotaMb: 102400,
            warningPercent: 85,
        );
    }

    public function testCapacityAddsAddonBlocksToPlanPoolAndIgnoresNegativeBlocks(): void
    {
        self::assertSame(51200 + 3 * 10240, $this->calculator->capacityMb('EMAIL_ESSENTIALS', 3));
        self::assertSame(51200, $this->calculator->capacityMb('EMAIL_ESSENTIALS', -2));
    }

    public function testSummaryAggregatesMailboxesAndPricesAddonsInMinorUnits(): void
    {
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 2, [
            ['quota_mb' => 10240, 'used_mb' => 4000],
            ['quota_mb' => 20480, 'used_mb' => 512],
        ]);

        self::assertSame(71680, $summary->capacityMb);
        self::assertSame(30720, $summary->allocatedMb);
        self::assertSame(4512, $summary->usedMb);
        self::assertSame(40960, $summary->unallocatedMb());
        self::assertSame(8, $summary->remainingMailboxSlots());
        self::assertSame(598, $summary->addonMonthlyCostMinor);
        self::assertSame('USD', $summary->currency);
    }

    public function testUnknownPlanIsABusinessRuleViolation(): void
    {
        $this->assertBusinessRule('MAIL_UNKNOWN_PLAN', fn () => $this->calculator->capacityMb('EMAIL_GOLD', 0));
    }

    public function testAllocationWithinPoolIsAccepted(): void
    {
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 0, [['quota_mb' => 40960, 'used_mb' => 0]]);

        $this->calculator->assertCanAllocate($summary, 10240, isNewMailbox: true);
        $this->addToAssertionCount(1);
    }

    public function testExhaustedPoolSuggestsEnoughAddonBlocksAndTheirMonthlyCost(): void
    {
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 0, [['quota_mb' => 46080, 'used_mb' => 0]]);

        $extensions = $this->assertBusinessRule(
            'MAIL_POOL_EXHAUSTED',
            fn () => $this->calculator->assertCanAllocate($summary, 20480, isNewMailbox: true),
        );

        self::assertSame(15360, $extensions['shortfallMb']);
        self::assertSame(2, $extensions['suggestedAddonBlocks']);
        self::assertSame(['amountMinor' => 598, 'currency' => 'USD'], $extensions['suggestedAddonMonthlyCost']);
    }

    public function testGrowingAnExistingMailboxOnlyCountsTheDelta(): void
    {
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 0, [['quota_mb' => 51200, 'used_mb' => 100]]);

        $this->assertBusinessRule(
            'MAIL_POOL_EXHAUSTED',
            fn () => $this->calculator->assertCanAllocate($summary, 51712, currentQuotaMb: 51200, currentUsedMb: 100),
        );
        $this->calculator->assertCanAllocate($summary, 40960, currentQuotaMb: 51200, currentUsedMb: 100);
        $this->addToAssertionCount(1);
    }

    public function testQuotaCannotShrinkBelowCurrentUsage(): void
    {
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 0, [['quota_mb' => 10240, 'used_mb' => 9000]]);

        $extensions = $this->assertBusinessRule(
            'MAIL_QUOTA_BELOW_USAGE',
            fn () => $this->calculator->assertCanAllocate($summary, 8192, currentQuotaMb: 10240, currentUsedMb: 9000),
        );
        self::assertSame(9000, $extensions['usedMb']);
    }

    public function testMailboxLimitAppliesOnlyToNewMailboxes(): void
    {
        $full = array_fill(0, 10, ['quota_mb' => 1024, 'used_mb' => 0]);
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 0, $full);

        $this->assertBusinessRule('MAIL_MAILBOX_LIMIT', fn () => $this->calculator->assertCanAllocate($summary, 1024, isNewMailbox: true));
        $this->calculator->assertCanAllocate($summary, 2048, currentQuotaMb: 1024);
        $this->addToAssertionCount(1);
    }

    #[DataProvider('outOfRangeQuotas')]
    public function testQuotaOutsideConfiguredRangeIsRejected(int $quotaMb): void
    {
        $summary = $this->calculator->summarise('EMAIL_BUSINESS', 0, []);

        $this->assertBusinessRule('MAIL_QUOTA_OUT_OF_RANGE', fn () => $this->calculator->assertCanAllocate($summary, $quotaMb, isNewMailbox: true));
    }

    /**
     * @return iterable<string, array{int}>
     */
    public static function outOfRangeQuotas(): iterable
    {
        yield 'below minimum' => [511];
        yield 'above maximum' => [102401];
    }

    public function testRemovingAddonBlocksMayNotStrandAllocatedQuota(): void
    {
        $summary = $this->calculator->summarise('EMAIL_ESSENTIALS', 3, [['quota_mb' => 70000, 'used_mb' => 0]]);

        $extensions = $this->assertBusinessRule(
            'MAIL_ADDON_BELOW_ALLOCATION',
            fn () => $this->calculator->assertCanChangeAddonBlocks($summary, 1),
        );
        self::assertSame(2, $extensions['minimumAddonBlocks']);

        $this->calculator->assertCanChangeAddonBlocks($summary, 2);
        $this->expectException(BusinessRuleException::class);
        $this->calculator->assertCanChangeAddonBlocks($summary, -1);
    }

    #[DataProvider('usageLevels')]
    public function testMailboxUsageLevel(int $used, int $quota, float $percent, string $level): void
    {
        $usage = $this->calculator->mailboxUsage($used, $quota);

        self::assertSame($percent, $usage['percent']);
        self::assertSame($level, $usage['level']);
    }

    /**
     * @return iterable<string, array{int, int, float, string}>
     */
    public static function usageLevels(): iterable
    {
        yield 'comfortable' => [1000, 10240, 9.8, QuotaCalculator::LEVEL_OK];
        yield 'at warning threshold' => [8704, 10240, 85.0, QuotaCalculator::LEVEL_WARNING];
        yield 'exactly full' => [10240, 10240, 100.0, QuotaCalculator::LEVEL_FULL];
        yield 'over quota is capped at 100 percent' => [12000, 10240, 100.0, QuotaCalculator::LEVEL_FULL];
        yield 'zero quota' => [0, 0, 100.0, QuotaCalculator::LEVEL_FULL];
    }

    public function testEvenSplitRoundsDownTo256MbUnitsWithinBounds(): void
    {
        self::assertSame(16896, $this->calculator->evenSplitMb(51200, 3));
        self::assertSame(512, $this->calculator->evenSplitMb(1000, 10));
        self::assertSame(102400, $this->calculator->evenSplitMb(1024000, 2));
        self::assertSame(0, $this->calculator->evenSplitMb(51200, 0));
    }

    public function testBlocksForRoundsUp(): void
    {
        self::assertSame(0, $this->calculator->blocksFor(0));
        self::assertSame(1, $this->calculator->blocksFor(1));
        self::assertSame(1, $this->calculator->blocksFor(10240));
        self::assertSame(2, $this->calculator->blocksFor(10241));
    }
}
```

## apps/hosted-services/tests/Unit/Porting/PortingStateMachineTest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/tests/Unit/Porting/PortingStateMachineTest.php`.

```php
<?php

declare(strict_types=1);

namespace Tests\Unit\Porting;

use App\Enums\PortingStatus;
use App\Exceptions\InvalidStateTransitionException;
use App\Services\Porting\PortingContext;
use App\Services\Porting\PortingStateMachine;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Unit\AssertsApiExceptions;

final class PortingStateMachineTest extends TestCase
{
    use AssertsApiExceptions;

    /** Wednesday 10:00 UTC. */
    private const NOW = '2026-03-04T10:00:00Z';

    private PortingStateMachine $machine;
    private CarbonImmutable $now;

    protected function setUp(): void
    {
        $this->machine = new PortingStateMachine(cancelCutoffHours: 48, maxResubmissions: 3, maxNumbersPerRequest: 3, minLeadBusinessDays: 5);
        $this->now = CarbonImmutable::parse(self::NOW);
    }

    public function testTerminalStatesAllowNoTransitions(): void
    {
        foreach ([PortingStatus::Completed, PortingStatus::Cancelled, PortingStatus::Failed] as $status) {
            self::assertTrue($status->isTerminal());
            self::assertSame([], $this->machine->allowedTransitions($status));
        }
    }

    public function testMoveOutsideTheTableIsAConflict(): void
    {
        $this->expectException(InvalidStateTransitionException::class);

        $this->machine->assertTransition(PortingStatus::Draft, PortingStatus::Completed, $this->context());
    }

    public function testSubmitRequiresNumbersAndASignedLoa(): void
    {
        $this->assertBusinessRule('PORT_NO_NUMBERS', fn () => $this->submit($this->context(numbers: [])));
        $this->assertBusinessRule('PORT_LOA_MISSING', fn () => $this->submit($this->context(hasLoa: false)));

        $this->submit($this->context());
        $this->addToAssertionCount(1);
    }

    public function testSubmitRejectsDuplicateAndExcessNumbers(): void
    {
        $this->assertBusinessRule(
            'PORT_DUPLICATE_NUMBER',
            fn () => $this->submit($this->context(numbers: ['+14155550101', '+14155550101'])),
        );
        $this->assertBusinessRule(
            'PORT_TOO_MANY_NUMBERS',
            fn () => $this->submit($this->context(numbers: ['+14155550101', '+14155550102', '+14155550103', '+14155550104'])),
        );
    }

    public function testFocMustBeInTheFuture(): void
    {
        $this->assertBusinessRule(
            'PORT_FOC_MISSING',
            fn () => $this->machine->assertTransition(PortingStatus::PendingFoc, PortingStatus::FocReceived, $this->context()),
        );
        $this->assertBusinessRule(
            'PORT_FOC_IN_PAST',
            fn () => $this->machine->assertTransition(
                PortingStatus::PendingFoc,
                PortingStatus::FocReceived,
                $this->context(focAt: $this->now->subMinute()),
            ),
        );
    }

    public function testFocMayBeRescheduledWhileFocReceived(): void
    {
        $this->machine->assertTransition(
            PortingStatus::FocReceived,
            PortingStatus::FocReceived,
            $this->context(focAt: $this->now->addDays(3)),
        );
        $this->addToAssertionCount(1);
    }

    public function testCompletionCannotPrecedeFoc(): void
    {
        $this->assertBusinessRule(
            'PORT_COMPLETE_BEFORE_FOC',
            fn () => $this->machine->assertTransition(
                PortingStatus::FocReceived,
                PortingStatus::Completed,
                $this->context(focAt: $this->now->addHour()),
            ),
        );

        $this->machine->assertTransition(PortingStatus::FocReceived, PortingStatus::Completed, $this->context(focAt: $this->now));
        $this->addToAssertionCount(1);
    }

    #[DataProvider('reasonRequiredTransitions')]
    public function testRejectionAndFailureRequireAReason(PortingStatus $from, PortingStatus $to): void
    {
        $this->assertBusinessRule('PORT_REASON_REQUIRED', fn () => $this->machine->assertTransition($from, $to, $this->context(reason: '  ')));

        $this->machine->assertTransition($from, $to, $this->context(reason: 'Account number mismatch', focAt: $this->now->addDay()));
        $this->addToAssertionCount(1);
    }

    /**
     * @return iterable<string, array{PortingStatus, PortingStatus}>
     */
    public static function reasonRequiredTransitions(): iterable
    {
        yield 'carrier rejects submission' => [PortingStatus::Submitted, PortingStatus::Rejected];
        yield 'carrier rejects before FOC' => [PortingStatus::PendingFoc, PortingStatus::Rejected];
        yield 'port fails on the day' => [PortingStatus::FocReceived, PortingStatus::Failed];
    }

    public function testResubmissionIsLimited(): void
    {
        $this->machine->assertTransition(PortingStatus::Rejected, PortingStatus::Draft, $this->context(resubmissions: 2));

        $this->assertBusinessRule(
            'PORT_RESUBMISSION_LIMIT',
            fn () => $this->machine->assertTransition(PortingStatus::Rejected, PortingStatus::Draft, $this->context(resubmissions: 3)),
        );
    }

    public function testCancellationClosesFortyEightHoursBeforeFoc(): void
    {
        $focAt = $this->now->addHours(72);
        self::assertEquals($this->now->addHours(24), $this->machine->cancelDeadline(PortingStatus::FocReceived, $focAt));

        $this->machine->assertTransition(PortingStatus::FocReceived, PortingStatus::Cancelled, $this->context(focAt: $focAt));

        $extensions = $this->assertBusinessRule(
            'PORT_CANCEL_CUTOFF',
            fn () => $this->machine->assertTransition(
                PortingStatus::FocReceived,
                PortingStatus::Cancelled,
                $this->context(focAt: $this->now->addHours(47)),
            ),
        );
        self::assertSame('2026-03-04T09:00:00Z', $extensions['cancelDeadline']);
    }

    public function testCancelDeadlineOnlyAppliesOnceFocIsKnown(): void
    {
        self::assertNull($this->machine->cancelDeadline(PortingStatus::Submitted, $this->now->addDay()));
        self::assertNull($this->machine->cancelDeadline(PortingStatus::FocReceived, null));
    }

    public function testEarliestPortDateSkipsWeekends(): void
    {
        self::assertSame('2026-03-11', $this->machine->earliestPortDate($this->now)->toDateString());

        $friday = CarbonImmutable::parse('2026-03-06T16:00:00Z');
        self::assertSame('2026-03-13', $this->machine->earliestPortDate($friday)->toDateString());
    }

    public function testRequestedPortDateMustBeABusinessDayAfterLeadTime(): void
    {
        $this->assertBusinessRule(
            'PORT_DATE_WEEKEND',
            fn () => $this->machine->assertRequestedPortDate(CarbonImmutable::parse('2026-03-14'), $this->now),
        );

        $extensions = $this->assertBusinessRule(
            'PORT_DATE_TOO_SOON',
            fn () => $this->machine->assertRequestedPortDate(CarbonImmutable::parse('2026-03-10'), $this->now),
        );
        self::assertSame('2026-03-11', $extensions['earliestPortDate']);

        $this->machine->assertRequestedPortDate(CarbonImmutable::parse('2026-03-11'), $this->now);
    }

    private function submit(PortingContext $ctx): void
    {
        $this->machine->assertTransition(PortingStatus::Draft, PortingStatus::Submitted, $ctx);
    }

    /**
     * @param list<string>|null $numbers
     */
    private function context(
        ?array $numbers = null,
        ?CarbonImmutable $focAt = null,
        int $resubmissions = 0,
        bool $hasLoa = true,
        ?string $reason = null,
    ): PortingContext {
        return new PortingContext(
            now: $this->now,
            numbers: $numbers ?? ['+14155550101'],
            focAt: $focAt,
            resubmissionCount: $resubmissions,
            hasLoa: $hasLoa,
            reason: $reason,
        );
    }
}
```

## apps/hosted-services/tests/Unit/Voice/DialPlanPolicyTest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/tests/Unit/Voice/DialPlanPolicyTest.php`.

```php
<?php

declare(strict_types=1);

namespace Tests\Unit\Voice;

use App\Exceptions\ConflictException;
use App\Services\Voice\DialPlanPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Unit\AssertsApiExceptions;

final class DialPlanPolicyTest extends TestCase
{
    use AssertsApiExceptions;

    private DialPlanPolicy $policy;

    protected function setUp(): void
    {
        $this->policy = new DialPlanPolicy(minDigits: 3, maxDigits: 6, reserved: ['911', '933', '411', '611', '711', '811']);
    }

    #[DataProvider('malformedNumbers')]
    public function testMalformedNumbersAreFieldErrors(string $number): void
    {
        $this->assertFieldError('pilot_extension', fn () => $this->policy->assertAvailable($number, [], 'pilot_extension'));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function malformedNumbers(): iterable
    {
        yield 'too short' => ['12'];
        yield 'too long' => ['1234567'];
        yield 'non-digit' => ['20a1'];
        yield 'empty' => [''];
    }

    #[DataProvider('reservedPrefixes')]
    public function testOperatorAndOutsideLinePrefixesAreReserved(string $number): void
    {
        $this->assertBusinessRule('VOICE_EXTENSION_RESERVED_PREFIX', fn () => $this->policy->assertAvailable($number, []));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function reservedPrefixes(): iterable
    {
        yield 'operator' => ['0123'];
        yield 'outside line' => ['9100'];
    }

    public function testServiceCodesCannotStartAnExtension(): void
    {
        $this->assertBusinessRule('VOICE_EXTENSION_RESERVED', fn () => $this->policy->assertAvailable('4110', []));
        $this->assertBusinessRule('VOICE_EXTENSION_RESERVED', fn () => $this->policy->assertAvailable('711', []));
    }

    public function testExactDuplicateIsAConflict(): void
    {
        $this->expectException(ConflictException::class);

        $this->policy->assertAvailable('2001', ['2001', '2002']);
    }

    public function testPrefixOverlapWouldMakeDiallingAmbiguous(): void
    {
        $this->assertBusinessRule('VOICE_EXTENSION_PREFIX_OVERLAP', fn () => $this->policy->assertAvailable('200', ['2001']));
        $this->assertBusinessRule('VOICE_EXTENSION_PREFIX_OVERLAP', fn () => $this->policy->assertAvailable('20015', ['2001']));

        $this->policy->assertAvailable('2010', ['2001', '2002']);
        $this->addToAssertionCount(1);
    }

    public function testSuggestReturnsLowestFreeNonOverlappingNumber(): void
    {
        self::assertSame('102', $this->policy->suggest(['100', '101'], 3));
        self::assertSame('101', $this->policy->suggest(['1000'], 3));
        self::assertSame('1000', $this->policy->suggest([], 4));
    }

    public function testSuggestClampsRequestedLengthToPolicy(): void
    {
        self::assertSame('100', $this->policy->suggest([], 1));
        self::assertSame('100000', $this->policy->suggest([], 9));
    }

    public function testSuggestReturnsNullWhenEveryCandidateOverlaps(): void
    {
        $inUse = array_map('strval', range(1, 8));

        self::assertNull($this->policy->suggest($inUse, 3));
    }
}
```

## apps/hosted-services/tests/Unit/Voice/ForwardingRuleValidatorTest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/tests/Unit/Voice/ForwardingRuleValidatorTest.php`.

```php
<?php

declare(strict_types=1);

namespace Tests\Unit\Voice;

use App\Enums\ForwardingCondition;
use App\Services\Voice\ForwardingRuleValidator;
use PHPUnit\Framework\TestCase;
use Tests\Unit\AssertsApiExceptions;

final class ForwardingRuleValidatorTest extends TestCase
{
    use AssertsApiExceptions;

    private const OWNER = '2001';
    private const DIAL_PLAN = ['2001', '2002', '2003', '2004'];

    private ForwardingRuleValidator $validator;

    protected function setUp(): void
    {
        $this->validator = new ForwardingRuleValidator(noAnswerMinSeconds: 5, noAnswerMaxSeconds: 60, maxChainDepth: 5);
    }

    public function testValidRuleSetIsNormalisedAndOrderedByPrecedence(): void
    {
        $rules = $this->validator->validate([
            ['condition' => 'NO_ANSWER', 'destination_type' => 'EXTENSION', 'destination' => '2002', 'ring_seconds' => 20],
            ['condition' => 'BUSY', 'destination_type' => 'VOICEMAIL', 'destination' => 'ignored', 'ring_seconds' => 30],
            ['condition' => 'UNREACHABLE', 'destination_type' => 'EXTERNAL', 'destination' => ' (415) 555-2671 ', 'enabled' => false],
        ], self::OWNER, self::DIAL_PLAN, []);

        self::assertSame(
            [ForwardingCondition::Unreachable, ForwardingCondition::Busy, ForwardingCondition::NoAnswer],
            array_column($rules, 'condition'),
        );
        self::assertSame('+14155552671', $rules[0]['destination']);
        self::assertFalse($rules[0]['enabled']);
        self::assertNull($rules[1]['destination']);
        self::assertNull($rules[1]['ring_seconds'], 'Ring time only applies to NO_ANSWER.');
        self::assertSame(20, $rules[2]['ring_seconds']);
        self::assertTrue($rules[2]['enabled']);
    }

    public function testEachConditionMayAppearOnlyOnce(): void
    {
        $this->assertFieldError('rules.1.condition', fn () => $this->validate([
            ['condition' => 'BUSY', 'destination_type' => 'VOICEMAIL'],
            ['condition' => 'BUSY', 'destination_type' => 'EXTENSION', 'destination' => '2002'],
        ]));
    }

    public function testUnknownConditionAndDestinationTypeAreReported(): void
    {
        $this->assertFieldError('rules.0.condition', fn () => $this->validate([['condition' => 'SOMETIMES', 'destination_type' => 'VOICEMAIL']]));
        $this->assertFieldError('rules.0.destination_type', fn () => $this->validate([['condition' => 'ALWAYS', 'destination_type' => 'FAX']]));
    }

    public function testInternalDestinationMustExistAndNotBeTheOwner(): void
    {
        $this->assertFieldError('rules.0.destination', fn () => $this->validate([
            ['condition' => 'ALWAYS', 'destination_type' => 'EXTENSION', 'destination' => '2999'],
        ]));
        $this->assertFieldError('rules.0.destination', fn () => $this->validate([
            ['condition' => 'ALWAYS', 'destination_type' => 'EXTENSION', 'destination' => self::OWNER],
        ]));
    }

    public function testExternalDestinationsExcludePremiumRateAndInternational(): void
    {
        $premium = $this->assertFieldError('rules.0.destination', fn () => $this->validate([
            ['condition' => 'ALWAYS', 'destination_type' => 'EXTERNAL', 'destination' => '900-555-1234'],
        ]));
        self::assertStringContainsString('premium-rate', $premium[0]);

        $international = $this->assertFieldError('rules.0.destination', fn () => $this->validate([
            ['condition' => 'ALWAYS', 'destination_type' => 'EXTERNAL', 'destination' => '+44 20 7946 0000'],
        ]));
        self::assertStringContainsString('International', $international[0]);
    }

    public function testInternationalForwardingCanBeEnabled(): void
    {
        $validator = new ForwardingRuleValidator(allowInternational: true);

        $rules = $validator->validate(
            [['condition' => 'ALWAYS', 'destination_type' => 'EXTERNAL', 'destination' => '+44 20 7946 0000']],
            self::OWNER,
            self::DIAL_PLAN,
            [],
        );

        self::assertSame('+442079460000', $rules[0]['destination']);
    }

    public function testNoAnswerRingTimeIsRequiredAndSteppedInFiveSeconds(): void
    {
        $this->assertFieldError('rules.0.ring_seconds', fn () => $this->validate([
            ['condition' => 'NO_ANSWER', 'destination_type' => 'VOICEMAIL'],
        ]));
        $this->assertFieldError('rules.0.ring_seconds', fn () => $this->validate([
            ['condition' => 'NO_ANSWER', 'destination_type' => 'VOICEMAIL', 'ring_seconds' => 17],
        ]));
        $this->assertFieldError('rules.0.ring_seconds', fn () => $this->validate([
            ['condition' => 'NO_ANSWER', 'destination_type' => 'VOICEMAIL', 'ring_seconds' => 65],
        ]));
    }

    public function testForwardingLoopAcrossExtensionsIsRejectedWithTheCycle(): void
    {
        $graph = ['2002' => ['2003'], '2003' => [self::OWNER]];

        $extensions = $this->assertBusinessRule('VOICE_FORWARDING_LOOP', fn () => $this->validate(
            [['condition' => 'ALWAYS', 'destination_type' => 'EXTENSION', 'destination' => '2002']],
            $graph,
        ));

        self::assertSame([self::OWNER, '2002', '2003', self::OWNER], $extensions['cycle']);
    }

    public function testDisabledRulesDoNotParticipateInLoopDetection(): void
    {
        $graph = ['2002' => [self::OWNER]];

        $rules = $this->validate(
            [['condition' => 'ALWAYS', 'destination_type' => 'EXTENSION', 'destination' => '2002', 'enabled' => false]],
            $graph,
        );

        self::assertCount(1, $rules);
    }

    public function testExistingOutgoingEdgesOfTheOwnerAreReplacedNotMerged(): void
    {
        $graph = [self::OWNER => ['2002'], '2002' => ['2004']];

        $rules = $this->validate([['condition' => 'BUSY', 'destination_type' => 'EXTENSION', 'destination' => '2003']], $graph);

        self::assertSame('2003', $rules[0]['destination']);
    }

    public function testChainsDeeperThanTheSwitchFollowsAreRejected(): void
    {
        $validator = new ForwardingRuleValidator(maxChainDepth: 2);

        $this->assertBusinessRule('VOICE_FORWARDING_TOO_DEEP', fn () => $validator->validate(
            [['condition' => 'ALWAYS', 'destination_type' => 'EXTENSION', 'destination' => '2002']],
            self::OWNER,
            self::DIAL_PLAN,
            ['2002' => ['2003'], '2003' => ['2004']],
        ));
    }

    /**
     * @param list<array<string, mixed>>  $rules
     * @param array<string, list<string>> $graph
     * @return list<array<string, mixed>>
     */
    private function validate(array $rules, array $graph = []): array
    {
        return $this->validator->validate($rules, self::OWNER, self::DIAL_PLAN, $graph);
    }
}
```

## apps/hosted-services/tests/Unit/Voice/VoicemailPinPolicyTest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/tests/Unit/Voice/VoicemailPinPolicyTest.php`.

```php
<?php

declare(strict_types=1);

namespace Tests\Unit\Voice;

use App\Services\Voice\VoicemailPinPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Unit\AssertsApiExceptions;

final class VoicemailPinPolicyTest extends TestCase
{
    use AssertsApiExceptions;

    private VoicemailPinPolicy $policy;

    protected function setUp(): void
    {
        $this->policy = new VoicemailPinPolicy(minLength: 4, maxLength: 8);
    }

    #[DataProvider('weakPins')]
    public function testWeakPinsAreRefused(string $pin, string $expectedProblem): void
    {
        self::assertStringContainsString($expectedProblem, (string) $this->policy->problem($pin));
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function weakPins(): iterable
    {
        yield 'letters' => ['12a4', 'digits only'];
        yield 'too short' => ['482', '4 to 8 digits'];
        yield 'too long' => ['482915736', '4 to 8 digits'];
        yield 'single repeated digit' => ['7777', 'single repeated digit'];
        yield 'ascending' => ['3456', 'sequence'];
        yield 'descending' => ['9876', 'sequence'];
        yield 'ascending wrapping past nine' => ['8901', 'sequence'];
        yield 'repeated halves' => ['4848', 'repeated pattern'];
        yield 'repeated triple' => ['258258', 'repeated pattern'];
    }

    public function testPinMayNotMatchTheExtensionOrSitInsideTheDirectNumber(): void
    {
        $forbidden = ['2001', '555-2671'];

        self::assertNotNull($this->policy->problem('2001', $forbidden));
        self::assertNotNull($this->policy->problem('5267', $forbidden));
        self::assertNull($this->policy->problem('5268', $forbidden));
    }

    public function testShortForbiddenValuesOnlyBlockExactMatches(): void
    {
        self::assertNull($this->policy->problem('20013', ['200']));
        self::assertNotNull($this->policy->problem('2013', ['2013']));
    }

    public function testAcceptablePinPassesAndWeakPinIsAFieldError(): void
    {
        $this->policy->assertAcceptable('2580');
        $this->assertFieldError('pin', fn () => $this->policy->assertAcceptable('0000'));
    }
}
```
