# Hosted Services (hosted voice, email, web hosting): apps/hosted-services/app/Services (part 4 of 6)

- **Application:** Hosted Services (hosted voice, email, web hosting)
- **Tech stack:** PHP 8 (Laravel-style)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 13

## Files

- `apps/hosted-services/app/Services/Dns/DnsRecordValidator.php` (329 lines)
- `apps/hosted-services/app/Services/Dns/DnsZoneService.php` (199 lines)
- `apps/hosted-services/app/Services/Dns/ZoneSerializer.php` (104 lines)
- `apps/hosted-services/app/Services/Hosting/DomainService.php` (118 lines)
- `apps/hosted-services/app/Services/Hosting/SslCertificateService.php` (295 lines)
- `apps/hosted-services/app/Services/Mail/EmailDomainService.php` (128 lines)
- `apps/hosted-services/app/Services/Mail/LocalPartPolicy.php` (52 lines)
- `apps/hosted-services/app/Services/Mail/MailAliasService.php` (148 lines)
- `apps/hosted-services/app/Services/Mail/MailboxService.php` (222 lines)
- `apps/hosted-services/app/Services/Mail/PasswordGenerator.php` (51 lines)
- `apps/hosted-services/app/Services/Mail/QuotaCalculator.php` (214 lines)
- `apps/hosted-services/app/Services/Mail/QuotaSummary.php` (67 lines)
- `apps/hosted-services/app/Services/Porting/PortingContext.php` (28 lines)

## apps/hosted-services/app/Services/Dns/DnsRecordValidator.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Dns/DnsRecordValidator.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Dns;

use App\Enums\DnsRecordType;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ValidationFailedException;
use App\Support\Hostname;

/**
 * Validates and normalises customer DNS records against RFC syntax rules
 * and zone-level consistency rules before they reach the authoritative
 * DNS platform.
 *
 * Syntax problems raise ValidationFailedException (400, field errors).
 * Zone conflicts (CNAME coexistence, duplicate SPF, record limit) raise
 * BusinessRuleException (422) with a stable rule code.
 */
final class DnsRecordValidator
{
    public const TXT_MAX_TOTAL_LENGTH = 4000;
    private const CAA_TAGS = ['issue', 'issuewild', 'iodef'];

    public function __construct(
        private readonly int $ttlMin = 60,
        private readonly int $ttlMax = 86400,
        private readonly int $maxRecordsPerZone = 500,
    ) {
    }

    /**
     * @param list<DnsRecordData> $existing Records already in the zone.
     * @param string|null         $ignoreId Record being updated, excluded from conflict checks.
     */
    public function validate(DnsRecordData $record, string $zone, array $existing, ?string $ignoreId = null): DnsRecordData
    {
        $zone = Hostname::normalise($zone);
        $errors = [];

        $name = Hostname::qualify($record->name, $zone);
        $nameError = $this->checkName($name, $zone, $record->type);
        if ($nameError !== null) {
            $errors['name'][] = $nameError;
        }

        if ($record->ttl < $this->ttlMin || $record->ttl > $this->ttlMax) {
            $errors['ttl'][] = sprintf('TTL must be between %d and %d seconds.', $this->ttlMin, $this->ttlMax);
        }

        [$value, $valueErrors] = $this->checkValue($record, $name, $zone);
        foreach ($valueErrors as $field => $messages) {
            foreach ($messages as $message) {
                $errors[$field][] = $message;
            }
        }

        if ($errors !== []) {
            throw ValidationFailedException::withErrors($errors);
        }

        $normalised = $record->with($name, $value);
        $others = array_values(array_filter(
            $existing,
            static fn (DnsRecordData $r) => $ignoreId === null || $r->id !== $ignoreId,
        ));

        $this->checkZoneConflicts($normalised, $zone, $others, $ignoreId === null);

        return $normalised;
    }

    private function checkName(string $name, string $zone, DnsRecordType $type): ?string
    {
        if (!Hostname::isWithinZone($name, $zone)) {
            return sprintf('Record name must be within the zone %s.', $zone);
        }

        $allowWildcard = $type !== DnsRecordType::SRV && $type !== DnsRecordType::NS;
        if (!Hostname::isValid($name, $allowWildcard, allowUnderscore: true)) {
            return 'Record name is not a valid DNS name.';
        }

        if ($type === DnsRecordType::CNAME && $name === $zone) {
            return 'A CNAME cannot be created at the zone apex; use an A/AAAA record instead.';
        }

        if ($type === DnsRecordType::NS && $name === $zone) {
            return 'Apex NS records are managed by Uniti and cannot be changed.';
        }

        if ($type === DnsRecordType::SRV) {
            $labels = explode('.', Hostname::relativise($name, $zone));
            if (count($labels) < 2 || !str_starts_with($labels[0], '_') || !in_array($labels[1], ['_tcp', '_udp', '_tls'], true)) {
                return 'SRV names must take the form _service._proto, e.g. _sip._tcp.';
            }
        }

        return null;
    }

    /**
     * @return array{0: string, 1: array<string, list<string>>}
     */
    private function checkValue(DnsRecordData $record, string $name, string $zone): array
    {
        $value = trim($record->value);
        $errors = [];

        if ($record->type->requiresPriority()) {
            if ($record->priority === null) {
                $errors['priority'][] = 'Priority is required for ' . $record->type->value . ' records.';
            } elseif (!$this->isUint16($record->priority)) {
                $errors['priority'][] = 'Priority must be between 0 and 65535.';
            }
        }

        switch ($record->type) {
            case DnsRecordType::A:
                if (filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_RES_RANGE) === false) {
                    $errors['value'][] = 'Value must be a public IPv4 address.';
                }
                break;

            case DnsRecordType::AAAA:
                if (filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6 | FILTER_FLAG_NO_RES_RANGE) === false) {
                    $errors['value'][] = 'Value must be a public IPv6 address.';
                } else {
                    $value = strtolower((string) inet_ntop((string) inet_pton($value)));
                }
                break;

            case DnsRecordType::CNAME:
            case DnsRecordType::NS:
                $value = Hostname::normalise($value);
                $error = $this->checkTargetHostname($value);
                if ($error !== null) {
                    $errors['value'][] = $error;
                } elseif ($value === $name) {
                    $errors['value'][] = 'A record cannot point at itself.';
                }
                break;

            case DnsRecordType::MX:
                $value = Hostname::normalise($value);
                // RFC 7505 null MX: "." with priority 0 declares the domain accepts no mail.
                if ($value === '') {
                    if ($record->priority !== 0) {
                        $errors['priority'][] = 'A null MX record must have priority 0.';
                    }
                    $value = '.';
                    break;
                }
                $error = $this->checkTargetHostname($value);
                if ($error !== null) {
                    $errors['value'][] = $error;
                }
                break;

            case DnsRecordType::SRV:
                foreach (['weight' => $record->weight, 'port' => $record->port] as $field => $number) {
                    if ($number === null || !$this->isUint16($number)) {
                        $errors[$field][] = ucfirst($field) . ' must be between 0 and 65535.';
                    }
                }
                $value = Hostname::normalise($value);
                if ($value === '') {
                    $value = '.';
                } else {
                    $error = $this->checkTargetHostname($value);
                    if ($error !== null) {
                        $errors['value'][] = $error;
                    }
                }
                break;

            case DnsRecordType::TXT:
                [$value, $error] = $this->normaliseTxt($value);
                if ($error !== null) {
                    $errors['value'][] = $error;
                }
                break;

