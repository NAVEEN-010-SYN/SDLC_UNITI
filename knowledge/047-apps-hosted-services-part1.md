# Hosted Services (hosted voice, email, web hosting): apps/hosted-services (part 1 of 6)

- **Application:** Hosted Services (hosted voice, email, web hosting)
- **Tech stack:** PHP 8 (Laravel-style)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 32

## Files

- `apps/hosted-services/.env.example` (43 lines)
- `apps/hosted-services/Dockerfile` (34 lines)
- `apps/hosted-services/app/Clients/CertificateAuthorityClient.php` (86 lines)
- `apps/hosted-services/app/Clients/MailPlatformClient.php` (118 lines)
- `apps/hosted-services/app/Clients/ProvisioningHttpClient.php` (189 lines)
- `apps/hosted-services/app/Clients/VoicePlatformClient.php` (164 lines)
- `apps/hosted-services/app/Clients/WebHostingClient.php` (84 lines)
- `apps/hosted-services/app/Enums/CertificateStatus.php` (20 lines)
- `apps/hosted-services/app/Enums/DnsRecordType.php` (45 lines)
- `apps/hosted-services/app/Enums/ForwardingCondition.php` (28 lines)
- `apps/hosted-services/app/Enums/HuntGroupStrategy.php` (26 lines)
- `apps/hosted-services/app/Enums/PortingStatus.php` (46 lines)
- `apps/hosted-services/app/Enums/ProvisioningStatus.php` (19 lines)
- `apps/hosted-services/app/Enums/Role.php` (43 lines)
- `apps/hosted-services/app/Exceptions/AccessDeniedException.php` (24 lines)
- `apps/hosted-services/app/Exceptions/ApiException.php` (51 lines)
- `apps/hosted-services/app/Exceptions/AuthenticationFailedException.php` (24 lines)
- `apps/hosted-services/app/Exceptions/BusinessRuleException.php` (42 lines)
- `apps/hosted-services/app/Exceptions/ConflictException.php` (27 lines)
- `apps/hosted-services/app/Exceptions/InvalidStateTransitionException.php` (32 lines)
- `apps/hosted-services/app/Exceptions/ProblemRenderer.php` (156 lines)
- `apps/hosted-services/app/Exceptions/ProvisioningException.php` (43 lines)
- `apps/hosted-services/app/Exceptions/ResourceNotFoundException.php` (29 lines)
- `apps/hosted-services/app/Exceptions/ValidationFailedException.php` (42 lines)
- `apps/hosted-services/app/Http/Controllers/Controller.php` (111 lines)
- `apps/hosted-services/app/Http/Controllers/HealthController.php` (44 lines)
- `apps/hosted-services/app/Http/Controllers/Hosting/CertificateController.php` (68 lines)
- `apps/hosted-services/app/Http/Controllers/Hosting/DnsRecordController.php` (71 lines)
- `apps/hosted-services/app/Http/Controllers/Hosting/HostedDomainController.php` (62 lines)
- `apps/hosted-services/app/Http/Controllers/Mail/EmailDomainController.php` (74 lines)
- `apps/hosted-services/app/Http/Controllers/Mail/MailAliasController.php` (53 lines)
- `apps/hosted-services/app/Http/Controllers/Mail/MailboxController.php` (81 lines)

## apps/hosted-services/.env.example

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: bash. Path: `apps/hosted-services/.env.example`.

```bash
APP_NAME=uniti-hosted-services
APP_ENV=local
APP_DEBUG=false
APP_URL=http://localhost:8080
LOG_CHANNEL=json
LOG_LEVEL=info

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=hosted_services
DB_USERNAME=hosted_services
DB_PASSWORD=

# OAuth2 / OIDC bearer token validation
JWT_ISSUER=https://login.uniti.example/realms/selfcare
JWT_AUDIENCE=hosted-services-api
JWT_ALGORITHM=RS256
# PEM-encoded public key (newlines escaped as \n) or a path prefixed with file://
JWT_PUBLIC_KEY=
JWT_LEEWAY_SECONDS=30

# Provisioning platform endpoints
VOICE_PLATFORM_BASE_URL=https://voice-prov.internal.uniti.example/api
VOICE_PLATFORM_API_KEY=
MAIL_PLATFORM_BASE_URL=https://mail-prov.internal.uniti.example/api
MAIL_PLATFORM_API_KEY=
WEBHOSTING_BASE_URL=https://webhost-prov.internal.uniti.example/api
WEBHOSTING_API_KEY=
CERT_AUTHORITY_BASE_URL=https://acme-proxy.internal.uniti.example/api
CERT_AUTHORITY_API_KEY=
PROVISIONING_TIMEOUT_SECONDS=10
PROVISIONING_MAX_RETRIES=2

# Hosted email defaults
MAIL_DEFAULT_MAILBOX_QUOTA_MB=10240
MAIL_QUOTA_WARNING_PERCENT=85
MAIL_ALLOW_EXTERNAL_FORWARDING=true

# Number porting
PORTING_CANCEL_CUTOFF_HOURS=48
PORTING_MIN_LEAD_DAYS=5
```

## apps/hosted-services/Dockerfile

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: dockerfile. Path: `apps/hosted-services/Dockerfile`.

```dockerfile
# syntax=docker/dockerfile:1.7

FROM composer:2.7 AS vendor
WORKDIR /app
COPY composer.json composer.lock* ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist --optimize-autoloader

FROM php:8.2-fpm-alpine AS runtime

RUN apk add --no-cache nginx supervisor postgresql-libs icu-libs \
    && apk add --no-cache --virtual .build-deps postgresql-dev icu-dev $PHPIZE_DEPS \
    && docker-php-ext-install pdo_pgsql intl opcache \
    && apk del .build-deps

WORKDIR /var/www/html

COPY --from=vendor /app/vendor ./vendor
COPY . .

RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app storage bootstrap/cache 2>/dev/null || true

ENV APP_ENV=production \
    LOG_CHANNEL=json \
    PHP_OPCACHE_VALIDATE_TIMESTAMPS=0

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/api/v1/health || exit 1

CMD ["php", "-S", "0.0.0.0:8080", "-t", "public"]
```

## apps/hosted-services/app/Clients/CertificateAuthorityClient.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Clients/CertificateAuthorityClient.php`.

