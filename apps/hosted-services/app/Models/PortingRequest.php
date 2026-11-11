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
