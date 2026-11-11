# Hosted Services (hosted voice, email, web hosting): apps/hosted-services/app (part 3 of 6)

- **Application:** Hosted Services (hosted voice, email, web hosting)
- **Tech stack:** PHP 8 (Laravel-style)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 23

## Files

- `apps/hosted-services/app/Models/DnsRecord.php` (56 lines)
- `apps/hosted-services/app/Models/EmailDomain.php` (47 lines)
- `apps/hosted-services/app/Models/Extension.php` (67 lines)
- `apps/hosted-services/app/Models/HostedDomain.php` (54 lines)
- `apps/hosted-services/app/Models/HostedNumber.php` (70 lines)
- `apps/hosted-services/app/Models/HuntGroup.php` (62 lines)
- `apps/hosted-services/app/Models/HuntGroupMember.php` (39 lines)
- `apps/hosted-services/app/Models/MailAlias.php` (35 lines)
- `apps/hosted-services/app/Models/Mailbox.php` (65 lines)
- `apps/hosted-services/app/Models/PortingEvent.php` (41 lines)
- `apps/hosted-services/app/Models/PortingRequest.php` (73 lines)
- `apps/hosted-services/app/Models/SslCertificate.php` (81 lines)
- `apps/hosted-services/app/Models/VoicemailBox.php` (56 lines)
- `apps/hosted-services/app/Providers/AppServiceProvider.php` (153 lines)
- `apps/hosted-services/app/Repositories/AccountScopedRepository.php` (93 lines)
- `apps/hosted-services/app/Repositories/EmailDomainRepository.php` (107 lines)
- `apps/hosted-services/app/Repositories/ExtensionRepository.php` (127 lines)
- `apps/hosted-services/app/Repositories/HostedDomainRepository.php` (158 lines)
- `apps/hosted-services/app/Repositories/HostedNumberRepository.php` (86 lines)
- `apps/hosted-services/app/Repositories/HuntGroupRepository.php` (77 lines)
- `apps/hosted-services/app/Repositories/MailboxRepository.php` (87 lines)
- `apps/hosted-services/app/Repositories/PortingRequestRepository.php` (108 lines)
- `apps/hosted-services/app/Services/Dns/DnsRecordData.php` (96 lines)

## apps/hosted-services/app/Models/DnsRecord.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/DnsRecord.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\DnsRecordType;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string        $id
 * @property string        $hosted_domain_id
 * @property string        $name        Fully qualified, lower case, no trailing dot.
 * @property DnsRecordType $type
 * @property string        $value
 * @property int           $ttl
 * @property int|null      $priority    MX / SRV.
 * @property int|null      $weight      SRV.
 * @property int|null      $port        SRV.
 * @property bool          $system_managed  Created by the platform; read-only to customers.
 * @property string|null   $created_by
 */
class DnsRecord extends BaseModel
{
    protected $table = 'dns_records';

    protected $fillable = [
        'hosted_domain_id',
        'name',
        'type',
        'value',
        'ttl',
        'priority',
        'weight',
        'port',
        'system_managed',
        'created_by',
    ];

    protected $casts = [
        'type' => DnsRecordType::class,
        'ttl' => 'integer',
        'priority' => 'integer',
        'weight' => 'integer',
        'port' => 'integer',
        'system_managed' => 'boolean',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function hostedDomain(): BelongsTo
    {
        return $this->belongsTo(HostedDomain::class);
    }
}
```

## apps/hosted-services/app/Models/EmailDomain.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/EmailDomain.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ProvisioningStatus;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A mail domain on the hosted email platform. Storage is pooled at domain
 * level according to the plan, plus purchased add-on blocks.
 *
 * @property string             $id
 * @property string             $account_id
 * @property string             $domain
 * @property string             $plan_code
 * @property int                $addon_blocks
 * @property bool               $mx_verified
 * @property ProvisioningStatus $status
 * @property string|null        $external_ref
 */
class EmailDomain extends BaseModel
{
    protected $table = 'email_domains';

    protected $fillable = ['account_id', 'domain', 'plan_code', 'addon_blocks', 'mx_verified', 'status', 'external_ref'];

    protected $casts = [
        'status' => ProvisioningStatus::class,
        'addon_blocks' => 'integer',
        'mx_verified' => 'boolean',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function mailboxes(): HasMany
    {
        return $this->hasMany(Mailbox::class);
    }

    public function aliases(): HasMany
    {
        return $this->hasMany(MailAlias::class);
    }
}
```

## apps/hosted-services/app/Models/Extension.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/Extension.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ProvisioningStatus;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A hosted PBX extension (user seat) on an account.
 *
 * @property string             $id
 * @property string             $account_id
 * @property string             $number            Short dial number, e.g. "2001".
 * @property string             $display_name
 * @property string|null        $email
 * @property string|null        $caller_id_number_id
 * @property bool               $do_not_disturb
 * @property ProvisioningStatus $status
 * @property string|null        $external_ref
 */
class Extension extends BaseModel
{
    protected $table = 'extensions';

    protected $fillable = [
        'account_id',
        'number',
        'display_name',
        'email',
        'caller_id_number_id',
        'do_not_disturb',
        'status',
        'external_ref',
    ];