            case DnsRecordType::CAA:
                [$value, $error] = $this->normaliseCaa($value);
                if ($error !== null) {
                    $errors['value'][] = $error;
                }
                break;
        }

        return [$value, $errors];
    }

    private function checkTargetHostname(string $target): ?string
    {
        if (filter_var($target, FILTER_VALIDATE_IP) !== false) {
            return 'Target must be a hostname, not an IP address.';
        }

        if (!Hostname::isValid($target, allowWildcard: false, allowUnderscore: true)) {
            return 'Target is not a valid hostname.';
        }

        if (!str_contains($target, '.')) {
            return 'Target must be a fully qualified hostname.';
        }

        return null;
    }

    /**
     * Strip wrapping quotes (users paste values from registrar UIs) and
     * enforce printable ASCII. Long values are split into 255-byte strings
     * by the zone serializer, not here.
     *
     * @return array{0: string, 1: string|null}
     */
    private function normaliseTxt(string $value): array
    {
        if (strlen($value) >= 2 && $value[0] === '"' && str_ends_with($value, '"')) {
            $value = substr($value, 1, -1);
        }
        $value = str_replace('" "', '', $value);

        if ($value === '') {
            return [$value, 'TXT value cannot be empty.'];
        }
        if (strlen($value) > self::TXT_MAX_TOTAL_LENGTH) {
            return [$value, sprintf('TXT value cannot exceed %d characters.', self::TXT_MAX_TOTAL_LENGTH)];
        }
        if (preg_match('/^[\x20-\x7E]+$/', $value) !== 1) {
            return [$value, 'TXT value may contain printable ASCII characters only.'];
        }

        return [$value, null];
    }

    /**
     * CAA rdata: `<flags> <tag> "<value>"`, e.g. `0 issue "letsencrypt.org"`.
     *
     * @return array{0: string, 1: string|null}
     */
    private function normaliseCaa(string $value): array
    {
        if (preg_match('/^(\d{1,3})\s+([a-z0-9]+)\s+"?([^"]*)"?$/i', $value, $m) !== 1) {
            return [$value, 'CAA value must look like: 0 issue "ca.example.net".'];
        }

        $flags = (int) $m[1];
        $tag = strtolower($m[2]);
        $tagValue = trim($m[3]);

        if ($flags !== 0 && $flags !== 128) {
            return [$value, 'CAA flags must be 0 or 128.'];
        }
        if (!in_array($tag, self::CAA_TAGS, true)) {
            return [$value, 'CAA tag must be one of: ' . implode(', ', self::CAA_TAGS) . '.'];
        }
        if ($tag === 'iodef' && !preg_match('#^(mailto:[^@\s]+@[^@\s]+|https://\S+)$#i', $tagValue)) {
            return [$value, 'CAA iodef value must be a mailto: or https:// URL.'];
        }
        if ($tag !== 'iodef' && $tagValue !== ';' && $tagValue !== '' && !Hostname::isValid(explode(';', $tagValue)[0])) {
            return [$value, 'CAA issuer must be a certificate authority domain or ";".'];
        }

        return [sprintf('%d %s "%s"', $flags, $tag, $tagValue), null];
    }

    /**
     * @param list<DnsRecordData> $others
     */
    private function checkZoneConflicts(DnsRecordData $record, string $zone, array $others, bool $isCreate): void
    {
        if ($isCreate && count($others) >= $this->maxRecordsPerZone) {
            throw new BusinessRuleException(
                sprintf('The zone %s already holds the maximum of %d records.', $zone, $this->maxRecordsPerZone),
                'DNS_ZONE_RECORD_LIMIT',
            );
        }

        $sameName = array_filter($others, static fn (DnsRecordData $r) => $r->name === $record->name);

        foreach ($sameName as $other) {
            if ($other->identity() === $record->identity()) {
                throw new BusinessRuleException('An identical record already exists.', 'DNS_DUPLICATE_RECORD');
            }

            // RFC 1034 3.6.2: a CNAME owner may have no other data.
            if ($record->type === DnsRecordType::CNAME || $other->type === DnsRecordType::CNAME) {
                throw new BusinessRuleException(
                    sprintf('%s already has %s data; a CNAME cannot coexist with other records.', $record->name, $other->type->value),
                    'DNS_CNAME_CONFLICT',
                );
            }
        }

        if ($record->type === DnsRecordType::TXT && $this->isSpf($record->value)) {
            foreach ($sameName as $other) {
                if ($other->type === DnsRecordType::TXT && $this->isSpf($other->value)) {
                    throw new BusinessRuleException(
                        'Only one SPF (v=spf1) record is allowed per name; merge the mechanisms into the existing record.',
                        'DNS_DUPLICATE_SPF',
                    );
                }
            }
        }

        if ($record->type === DnsRecordType::MX && $record->value === '.') {
            foreach ($sameName as $other) {
                if ($other->type === DnsRecordType::MX) {
                    throw new BusinessRuleException('A null MX record must be the only MX record for the name.', 'DNS_NULL_MX_CONFLICT');
                }
            }
        }
    }

    private function isSpf(string $txt): bool
    {
        return str_starts_with(strtolower($txt), 'v=spf1');
    }

    private function isUint16(int $value): bool
    {
        return $value >= 0 && $value <= 65535;
    }
}
```

## apps/hosted-services/app/Services/Dns/DnsZoneService.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Dns/DnsZoneService.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Dns;

use App\Clients\WebHostingClient;
use App\Enums\DnsRecordType;
use App\Exceptions\BusinessRuleException;
use App\Models\DnsRecord;
use App\Models\HostedDomain;
use App\Repositories\HostedDomainRepository;
use App\Support\Page;
use App\Support\Principal;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Psr\Clock\ClockInterface;

/**
 * Customer-facing DNS zone management. Each mutation validates against the
 * whole zone, bumps the SOA serial and republishes the zone atomically, so
 * the database and the authoritative servers never diverge for long.
 */
final class DnsZoneService
{
    public function __construct(
        private readonly HostedDomainRepository $domains,
        private readonly DnsRecordValidator $validator,
        private readonly ZoneSerializer $serializer,
        private readonly WebHostingClient $hosting,
        private readonly ClockInterface $clock,
        private readonly int $defaultTtl = 3600,
    ) {
    }

    /**
     * @return Page<DnsRecord>
     */
    public function list(string $accountId, string $domainId, int $page, int $pageSize, ?DnsRecordType $type): Page
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);

        return $this->domains->records($domain->id, $page, $pageSize, $type);
    }

    /**
     * @param array<string, mixed> $input
     */
    public function create(string $accountId, string $domainId, array $input, Principal $actor): DnsRecord
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $data = $this->validator->validate(
            DnsRecordData::fromArray($input, $this->defaultTtl),
            $domain->name,
            $this->domains->recordData($domain->id),
        );

        return $this->mutate($domain, function () use ($domain, $data, $actor): DnsRecord {
            $record = new DnsRecord($data->toAttributes() + [
                'hosted_domain_id' => $domain->id,
                'system_managed' => false,
                'created_by' => $actor->auditId(),
            ]);
            $record->save();

            return $record;
        });
    }

    /**
     * @param array<string, mixed> $input
     */
    public function update(string $accountId, string $domainId, string $recordId, array $input): DnsRecord
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $record = $this->domains->getRecord($domain->id, $recordId);
        $this->assertCustomerEditable($record);

        $merged = array_merge(
            ['name' => $record->name, 'type' => $record->type->value, 'value' => $record->value, 'ttl' => $record->ttl,
             'priority' => $record->priority, 'weight' => $record->weight, 'port' => $record->port],
            $input,
            ['type' => $record->type->value],
        );

        $data = $this->validator->validate(
            DnsRecordData::fromArray($merged, $this->defaultTtl),
            $domain->name,
            $this->domains->recordData($domain->id),
            $record->id,
        );

        return $this->mutate($domain, function () use ($record, $data): DnsRecord {
            $record->fill($data->toAttributes());
            $record->save();

            return $record;
        });
    }

    public function delete(string $accountId, string $domainId, string $recordId): void
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $record = $this->domains->getRecord($domain->id, $recordId);
        $this->assertCustomerEditable($record);

        $this->mutate($domain, static function () use ($record): void {
            $record->delete();
        });
    }

    /**
     * Platform-owned records (ACME challenges, mail routing). These bypass
     * the customer-editability check but still go through validation.
     */
    public function upsertSystemRecord(HostedDomain $domain, string $name, DnsRecordType $type, string $value, int $ttl = 300): void
    {
        $data = new DnsRecordData($name, $type, $value, $ttl);
        $existing = array_values(array_filter(
            $this->domains->recordData($domain->id),
            static fn (DnsRecordData $r) => !($r->name === $name && $r->type === $type),
        ));
        $data = $this->validator->validate($data, $domain->name, $existing);

        $this->mutate($domain, function () use ($domain, $data): void {
            $this->domains->deleteRecordsByName($domain->id, $data->name, $data->type);
            (new DnsRecord($data->toAttributes() + ['hosted_domain_id' => $domain->id, 'system_managed' => true]))->save();
        });
    }

    public function removeSystemRecords(HostedDomain $domain, string $name, DnsRecordType $type): void
    {
        $this->mutate($domain, function () use ($domain, $name, $type): void {
            $this->domains->deleteRecordsByName($domain->id, $name, $type);
        });
    }

    public function export(string $accountId, string $domainId): string
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);

        return $this->serializer->serialize(
            $domain->name,
            $domain->zone_serial,
            $this->domains->recordData($domain->id),
            $this->hosting->nameservers(),
            $this->defaultTtl,
        );
    }

    /**
     * Run a change inside a transaction, bump the serial and publish. If
     * publishing fails the transaction rolls back and the error surfaces as
     * a 502, leaving the stored zone equal to the served zone.
     *
     * @template T
     * @param callable(): T $change
     * @return T
     */
    private function mutate(HostedDomain $domain, callable $change): mixed
    {
        return DB::transaction(function () use ($domain, $change): mixed {
            /** @var HostedDomain $locked */
            $locked = HostedDomain::query()->whereKey($domain->id)->lockForUpdate()->firstOrFail();

            $result = $change();

            $locked->zone_serial = ZoneSerializer::nextSerial($locked->zone_serial, CarbonImmutable::instance($this->clock->now()));
            $locked->save();

            $zoneFile = $this->serializer->serialize(
                $locked->name,
                $locked->zone_serial,
                $this->domains->recordData($locked->id),
                $this->hosting->nameservers(),
                $this->defaultTtl,
            );
            $this->hosting->publishZone($locked->name, $locked->zone_serial, $zoneFile);

            Log::info('dns.zone_published', ['hostedDomainId' => $locked->id, 'serial' => $locked->zone_serial]);

            $domain->zone_serial = $locked->zone_serial;

            return $result;
        });
    }

    private function assertCustomerEditable(DnsRecord $record): void
    {
        if ($record->system_managed) {
            throw new BusinessRuleException(
                'This record is managed by Uniti (for example mail routing or certificate validation) and cannot be changed.',
                'DNS_SYSTEM_RECORD',
            );
        }
    }
}
```

