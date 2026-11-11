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