    protected $casts = [
        'status' => ProvisioningStatus::class,
        'do_not_disturb' => 'boolean',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function callerIdNumber(): BelongsTo
    {
        return $this->belongsTo(HostedNumber::class, 'caller_id_number_id');
    }

    public function forwardingRules(): HasMany
    {
        return $this->hasMany(CallForwardingRule::class);
    }

    public function voicemailBox(): HasOne
    {
        return $this->hasOne(VoicemailBox::class);
    }

    public function directNumbers(): HasMany
    {
        return $this->hasMany(HostedNumber::class);
    }
}
```

## apps/hosted-services/app/Models/HostedDomain.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/HostedDomain.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ProvisioningStatus;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A web hosting domain whose DNS zone Uniti serves authoritatively.
 *
 * @property string             $id
 * @property string             $account_id
 * @property string             $name
 * @property string             $hosting_plan
 * @property bool               $delegation_verified  Registrar NS points at Uniti.
 * @property int                $zone_serial
 * @property ProvisioningStatus $status
 * @property string|null        $external_ref
 */
class HostedDomain extends BaseModel
{
    protected $table = 'hosted_domains';

    protected $fillable = [
        'account_id',
        'name',
        'hosting_plan',
        'delegation_verified',
        'zone_serial',
        'status',
        'external_ref',
    ];

    protected $casts = [
        'status' => ProvisioningStatus::class,
        'delegation_verified' => 'boolean',
        'zone_serial' => 'integer',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function dnsRecords(): HasMany
    {
        return $this->hasMany(DnsRecord::class);
    }

    public function certificates(): HasMany
    {
        return $this->hasMany(SslCertificate::class);
    }
}
```

## apps/hosted-services/app/Models/HostedNumber.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/HostedNumber.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ProvisioningStatus;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A DID (direct inward dial) number held on an account, either allocated
 * from Uniti inventory or ported in from another carrier.
 *
 * @property string                  $id
 * @property string                  $account_id
 * @property string                  $e164
 * @property string|null             $label
 * @property ProvisioningStatus      $status
 * @property string|null             $extension_id
 * @property string|null             $porting_request_id
 * @property string|null             $external_ref
 * @property bool                    $emergency_address_verified
 */
class HostedNumber extends BaseModel
{
    protected $table = 'hosted_numbers';

    protected $fillable = [
        'account_id',
        'e164',
        'label',
        'status',
        'extension_id',
        'porting_request_id',
        'external_ref',
        'emergency_address_verified',
    ];

    protected $casts = [
        'status' => ProvisioningStatus::class,
        'emergency_address_verified' => 'boolean',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function extension(): BelongsTo
    {
        return $this->belongsTo(Extension::class);
    }

    public function portingRequest(): BelongsTo
    {
        return $this->belongsTo(PortingRequest::class);
    }

    public function isAssigned(): bool
    {
        return $this->extension_id !== null;
    }

    /**
     * A number may place outbound calls only once E911 address details are
     * verified; this is a regulatory requirement, not a product choice.
     */
    public function canBeOutboundCallerId(): bool
    {
        return $this->status === ProvisioningStatus::Active && $this->emergency_address_verified;
    }
}
```

## apps/hosted-services/app/Models/HuntGroup.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/HuntGroup.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\HuntGroupStrategy;
use App\Enums\ProvisioningStatus;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A ring group reachable by a pilot extension and optionally a DID.
 *
 * @property string             $id
 * @property string             $account_id
 * @property string             $name
 * @property string             $pilot_extension
 * @property string|null        $pilot_number_id
 * @property HuntGroupStrategy  $strategy
 * @property int                $ring_seconds
 * @property string             $no_answer_type     VOICEMAIL | EXTENSION | EXTERNAL | DISCONNECT
 * @property string|null        $no_answer_destination
 * @property ProvisioningStatus $status
 */
class HuntGroup extends BaseModel
{
    public const NO_ANSWER_TYPES = ['VOICEMAIL', 'EXTENSION', 'EXTERNAL', 'DISCONNECT'];

    protected $table = 'hunt_groups';

    protected $fillable = [
        'account_id',
        'name',
        'pilot_extension',
        'pilot_number_id',
        'strategy',
        'ring_seconds',
        'no_answer_type',
        'no_answer_destination',
        'status',
    ];

    protected $casts = [
        'strategy' => HuntGroupStrategy::class,
        'status' => ProvisioningStatus::class,
        'ring_seconds' => 'integer',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function members(): HasMany
    {
        return $this->hasMany(HuntGroupMember::class)->orderBy('position');
    }

    public function pilotNumber(): BelongsTo
    {
        return $this->belongsTo(HostedNumber::class, 'pilot_number_id');
    }
}
```

## apps/hosted-services/app/Models/HuntGroupMember.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/HuntGroupMember.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string   $id
 * @property string   $hunt_group_id
 * @property string   $extension_id
 * @property int      $position
 * @property int|null $ring_seconds  Overrides the group default when set.
 */
class HuntGroupMember extends BaseModel
{
    protected $table = 'hunt_group_members';

    protected $fillable = ['hunt_group_id', 'extension_id', 'position', 'ring_seconds'];

    protected $casts = [
        'position' => 'integer',
        'ring_seconds' => 'integer',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function huntGroup(): BelongsTo
    {
        return $this->belongsTo(HuntGroup::class);
    }

    public function extension(): BelongsTo
    {
        return $this->belongsTo(Extension::class);
    }
}
```

## apps/hosted-services/app/Models/MailAlias.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/MailAlias.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An address that delivers to one or more destinations (distribution list).
 *
 * @property string       $id
 * @property string       $email_domain_id
 * @property string       $local_part
 * @property list<string> $destinations
 * @property string|null  $description
 */
class MailAlias extends BaseModel
{
    protected $table = 'mail_aliases';

    protected $fillable = ['email_domain_id', 'local_part', 'destinations', 'description'];

    protected $casts = [
        'destinations' => 'array',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function emailDomain(): BelongsTo
    {
        return $this->belongsTo(EmailDomain::class);
    }
}
```

## apps/hosted-services/app/Models/Mailbox.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/Mailbox.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ProvisioningStatus;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string                       $id
 * @property string                       $account_id
 * @property string                       $email_domain_id
 * @property string                       $local_part
 * @property string                       $display_name
 * @property int                          $quota_mb
 * @property int                          $used_mb
 * @property \Carbon\CarbonImmutable|null $usage_synced_at
 * @property bool                         $forwarding_enabled
 * @property string|null                  $forwarding_address
 * @property bool                         $keep_forwarded_copy
 * @property ProvisioningStatus           $status
 * @property string|null                  $external_ref
 */
class Mailbox extends BaseModel
{
    protected $table = 'mailboxes';

    protected $fillable = [
        'account_id',
        'email_domain_id',
        'local_part',
        'display_name',
        'quota_mb',
        'used_mb',
        'usage_synced_at',
        'forwarding_enabled',
        'forwarding_address',
        'keep_forwarded_copy',
        'status',
        'external_ref',
    ];

