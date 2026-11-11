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
