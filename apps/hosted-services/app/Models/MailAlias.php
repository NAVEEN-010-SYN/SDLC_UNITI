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
