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