## apps/hosted-services/app/Services/Dns/ZoneSerializer.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Dns/ZoneSerializer.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Dns;

use App\Enums\DnsRecordType;
use App\Support\Hostname;

/**
 * Renders records into RFC 1035 master-file syntax. Used for the
 * "export zone" download and for the payload pushed to the DNS platform,
 * so customers see exactly what is served.
 */
final class ZoneSerializer
{
    private const TXT_CHUNK = 255;

    /**
     * @param list<DnsRecordData> $records
     * @param list<string>        $nameservers
     */
    public function serialize(string $zone, int $serial, array $records, array $nameservers, int $defaultTtl = 3600): string
    {
        $zone = Hostname::normalise($zone);
        $lines = [
            sprintf('$ORIGIN %s.', $zone),
            sprintf('$TTL %d', $defaultTtl),
            sprintf(
                '@ IN SOA %s. hostmaster.%s. ( %d 3600 900 1209600 300 )',
                Hostname::normalise($nameservers[0] ?? 'ns1.' . $zone),
                $zone,
                $serial,
            ),
        ];

        foreach ($nameservers as $ns) {
            $lines[] = sprintf('@ IN NS %s.', Hostname::normalise($ns));
        }

        usort($records, static fn (DnsRecordData $a, DnsRecordData $b) => [$a->name, $a->type->value, $a->priority ?? 0]
            <=> [$b->name, $b->type->value, $b->priority ?? 0]);

        foreach ($records as $record) {
            $lines[] = $this->line($record, $zone);
        }

        return implode("\n", $lines) . "\n";
    }

    public function line(DnsRecordData $record, string $zone): string
    {
        $owner = Hostname::relativise($record->name, $zone);

        return sprintf('%s %d IN %s %s', $owner, $record->ttl, $record->type->value, $this->rdata($record));
    }

    public function rdata(DnsRecordData $record): string
    {
        return match ($record->type) {
            DnsRecordType::MX => sprintf('%d %s', $record->priority ?? 0, $this->fqdn($record->value)),
            DnsRecordType::SRV => sprintf(
                '%d %d %d %s',
                $record->priority ?? 0,
                $record->weight ?? 0,
                $record->port ?? 0,
                $this->fqdn($record->value),
            ),
            DnsRecordType::CNAME, DnsRecordType::NS => $this->fqdn($record->value),
            DnsRecordType::TXT => $this->quoteTxt($record->value),
            default => $record->value,
        };
    }

    /**
     * Split long TXT data into <=255 byte character-strings (RFC 1035 3.3).
     */
    public function quoteTxt(string $value): string
    {
        $chunks = str_split($value, self::TXT_CHUNK);

        return implode(' ', array_map(
            static fn (string $chunk) => '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $chunk) . '"',
            $chunks,
        ));
    }

    private function fqdn(string $host): string
    {
        return $host === '.' ? '.' : rtrim($host, '.') . '.';
    }

    /**
     * Next SOA serial in YYYYMMDDnn form; falls back to +1 once the day's
     * 99 revisions are exhausted or the stored serial is ahead of today.
     */
    public static function nextSerial(int $current, \DateTimeInterface $now): int
    {
        $base = (int) ($now->format('Ymd') . '00');

        return $current >= $base ? $current + 1 : $base;
    }
}
```

## apps/hosted-services/app/Services/Hosting/DomainService.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Hosting/DomainService.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Hosting;

use App\Clients\WebHostingClient;
use App\Enums\CertificateStatus;
use App\Enums\ProvisioningStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ConflictException;
use App\Exceptions\ValidationFailedException;
use App\Models\HostedDomain;
use App\Repositories\HostedDomainRepository;
use App\Support\Hostname;
use App\Support\Page;
use App\Support\Principal;
use Illuminate\Support\Facades\Log;

/**
 * Web hosting domains: onboarding, delegation checks and removal.
 */
final class DomainService
{
    public const PLANS = ['WEB_STARTER', 'WEB_BUSINESS', 'WEB_PREMIUM'];

    public function __construct(
        private readonly HostedDomainRepository $domains,
        private readonly WebHostingClient $hosting,
    ) {
    }

    /**
     * @return Page<HostedDomain>
     */
    public function list(string $accountId, int $page, int $pageSize): Page
    {
        return $this->domains->list($accountId, $page, $pageSize);
    }

    public function get(string $accountId, string $domainId): HostedDomain
    {
        return $this->domains->getForAccount($accountId, $domainId);
    }

    /**
     * @return array{domain: HostedDomain, nameservers: list<string>}
     */
    public function add(string $accountId, string $name, string $plan, Principal $actor): array
    {
        $name = Hostname::normalise($name);
        if (!Hostname::isRegistrableDomain($name)) {
            throw ValidationFailedException::forField('name', 'Enter a domain such as example.com.');
        }
        if (!in_array($plan, self::PLANS, true)) {
            throw ValidationFailedException::forField('hosting_plan', 'Unknown hosting plan.');
        }
        if ($this->domains->nameExists($name)) {
            throw new ConflictException(sprintf('%s is already hosted with Uniti.', $name));
        }

        $domain = new HostedDomain([
            'account_id' => $accountId,
            'name' => $name,
            'hosting_plan' => $plan,
            'delegation_verified' => false,
            'zone_serial' => 0,
            'status' => ProvisioningStatus::Pending,
        ]);
        $this->domains->save($domain);

        $domain->external_ref = $this->hosting->createSite($domain);
        $this->domains->save($domain);

        Log::info('hosting.domain_added', ['hostedDomainId' => $domain->id, 'actor' => $actor->auditId()]);

        return ['domain' => $domain, 'nameservers' => $this->hosting->nameservers()];
    }

    /**
     * Confirm the registrar delegates the domain to Uniti nameservers.
     */
    public function checkDelegation(string $accountId, string $domainId): HostedDomain
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $delegated = $this->hosting->checkDelegation($domain->name);

        $domain->delegation_verified = $delegated;
        if ($delegated && $domain->status === ProvisioningStatus::Pending) {
            $domain->status = ProvisioningStatus::Active;
        }

        return $this->domains->save($domain);
    }

    public function remove(string $accountId, string $domainId, Principal $actor): void
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);

        foreach ($this->domains->certificates($domain->id) as $certificate) {
            if ($certificate->status === CertificateStatus::PendingValidation) {
                throw new BusinessRuleException(
                    'A certificate order is in progress; wait for it to finish or cancel it first.',
                    'HOSTING_CERTIFICATE_IN_PROGRESS',
                );
            }
        }

        $this->hosting->deleteZone($domain->name);
        $this->hosting->deleteSite((string) $domain->external_ref);

        $domain->status = ProvisioningStatus::Deprovisioned;
        $this->domains->save($domain);

        Log::info('hosting.domain_removed', ['hostedDomainId' => $domain->id, 'actor' => $actor->auditId()]);
    }
}
```