```php
<?php

declare(strict_types=1);

namespace App\Clients;

use Carbon\CarbonImmutable;

/**
 * Internal ACME proxy. Orders DV certificates using DNS-01 challenges,
 * which we can satisfy ourselves because Uniti serves the customer's zone.
 */
class CertificateAuthorityClient
{
    public function __construct(private readonly ProvisioningHttpClient $http)
    {
    }

    /**
     * @param list<string> $names
     * @return array{orderRef: string, challenges: array<string, string>, expiresAt: CarbonImmutable}
     *         challenges maps the TXT record FQDN to the token value.
     */
    public function createOrder(array $names, string $idempotencyKey): array
    {
        $result = $this->http->post('/orders', [
            'identifiers' => $names,
            'challengeType' => 'dns-01',
        ], $idempotencyKey);

        $challenges = [];
        foreach ($result['challenges'] ?? [] as $challenge) {
            $challenges[(string) $challenge['recordName']] = (string) $challenge['recordValue'];
        }

        return [
            'orderRef' => (string) $result['orderId'],
            'challenges' => $challenges,
            'expiresAt' => CarbonImmutable::parse((string) $result['expiresAt']),
        ];
    }

    /**
     * Ask the CA to validate challenges and finalise the order.
     *
     * @return array{status: string, serialNumber: ?string, issuer: ?string, notBefore: ?CarbonImmutable, notAfter: ?CarbonImmutable, error: ?string}
     */
    public function finalise(string $orderRef): array
    {
        $result = $this->http->post('/orders/' . rawurlencode($orderRef) . '/finalize', [], 'finalize-' . $orderRef);

        return $this->mapOrder($result);
    }

    /**
     * @return array{status: string, serialNumber: ?string, issuer: ?string, notBefore: ?CarbonImmutable, notAfter: ?CarbonImmutable, error: ?string}
     */
    public function getOrder(string $orderRef): array
    {
        return $this->mapOrder($this->http->get('/orders/' . rawurlencode($orderRef)));
    }

    public function revoke(string $orderRef, string $reason): void
    {
        $this->http->post('/orders/' . rawurlencode($orderRef) . '/revoke', ['reason' => $reason]);
    }

    /**
     * @param array<string, mixed> $order
     * @return array{status: string, serialNumber: ?string, issuer: ?string, notBefore: ?CarbonImmutable, notAfter: ?CarbonImmutable, error: ?string}
     */
    private function mapOrder(array $order): array
    {
        $date = static fn (mixed $v) => is_string($v) && $v !== '' ? CarbonImmutable::parse($v) : null;

        return [
            'status' => strtolower((string) ($order['status'] ?? 'pending')),
            'serialNumber' => isset($order['serialNumber']) ? (string) $order['serialNumber'] : null,
            'issuer' => isset($order['issuer']) ? (string) $order['issuer'] : null,
            'notBefore' => $date($order['notBefore'] ?? null),
            'notAfter' => $date($order['notAfter'] ?? null),
            'error' => isset($order['error']) ? (string) $order['error'] : null,
        ];
    }
}
```

## apps/hosted-services/app/Clients/MailPlatformClient.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Clients/MailPlatformClient.php`.

```php
<?php

declare(strict_types=1);

namespace App\Clients;

use App\Models\EmailDomain;
use App\Models\MailAlias;
use App\Models\Mailbox;

/**
 * Hosted email platform provisioning API.
 */
class MailPlatformClient
{
    public function __construct(private readonly ProvisioningHttpClient $http)
    {
    }

    public function createDomain(EmailDomain $domain): string
    {
        $result = $this->http->post('/domains', [
            'accountId' => $domain->account_id,
            'domain' => $domain->domain,
            'plan' => $domain->plan_code,
        ], 'maildomain-' . $domain->id);

        return (string) $result['id'];
    }

    /**
     * @return array{verified: bool, observedMx: list<string>}
     */
    public function verifyMx(string $domainRef): array
    {
        $result = $this->http->get('/domains/' . rawurlencode($domainRef) . '/mx-check');

        return [
            'verified' => (bool) ($result['verified'] ?? false),
            'observedMx' => array_values(array_map('strval', $result['observedMx'] ?? [])),
        ];
    }

    public function setDomainStorage(string $domainRef, int $capacityMb): void
    {
        $this->http->put('/domains/' . rawurlencode($domainRef) . '/storage', ['capacityMb' => $capacityMb]);
    }

    public function createMailbox(Mailbox $mailbox, string $address, string $initialPassword): string
    {
        $result = $this->http->post('/mailboxes', [
            'domainId' => $mailbox->emailDomain->external_ref,
            'address' => $address,
            'displayName' => $mailbox->display_name,
            'quotaMb' => $mailbox->quota_mb,
            'password' => $initialPassword,
            'forcePasswordChange' => true,
        ], 'mailbox-' . $mailbox->id);

        return (string) $result['id'];
    }

    public function updateMailbox(Mailbox $mailbox): void
    {
        $this->http->put('/mailboxes/' . rawurlencode((string) $mailbox->external_ref), [
            'displayName' => $mailbox->display_name,
            'quotaMb' => $mailbox->quota_mb,
            'forwarding' => $mailbox->forwarding_enabled
                ? ['address' => $mailbox->forwarding_address, 'keepCopy' => $mailbox->keep_forwarded_copy]
                : null,
            'suspended' => $mailbox->status->value === 'SUSPENDED',
        ]);
    }

    public function resetPassword(string $mailboxRef, string $temporaryPassword): void
    {
        $this->http->post('/mailboxes/' . rawurlencode($mailboxRef) . '/password', [
            'password' => $temporaryPassword,
            'forcePasswordChange' => true,
        ]);
    }

    public function deleteMailbox(string $mailboxRef): void
    {
        $this->http->delete('/mailboxes/' . rawurlencode($mailboxRef));
    }

    /**
     * Current storage usage for every mailbox on a domain.
     *
     * @return array<string, int> Mailbox platform ref => used MB.
     */
    public function fetchUsage(string $domainRef): array
    {
        $result = $this->http->get('/domains/' . rawurlencode($domainRef) . '/usage');

        $usage = [];
        foreach ($result['mailboxes'] ?? [] as $row) {
            $usage[(string) $row['id']] = (int) ceil(((int) $row['usedBytes']) / 1_048_576);
        }

        return $usage;
    }

    public function upsertAlias(MailAlias $alias, string $address): void
    {
        $this->http->put('/aliases/' . rawurlencode($address), [
            'domainId' => $alias->emailDomain->external_ref,
            'destinations' => $alias->destinations,
        ]);
    }

    public function deleteAlias(string $address): void
    {
        $this->http->delete('/aliases/' . rawurlencode($address));
    }
}
```

## apps/hosted-services/app/Clients/ProvisioningHttpClient.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Clients/ProvisioningHttpClient.php`.

