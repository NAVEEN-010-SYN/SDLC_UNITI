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
            delegatedAccounts: $this->stringList($delegated),
        );
    }

    /**
     * @return list<string>
     */
    private function stringList(mixed $raw): array
    {
        if (!is_array($raw)) {
            return [];
        }

        $result = [];
        foreach ($raw as $item) {
            if (is_string($item)) {
                $result[] = $item;
            }
        }

        return $result;
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