## apps/hosted-services/app/Services/Hosting/SslCertificateService.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Hosting/SslCertificateService.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Hosting;

use App\Clients\CertificateAuthorityClient;
use App\Clients\WebHostingClient;
use App\Enums\CertificateStatus;
use App\Enums\DnsRecordType;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ProvisioningException;
use App\Exceptions\ValidationFailedException;
use App\Models\HostedDomain;
use App\Models\SslCertificate;
use App\Repositories\HostedDomainRepository;
use App\Services\Dns\DnsZoneService;
use App\Support\Hostname;
use App\Support\Principal;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;
use Psr\Clock\ClockInterface;

/**
 * Domain-validated TLS certificates for hosted sites.
 *
 * Flow: order -> publish DNS-01 TXT records in the customer's zone ->
 * finalise with the CA -> install on the site -> remove challenge records.
 * A scheduled job calls processPending() and renewDue().
 */
final class SslCertificateService
{
    public function __construct(
        private readonly HostedDomainRepository $domains,
        private readonly DnsZoneService $dns,
        private readonly CertificateAuthorityClient $ca,
        private readonly WebHostingClient $hosting,
        private readonly ClockInterface $clock,
        private readonly int $maxSans = 20,
        private readonly int $renewalWindowDays = 30,
    ) {
    }