```php
<?php

declare(strict_types=1);

namespace App\Clients;

use App\Exceptions\ProvisioningException;
use App\Http\Middleware\CorrelationId;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Exception\RequestException;
use JsonException;
use Psr\Http\Message\ResponseInterface;
use Psr\Log\LoggerInterface;

/**
 * Shared transport for the internal provisioning platforms.
 *
 * - Sends the API key and propagates X-Correlation-Id.
 * - Retries connection failures and 502/503/504 with linear backoff, but only
 *   for idempotent methods or when the caller supplies an Idempotency-Key.
 * - Translates every failure into ProvisioningException (502 to our caller)
 *   so no Guzzle type leaks above the client layer.
 */
class ProvisioningHttpClient
{
    private const RETRYABLE_STATUS = [502, 503, 504];
    private const IDEMPOTENT_METHODS = ['GET', 'PUT', 'DELETE', 'HEAD'];

    public function __construct(
        private readonly ClientInterface $http,
        private readonly LoggerInterface $logger,
        private readonly string $platform,
        private readonly string $baseUrl,
        private readonly string $apiKey,
        private readonly float $timeoutSeconds = 10.0,
        private readonly int $maxRetries = 2,
        private readonly int $backoffMs = 250,
    ) {
    }

    /**
     * @param array<string, mixed>|null $body
     * @param array<string, scalar>     $query
     * @return array<string, mixed> Decoded JSON body (empty for 204).
     */
    public function request(
        string $method,
        string $path,
        ?array $body = null,
        array $query = [],
        ?string $idempotencyKey = null,
    ): array {
        $method = strtoupper($method);
        $url = rtrim($this->baseUrl, '/') . '/' . ltrim($path, '/');
        $canRetry = in_array($method, self::IDEMPOTENT_METHODS, true) || $idempotencyKey !== null;

        $headers = [
            'Accept' => 'application/json',
            'X-Api-Key' => $this->apiKey,
            CorrelationId::HEADER => CorrelationId::current(),
        ];
        if ($idempotencyKey !== null) {
            $headers['Idempotency-Key'] = $idempotencyKey;
        }

        $options = [
            'headers' => $headers,
            'timeout' => $this->timeoutSeconds,
            'connect_timeout' => min(3.0, $this->timeoutSeconds),
            'http_errors' => false,
        ];
        if ($body !== null) {
            $options['json'] = $body;
        }
        if ($query !== []) {
            $options['query'] = $query;
        }

        $attempt = 0;
        while (true) {
            $attempt++;
            $started = hrtime(true);

            try {
                $response = $this->http->request($method, $url, $options);
            } catch (ConnectException $e) {
                if ($canRetry && $attempt <= $this->maxRetries) {
                    $this->backoff($attempt, $method, $path, 0);
                    continue;
                }
                throw ProvisioningException::fromPlatform($this->platform, "$method $path", 0, 'unreachable', $e);
            } catch (RequestException | GuzzleException $e) {
                throw ProvisioningException::fromPlatform($this->platform, "$method $path", 0, $e->getMessage(), $e);
            }

            $status = $response->getStatusCode();
            $this->logger->info('provisioning.call', [
                'platform' => $this->platform,
                'method' => $method,
                'path' => $path,
                'status' => $status,
                'attempt' => $attempt,
                'durationMs' => round((hrtime(true) - $started) / 1_000_000, 2),
            ]);

            if (in_array($status, self::RETRYABLE_STATUS, true) && $canRetry && $attempt <= $this->maxRetries) {
                $this->backoff($attempt, $method, $path, $status);
                continue;
            }

            return $this->decode($response, $method, $path);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function get(string $path, array $query = []): array
    {
        return $this->request('GET', $path, null, $query);
    }

    /**
     * @return array<string, mixed>
     */
    public function post(string $path, array $body, ?string $idempotencyKey = null): array
    {
        return $this->request('POST', $path, $body, [], $idempotencyKey);
    }

    /**
     * @return array<string, mixed>
     */
    public function put(string $path, array $body): array
    {
        return $this->request('PUT', $path, $body);
    }

    public function delete(string $path): void
    {
        $this->request('DELETE', $path);
    }

    /**
     * @return array<string, mixed>
     */
    private function decode(ResponseInterface $response, string $method, string $path): array
    {
        $status = $response->getStatusCode();
        $raw = (string) $response->getBody();

        if ($status === 204 || $raw === '') {
            if ($status >= 400) {
                throw ProvisioningException::fromPlatform($this->platform, "$method $path", $status, 'empty error response');
            }

            return [];
        }

        try {
            $decoded = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw ProvisioningException::fromPlatform($this->platform, "$method $path", $status, 'invalid JSON', $e);
        }

        if ($status >= 400) {
            $reason = is_array($decoded) ? (string) ($decoded['message'] ?? $decoded['detail'] ?? $decoded['error'] ?? 'error') : 'error';
            throw ProvisioningException::fromPlatform($this->platform, "$method $path", $status, $reason);
        }

        return is_array($decoded) ? $decoded : [];
    }

    private function backoff(int $attempt, string $method, string $path, int $status): void
    {
        $this->logger->warning('provisioning.retry', [
            'platform' => $this->platform,
            'method' => $method,
            'path' => $path,
            'status' => $status,
            'attempt' => $attempt,
        ]);

        usleep($this->backoffMs * $attempt * 1000);
    }
}
```

## apps/hosted-services/app/Clients/VoicePlatformClient.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Clients/VoicePlatformClient.php`.

```php
<?php

declare(strict_types=1);

namespace App\Clients;

use App\Models\CallForwardingRule;
use App\Models\Extension;
use App\Models\HuntGroup;
use App\Models\PortingRequest;

/**
 * Hosted PBX / softswitch provisioning API.
 */
class VoicePlatformClient
{
    public function __construct(private readonly ProvisioningHttpClient $http)
    {
    }

    /**
     * Reserve available DIDs in a rate centre (NPA) for the account.
     *
     * @return list<string> E.164 numbers reserved for 15 minutes.
     */
    public function searchAvailableNumbers(string $accountId, string $npa, int $quantity): array
    {
        $result = $this->http->get('/inventory/numbers', [
            'accountId' => $accountId,
            'npa' => $npa,
            'quantity' => $quantity,
        ]);

        return array_values(array_map('strval', $result['numbers'] ?? []));
    }

    /**
     * @return string Platform reference for the activated number.
     */
    public function activateNumber(string $accountId, string $e164): string
    {
        $result = $this->http->post('/numbers', ['accountId' => $accountId, 'number' => $e164], 'activate-' . $e164);

        return (string) $result['id'];
    }

    public function releaseNumber(string $externalRef): void
    {
        $this->http->delete('/numbers/' . rawurlencode($externalRef));
    }

    public function routeNumber(string $externalRef, ?string $extensionRef): void
    {
        $this->http->put('/numbers/' . rawurlencode($externalRef) . '/routing', ['extensionId' => $extensionRef]);
    }

    public function createExtension(Extension $extension): string
    {
        $result = $this->http->post('/extensions', [
            'accountId' => $extension->account_id,
            'number' => $extension->number,
            'displayName' => $extension->display_name,
            'email' => $extension->email,
        ], 'ext-' . $extension->id);

        return (string) $result['id'];
    }

    public function updateExtension(Extension $extension, ?string $callerIdE164): void
    {
        $this->http->put('/extensions/' . rawurlencode((string) $extension->external_ref), [
            'displayName' => $extension->display_name,
            'email' => $extension->email,
            'doNotDisturb' => $extension->do_not_disturb,
            'callerId' => $callerIdE164,
        ]);
    }

    public function deleteExtension(string $externalRef): void
    {
        $this->http->delete('/extensions/' . rawurlencode($externalRef));
    }

    /**
     * Replace the full forwarding rule set for an extension atomically.
     *
     * @param iterable<CallForwardingRule> $rules
     */
    public function replaceForwardingRules(string $extensionRef, iterable $rules): void
    {
        $payload = [];
        foreach ($rules as $rule) {
            if (!$rule->enabled) {
                continue;
            }
            $payload[] = [
                'condition' => $rule->condition->value,
                'destinationType' => $rule->destination_type,
                'destination' => $rule->destination,
                'ringSeconds' => $rule->ring_seconds,
            ];
        }

        $this->http->put('/extensions/' . rawurlencode($extensionRef) . '/forwarding', ['rules' => $payload]);
    }

    /**
     * @param array<string, mixed> $settings
     */
    public function configureVoicemail(string $extensionRef, array $settings): void
    {
        $this->http->put('/extensions/' . rawurlencode($extensionRef) . '/voicemail', $settings);
    }

    /**
     * @param list<array{extensionRef: string, ringSeconds: int}> $members
     */
    public function upsertHuntGroup(HuntGroup $group, array $members, ?string $pilotNumberRef): void
    {
        $this->http->put('/hunt-groups/' . rawurlencode($group->id), [
            'accountId' => $group->account_id,
            'name' => $group->name,
            'pilotExtension' => $group->pilot_extension,
            'pilotNumberId' => $pilotNumberRef,
            'strategy' => $group->strategy->value,
            'noAnswer' => ['type' => $group->no_answer_type, 'destination' => $group->no_answer_destination],
            'members' => $members,
        ]);
    }

    public function deleteHuntGroup(string $huntGroupId): void
    {
        $this->http->delete('/hunt-groups/' . rawurlencode($huntGroupId));
    }

    /**
     * Submit a port-in order to the number portability gateway.
     *
     * @return string Gateway reference (PON).
     */
    public function submitPortOrder(PortingRequest $request): string
    {
        $result = $this->http->post('/porting/orders', [
            'accountId' => $request->account_id,
            'numbers' => $request->numbers,
            'losingCarrier' => $request->losing_carrier,
            'carrierAccountNumber' => $request->carrier_account_number,
            'carrierPin' => $request->carrier_pin,
            'billingTelephoneNumber' => $request->billing_telephone_number,
            'authorizedName' => $request->authorised_name,
            'serviceAddress' => $request->service_address,
            'requestedPortDate' => $request->requested_port_date->toDateString(),
            'loaDocumentRef' => $request->loa_document_ref,
        ], 'port-' . $request->id . '-' . $request->resubmission_count);

        return (string) $result['orderReference'];
    }

    public function cancelPortOrder(string $carrierReference): void
    {
        $this->http->delete('/porting/orders/' . rawurlencode($carrierReference));
    }
}
```