    protected $casts = [
        'status' => ProvisioningStatus::class,
        'quota_mb' => 'integer',
        'used_mb' => 'integer',
        'usage_synced_at' => 'immutable_datetime',
        'forwarding_enabled' => 'boolean',
        'keep_forwarded_copy' => 'boolean',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function emailDomain(): BelongsTo
    {
        return $this->belongsTo(EmailDomain::class);
    }

    public function address(): string
    {
        return $this->local_part . '@' . $this->emailDomain->domain;
    }
}
```

## apps/hosted-services/app/Models/PortingEvent.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/PortingEvent.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\PortingStatus;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only audit trail of porting status changes.
 *
 * @property string                  $id
 * @property string                  $porting_request_id
 * @property PortingStatus|null      $from_status
 * @property PortingStatus           $to_status
 * @property string                  $actor        Subject id or "carrier".
 * @property string|null             $note
 * @property \Carbon\CarbonImmutable $occurred_at
 */
class PortingEvent extends BaseModel
{
    public const UPDATED_AT = null;

    protected $table = 'porting_events';

    protected $fillable = ['porting_request_id', 'from_status', 'to_status', 'actor', 'note', 'occurred_at'];

    protected $casts = [
        'from_status' => PortingStatus::class,
        'to_status' => PortingStatus::class,
        'occurred_at' => 'immutable_datetime',
        'created_at' => 'immutable_datetime',
    ];

    public function portingRequest(): BelongsTo
    {
        return $this->belongsTo(PortingRequest::class);
    }
}
```

## apps/hosted-services/app/Models/PortingRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/PortingRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\PortingStatus;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A request to port one or more numbers from another carrier into Uniti.
 *
 * @property string                          $id
 * @property string                          $account_id
 * @property PortingStatus                   $status
 * @property list<string>                    $numbers                  E.164 list.
 * @property string                          $losing_carrier
 * @property string                          $carrier_account_number
 * @property string|null                     $carrier_pin              Encrypted at rest.
 * @property string                          $billing_telephone_number
 * @property string                          $authorised_name
 * @property array<string, string>           $service_address
 * @property \Carbon\CarbonImmutable         $requested_port_date
 * @property \Carbon\CarbonImmutable|null    $foc_at
 * @property string|null                     $carrier_reference
 * @property string|null                     $rejection_reason
 * @property int                             $resubmission_count
 * @property string|null                     $loa_document_ref
 * @property string                          $created_by
 */
class PortingRequest extends BaseModel
{
    protected $table = 'porting_requests';

    protected $fillable = [
        'account_id',
        'status',
        'numbers',
        'losing_carrier',
        'carrier_account_number',
        'carrier_pin',
        'billing_telephone_number',
        'authorised_name',
        'service_address',
        'requested_port_date',
        'foc_at',
        'carrier_reference',
        'rejection_reason',
        'resubmission_count',
        'loa_document_ref',
        'created_by',
    ];

    protected $hidden = ['carrier_pin'];

    protected $casts = [
        'status' => PortingStatus::class,
        'numbers' => 'array',
        'service_address' => 'array',
        'carrier_pin' => 'encrypted',
        'requested_port_date' => 'immutable_date',
        'foc_at' => 'immutable_datetime',
        'resubmission_count' => 'integer',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function events(): HasMany
    {
        return $this->hasMany(PortingEvent::class)->orderBy('occurred_at');
    }
}
```

## apps/hosted-services/app/Models/SslCertificate.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/SslCertificate.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\CertificateStatus;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string                $id
 * @property string                $hosted_domain_id
 * @property string                $common_name
 * @property list<string>          $subject_alt_names
 * @property CertificateStatus     $status
 * @property bool                  $auto_renew
 * @property string|null           $issuer
 * @property string|null           $serial_number
 * @property CarbonImmutable|null  $not_before
 * @property CarbonImmutable|null  $not_after
 * @property string|null           $order_ref       Certificate authority order id.
 * @property array<string, string> $challenges      FQDN => TXT token for DNS-01.
 * @property CarbonImmutable|null  $validation_expires_at
 * @property string|null           $failure_reason
 * @property string|null           $renewed_from_id
 */
class SslCertificate extends BaseModel
{
    protected $table = 'ssl_certificates';

    protected $fillable = [
        'hosted_domain_id',
        'common_name',
        'subject_alt_names',
        'status',
        'auto_renew',
        'issuer',
        'serial_number',
        'not_before',
        'not_after',
        'order_ref',
        'challenges',
        'validation_expires_at',
        'failure_reason',
        'renewed_from_id',
    ];

    protected $casts = [
        'status' => CertificateStatus::class,
        'subject_alt_names' => 'array',
        'challenges' => 'array',
        'auto_renew' => 'boolean',
        'not_before' => 'immutable_datetime',
        'not_after' => 'immutable_datetime',
        'validation_expires_at' => 'immutable_datetime',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function hostedDomain(): BelongsTo
    {
        return $this->belongsTo(HostedDomain::class);
    }

    /**
     * Every name the certificate covers (CN first, de-duplicated).
     *
     * @return list<string>
     */
    public function allNames(): array
    {
        return array_values(array_unique([$this->common_name, ...($this->subject_alt_names ?? [])]));
    }

    public function daysUntilExpiry(CarbonImmutable $now): ?int
    {
        return $this->not_after === null ? null : (int) floor($now->diffInDays($this->not_after, false));
    }
}
```

## apps/hosted-services/app/Models/VoicemailBox.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/VoicemailBox.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string      $id
 * @property string      $extension_id
 * @property string      $pin_hash
 * @property string      $greeting_type        STANDARD | BUSY | UNAVAILABLE | NAME_ONLY
 * @property string|null $notification_email
 * @property bool        $attach_audio
 * @property bool        $delete_after_email
 * @property bool        $transcription_enabled
 * @property int         $max_message_seconds
 * @property int         $unread_count
 */
class VoicemailBox extends BaseModel
{
    public const GREETING_TYPES = ['STANDARD', 'BUSY', 'UNAVAILABLE', 'NAME_ONLY'];

    protected $table = 'voicemail_boxes';

    protected $fillable = [
        'extension_id',
        'pin_hash',
        'greeting_type',
        'notification_email',
        'attach_audio',
        'delete_after_email',
        'transcription_enabled',
        'max_message_seconds',
        'unread_count',
    ];