    /**
     * @return list<SslCertificate>
     */
    public function list(string $accountId, string $domainId): array
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);

        return $this->domains->certificates($domain->id);
    }

    /**
     * @param list<string> $subjectAltNames
     */
    public function request(string $accountId, string $domainId, string $commonName, array $subjectAltNames, bool $autoRenew, Principal $actor): SslCertificate
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        if (!$domain->delegation_verified) {
            throw new BusinessRuleException(
                'Point the domain at Uniti nameservers before requesting a certificate.',
                'SSL_DELEGATION_REQUIRED',
            );
        }

        $names = $this->normaliseNames($domain, $commonName, $subjectAltNames);

        foreach ($this->domains->certificates($domain->id) as $existing) {
            if ($existing->status === CertificateStatus::PendingValidation && $existing->allNames() === $names) {
                return $existing;
            }
        }

        $certificate = $this->order($domain, $names, $autoRenew, null);
        Log::info('ssl.requested', ['certificateId' => $certificate->id, 'names' => $names, 'actor' => $actor->auditId()]);

        return $certificate;
    }

    /**
     * Attempt to finalise every pending order. Returns how many changed state.
     */
    public function processPending(): int
    {
        $changed = 0;
        foreach ($this->domains->pendingValidations() as $certificate) {
            $before = $certificate->status;
            $this->finalise($certificate);
            if ($certificate->status !== $before) {
                $changed++;
            }
        }

        return $changed;
    }

    /**
     * Start renewal orders for certificates inside the renewal window.
     *
     * @return list<SslCertificate> The new renewal orders.
     */
    public function renewDue(): array
    {
        $cutoff = $this->now()->addDays($this->renewalWindowDays);
        $renewals = [];

        foreach ($this->domains->certificatesDueForRenewal($cutoff) as $certificate) {
            try {
                $renewals[] = $this->order($certificate->hostedDomain, $certificate->allNames(), true, $certificate->id);
            } catch (ProvisioningException $e) {
                Log::warning('ssl.renewal_order_failed', ['certificateId' => $certificate->id, 'error' => $e->getMessage()]);
            }
        }

        return $renewals;
    }

    public function revoke(string $accountId, string $domainId, string $certificateId, string $reason, Principal $actor): SslCertificate
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $certificate = $this->domains->getCertificate($domain->id, $certificateId);

        if ($certificate->status !== CertificateStatus::Issued) {
            throw new BusinessRuleException('Only issued certificates can be revoked.', 'SSL_NOT_ISSUED');
        }

        $this->ca->revoke((string) $certificate->order_ref, $reason);
        $certificate->status = CertificateStatus::Revoked;
        $certificate->auto_renew = false;
        $certificate->save();

        Log::notice('ssl.revoked', ['certificateId' => $certificate->id, 'reason' => $reason, 'actor' => $actor->auditId()]);

        return $certificate;
    }

    public function setAutoRenew(string $accountId, string $domainId, string $certificateId, bool $autoRenew): SslCertificate
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $certificate = $this->domains->getCertificate($domain->id, $certificateId);
        $certificate->auto_renew = $autoRenew;
        $certificate->save();

        return $certificate;
    }

    /**
     * Customer-facing health of a certificate.
     *
     * @return array{state: string, daysRemaining: ?int}
     */
    public function health(SslCertificate $certificate): array
    {
        $days = $certificate->daysUntilExpiry($this->now());

        $state = match (true) {
            $certificate->status !== CertificateStatus::Issued => $certificate->status->value,
            $days !== null && $days < 0 => 'EXPIRED',
            $days !== null && $days <= $this->renewalWindowDays => 'EXPIRING_SOON',
            default => 'VALID',
        };

        return ['state' => $state, 'daysRemaining' => $days];
    }

    /**
     * @param list<string> $sans
     * @return list<string> CN first, then sorted unique SANs.
     */
    public function normaliseNames(HostedDomain $domain, string $commonName, array $sans): array
    {
        $commonName = Hostname::normalise($commonName);
        $all = array_values(array_unique(array_map([Hostname::class, 'normalise'], $sans)));
        $all = array_values(array_diff($all, [$commonName]));
        sort($all);

        if (count($all) > $this->maxSans) {
            throw ValidationFailedException::forField('subject_alt_names', sprintf('At most %d additional names are allowed.', $this->maxSans));
        }

        foreach ([$commonName, ...$all] as $i => $name) {
            $field = $i === 0 ? 'common_name' : 'subject_alt_names.' . ($i - 1);
            if (!Hostname::isValid($name, allowWildcard: true)) {
                throw ValidationFailedException::forField($field, 'Not a valid hostname.');
            }
            if (!Hostname::isWithinZone(ltrim($name, '*.'), $domain->name)) {
                throw ValidationFailedException::forField($field, sprintf('Names must be within %s.', $domain->name));
            }
        }

        return [$commonName, ...$all];
    }

    /**
     * @param list<string> $names
     */
    private function order(HostedDomain $domain, array $names, bool $autoRenew, ?string $renewedFromId): SslCertificate
    {
        $certificate = new SslCertificate([
            'hosted_domain_id' => $domain->id,
            'common_name' => $names[0],
            'subject_alt_names' => array_slice($names, 1),
            'status' => CertificateStatus::PendingValidation,
            'auto_renew' => $autoRenew,
            'challenges' => [],
            'renewed_from_id' => $renewedFromId,
        ]);
        $certificate->save();

        $order = $this->ca->createOrder($names, 'cert-' . $certificate->id);
        $certificate->order_ref = $order['orderRef'];
        $certificate->challenges = $order['challenges'];
        $certificate->validation_expires_at = $order['expiresAt'];
        $certificate->save();

        foreach ($order['challenges'] as $recordName => $token) {
            $this->dns->upsertSystemRecord($domain, $recordName, DnsRecordType::TXT, $token, 60);
        }

        return $certificate;
    }

    private function finalise(SslCertificate $certificate): void
    {
        $domain = $certificate->hostedDomain;

        if ($certificate->validation_expires_at !== null && $this->now()->gte($certificate->validation_expires_at)) {
            $this->fail($certificate, 'Domain validation did not complete before the order expired.');

            return;
        }

        $result = $this->ca->finalise((string) $certificate->order_ref);

        if ($result['status'] === 'valid') {
            $certificate->fill([
                'status' => CertificateStatus::Issued,
                'issuer' => $result['issuer'],
                'serial_number' => $result['serialNumber'],
                'not_before' => $result['notBefore'],
                'not_after' => $result['notAfter'],
            ])->save();

            $this->hosting->installCertificate((string) $domain->external_ref, (string) $certificate->order_ref);
            $this->cleanupChallenges($certificate);
            $this->retirePredecessor($certificate);

            Log::info('ssl.issued', ['certificateId' => $certificate->id, 'notAfter' => $result['notAfter']?->toIso8601ZuluString()]);

            return;
        }

        if ($result['status'] === 'invalid') {
            $this->fail($certificate, $result['error'] ?? 'The certificate authority rejected the order.');
        }
    }

    private function fail(SslCertificate $certificate, string $reason): void
    {
        $certificate->status = CertificateStatus::Failed;
        $certificate->failure_reason = $reason;
        $certificate->save();
        $this->cleanupChallenges($certificate);

        Log::warning('ssl.failed', ['certificateId' => $certificate->id, 'reason' => $reason]);
    }

    private function cleanupChallenges(SslCertificate $certificate): void
    {
        foreach (array_keys($certificate->challenges ?? []) as $recordName) {
            $this->dns->removeSystemRecords($certificate->hostedDomain, $recordName, DnsRecordType::TXT);
        }
    }

    private function retirePredecessor(SslCertificate $certificate): void
    {
        if ($certificate->renewed_from_id === null) {
            return;
        }

        $previous = SslCertificate::query()->find($certificate->renewed_from_id);
        if ($previous !== null && $previous->status === CertificateStatus::Issued) {
            $previous->status = CertificateStatus::Expired;
            $previous->auto_renew = false;
            $previous->save();
        }
    }

    private function now(): CarbonImmutable
    {
        return CarbonImmutable::instance($this->clock->now())->utc();
    }
}
```

## apps/hosted-services/app/Services/Mail/EmailDomainService.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Mail/EmailDomainService.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Mail;

use App\Clients\MailPlatformClient;
use App\Enums\ProvisioningStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ConflictException;
use App\Exceptions\ValidationFailedException;
use App\Models\EmailDomain;
use App\Repositories\EmailDomainRepository;
use App\Support\Hostname;
use App\Support\Principal;
use Illuminate\Support\Facades\Log;

/**
 * Hosted email domains: onboarding, MX verification and storage add-ons.
 */
final class EmailDomainService
{
    public function __construct(
        private readonly EmailDomainRepository $domains,
        private readonly QuotaCalculator $quota,
        private readonly MailPlatformClient $mail,
    ) {
    }

    /**
     * @return list<array{domain: EmailDomain, quota: QuotaSummary}>
     */
    public function listWithQuota(string $accountId): array
    {
        return array_map(fn (EmailDomain $d) => ['domain' => $d, 'quota' => $this->quotaFor($d)], $this->domains->allForAccount($accountId));
    }

    public function get(string $accountId, string $domainId): EmailDomain
    {
        return $this->domains->getForAccount($accountId, $domainId);
    }

    public function quotaFor(EmailDomain $domain): QuotaSummary
    {
        return $this->quota->summarise($domain->plan_code, $domain->addon_blocks, $this->domains->allocations($domain->id));
    }

    public function register(string $accountId, string $domainName, string $planCode, Principal $actor): EmailDomain
    {
        $domainName = Hostname::normalise($domainName);
        if (!Hostname::isRegistrableDomain($domainName)) {
            throw ValidationFailedException::forField('domain', 'Enter a domain such as example.com.');
        }
        if ($this->domains->domainExists($domainName)) {
            throw new ConflictException(sprintf('%s is already set up for hosted email.', $domainName));
        }

        // Validates the plan code; throws for unknown plans.
        $this->quota->capacityMb($planCode, 0);

        $domain = new EmailDomain([
            'account_id' => $accountId,
            'domain' => $domainName,
            'plan_code' => $planCode,
            'addon_blocks' => 0,
            'mx_verified' => false,
            'status' => ProvisioningStatus::Pending,
        ]);
        $this->domains->save($domain);

        $domain->external_ref = $this->mail->createDomain($domain);
        $this->domains->save($domain);

        Log::info('mail.domain_registered', ['emailDomainId' => $domain->id, 'actor' => $actor->auditId()]);

        return $domain;
    }

    /**
     * Check the public MX records; the domain becomes ACTIVE once they
     * point at the Uniti mail platform.
     *
     * @return array{domain: EmailDomain, observedMx: list<string>}
     */
    public function verifyMx(string $accountId, string $domainId): array
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $result = $this->mail->verifyMx((string) $domain->external_ref);

        $domain->mx_verified = $result['verified'];
        if ($result['verified'] && $domain->status === ProvisioningStatus::Pending) {
            $domain->status = ProvisioningStatus::Active;
        }
        $this->domains->save($domain);

        return ['domain' => $domain, 'observedMx' => $result['observedMx']];
    }

    /**
     * Change the number of purchased storage blocks. Reductions are refused
     * when mailbox quotas would no longer fit in the pool.
     */
    public function setAddonBlocks(string $accountId, string $domainId, int $blocks, Principal $actor): EmailDomain
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        if ($domain->status === ProvisioningStatus::Deprovisioned) {
            throw new BusinessRuleException('The domain has been removed.', 'MAIL_DOMAIN_REMOVED');
        }

        $this->quota->assertCanChangeAddonBlocks($this->quotaFor($domain), $blocks);

        $this->mail->setDomainStorage((string) $domain->external_ref, $this->quota->capacityMb($domain->plan_code, $blocks));

        $previous = $domain->addon_blocks;
        $domain->addon_blocks = $blocks;
        $this->domains->save($domain);

        Log::info('mail.addon_blocks_changed', [
            'emailDomainId' => $domain->id,
            'from' => $previous,
            'to' => $blocks,
            'actor' => $actor->auditId(),
        ]);

        return $domain;
    }
}
```

## apps/hosted-services/app/Services/Mail/LocalPartPolicy.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Mail/LocalPartPolicy.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Mail;

use App\Exceptions\BusinessRuleException;
use App\Exceptions\ValidationFailedException;

/**
 * Rules for the part of an address before "@". Deliberately stricter than
 * RFC 5321 (no quoted strings, no "+" since we use sub-addressing) so that
 * addresses work with every client and spam filter.
 */
final class LocalPartPolicy
{
    private const MAX_LENGTH = 64;

    /**
     * @param list<string> $reserved Role addresses the platform owns.
     */
    public function __construct(private readonly array $reserved = [])
    {
    }