## apps/hosted-services/app/Clients/WebHostingClient.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Clients/WebHostingClient.php`.

```php
<?php

declare(strict_types=1);

namespace App\Clients;

use App\Models\HostedDomain;

/**
 * Web hosting and authoritative DNS platform API.
 */
class WebHostingClient
{
    public function __construct(private readonly ProvisioningHttpClient $http)
    {
    }

    public function createSite(HostedDomain $domain): string
    {
        $result = $this->http->post('/sites', [
            'accountId' => $domain->account_id,
            'domain' => $domain->name,
            'plan' => $domain->hosting_plan,
        ], 'site-' . $domain->id);

        return (string) $result['id'];
    }

    public function deleteSite(string $siteRef): void
    {
        $this->http->delete('/sites/' . rawurlencode($siteRef));
    }

    /**
     * Nameservers customers must configure at their registrar.
     *
     * @return list<string>
     */
    public function nameservers(): array
    {
        $result = $this->http->get('/dns/nameservers');

        return array_values(array_map('strval', $result['nameservers'] ?? []));
    }

    /**
     * Does the public DNS delegation already point at Uniti?
     */
    public function checkDelegation(string $zone): bool
    {
        $result = $this->http->get('/dns/delegation', ['zone' => $zone]);

        return (bool) ($result['delegated'] ?? false);
    }

    /**
     * Push the complete zone. The platform swaps it atomically and returns
     * once all anycast nodes have acknowledged the new serial.
     */
    public function publishZone(string $zone, int $serial, string $zoneFile): void
    {
        $this->http->put('/dns/zones/' . rawurlencode($zone), [
            'serial' => $serial,
            'format' => 'rfc1035',
            'zone' => $zoneFile,
        ]);
    }

    public function deleteZone(string $zone): void
    {
        $this->http->delete('/dns/zones/' . rawurlencode($zone));
    }

    /**
     * Install an issued certificate on the site's TLS terminators.
     */
    public function installCertificate(string $siteRef, string $certificateOrderRef): void
    {
        $this->http->put('/sites/' . rawurlencode($siteRef) . '/certificate', [
            'certificateOrderRef' => $certificateOrderRef,
        ]);
    }
}
```

## apps/hosted-services/app/Enums/CertificateStatus.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Enums/CertificateStatus.php`.

```php
<?php

declare(strict_types=1);

namespace App\Enums;

enum CertificateStatus: string
{
    case PendingValidation = 'PENDING_VALIDATION';
    case Issued = 'ISSUED';
    case Expired = 'EXPIRED';
    case Revoked = 'REVOKED';
    case Failed = 'FAILED';

    public function isActive(): bool
    {
        return $this === self::Issued;
    }
}
```

## apps/hosted-services/app/Enums/DnsRecordType.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Enums/DnsRecordType.php`.

```php
<?php

declare(strict_types=1);

namespace App\Enums;

enum DnsRecordType: string
{
    case A = 'A';
    case AAAA = 'AAAA';
    case CNAME = 'CNAME';
    case MX = 'MX';
    case TXT = 'TXT';
    case SRV = 'SRV';
    case CAA = 'CAA';
    case NS = 'NS';

    /**
     * Record types that require a numeric priority field.
     */
    public function requiresPriority(): bool
    {
        return $this === self::MX || $this === self::SRV;
    }

    /**
     * Record types whose value is a hostname that must not be an IP literal.
     */
    public function targetsHostname(): bool
    {
        return match ($this) {
            self::CNAME, self::MX, self::NS, self::SRV => true,
            default => false,
        };
    }

    /**
     * Record types customers may manage. Apex NS/SOA are platform-owned.
     */
    public function isCustomerManaged(): bool
    {
        return $this !== self::NS;
    }
}
```

## apps/hosted-services/app/Enums/ForwardingCondition.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Enums/ForwardingCondition.php`.

```php
<?php

declare(strict_types=1);

namespace App\Enums;

enum ForwardingCondition: string
{
    case Always = 'ALWAYS';
    case Busy = 'BUSY';
    case NoAnswer = 'NO_ANSWER';
    case Unreachable = 'UNREACHABLE';

    /**
     * Evaluation order used by the switch: unconditional forwarding wins,
     * then device state, then timeout.
     */
    public function precedence(): int
    {
        return match ($this) {
            self::Always => 0,
            self::Unreachable => 1,
            self::Busy => 2,
            self::NoAnswer => 3,
        };
    }
}
```

## apps/hosted-services/app/Enums/HuntGroupStrategy.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Enums/HuntGroupStrategy.php`.

```php
<?php

declare(strict_types=1);

namespace App\Enums;

enum HuntGroupStrategy: string
{
    /** Ring every member at once; first to answer takes the call. */
    case Simultaneous = 'SIMULTANEOUS';
    /** Ring members in configured order, each for its ring timeout. */
    case Sequential = 'SEQUENTIAL';
    /** Start with the member after the one who answered last. */
    case RoundRobin = 'ROUND_ROBIN';
    /** Ring the member who has been idle the longest. */
    case LongestIdle = 'LONGEST_IDLE';

    /**
     * Whether member order is meaningful for this strategy.
     */
    public function isOrdered(): bool
    {
        return $this === self::Sequential || $this === self::RoundRobin;
    }
}
```

## apps/hosted-services/app/Enums/PortingStatus.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Enums/PortingStatus.php`.