    protected $hidden = ['pin_hash'];

    protected $casts = [
        'attach_audio' => 'boolean',
        'delete_after_email' => 'boolean',
        'transcription_enabled' => 'boolean',
        'max_message_seconds' => 'integer',
        'unread_count' => 'integer',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function extension(): BelongsTo
    {
        return $this->belongsTo(Extension::class);
    }
}
```

## apps/hosted-services/app/Providers/AppServiceProvider.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Providers/AppServiceProvider.php`.

```php
<?php

declare(strict_types=1);

namespace App\Providers;

use App\Clients\CertificateAuthorityClient;
use App\Clients\MailPlatformClient;
use App\Clients\ProvisioningHttpClient;
use App\Clients\VoicePlatformClient;
use App\Clients\WebHostingClient;
use App\Exceptions\ProblemRenderer;
use App\Services\Dns\DnsRecordValidator;
use App\Services\Dns\DnsZoneService;
use App\Services\Hosting\SslCertificateService;
use App\Services\Mail\LocalPartPolicy;
use App\Services\Mail\MailAliasService;
use App\Services\Mail\MailboxService;
use App\Services\Mail\PasswordGenerator;
use App\Services\Mail\QuotaCalculator;
use App\Services\Porting\PortingStateMachine;
use App\Services\Voice\DialPlanPolicy;
use App\Services\Voice\ForwardingRuleValidator;
use App\Services\Voice\HuntGroupService;
use App\Services\Voice\VoicemailPinPolicy;
use App\Services\Voice\VoicemailService;
use App\Support\JwtDecoder;
use App\Support\SystemClock;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\ServiceProvider;
use Psr\Clock\ClockInterface;
use Psr\Log\LoggerInterface;
use RuntimeException;

/**
 * Wires services whose constructors take tunable scalars from
 * config/hosted.php and gives each provisioning client its own transport.
 * Classes without scalar arguments are left to container autowiring.
 */
final class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ClockInterface::class, SystemClock::class);
        $this->app->singleton(JwtDecoder::class, fn () => JwtDecoder::fromConfig((array) config('auth_jwt')));
        $this->app->singleton(ProblemRenderer::class, fn (Application $app) => new ProblemRenderer(
            logger: $app->make(LoggerInterface::class),
            debug: (bool) config('app.debug', false),
        ));

        $this->registerProvisioningClients();
        $this->registerVoice();
        $this->registerMail();
        $this->registerHostingAndPorting();
    }

    public function boot(): void
    {
        JsonResource::withoutWrapping();
    }

    private function registerProvisioningClients(): void
    {
        $platforms = [
            VoicePlatformClient::class => 'voice',
            MailPlatformClient::class => 'mail',
            WebHostingClient::class => 'webhosting',
            CertificateAuthorityClient::class => 'certificates',
        ];

        foreach ($platforms as $clientClass => $platform) {
            $this->app->singleton($clientClass, fn (Application $app) => new $clientClass($this->transportFor($app, $platform)));
        }
    }

    private function transportFor(Application $app, string $platform): ProvisioningHttpClient
    {
        $settings = (array) config("provisioning.$platform");
        $baseUrl = (string) ($settings['base_url'] ?? '');
        if ($baseUrl === '') {
            throw new RuntimeException(sprintf('Provisioning platform "%s" has no base URL configured.', $platform));
        }

        return new ProvisioningHttpClient(
            http: new GuzzleClient(['http_errors' => false]),
            logger: $app->make(LoggerInterface::class),
            platform: $platform,
            baseUrl: $baseUrl,
            apiKey: (string) ($settings['api_key'] ?? ''),
            timeoutSeconds: (float) config('provisioning.timeout_seconds', 10),
            maxRetries: (int) config('provisioning.max_retries', 2),
            backoffMs: (int) config('provisioning.retry_backoff_ms', 250),
        );
    }

    private function registerVoice(): void
    {
        $this->app->singleton(DialPlanPolicy::class, fn () => new DialPlanPolicy(
            minDigits: (int) config('hosted.voice.extension_min_digits'),
            maxDigits: (int) config('hosted.voice.extension_max_digits'),
            reserved: (array) config('hosted.voice.reserved_extensions'),
        ));
        $this->app->singleton(ForwardingRuleValidator::class, fn () => new ForwardingRuleValidator(
            noAnswerMinSeconds: (int) config('hosted.voice.forward_no_answer_seconds_min'),
            noAnswerMaxSeconds: (int) config('hosted.voice.forward_no_answer_seconds_max'),
            maxChainDepth: (int) config('hosted.voice.forward_max_chain_depth'),
        ));
        $this->app->singleton(VoicemailPinPolicy::class, fn () => new VoicemailPinPolicy(
            minLength: (int) config('hosted.voice.voicemail_pin_min_length'),
            maxLength: (int) config('hosted.voice.voicemail_pin_max_length'),
        ));
        $this->app->when(VoicemailService::class)
            ->needs('$maxMessageSeconds')
            ->giveConfig('hosted.voice.voicemail_max_message_seconds');
        $this->app->when(HuntGroupService::class)->needs('$maxMembers')->giveConfig('hosted.voice.hunt_group_max_members');
        $this->app->when(HuntGroupService::class)->needs('$ringSecondsMin')->giveConfig('hosted.voice.hunt_group_ring_seconds_min');
        $this->app->when(HuntGroupService::class)->needs('$ringSecondsMax')->giveConfig('hosted.voice.hunt_group_ring_seconds_max');
    }

    private function registerMail(): void
    {
        $this->app->singleton(QuotaCalculator::class, fn () => QuotaCalculator::fromConfig((array) config('hosted.mail')));
        $this->app->singleton(LocalPartPolicy::class, fn () => new LocalPartPolicy((array) config('hosted.mail.reserved_local_parts')));
        $this->app->singleton(PasswordGenerator::class, fn () => new PasswordGenerator());

        $this->app->when(MailboxService::class)->needs('$allowExternalForwarding')->giveConfig('hosted.mail.allow_external_forwarding');
        $this->app->when(MailboxService::class)->needs('$defaultQuotaMb')->giveConfig('hosted.mail.default_mailbox_quota_mb');
        $this->app->when(MailAliasService::class)->needs('$maxDestinations')->giveConfig('hosted.mail.max_alias_destinations');
        $this->app->when(MailAliasService::class)->needs('$allowExternalForwarding')->giveConfig('hosted.mail.allow_external_forwarding');
    }

    private function registerHostingAndPorting(): void
    {
        $this->app->singleton(DnsRecordValidator::class, fn () => new DnsRecordValidator(
            ttlMin: (int) config('hosted.dns.ttl_min'),
            ttlMax: (int) config('hosted.dns.ttl_max'),
            maxRecordsPerZone: (int) config('hosted.dns.max_records_per_zone'),
        ));
        $this->app->when(DnsZoneService::class)->needs('$defaultTtl')->giveConfig('hosted.dns.ttl_default');
        $this->app->when(SslCertificateService::class)->needs('$maxSans')->giveConfig('hosted.ssl.max_sans');
        $this->app->when(SslCertificateService::class)->needs('$renewalWindowDays')->giveConfig('hosted.ssl.renewal_window_days');

        $this->app->singleton(PortingStateMachine::class, fn () => new PortingStateMachine(
            cancelCutoffHours: (int) config('hosted.porting.cancel_cutoff_hours'),
            maxResubmissions: (int) config('hosted.porting.max_resubmissions'),
            maxNumbersPerRequest: (int) config('hosted.porting.max_numbers_per_request'),
            minLeadBusinessDays: (int) config('hosted.porting.min_lead_days'),
        ));
    }
}
```

## apps/hosted-services/app/Repositories/AccountScopedRepository.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Repositories/AccountScopedRepository.php`.

```php
<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Exceptions\ResourceNotFoundException;
use App\Models\BaseModel;
use App\Support\Page;
use Illuminate\Database\Eloquent\Builder;

/**
 * Base for repositories whose table carries an account_id column. Every
 * lookup is scoped by account so an id from another account is
 * indistinguishable from a missing one (no enumeration oracle).
 *
 * @template TModel of BaseModel
 */
abstract class AccountScopedRepository
{
    /**
     * @return class-string<TModel>
     */
    abstract protected function modelClass(): string;

    /**
     * Human-readable resource name used in 404 problems.
     */
    abstract protected function resourceName(): string;

    /**
     * @return Builder<TModel>
     */
    protected function query(): Builder
    {
        $class = $this->modelClass();

        return $class::query();
    }

    /**
     * @return Builder<TModel>
     */
    protected function forAccount(string $accountId): Builder
    {
        return $this->query()->where('account_id', $accountId);
    }

    /**
     * @return TModel
     */
    public function getForAccount(string $accountId, string $id): BaseModel
    {
        $model = $this->forAccount($accountId)->whereKey($id)->first();
        if ($model === null) {
            throw ResourceNotFoundException::of($this->resourceName(), $id);
        }

        return $model;
    }

    /**
     * @param TModel $model
     * @return TModel
     */
    public function save(BaseModel $model): BaseModel
    {
        $model->save();

        return $model;
    }

    /**
     * @param TModel $model
     */
    public function delete(BaseModel $model): void
    {
        $model->delete();
    }

    /**
     * @param Builder<TModel> $query
     * @return Page<TModel>
     */
    protected function paginate(Builder $query, int $page, int $pageSize): Page
    {
        $total = (clone $query)->count();
        $items = $query->forPage($page, $pageSize)->get()->all();

        return new Page(array_values($items), $page, $pageSize, $total);
    }
}
```

## apps/hosted-services/app/Repositories/EmailDomainRepository.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Repositories/EmailDomainRepository.php`.

```php
<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\ProvisioningStatus;
use App\Models\EmailDomain;
use App\Models\MailAlias;
use App\Models\Mailbox;
use App\Support\Page;

/**
 * @extends AccountScopedRepository<EmailDomain>
 */
class EmailDomainRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return EmailDomain::class;
    }

    protected function resourceName(): string
    {
        return 'Email domain';
    }

    /**
     * @return list<EmailDomain>
     */
    public function allForAccount(string $accountId): array
    {
        return $this->forAccount($accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->orderBy('domain')
            ->get()
            ->all();
    }

    public function domainExists(string $domain): bool
    {
        return $this->query()
            ->where('domain', strtolower($domain))
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->exists();
    }

    /**
     * Quota allocations used by the QuotaCalculator.
     *
     * @return list<array{quota_mb: int, used_mb: int}>
     */
    public function allocations(string $emailDomainId, ?string $excludeMailboxId = null): array
    {
        $query = Mailbox::query()
            ->where('email_domain_id', $emailDomainId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value);

        if ($excludeMailboxId !== null) {
            $query->whereKeyNot($excludeMailboxId);
        }

        return $query->get(['quota_mb', 'used_mb'])
            ->map(static fn (Mailbox $m) => ['quota_mb' => $m->quota_mb, 'used_mb' => $m->used_mb])
            ->all();
    }

    /**
     * Local parts already taken by a mailbox or alias on the domain.
     */
    public function isLocalPartTaken(string $emailDomainId, string $localPart, ?string $ignoreAliasId = null): bool
    {
        $mailbox = Mailbox::query()
            ->where('email_domain_id', $emailDomainId)
            ->where('local_part', $localPart)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->exists();

        if ($mailbox) {
            return true;
        }

        $aliasQuery = MailAlias::query()->where('email_domain_id', $emailDomainId)->where('local_part', $localPart);
        if ($ignoreAliasId !== null) {
            $aliasQuery->whereKeyNot($ignoreAliasId);
        }

        return $aliasQuery->exists();
    }

    /**
     * @return Page<MailAlias>
     */
    public function aliases(string $emailDomainId, int $page, int $pageSize): Page
    {
        $query = MailAlias::query()->where('email_domain_id', $emailDomainId)->orderBy('local_part');
        $total = (clone $query)->count();

        return new Page($query->forPage($page, $pageSize)->get()->all(), $page, $pageSize, $total);
    }

    public function findAlias(string $emailDomainId, string $aliasId): ?MailAlias
    {
        return MailAlias::query()->where('email_domain_id', $emailDomainId)->whereKey($aliasId)->first();
    }
}
```

## apps/hosted-services/app/Repositories/ExtensionRepository.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Repositories/ExtensionRepository.php`.

```php
<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\ProvisioningStatus;
use App\Models\CallForwardingRule;
use App\Models\Extension;
use App\Support\Page;
use Illuminate\Support\Facades\DB;

/**
 * @extends AccountScopedRepository<Extension>
 */
class ExtensionRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return Extension::class;
    }

    protected function resourceName(): string
    {
        return 'Extension';
    }

    /**
     * @return Page<Extension>
     */
    public function search(string $accountId, int $page, int $pageSize, ?string $query = null): Page
    {
        $builder = $this->forAccount($accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->with(['callerIdNumber', 'voicemailBox'])
            ->orderBy('number');

        if ($query !== null && $query !== '') {
            $builder->where(function ($q) use ($query): void {
                $q->where('number', 'like', $query . '%')
                    ->orWhere('display_name', 'like', '%' . $query . '%');
            });
        }

        return $this->paginate($builder, $page, $pageSize);
    }

    public function findByNumber(string $accountId, string $number): ?Extension
    {
        return $this->forAccount($accountId)
            ->where('number', $number)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->first();
    }

    /**
     * All short-dial numbers in use on the account (extensions and hunt
     * group pilots share one dial plan).
     *
     * @return list<string>
     */
    public function dialPlanNumbers(string $accountId): array
    {
        $extensions = $this->forAccount($accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->pluck('number')
            ->all();

        $pilots = DB::table('hunt_groups')
            ->where('account_id', $accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->pluck('pilot_extension')
            ->all();

        return array_values(array_unique(array_merge($extensions, $pilots)));
    }

    /**
     * Forwarding edges between extensions on the account, used for loop
     * detection: extension number => list of extension numbers it forwards to.
     *
     * @return array<string, list<string>>
     */
    public function internalForwardingGraph(string $accountId): array
    {
        $rows = DB::table('call_forwarding_rules as r')
            ->join('extensions as e', 'e.id', '=', 'r.extension_id')
            ->where('e.account_id', $accountId)
            ->where('r.enabled', true)
            ->where('r.destination_type', CallForwardingRule::DEST_EXTENSION)
            ->get(['e.number as source', 'r.destination as target']);

        $graph = [];
        foreach ($rows as $row) {
            $graph[(string) $row->source][] = (string) $row->target;
        }

        return $graph;
    }

    /**
     * @return list<CallForwardingRule>
     */
    public function forwardingRules(string $extensionId): array
    {
        return CallForwardingRule::query()
            ->where('extension_id', $extensionId)
            ->get()
            ->sortBy(static fn (CallForwardingRule $r) => $r->condition->precedence())
            ->values()
            ->all();
    }

    /**
     * @param list<array<string, mixed>> $rules
     */
    public function replaceForwardingRules(string $extensionId, array $rules): void
    {
        DB::transaction(function () use ($extensionId, $rules): void {
            CallForwardingRule::query()->where('extension_id', $extensionId)->delete();
            foreach ($rules as $rule) {
                CallForwardingRule::query()->create(['extension_id' => $extensionId] + $rule);
            }
        });
    }
}
```

## apps/hosted-services/app/Repositories/HostedDomainRepository.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Repositories/HostedDomainRepository.php`.

```php
<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\CertificateStatus;
use App\Enums\DnsRecordType;
use App\Enums\ProvisioningStatus;
use App\Exceptions\ResourceNotFoundException;
use App\Models\DnsRecord;
use App\Models\HostedDomain;
use App\Models\SslCertificate;
use App\Services\Dns\DnsRecordData;
use App\Support\Page;
use Carbon\CarbonImmutable;

/**
 * Web hosting domains plus their DNS records and certificates, which are
 * always accessed through the owning domain.
 *
 * @extends AccountScopedRepository<HostedDomain>
 */
class HostedDomainRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return HostedDomain::class;
    }

    protected function resourceName(): string
    {
        return 'Domain';
    }

    /**
     * @return Page<HostedDomain>
     */
    public function list(string $accountId, int $page, int $pageSize): Page
    {
        $query = $this->forAccount($accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->orderBy('name');

        return $this->paginate($query, $page, $pageSize);
    }

    public function nameExists(string $name): bool
    {
        return $this->query()
            ->where('name', $name)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->exists();
    }

    /**
     * @return Page<DnsRecord>
     */
    public function records(string $domainId, int $page, int $pageSize, ?DnsRecordType $type = null): Page
    {
        $query = DnsRecord::query()->where('hosted_domain_id', $domainId)->orderBy('name')->orderBy('type');
        if ($type !== null) {
            $query->where('type', $type->value);
        }
        $total = (clone $query)->count();

        return new Page($query->forPage($page, $pageSize)->get()->all(), $page, $pageSize, $total);
    }

    /**
     * @return list<DnsRecordData>
     */
    public function recordData(string $domainId): array
    {
        return DnsRecord::query()
            ->where('hosted_domain_id', $domainId)
            ->get()
            ->map(static fn (DnsRecord $r) => DnsRecordData::fromModel($r))
            ->all();
    }

    public function getRecord(string $domainId, string $recordId): DnsRecord
    {
        $record = DnsRecord::query()->where('hosted_domain_id', $domainId)->whereKey($recordId)->first();
        if ($record === null) {
            throw ResourceNotFoundException::of('DNS record', $recordId);
        }

        return $record;
    }

    public function deleteRecordsByName(string $domainId, string $name, DnsRecordType $type): int
    {
        return DnsRecord::query()
            ->where('hosted_domain_id', $domainId)
            ->where('name', $name)
            ->where('type', $type->value)
            ->delete();
    }

    /**
     * @return list<SslCertificate>
     */
    public function certificates(string $domainId): array
    {
        return SslCertificate::query()
            ->where('hosted_domain_id', $domainId)
            ->orderByDesc('created_at')
            ->get()
            ->all();
    }

    public function getCertificate(string $domainId, string $certificateId): SslCertificate
    {
        $certificate = SslCertificate::query()->where('hosted_domain_id', $domainId)->whereKey($certificateId)->first();
        if ($certificate === null) {
            throw ResourceNotFoundException::of('Certificate', $certificateId);
        }

        return $certificate;
    }

    /**
     * Issued, auto-renewing certificates expiring before the cut-off that
     * do not yet have a renewal in flight.
     *
     * @return list<SslCertificate>
     */
    public function certificatesDueForRenewal(CarbonImmutable $before): array
    {
        $inFlight = SslCertificate::query()
            ->whereNotNull('renewed_from_id')
            ->whereIn('status', [CertificateStatus::PendingValidation->value, CertificateStatus::Issued->value])
            ->select('renewed_from_id');

        return SslCertificate::query()
            ->where('status', CertificateStatus::Issued->value)
            ->where('auto_renew', true)
            ->where('not_after', '<', $before)
            ->whereNotIn('id', $inFlight)
            ->with('hostedDomain')
            ->get()
            ->all();
    }

    /**
     * @return list<SslCertificate>
     */
    public function pendingValidations(): array
    {
        return SslCertificate::query()
            ->where('status', CertificateStatus::PendingValidation->value)
            ->with('hostedDomain')
            ->get()
            ->all();
    }
}
```

## apps/hosted-services/app/Repositories/HostedNumberRepository.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Repositories/HostedNumberRepository.php`.

```php
<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\ProvisioningStatus;
use App\Models\HostedNumber;
use App\Support\Page;

/**
 * @extends AccountScopedRepository<HostedNumber>
 */
class HostedNumberRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return HostedNumber::class;
    }

    protected function resourceName(): string
    {
        return 'Number';
    }

    /**
     * @return Page<HostedNumber>
     */
    public function search(string $accountId, int $page, int $pageSize, ?string $status = null, ?bool $assigned = null, ?string $contains = null): Page
    {
        $query = $this->forAccount($accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->orderBy('e164');

        if ($status !== null) {
            $query->where('status', $status);
        }
        if ($assigned !== null) {
            $assigned ? $query->whereNotNull('extension_id') : $query->whereNull('extension_id');
        }
        if ($contains !== null && $contains !== '') {
            $query->where('e164', 'like', '%' . preg_replace('/\D+/', '', $contains) . '%');
        }

        return $this->paginate($query, $page, $pageSize);
    }

    public function findActiveByE164(string $e164): ?HostedNumber
    {
        return $this->query()
            ->where('e164', $e164)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->first();
    }

    /**
     * @param list<string> $e164s
     * @return list<string> The subset already held on any account.
     */
    public function existingNumbers(array $e164s): array
    {
        if ($e164s === []) {
            return [];
        }

        return $this->query()
            ->whereIn('e164', $e164s)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->pluck('e164')
            ->all();
    }

    /**
     * @return list<HostedNumber>
     */
    public function assignedTo(string $extensionId): array
    {
        return $this->query()->where('extension_id', $extensionId)->get()->all();
    }

    public function unassignAllFrom(string $extensionId): int
    {
        return $this->query()->where('extension_id', $extensionId)->update(['extension_id' => null]);
    }
}
```

## apps/hosted-services/app/Repositories/HuntGroupRepository.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Repositories/HuntGroupRepository.php`.

```php
<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\ProvisioningStatus;
use App\Models\HuntGroup;
use App\Models\HuntGroupMember;
use App\Support\Page;
use Illuminate\Support\Facades\DB;

/**
 * @extends AccountScopedRepository<HuntGroup>
 */
class HuntGroupRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return HuntGroup::class;
    }

    protected function resourceName(): string
    {
        return 'Hunt group';
    }

    /**
     * @return Page<HuntGroup>
     */
    public function list(string $accountId, int $page, int $pageSize): Page
    {
        $query = $this->forAccount($accountId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->with('members.extension')
            ->orderBy('name');

        return $this->paginate($query, $page, $pageSize);
    }

    /**
     * @param list<array{extension_id: string, ring_seconds: ?int}> $members In ring order.
     */
    public function saveWithMembers(HuntGroup $group, array $members): HuntGroup
    {
        return DB::transaction(function () use ($group, $members): HuntGroup {
            $group->save();
            HuntGroupMember::query()->where('hunt_group_id', $group->id)->delete();

            foreach ($members as $position => $member) {
                HuntGroupMember::query()->create([
                    'hunt_group_id' => $group->id,
                    'extension_id' => $member['extension_id'],
                    'ring_seconds' => $member['ring_seconds'],
                    'position' => $position + 1,
                ]);
            }

            return $group->load('members.extension');
        });
    }

    /**
     * Hunt groups an extension belongs to (blocks extension deletion).
     *
     * @return list<string> Group names.
     */
    public function groupNamesContaining(string $extensionId): array
    {
        return HuntGroup::query()
            ->whereIn('id', HuntGroupMember::query()->select('hunt_group_id')->where('extension_id', $extensionId))
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->pluck('name')
            ->all();
    }
}
```

## apps/hosted-services/app/Repositories/MailboxRepository.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Repositories/MailboxRepository.php`.

```php
<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\ProvisioningStatus;
use App\Models\Mailbox;
use App\Support\Page;
use Carbon\CarbonImmutable;

/**
 * @extends AccountScopedRepository<Mailbox>
 */
class MailboxRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return Mailbox::class;
    }

    protected function resourceName(): string
    {
        return 'Mailbox';
    }

    /**
     * @return Page<Mailbox>
     */
    public function listForDomain(string $accountId, string $emailDomainId, int $page, int $pageSize, ?string $search = null): Page
    {
        $query = $this->forAccount($accountId)
            ->where('email_domain_id', $emailDomainId)
            ->where('status', '!=', ProvisioningStatus::Deprovisioned->value)
            ->with('emailDomain')
            ->orderBy('local_part');

        if ($search !== null && $search !== '') {
            $query->where(function ($q) use ($search): void {
                $q->where('local_part', 'like', $search . '%')->orWhere('display_name', 'like', '%' . $search . '%');
            });
        }

        return $this->paginate($query, $page, $pageSize);
    }

    /**
     * Apply usage figures fetched from the mail platform in one pass.
     *
     * @param array<string, int> $usageByRef external_ref => used MB
     * @return int Mailboxes updated.
     */
    public function applyUsage(string $emailDomainId, array $usageByRef, CarbonImmutable $syncedAt): int
    {
        $updated = 0;
        $mailboxes = Mailbox::query()
            ->where('email_domain_id', $emailDomainId)
            ->whereIn('external_ref', array_keys($usageByRef))
            ->get();

        foreach ($mailboxes as $mailbox) {
            $mailbox->used_mb = $usageByRef[$mailbox->external_ref];
            $mailbox->usage_synced_at = $syncedAt;
            $mailbox->save();
            $updated++;
        }

        return $updated;
    }

    /**
     * Mailboxes at or above the warning threshold, for notification jobs.
     *
     * @return list<Mailbox>
     */
    public function nearQuota(int $warningPercent): array
    {
        return Mailbox::query()
            ->where('status', ProvisioningStatus::Active->value)
            ->where('quota_mb', '>', 0)
            ->whereRaw('used_mb * 100 >= quota_mb * ?', [$warningPercent])
            ->with('emailDomain')
            ->get()
            ->all();
    }
}
```

## apps/hosted-services/app/Repositories/PortingRequestRepository.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Repositories/PortingRequestRepository.php`.

```php
<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\PortingStatus;
use App\Models\PortingEvent;
use App\Models\PortingRequest;
use App\Support\Page;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * @extends AccountScopedRepository<PortingRequest>
 */
class PortingRequestRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return PortingRequest::class;
    }

    protected function resourceName(): string
    {
        return 'Porting request';
    }

    /**
     * @return Page<PortingRequest>
     */
    public function list(string $accountId, int $page, int $pageSize, ?PortingStatus $status = null): Page
    {
        $query = $this->forAccount($accountId)->orderByDesc('created_at');
        if ($status !== null) {
            $query->where('status', $status->value);
        }

        return $this->paginate($query, $page, $pageSize);
    }

    public function findByCarrierReference(string $reference): ?PortingRequest
    {
        return $this->query()->where('carrier_reference', $reference)->first();
    }

    /**
     * Numbers that are already part of an in-flight port on any account.
     *
     * @param list<string> $numbers
     * @return list<string>
     */
    public function numbersInFlight(array $numbers, ?string $excludeRequestId = null): array
    {
        $open = [
            PortingStatus::Submitted->value,
            PortingStatus::PendingFoc->value,
            PortingStatus::FocReceived->value,
        ];

        $query = $this->query()->whereIn('status', $open);
        if ($excludeRequestId !== null) {
            $query->whereKeyNot($excludeRequestId);
        }

        $inFlight = [];
        foreach ($query->get(['id', 'numbers']) as $request) {
            foreach ($request->numbers as $number) {
                $inFlight[$number] = true;
            }
        }

        return array_values(array_filter($numbers, static fn (string $n) => isset($inFlight[$n])));
    }

    /**
     * Persist the new status together with its audit event, atomically.
     *
     * @param array<string, mixed> $changes Extra columns to update.
     */
    public function recordTransition(
        PortingRequest $request,
        PortingStatus $to,
        string $actor,
        ?string $note,
        CarbonImmutable $at,
        array $changes = [],
    ): PortingRequest {
        return DB::transaction(function () use ($request, $to, $actor, $note, $at, $changes): PortingRequest {
            $from = $request->status;
            $request->fill($changes);
            $request->status = $to;
            $request->save();

            PortingEvent::query()->create([
                'porting_request_id' => $request->id,
                'from_status' => $from,
                'to_status' => $to,
                'actor' => $actor,
                'note' => $note,
                'occurred_at' => $at,
            ]);

            return $request;
        });
    }
}
```

## apps/hosted-services/app/Services/Dns/DnsRecordData.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Services/Dns/DnsRecordData.php`.

```php
<?php

declare(strict_types=1);

namespace App\Services\Dns;

use App\Enums\DnsRecordType;
use App\Models\DnsRecord;

/**
 * Immutable DNS record value used by the validator, zone serializer and
 * provisioning client, independent of persistence.
 */
final class DnsRecordData
{
    public function __construct(
        public readonly string $name,
        public readonly DnsRecordType $type,
        public readonly string $value,
        public readonly int $ttl,
        public readonly ?int $priority = null,
        public readonly ?int $weight = null,
        public readonly ?int $port = null,
        public readonly ?string $id = null,
    ) {
    }

    /**
     * @param array<string, mixed> $input Validated request payload.
     */
    public static function fromArray(array $input, int $defaultTtl): self
    {
        return new self(
            name: (string) ($input['name'] ?? '@'),
            type: DnsRecordType::from(strtoupper((string) $input['type'])),
            value: (string) $input['value'],
            ttl: isset($input['ttl']) ? (int) $input['ttl'] : $defaultTtl,
            priority: isset($input['priority']) ? (int) $input['priority'] : null,
            weight: isset($input['weight']) ? (int) $input['weight'] : null,
            port: isset($input['port']) ? (int) $input['port'] : null,
            id: isset($input['id']) ? (string) $input['id'] : null,
        );
    }

    public static function fromModel(DnsRecord $record): self
    {
        return new self(
            name: $record->name,
            type: $record->type,
            value: $record->value,
            ttl: $record->ttl,
            priority: $record->priority,
            weight: $record->weight,
            port: $record->port,
            id: $record->id,
        );
    }

    public function with(string $name, string $value): self
    {
        return new self($name, $this->type, $value, $this->ttl, $this->priority, $this->weight, $this->port, $this->id);
    }

    /**
     * Identity used for duplicate detection: two records are the same RR if
     * name, type and rdata match (TTL differences do not make a new record).
     */
    public function identity(): string
    {
        return implode('|', [
            $this->name,
            $this->type->value,
            $this->priority ?? '',
            $this->weight ?? '',
            $this->port ?? '',
            strtolower($this->value),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function toAttributes(): array
    {
        return [
            'name' => $this->name,
            'type' => $this->type,
            'value' => $this->value,
            'ttl' => $this->ttl,
            'priority' => $this->priority,
            'weight' => $this->weight,
            'port' => $this->port,
        ];
    }
}
```