    public function normalise(string $localPart, string $field = 'local_part'): string
    {
        $value = strtolower(trim($localPart));

        if ($value === '' || strlen($value) > self::MAX_LENGTH) {
            throw ValidationFailedException::forField($field, sprintf('Must be 1 to %d characters.', self::MAX_LENGTH));
        }

        if (preg_match('/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/', $value) !== 1) {
            throw ValidationFailedException::forField(
                $field,
                'Use letters, digits, dots, hyphens and underscores; start and end with a letter or digit.',
            );
        }

        if (str_contains($value, '..')) {
            throw ValidationFailedException::forField($field, 'Consecutive dots are not allowed.');
        }

        if (in_array($value, $this->reserved, true)) {
            throw new BusinessRuleException(sprintf('"%s" is a reserved address.', $value), 'MAIL_RESERVED_LOCAL_PART');
        }

        return $value;
    }
}
```

## apps/hosted-services/app/Services/Mail/MailAliasService.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Mail/MailAliasService.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Mail;

use App\Clients\MailPlatformClient;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ConflictException;
use App\Exceptions\ResourceNotFoundException;
use App\Exceptions\ValidationFailedException;
use App\Models\EmailDomain;
use App\Models\MailAlias;
use App\Repositories\EmailDomainRepository;
use App\Support\Page;

/**
 * Aliases and distribution lists on a hosted email domain.
 */
final class MailAliasService
{
    public function __construct(
        private readonly EmailDomainRepository $domains,
        private readonly LocalPartPolicy $localParts,
        private readonly MailPlatformClient $mail,
        private readonly int $maxDestinations = 50,
        private readonly bool $allowExternalForwarding = true,
    ) {
    }

    /**
     * @return Page<MailAlias>
     */
    public function list(string $accountId, string $domainId, int $page, int $pageSize): Page
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);

        return $this->domains->aliases($domain->id, $page, $pageSize);
    }

    /**
     * @param array{local_part: string, destinations: list<string>, description?: ?string} $data
     */
    public function create(string $accountId, string $domainId, array $data): MailAlias
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $localPart = $this->localParts->normalise($data['local_part']);

        if ($this->domains->isLocalPartTaken($domain->id, $localPart)) {
            throw new ConflictException(sprintf('%s@%s is already in use.', $localPart, $domain->domain));
        }

        $alias = new MailAlias([
            'email_domain_id' => $domain->id,
            'local_part' => $localPart,
            'destinations' => $this->normaliseDestinations($domain, $localPart, $data['destinations']),
            'description' => $data['description'] ?? null,
        ]);
        $alias->setRelation('emailDomain', $domain);

        $this->mail->upsertAlias($alias, $localPart . '@' . $domain->domain);
        $alias->save();

        return $alias;
    }

    /**
     * @param array{destinations?: list<string>, description?: ?string} $changes
     */
    public function update(string $accountId, string $domainId, string $aliasId, array $changes): MailAlias
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $alias = $this->find($domain, $aliasId);

        if (isset($changes['destinations'])) {
            $alias->destinations = $this->normaliseDestinations($domain, $alias->local_part, $changes['destinations']);
        }
        if (array_key_exists('description', $changes)) {
            $alias->description = $changes['description'];
        }

        $alias->setRelation('emailDomain', $domain);
        $this->mail->upsertAlias($alias, $alias->local_part . '@' . $domain->domain);
        $alias->save();

        return $alias;
    }

    public function delete(string $accountId, string $domainId, string $aliasId): void
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $alias = $this->find($domain, $aliasId);

        $this->mail->deleteAlias($alias->local_part . '@' . $domain->domain);
        $alias->delete();
    }

    /**
     * @param list<string> $destinations
     * @return list<string>
     */
    public function normaliseDestinations(EmailDomain $domain, string $localPart, array $destinations): array
    {
        $self = $localPart . '@' . $domain->domain;
        $errors = [];
        $result = [];

        foreach ($destinations as $i => $raw) {
            $address = strtolower(trim((string) $raw));
            if (filter_var($address, FILTER_VALIDATE_EMAIL) === false) {
                $errors["destinations.$i"][] = 'Not a valid email address.';
                continue;
            }
            if ($address === $self) {
                $errors["destinations.$i"][] = 'An alias cannot deliver to itself.';
                continue;
            }
            if (!$this->allowExternalForwarding && !str_ends_with($address, '@' . $domain->domain)) {
                $errors["destinations.$i"][] = 'External destinations are disabled for this domain.';
                continue;
            }
            $result[$address] = true;
        }

        if ($errors !== []) {
            throw ValidationFailedException::withErrors($errors);
        }

        if ($result === []) {
            throw new BusinessRuleException('An alias needs at least one destination.', 'MAIL_ALIAS_EMPTY');
        }

        if (count($result) > $this->maxDestinations) {
            throw new BusinessRuleException(
                sprintf('An alias may have at most %d destinations.', $this->maxDestinations),
                'MAIL_ALIAS_TOO_MANY_DESTINATIONS',
            );
        }

        return array_keys($result);
    }

    private function find(EmailDomain $domain, string $aliasId): MailAlias
    {
        return $this->domains->findAlias($domain->id, $aliasId) ?? throw ResourceNotFoundException::of('Alias', $aliasId);
    }
}
```

## apps/hosted-services/app/Services/Mail/MailboxService.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Mail/MailboxService.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Mail;

use App\Clients\MailPlatformClient;
use App\Enums\ProvisioningStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ConflictException;
use App\Exceptions\ValidationFailedException;
use App\Models\EmailDomain;
use App\Models\Mailbox;
use App\Repositories\EmailDomainRepository;
use App\Repositories\MailboxRepository;
use App\Support\Page;
use App\Support\Principal;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;

/**
 * Mailbox lifecycle on hosted email, enforcing pooled storage quotas.
 */
final class MailboxService
{
    public function __construct(
        private readonly MailboxRepository $mailboxes,
        private readonly EmailDomainRepository $domains,
        private readonly QuotaCalculator $quota,
        private readonly LocalPartPolicy $localParts,
        private readonly MailPlatformClient $mail,
        private readonly PasswordGenerator $passwords,
        private readonly bool $allowExternalForwarding = true,
        private readonly int $defaultQuotaMb = 10240,
    ) {
    }