```php
<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Lifecycle of a number port-in request.
 *
 *   DRAFT -> SUBMITTED -> PENDING_FOC -> FOC_RECEIVED -> COMPLETED
 *                \             \              \
 *                 -> REJECTED   -> REJECTED    -> FAILED
 *   REJECTED -> DRAFT (customer corrects and resubmits)
 *   Any non-terminal state -> CANCELLED (subject to FOC cut-off)
 *
 * FOC = Firm Order Commitment: the date/time the losing carrier commits to
 * release the numbers.
 */
enum PortingStatus: string
{
    case Draft = 'DRAFT';
    case Submitted = 'SUBMITTED';
    case PendingFoc = 'PENDING_FOC';
    case FocReceived = 'FOC_RECEIVED';
    case Completed = 'COMPLETED';
    case Rejected = 'REJECTED';
    case Cancelled = 'CANCELLED';
    case Failed = 'FAILED';

    public function isTerminal(): bool
    {
        return match ($this) {
            self::Completed, self::Cancelled, self::Failed => true,
            default => false,
        };
    }

    /**
     * Whether the customer may still edit numbers, LOA and billing details.
     */
    public function isEditable(): bool
    {
        return $this === self::Draft;
    }
}
```

## apps/hosted-services/app/Enums/ProvisioningStatus.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Enums/ProvisioningStatus.php`.

```php
<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Provisioning state of any hosted resource mirrored from a downstream
 * platform (number, extension, mailbox, domain).
 */
enum ProvisioningStatus: string
{
    case Pending = 'PENDING';
    case Active = 'ACTIVE';
    case Suspended = 'SUSPENDED';
    case Failed = 'FAILED';
    case Deprovisioned = 'DEPROVISIONED';
}
```

## apps/hosted-services/app/Enums/Role.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Enums/Role.php`.

```php
<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Platform roles as defined in the monorepo conventions. Only the subset
 * listed in config('auth_jwt.allowed_roles') may call this API.
 */
enum Role: string
{
    case Consumer = 'CONSUMER';
    case BusinessAdmin = 'BUSINESS_ADMIN';
    case BusinessUser = 'BUSINESS_USER';
    case PartnerAdmin = 'PARTNER_ADMIN';
    case PartnerAgent = 'PARTNER_AGENT';
    case WholesaleBuyer = 'WHOLESALE_BUYER';
    case SupportAgent = 'SUPPORT_AGENT';

    /**
     * Whether the role may change configuration (as opposed to read-only use).
     */
    public function canManage(): bool
    {
        return match ($this) {
            self::BusinessAdmin, self::PartnerAdmin, self::SupportAgent => true,
            default => false,
        };
    }

    /**
     * Whether the role acts on behalf of accounts it does not own.
     */
    public function isDelegated(): bool
    {
        return match ($this) {
            self::PartnerAdmin, self::PartnerAgent => true,
            default => false,
        };
    }
}
```

## apps/hosted-services/app/Exceptions/AccessDeniedException.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Exceptions/AccessDeniedException.php`.

```php
<?php

declare(strict_types=1);

namespace App\Exceptions;

final class AccessDeniedException extends ApiException
{
    public function status(): int
    {
        return 403;
    }

    public function problemType(): string
    {
        return 'forbidden';
    }

    public function title(): string
    {
        return 'Access denied';
    }
}
```

## apps/hosted-services/app/Exceptions/ApiException.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Exceptions/ApiException.php`.

```php
<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;
use Throwable;

/**
 * Base class for every exception that maps cleanly onto an RFC 7807
 * problem document. Subclasses fix the HTTP status and problem type;
 * callers supply the human-readable detail and optional extension members.
 */
abstract class ApiException extends RuntimeException
{
    /** @var array<string, mixed> */
    private array $extensions;

    /**
     * @param array<string, mixed> $extensions Extra problem members (e.g. "errors", "currentStatus").
     */
    public function __construct(string $detail, array $extensions = [], ?Throwable $previous = null)
    {
        parent::__construct($detail, 0, $previous);
        $this->extensions = $extensions;
    }

    abstract public function status(): int;

    /**
     * Short, stable slug appended to the problem type base URI.
     */
    abstract public function problemType(): string;

    abstract public function title(): string;

    public function detail(): string
    {
        return $this->getMessage();
    }

    /**
     * @return array<string, mixed>
     */
    public function extensions(): array
    {
        return $this->extensions;
    }
}
```

## apps/hosted-services/app/Exceptions/AuthenticationFailedException.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Exceptions/AuthenticationFailedException.php`.

```php
<?php

declare(strict_types=1);

namespace App\Exceptions;

final class AuthenticationFailedException extends ApiException
{
    public function status(): int
    {
        return 401;
    }

    public function problemType(): string
    {
        return 'unauthenticated';
    }

    public function title(): string
    {
        return 'Authentication required';
    }
}
```

## apps/hosted-services/app/Exceptions/BusinessRuleException.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Exceptions/BusinessRuleException.php`.

```php
<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * Input passed syntactic validation but violates a business rule
 * (quota exceeded, CNAME conflict, reserved extension...). The stable
 * "rule" code lets the portals show a localised message.
 */
final class BusinessRuleException extends ApiException
{
    /**
     * @param array<string, mixed> $extensions
     */
    public function __construct(string $detail, private readonly string $rule, array $extensions = [])
    {
        parent::__construct($detail, ['rule' => $rule] + $extensions);
    }

    public function rule(): string
    {
        return $this->rule;
    }

    public function status(): int
    {
        return 422;
    }

    public function problemType(): string
    {
        return 'business-rule-violation';
    }

    public function title(): string
    {
        return 'Business rule violation';
    }
}
```

## apps/hosted-services/app/Exceptions/ConflictException.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Exceptions/ConflictException.php`.

```php
<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * The resource already exists or is held by another entity.
 */
final class ConflictException extends ApiException
{
    public function status(): int
    {
        return 409;
    }

    public function problemType(): string
    {
        return 'conflict';
    }

    public function title(): string
    {
        return 'Conflict';
    }
}
```

## apps/hosted-services/app/Exceptions/InvalidStateTransitionException.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Exceptions/InvalidStateTransitionException.php`.

```php
<?php

declare(strict_types=1);

namespace App\Exceptions;

final class InvalidStateTransitionException extends ApiException
{
    public static function between(string $entity, string $from, string $to): self
    {
        return new self(
            sprintf('%s cannot move from %s to %s.', $entity, $from, $to),
            ['currentStatus' => $from, 'requestedStatus' => $to],
        );
    }

    public function status(): int
    {
        return 409;
    }

    public function problemType(): string
    {
        return 'invalid-state-transition';
    }

    public function title(): string
    {
        return 'Invalid state transition';
    }
}
```

## apps/hosted-services/app/Exceptions/ProblemRenderer.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Exceptions/ProblemRenderer.php`.

