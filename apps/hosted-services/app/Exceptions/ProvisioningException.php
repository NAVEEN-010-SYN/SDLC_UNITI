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