    /**
     * @return Page<Mailbox>
     */
    public function list(string $accountId, string $domainId, int $page, int $pageSize, ?string $search): Page
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);

        return $this->mailboxes->listForDomain($accountId, $domain->id, $page, $pageSize, $search);
    }

    public function get(string $accountId, string $mailboxId): Mailbox
    {
        return $this->mailboxes->getForAccount($accountId, $mailboxId);
    }

    /**
     * @param array{local_part: string, display_name: string, quota_mb?: ?int} $data
     * @return array{mailbox: Mailbox, temporaryPassword: string}
     */
    public function create(string $accountId, string $domainId, array $data, Principal $actor): array
    {
        $domain = $this->activeDomain($accountId, $domainId);
        $localPart = $this->localParts->normalise($data['local_part']);

        if ($this->domains->isLocalPartTaken($domain->id, $localPart)) {
            throw new ConflictException(sprintf('%s@%s is already in use.', $localPart, $domain->domain));
        }

        $summary = $this->quota->summarise($domain->plan_code, $domain->addon_blocks, $this->domains->allocations($domain->id));
        $quotaMb = $data['quota_mb'] ?? min($this->defaultQuotaMb, $summary->unallocatedMb());
        $this->quota->assertCanAllocate($summary, $quotaMb, isNewMailbox: true);

        $mailbox = new Mailbox([
            'account_id' => $accountId,
            'email_domain_id' => $domain->id,
            'local_part' => $localPart,
            'display_name' => trim($data['display_name']),
            'quota_mb' => $quotaMb,
            'used_mb' => 0,
            'forwarding_enabled' => false,
            'keep_forwarded_copy' => true,
            'status' => ProvisioningStatus::Pending,
        ]);
        $mailbox->setRelation('emailDomain', $domain);
        $this->mailboxes->save($mailbox);

        $temporaryPassword = $this->passwords->generate();
        $mailbox->external_ref = $this->mail->createMailbox($mailbox, $localPart . '@' . $domain->domain, $temporaryPassword);
        $mailbox->status = ProvisioningStatus::Active;
        $this->mailboxes->save($mailbox);

        Log::info('mail.mailbox_created', ['mailboxId' => $mailbox->id, 'quotaMb' => $quotaMb, 'actor' => $actor->auditId()]);

        return ['mailbox' => $mailbox, 'temporaryPassword' => $temporaryPassword];
    }

    /**
     * @param array{display_name?: string, quota_mb?: int, forwarding_enabled?: bool,
     *              forwarding_address?: ?string, keep_forwarded_copy?: bool, suspended?: bool} $changes
     */
    public function update(string $accountId, string $mailboxId, array $changes): Mailbox
    {
        $mailbox = $this->mailboxes->getForAccount($accountId, $mailboxId);
        $domain = $mailbox->emailDomain;

        if (isset($changes['quota_mb']) && $changes['quota_mb'] !== $mailbox->quota_mb) {
            $summary = $this->quota->summarise($domain->plan_code, $domain->addon_blocks, $this->domains->allocations($domain->id));
            $this->quota->assertCanAllocate($summary, (int) $changes['quota_mb'], $mailbox->quota_mb, $mailbox->used_mb);
            $mailbox->quota_mb = (int) $changes['quota_mb'];
        }

        if (isset($changes['display_name'])) {
            $mailbox->display_name = trim($changes['display_name']);
        }

        if (array_key_exists('forwarding_enabled', $changes) || array_key_exists('forwarding_address', $changes)) {
            $this->applyForwarding($mailbox, $domain, $changes);
        }

        if (isset($changes['suspended'])) {
            $mailbox->status = $changes['suspended'] ? ProvisioningStatus::Suspended : ProvisioningStatus::Active;
        }

        $this->mail->updateMailbox($mailbox);

        return $this->mailboxes->save($mailbox);
    }

    /**
     * @return string New temporary password, shown once to the administrator.
     */
    public function resetPassword(string $accountId, string $mailboxId, Principal $actor): string
    {
        $mailbox = $this->mailboxes->getForAccount($accountId, $mailboxId);
        $password = $this->passwords->generate();
        $this->mail->resetPassword((string) $mailbox->external_ref, $password);

        Log::notice('mail.password_reset', ['mailboxId' => $mailbox->id, 'actor' => $actor->auditId()]);

        return $password;
    }

    public function delete(string $accountId, string $mailboxId, Principal $actor): void
    {
        $mailbox = $this->mailboxes->getForAccount($accountId, $mailboxId);
        $address = $mailbox->address();

        $referencingAliases = $mailbox->emailDomain->aliases()
            ->get()
            ->filter(static fn ($alias) => in_array($address, $alias->destinations, true))
            ->pluck('local_part')
            ->all();
        if ($referencingAliases !== []) {
            throw new BusinessRuleException(
                'The mailbox is a destination of aliases: ' . implode(', ', $referencingAliases) . '.',
                'MAIL_MAILBOX_IS_ALIAS_TARGET',
                ['aliases' => $referencingAliases],
            );
        }

        $this->mail->deleteMailbox((string) $mailbox->external_ref);
        $mailbox->status = ProvisioningStatus::Deprovisioned;
        $this->mailboxes->save($mailbox);

        Log::info('mail.mailbox_deleted', ['mailboxId' => $mailbox->id, 'actor' => $actor->auditId()]);
    }

    /**
     * Refresh usage from the platform for a whole domain.
     */
    public function syncUsage(EmailDomain $domain, CarbonImmutable $now): int
    {
        $usage = $this->mail->fetchUsage((string) $domain->external_ref);

        return $this->mailboxes->applyUsage($domain->id, $usage, $now);
    }

    /**
     * @param array<string, mixed> $changes
     */
    private function applyForwarding(Mailbox $mailbox, EmailDomain $domain, array $changes): void
    {
        $enabled = (bool) ($changes['forwarding_enabled'] ?? $mailbox->forwarding_enabled);
        $address = $changes['forwarding_address'] ?? $mailbox->forwarding_address;

        if (!$enabled) {
            $mailbox->forwarding_enabled = false;
            $mailbox->forwarding_address = null;

            return;
        }

        if ($address === null || filter_var($address, FILTER_VALIDATE_EMAIL) === false) {
            throw ValidationFailedException::forField('forwarding_address', 'A valid forwarding address is required.');
        }
        $address = strtolower($address);

        if ($address === strtolower($mailbox->local_part . '@' . $domain->domain)) {
            throw ValidationFailedException::forField('forwarding_address', 'A mailbox cannot forward to itself.');
        }

        $isExternal = !str_ends_with($address, '@' . $domain->domain);
        if ($isExternal && !$this->allowExternalForwarding) {
            throw new BusinessRuleException('Forwarding outside the organisation is disabled.', 'MAIL_EXTERNAL_FORWARDING_DISABLED');
        }

        $mailbox->forwarding_enabled = true;
        $mailbox->forwarding_address = $address;
        $mailbox->keep_forwarded_copy = (bool) ($changes['keep_forwarded_copy'] ?? $mailbox->keep_forwarded_copy);
    }

    private function activeDomain(string $accountId, string $domainId): EmailDomain
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        if ($domain->status !== ProvisioningStatus::Active) {
            throw new BusinessRuleException(
                sprintf('The domain %s is %s; mailboxes can be added once it is active.', $domain->domain, $domain->status->value),
                'MAIL_DOMAIN_NOT_ACTIVE',
            );
        }

        return $domain;
    }
}
```

## apps/hosted-services/app/Services/Mail/PasswordGenerator.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Mail/PasswordGenerator.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Mail;

/**
 * Generates temporary mailbox passwords that satisfy the mail platform's
 * complexity policy and avoid visually ambiguous characters.
 */
final class PasswordGenerator
{
    private const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    private const LOWER = 'abcdefghijkmnpqrstuvwxyz';
    private const DIGITS = '23456789';
    private const SYMBOLS = '!@#$%*-_=+?';

    public function __construct(private readonly int $length = 16)
    {
    }

    public function generate(): string
    {
        $all = self::UPPER . self::LOWER . self::DIGITS . self::SYMBOLS;

        $chars = [
            $this->pick(self::UPPER),
            $this->pick(self::LOWER),
            $this->pick(self::DIGITS),
            $this->pick(self::SYMBOLS),
        ];

        for ($i = count($chars); $i < $this->length; $i++) {
            $chars[] = $this->pick($all);
        }

        // Fisher-Yates with a CSPRNG so the guaranteed classes are not positional.
        for ($i = count($chars) - 1; $i > 0; $i--) {
            $j = random_int(0, $i);
            [$chars[$i], $chars[$j]] = [$chars[$j], $chars[$i]];
        }

        return implode('', $chars);
    }

    private function pick(string $alphabet): string
    {
        return $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
}
```

## apps/hosted-services/app/Services/Mail/QuotaCalculator.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Mail/QuotaCalculator.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Mail;

use App\Exceptions\BusinessRuleException;
use InvalidArgumentException;

/**
 * Pure quota arithmetic for hosted email. Storage is pooled per domain:
 * capacity = plan pool + add-on blocks; individual mailbox quotas are
 * carved out of that pool and the sum may never exceed capacity.
 *
 * No I/O: callers pass the current allocations in, which keeps this class
 * trivially unit-testable.
 */
final class QuotaCalculator
{
    public const LEVEL_OK = 'OK';
    public const LEVEL_WARNING = 'WARNING';
    public const LEVEL_FULL = 'FULL';

    /**
     * @param array<string, array{pool_mb: int, max_mailboxes: int}> $plans
     */
    public function __construct(
        private readonly array $plans,
        private readonly int $addonBlockMb,
        private readonly int $addonBlockPriceMinor,
        private readonly string $currency,
        private readonly int $minMailboxQuotaMb,
        private readonly int $maxMailboxQuotaMb,
        private readonly int $warningPercent = 85,
    ) {
        if ($addonBlockMb <= 0) {
            throw new InvalidArgumentException('Add-on block size must be positive.');
        }
    }

    public static function fromConfig(array $mail): self
    {
        return new self(
            plans: $mail['plans'],
            addonBlockMb: (int) $mail['addon_block_mb'],
            addonBlockPriceMinor: (int) $mail['addon_block_price_minor'],
            currency: (string) $mail['currency'],
            minMailboxQuotaMb: (int) $mail['min_mailbox_quota_mb'],
            maxMailboxQuotaMb: (int) $mail['max_mailbox_quota_mb'],
            warningPercent: (int) $mail['quota_warning_percent'],
        );
    }

    public function capacityMb(string $planCode, int $addonBlocks): int
    {
        return $this->plan($planCode)['pool_mb'] + max(0, $addonBlocks) * $this->addonBlockMb;
    }

    /**
     * @param list<array{quota_mb: int, used_mb: int}> $mailboxes
     */
    public function summarise(string $planCode, int $addonBlocks, array $mailboxes): QuotaSummary
    {
        $plan = $this->plan($planCode);
        $addonBlocks = max(0, $addonBlocks);

        return new QuotaSummary(
            planCode: $planCode,
            planPoolMb: $plan['pool_mb'],
            addonBlocks: $addonBlocks,
            addonMb: $addonBlocks * $this->addonBlockMb,
            capacityMb: $this->capacityMb($planCode, $addonBlocks),
            allocatedMb: array_sum(array_column($mailboxes, 'quota_mb')),
            usedMb: array_sum(array_column($mailboxes, 'used_mb')),
            mailboxCount: count($mailboxes),
            maxMailboxes: $plan['max_mailboxes'],
            addonMonthlyCostMinor: $addonBlocks * $this->addonBlockPriceMinor,
            currency: $this->currency,
        );
    }