```php
<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Http\Middleware\CorrelationId;
use App\Support\FieldCase;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * Converts any throwable into an RFC 7807 application/problem+json response.
 *
 * Known ApiException subclasses carry their own status/type/title; framework
 * exceptions are mapped explicitly; anything else becomes an opaque 500 so
 * internals never leak to the portals.
 */
final class ProblemRenderer
{
    public const CONTENT_TYPE = 'application/problem+json';

    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly string $typeBaseUri = 'https://errors.uniti.example/hosted-services/',
        private readonly bool $debug = false,
    ) {
    }

    public function render(Throwable $e, Request $request): JsonResponse
    {
        $problem = $this->toProblem($e);
        $problem['instance'] = $request->getPathInfo();

        $correlationId = $request->attributes->get(CorrelationId::ATTRIBUTE);
        if (is_string($correlationId)) {
            $problem['correlationId'] = $correlationId;
        }

        $this->log($e, $problem);

        $response = new JsonResponse($problem, $problem['status'], [
            'Content-Type' => self::CONTENT_TYPE,
        ]);

        if ($e instanceof HttpExceptionInterface) {
            foreach ($e->getHeaders() as $name => $value) {
                $response->headers->set($name, $value);
            }
        }

        return $response;
    }

    /**
     * @return array<string, mixed>
     */
    public function toProblem(Throwable $e): array
    {
        if ($e instanceof ApiException) {
            $extensions = $e->extensions();
            if (isset($extensions['errors']) && is_array($extensions['errors'])) {
                $extensions['errors'] = FieldCase::camelErrors($extensions['errors']);
            }

            return [
                'type' => $this->typeBaseUri . $e->problemType(),
                'title' => $e->title(),
                'status' => $e->status(),
                'detail' => $e->detail(),
            ] + $extensions;
        }

        if ($e instanceof ValidationException) {
            return [
                'type' => $this->typeBaseUri . 'validation-error',
                'title' => 'Invalid request',
                'status' => 400,
                'detail' => 'One or more fields are invalid.',
                'errors' => FieldCase::camelErrors($e->errors()),
            ];
        }

        if ($e instanceof ModelNotFoundException) {
            $model = class_basename($e->getModel());

            return [
                'type' => $this->typeBaseUri . 'not-found',
                'title' => 'Resource not found',
                'status' => 404,
                'detail' => sprintf('%s was not found.', $model),
            ];
        }

        if ($e instanceof AuthorizationException) {
            return [
                'type' => $this->typeBaseUri . 'forbidden',
                'title' => 'Access denied',
                'status' => 403,
                'detail' => 'You are not permitted to perform this action.',
            ];
        }

        if ($e instanceof HttpExceptionInterface) {
            $status = $e->getStatusCode();

            return [
                'type' => 'about:blank',
                'title' => JsonResponse::$statusTexts[$status] ?? 'Error',
                'status' => $status,
                'detail' => $e->getMessage() !== '' ? $e->getMessage() : (JsonResponse::$statusTexts[$status] ?? 'Error'),
            ];
        }

        $problem = [
            'type' => $this->typeBaseUri . 'internal-error',
            'title' => 'Internal server error',
            'status' => 500,
            'detail' => 'An unexpected error occurred. Quote the correlation id when contacting support.',
        ];

        if ($this->debug) {
            $problem['exception'] = $e::class;
            $problem['debugMessage'] = $e->getMessage();
        }

        return $problem;
    }

    /**
     * @param array<string, mixed> $problem
     */
    private function log(Throwable $e, array $problem): void
    {
        $context = [
            'problemType' => $problem['type'],
            'status' => $problem['status'],
            'correlationId' => $problem['correlationId'] ?? null,
            'exception' => $e::class,
        ];

        if ($problem['status'] >= 500) {
            $this->logger->error($e->getMessage(), $context + ['trace' => $e->getTraceAsString()]);
            return;
        }

        $this->logger->info('Request rejected: ' . $problem['detail'], $context);
    }
}
```

## apps/hosted-services/app/Exceptions/ProvisioningException.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Exceptions/ProvisioningException.php`.

```php
<?php

declare(strict_types=1);

namespace App\Exceptions;

use Throwable;

/**
 * A downstream provisioning platform failed or was unreachable.
 */
final class ProvisioningException extends ApiException
{
    public static function fromPlatform(
        string $platform,
        string $operation,
        int $upstreamStatus,
        string $reason,
        ?Throwable $previous = null,
    ): self {
        return new self(
            sprintf('The %s platform could not complete "%s".', $platform, $operation),
            ['platform' => $platform, 'operation' => $operation, 'upstreamStatus' => $upstreamStatus, 'reason' => $reason],
            $previous,
        );
    }

    public function status(): int
    {
        return 502;
    }

    public function problemType(): string
    {
        return 'provisioning-failed';
    }

    public function title(): string
    {
        return 'Provisioning platform error';
    }
}
```

## apps/hosted-services/app/Exceptions/ResourceNotFoundException.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Exceptions/ResourceNotFoundException.php`.

```php
<?php

declare(strict_types=1);

namespace App\Exceptions;

final class ResourceNotFoundException extends ApiException
{
    public static function of(string $resource, string|int $id): self
    {
        return new self(sprintf('%s "%s" was not found.', $resource, $id), ['resource' => $resource]);
    }

    public function status(): int
    {
        return 404;
    }

    public function problemType(): string
    {
        return 'not-found';
    }

    public function title(): string
    {
        return 'Resource not found';
    }
}
```

## apps/hosted-services/app/Exceptions/ValidationFailedException.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Exceptions/ValidationFailedException.php`.

```php
<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * Field-level validation failure raised from service code (FormRequests use
 * the framework ValidationException, which the renderer maps to the same
 * shape). The "errors" extension maps field name to a list of messages.
 */
final class ValidationFailedException extends ApiException
{
    /**
     * @param array<string, list<string>> $errors
     */
    public static function withErrors(array $errors): self
    {
        return new self('One or more fields are invalid.', ['errors' => $errors]);
    }

    public static function forField(string $field, string $message): self
    {
        return self::withErrors([$field => [$message]]);
    }

    public function status(): int
    {
        return 400;
    }

    public function problemType(): string
    {
        return 'validation-error';
    }

    public function title(): string
    {
        return 'Invalid request';
    }
}
```

## apps/hosted-services/app/Http/Controllers/Controller.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Controller.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Exceptions\ValidationFailedException;
use App\Http\Middleware\AuthenticateJwt;
use App\Support\Principal;
use BackedEnum;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Thin HTTP adapters: controllers translate requests into service calls
 * and service results into resources. They hold no business rules.
 * Account scoping and role checks have already run as route middleware.
 */
abstract class Controller
{
    protected function principal(Request $request): Principal
    {
        return AuthenticateJwt::principal($request);
    }

    /**
     * @param array<mixed> $body
     */
    protected function ok(array $body): JsonResponse
    {
        return new JsonResponse($body, 200);
    }

    /**
     * @param array<mixed> $body
     */
    protected function created(array $body, string $location): JsonResponse
    {
        return new JsonResponse($body, 201, ['Location' => $location]);
    }

    /**
     * Provisioning continues asynchronously (certificate validation, port
     * submission); the client polls the resource at $location.
     *
     * @param array<mixed> $body
     */
    protected function accepted(array $body, string $location): JsonResponse
    {
        return new JsonResponse($body, 202, ['Location' => $location]);
    }

    protected function noContent(): Response
    {
        return new Response('', 204);
    }