    /**
     * Guard for creating a mailbox or changing its quota.
     *
     * @param int  $currentQuotaMb Quota of the mailbox being changed (0 when creating).
     * @param int  $currentUsedMb  Used storage of the mailbox being changed.
     * @param bool $isNewMailbox   Whether a mailbox slot is consumed.
     */
    public function assertCanAllocate(
        QuotaSummary $summary,
        int $requestedQuotaMb,
        int $currentQuotaMb = 0,
        int $currentUsedMb = 0,
        bool $isNewMailbox = false,
    ): void {
        if ($requestedQuotaMb < $this->minMailboxQuotaMb || $requestedQuotaMb > $this->maxMailboxQuotaMb) {
            throw new BusinessRuleException(
                sprintf('Mailbox quota must be between %d MB and %d MB.', $this->minMailboxQuotaMb, $this->maxMailboxQuotaMb),
                'MAIL_QUOTA_OUT_OF_RANGE',
            );
        }

        if ($isNewMailbox && $summary->remainingMailboxSlots() === 0) {
            throw new BusinessRuleException(
                sprintf('The %s plan allows at most %d mailboxes.', $summary->planCode, $summary->maxMailboxes),
                'MAIL_MAILBOX_LIMIT',
            );
        }

        if ($requestedQuotaMb < $currentUsedMb) {
            throw new BusinessRuleException(
                sprintf('The mailbox already uses %d MB; the quota cannot be set below current usage.', $currentUsedMb),
                'MAIL_QUOTA_BELOW_USAGE',
                ['usedMb' => $currentUsedMb],
            );
        }

        $delta = $requestedQuotaMb - $currentQuotaMb;
        if ($delta > $summary->unallocatedMb()) {
            $shortfall = $delta - $summary->unallocatedMb();
            $blocks = $this->blocksFor($shortfall);

            throw new BusinessRuleException(
                sprintf('The storage pool has %d MB unallocated but %d MB is needed.', $summary->unallocatedMb(), $delta),
                'MAIL_POOL_EXHAUSTED',
                [
                    'shortfallMb' => $shortfall,
                    'suggestedAddonBlocks' => $blocks,
                    'suggestedAddonMonthlyCost' => [
                        'amountMinor' => $blocks * $this->addonBlockPriceMinor,
                        'currency' => $this->currency,
                    ],
                ],
            );
        }
    }

    /**
     * Guard for removing add-on blocks: capacity must still cover the sum
     * of allocated mailbox quotas.
     */
    public function assertCanChangeAddonBlocks(QuotaSummary $summary, int $newAddonBlocks): void
    {
        if ($newAddonBlocks < 0) {
            throw new BusinessRuleException('Add-on block count cannot be negative.', 'MAIL_ADDON_NEGATIVE');
        }

        $newCapacity = $summary->planPoolMb + $newAddonBlocks * $this->addonBlockMb;
        if ($newCapacity < $summary->allocatedMb) {
            throw new BusinessRuleException(
                sprintf(
                    'Mailbox quotas total %d MB; reducing to %d add-on blocks would leave only %d MB.',
                    $summary->allocatedMb,
                    $newAddonBlocks,
                    $newCapacity,
                ),
                'MAIL_ADDON_BELOW_ALLOCATION',
                ['minimumAddonBlocks' => $this->blocksFor($summary->allocatedMb - $summary->planPoolMb)],
            );
        }
    }

    /**
     * Usage level for a single mailbox, used for portal badges and the
     * warning notification job.
     *
     * @return array{usedMb: int, quotaMb: int, percent: float, level: string}
     */
    public function mailboxUsage(int $usedMb, int $quotaMb): array
    {
        $percent = $quotaMb <= 0 ? 100.0 : round(min($usedMb, $quotaMb) * 100 / $quotaMb, 1);
        $level = match (true) {
            $usedMb >= $quotaMb => self::LEVEL_FULL,
            $percent >= $this->warningPercent => self::LEVEL_WARNING,
            default => self::LEVEL_OK,
        };

        return ['usedMb' => $usedMb, 'quotaMb' => $quotaMb, 'percent' => $percent, 'level' => $level];
    }

    /**
     * Distribute capacity evenly across N mailboxes, rounded down to whole
     * 256 MB units so the remainder stays visible as unallocated.
     */
    public function evenSplitMb(int $capacityMb, int $mailboxCount): int
    {
        if ($mailboxCount <= 0) {
            return 0;
        }

        $share = intdiv($capacityMb, $mailboxCount);
        $share -= $share % 256;

        return max($this->minMailboxQuotaMb, min($share, $this->maxMailboxQuotaMb));
    }

    public function blocksFor(int $shortfallMb): int
    {
        return $shortfallMb <= 0 ? 0 : intdiv($shortfallMb + $this->addonBlockMb - 1, $this->addonBlockMb);
    }

    /**
     * @return array{pool_mb: int, max_mailboxes: int}
     */
    private function plan(string $planCode): array
    {
        if (!isset($this->plans[$planCode])) {
            throw new BusinessRuleException(sprintf('Unknown hosted email plan "%s".', $planCode), 'MAIL_UNKNOWN_PLAN');
        }

        return $this->plans[$planCode];
    }
}
```

## apps/hosted-services/app/Services/Mail/QuotaSummary.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Mail/QuotaSummary.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Mail;

use JsonSerializable;

/**
 * Storage position of an email domain's pool. All sizes in MB, money in
 * integer minor units.
 */
final class QuotaSummary implements JsonSerializable
{
    public function __construct(
        public readonly string $planCode,
        public readonly int $planPoolMb,
        public readonly int $addonBlocks,
        public readonly int $addonMb,
        public readonly int $capacityMb,
        public readonly int $allocatedMb,
        public readonly int $usedMb,
        public readonly int $mailboxCount,
        public readonly int $maxMailboxes,
        public readonly int $addonMonthlyCostMinor,
        public readonly string $currency,
    ) {
    }

    public function unallocatedMb(): int
    {
        return max(0, $this->capacityMb - $this->allocatedMb);
    }

    public function allocationPercent(): float
    {
        return $this->capacityMb === 0 ? 0.0 : round($this->allocatedMb * 100 / $this->capacityMb, 1);
    }

    public function remainingMailboxSlots(): int
    {
        return max(0, $this->maxMailboxes - $this->mailboxCount);
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return [
            'planCode' => $this->planCode,
            'planPoolMb' => $this->planPoolMb,
            'addonBlocks' => $this->addonBlocks,
            'addonMb' => $this->addonMb,
            'capacityMb' => $this->capacityMb,
            'allocatedMb' => $this->allocatedMb,
            'unallocatedMb' => $this->unallocatedMb(),
            'allocationPercent' => $this->allocationPercent(),
            'usedMb' => $this->usedMb,
            'mailboxCount' => $this->mailboxCount,
            'maxMailboxes' => $this->maxMailboxes,
            'remainingMailboxSlots' => $this->remainingMailboxSlots(),
            'addonMonthlyCost' => ['amountMinor' => $this->addonMonthlyCostMinor, 'currency' => $this->currency],
        ];
    }
}
```

## apps/hosted-services/app/Services/Porting/PortingContext.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Porting/PortingContext.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Porting;

use Carbon\CarbonImmutable;

/**
 * Facts the porting state machine needs to evaluate guards, decoupled from
 * the Eloquent model so transitions can be tested in isolation.
 */
final class PortingContext
{
    /**
     * @param list<string> $numbers
     */
    public function __construct(
        public readonly CarbonImmutable $now,
        public readonly array $numbers,
        public readonly ?CarbonImmutable $focAt = null,
        public readonly int $resubmissionCount = 0,
        public readonly bool $hasLoa = false,
        public readonly ?string $reason = null,
    ) {
    }
}
```