    /**
     * Optional enum-valued query filter (?status=ACTIVE). Unknown values are
     * a client error rather than an empty result.
     *
     * @template T of BackedEnum
     * @param class-string<T> $enum
     * @return T|null
     */
    protected function enumQuery(Request $request, string $name, string $enum): ?BackedEnum
    {
        $raw = $request->query($name);
        if ($raw === null || $raw === '') {
            return null;
        }

        $value = is_string($raw) ? $enum::tryFrom(strtoupper($raw)) : null;
        if ($value === null) {
            $allowed = implode(', ', array_map(static fn (BackedEnum $c) => (string) $c->value, $enum::cases()));
            throw ValidationFailedException::forField($name, sprintf('Must be one of: %s.', $allowed));
        }

        return $value;
    }

    protected function boolQuery(Request $request, string $name): ?bool
    {
        $raw = $request->query($name);
        if ($raw === null || $raw === '') {
            return null;
        }

        $value = filter_var($raw, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
        if ($value === null) {
            throw ValidationFailedException::forField($name, 'Must be true or false.');
        }

        return $value;
    }

    protected function stringQuery(Request $request, string $name, int $maxLength = 64): ?string
    {
        $raw = $request->query($name);
        if ($raw === null || $raw === '') {
            return null;
        }
        if (!is_string($raw) || mb_strlen($raw) > $maxLength) {
            throw ValidationFailedException::forField($name, sprintf('Must be a string of at most %d characters.', $maxLength));
        }

        return trim($raw);
    }
}
```

## apps/hosted-services/app/Http/Controllers/HealthController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/HealthController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Unauthenticated liveness/readiness probe used by the container
 * HEALTHCHECK and the load balancer. Downstream provisioning platforms are
 * deliberately not probed: their outages degrade features, not the API.
 */
final class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $checks = ['database' => $this->database()];
        $healthy = !in_array(false, $checks, true);

        return new JsonResponse([
            'status' => $healthy ? 'UP' : 'DOWN',
            'checks' => array_map(static fn (bool $ok) => $ok ? 'UP' : 'DOWN', $checks),
            'time' => gmdate('Y-m-d\TH:i:s\Z'),
        ], $healthy ? 200 : 503, ['Cache-Control' => 'no-store']);
    }

    private function database(): bool
    {
        try {
            DB::select('select 1');

            return true;
        } catch (Throwable $e) {
            Log::error('health.database_unreachable', ['exception' => $e::class]);

            return false;
        }
    }
}
```

## apps/hosted-services/app/Http/Controllers/Hosting/CertificateController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Hosting/CertificateController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Hosting;

use App\Http\Controllers\Controller;
use App\Http\Requests\Hosting\CertificateChangeRequest;
use App\Http\Requests\Hosting\CertificateRequest;
use App\Http\Resources\SslCertificateResource;
use App\Services\Hosting\SslCertificateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class CertificateController extends Controller
{
    public function __construct(private readonly SslCertificateService $certificates)
    {
    }

    public function index(Request $request, string $accountId, string $domainId): JsonResponse
    {
        $items = SslCertificateResource::list($this->certificates->list($accountId, $domainId), $request);

        return $this->ok(['items' => $items, 'page' => 1, 'pageSize' => count($items), 'total' => count($items)]);
    }

    /**
     * Issuance is asynchronous (DNS-01 validation), hence 202 Accepted.
     */
    public function store(CertificateRequest $request, string $accountId, string $domainId): JsonResponse
    {
        $certificate = $this->certificates->request(
            $accountId,
            $domainId,
            (string) $request->validated()['common_name'],
            $request->subjectAltNames(),
            $request->autoRenew(),
            $this->principal($request),
        );

        return $this->accepted(
            (new SslCertificateResource($certificate))->resolve($request),
            sprintf('/api/v1/accounts/%s/domains/%s/certificates/%s', $accountId, $domainId, $certificate->id),
        );
    }

    public function update(CertificateChangeRequest $request, string $accountId, string $domainId, string $certificateId): JsonResponse
    {
        $certificate = $this->certificates->setAutoRenew($accountId, $domainId, $certificateId, $request->autoRenew());

        return $this->ok((new SslCertificateResource($certificate))->resolve($request));
    }

    public function revoke(CertificateChangeRequest $request, string $accountId, string $domainId, string $certificateId): JsonResponse
    {
        $certificate = $this->certificates->revoke(
            $accountId,
            $domainId,
            $certificateId,
            $request->rfc5280Reason(),
            $this->principal($request),
        );

        return $this->ok((new SslCertificateResource($certificate))->resolve($request));
    }
}
```

## apps/hosted-services/app/Http/Controllers/Hosting/DnsRecordController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Hosting/DnsRecordController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Hosting;

use App\Enums\DnsRecordType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hosting\DnsRecordRequest;
use App\Http\Resources\DnsRecordResource;
use App\Services\Dns\DnsZoneService;
use App\Services\Hosting\DomainService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class DnsRecordController extends Controller
{
    public function __construct(
        private readonly DnsZoneService $zones,
        private readonly DomainService $domains,
    ) {
    }

    public function index(Request $request, string $accountId, string $domainId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);
        $type = $this->enumQuery($request, 'type', DnsRecordType::class);

        return $this->ok(DnsRecordResource::page($this->zones->list($accountId, $domainId, $page, $pageSize, $type), $request));
    }

    public function store(DnsRecordRequest $request, string $accountId, string $domainId): JsonResponse
    {
        $record = $this->zones->create($accountId, $domainId, $request->validated(), $this->principal($request));

        return $this->created(
            (new DnsRecordResource($record))->resolve($request),
            sprintf('/api/v1/accounts/%s/domains/%s/dns-records/%s', $accountId, $domainId, $record->id),
        );
    }

    public function update(DnsRecordRequest $request, string $accountId, string $domainId, string $recordId): JsonResponse
    {
        $record = $this->zones->update($accountId, $domainId, $recordId, $request->payload());

        return $this->ok((new DnsRecordResource($record))->resolve($request));
    }

    public function destroy(string $accountId, string $domainId, string $recordId): Response
    {
        $this->zones->delete($accountId, $domainId, $recordId);

        return $this->noContent();
    }

    /**
     * Download the zone in RFC 1035 master-file format.
     */
    public function export(string $accountId, string $domainId): Response
    {
        $domain = $this->domains->get($accountId, $domainId);

        return new Response($this->zones->export($accountId, $domainId), 200, [
            'Content-Type' => 'text/dns; charset=utf-8',
            'Content-Disposition' => sprintf('attachment; filename="%s.zone"', $domain->name),
        ]);
    }
}
```

## apps/hosted-services/app/Http/Controllers/Hosting/HostedDomainController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Hosting/HostedDomainController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Hosting;

use App\Http\Controllers\Controller;
use App\Http\Requests\Hosting\HostedDomainRequest;
use App\Http\Resources\HostedDomainResource;
use App\Services\Hosting\DomainService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class HostedDomainController extends Controller
{
    public function __construct(private readonly DomainService $domains)
    {
    }

    public function index(Request $request, string $accountId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);

        return $this->ok(HostedDomainResource::page($this->domains->list($accountId, $page, $pageSize), $request));
    }

    public function show(Request $request, string $accountId, string $domainId): JsonResponse
    {
        return $this->ok((new HostedDomainResource($this->domains->get($accountId, $domainId)))->resolve($request));
    }

    /**
     * The response carries the nameservers the customer must set at their
     * registrar; the domain stays PENDING until delegation is confirmed.
     */
    public function store(HostedDomainRequest $request, string $accountId): JsonResponse
    {
        $data = $request->validated();
        $result = $this->domains->add($accountId, (string) $data['name'], (string) $data['hosting_plan'], $this->principal($request));
        $domain = $result['domain'];

        return $this->created(
            (new HostedDomainResource($domain))->resolve($request) + ['requiredNameservers' => $result['nameservers']],
            sprintf('/api/v1/accounts/%s/domains/%s', $accountId, $domain->id),
        );
    }

    public function checkDelegation(Request $request, string $accountId, string $domainId): JsonResponse
    {
        return $this->ok((new HostedDomainResource($this->domains->checkDelegation($accountId, $domainId)))->resolve($request));
    }

    public function destroy(Request $request, string $accountId, string $domainId): Response
    {
        $this->domains->remove($accountId, $domainId, $this->principal($request));

        return $this->noContent();
    }
}
```

## apps/hosted-services/app/Http/Controllers/Mail/EmailDomainController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Mail/EmailDomainController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mail;

use App\Http\Controllers\Controller;
use App\Http\Requests\Mail\AddonBlocksRequest;
use App\Http\Requests\Mail\EmailDomainRequest;
use App\Http\Resources\EmailDomainResource;
use App\Models\EmailDomain;
use App\Services\Mail\EmailDomainService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class EmailDomainController extends Controller
{
    public function __construct(private readonly EmailDomainService $domains)
    {
    }

    /**
     * An account holds a handful of email domains, so the list is returned
     * whole (still in the standard envelope) with each domain's quota.
     */
    public function index(Request $request, string $accountId): JsonResponse
    {
        $items = array_map(
            static fn (array $row) => (new EmailDomainResource($row['domain'], $row['quota']))->resolve($request),
            $this->domains->listWithQuota($accountId),
        );

        return $this->ok(['items' => $items, 'page' => 1, 'pageSize' => count($items), 'total' => count($items)]);
    }

    public function show(Request $request, string $accountId, string $domainId): JsonResponse
    {
        return $this->ok($this->present($this->domains->get($accountId, $domainId), $request));
    }

    public function store(EmailDomainRequest $request, string $accountId): JsonResponse
    {
        $data = $request->validated();
        $domain = $this->domains->register($accountId, (string) $data['domain'], (string) $data['plan_code'], $this->principal($request));

        return $this->created(
            $this->present($domain, $request),
            sprintf('/api/v1/accounts/%s/email-domains/%s', $accountId, $domain->id),
        );
    }

    public function verifyMx(Request $request, string $accountId, string $domainId): JsonResponse
    {
        $result = $this->domains->verifyMx($accountId, $domainId);

        return $this->ok($this->present($result['domain'], $request) + ['observedMx' => $result['observedMx']]);
    }

    public function setStorage(AddonBlocksRequest $request, string $accountId, string $domainId): JsonResponse
    {
        $domain = $this->domains->setAddonBlocks($accountId, $domainId, $request->blocks(), $this->principal($request));

        return $this->ok($this->present($domain, $request));
    }

    /**
     * @return array<string, mixed>
     */
    private function present(EmailDomain $domain, Request $request): array
    {
        return (new EmailDomainResource($domain, $this->domains->quotaFor($domain)))->resolve($request);
    }
}
```

## apps/hosted-services/app/Http/Controllers/Mail/MailAliasController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Mail/MailAliasController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mail;

use App\Http\Controllers\Controller;
use App\Http\Requests\Mail\MailAliasRequest;
use App\Http\Resources\MailAliasResource;
use App\Services\Mail\MailAliasService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class MailAliasController extends Controller
{
    public function __construct(private readonly MailAliasService $aliases)
    {
    }

    public function index(Request $request, string $accountId, string $domainId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);

        return $this->ok(MailAliasResource::page($this->aliases->list($accountId, $domainId, $page, $pageSize), $request));
    }

    public function store(MailAliasRequest $request, string $accountId, string $domainId): JsonResponse
    {
        $alias = $this->aliases->create($accountId, $domainId, $request->validated());

        return $this->created(
            (new MailAliasResource($alias))->resolve($request),
            sprintf('/api/v1/accounts/%s/email-domains/%s/aliases/%s', $accountId, $domainId, $alias->id),
        );
    }

    public function update(MailAliasRequest $request, string $accountId, string $domainId, string $aliasId): JsonResponse
    {
        $alias = $this->aliases->update($accountId, $domainId, $aliasId, $request->payload());

        return $this->ok((new MailAliasResource($alias))->resolve($request));
    }

    public function destroy(string $accountId, string $domainId, string $aliasId): Response
    {
        $this->aliases->delete($accountId, $domainId, $aliasId);

        return $this->noContent();
    }
}
```

## apps/hosted-services/app/Http/Controllers/Mail/MailboxController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Mail/MailboxController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mail;

use App\Http\Controllers\Controller;
use App\Http\Requests\Mail\MailboxRequest;
use App\Http\Resources\MailboxResource;
use App\Services\Mail\MailboxService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Temporary passwords are shown exactly once, in the create and
 * reset-password responses, which are marked non-cacheable.
 */
final class MailboxController extends Controller
{
    public function __construct(private readonly MailboxService $mailboxes)
    {
    }

    public function index(Request $request, string $accountId, string $domainId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);
        $result = $this->mailboxes->list($accountId, $domainId, $page, $pageSize, $this->stringQuery($request, 'q'));

        return $this->ok(MailboxResource::page($result, $request));
    }

    public function show(Request $request, string $accountId, string $mailboxId): JsonResponse
    {
        return $this->ok((new MailboxResource($this->mailboxes->get($accountId, $mailboxId)))->resolve($request));
    }

    public function store(MailboxRequest $request, string $accountId, string $domainId): JsonResponse
    {
        $result = $this->mailboxes->create($accountId, $domainId, $request->validated(), $this->principal($request));
        $mailbox = $result['mailbox'];

        $response = $this->created(
            (new MailboxResource($mailbox))->resolve($request) + ['temporaryPassword' => $result['temporaryPassword']],
            sprintf('/api/v1/accounts/%s/mailboxes/%s', $accountId, $mailbox->id),
        );

        return $this->withoutCaching($response);
    }

    public function update(MailboxRequest $request, string $accountId, string $mailboxId): JsonResponse
    {
        $mailbox = $this->mailboxes->update($accountId, $mailboxId, $request->payload());

        return $this->ok((new MailboxResource($mailbox))->resolve($request));
    }

    public function resetPassword(Request $request, string $accountId, string $mailboxId): JsonResponse
    {
        $password = $this->mailboxes->resetPassword($accountId, $mailboxId, $this->principal($request));

        return $this->withoutCaching($this->ok(['temporaryPassword' => $password]));
    }

    public function destroy(Request $request, string $accountId, string $mailboxId): Response
    {
        $this->mailboxes->delete($accountId, $mailboxId, $this->principal($request));

        return $this->noContent();
    }

    private function withoutCaching(JsonResponse $response): JsonResponse
    {
        $response->headers->set('Cache-Control', 'no-store');
        $response->headers->set('Pragma', 'no-cache');

        return $response;
    }
}
```
