<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\Role;

/**
 * The authenticated caller, built from validated JWT claims. Immutable and
 * attached to the request by the AuthenticateJwt middleware.
 */
final class Principal
{
    /**
     * @param list<Role>   $roles
     * @param list<string> $delegatedAccounts Accounts a partner may act on.
     */
    public function __construct(
        public readonly string $subject,
        public readonly array $roles,
        public readonly ?string $accountId,
        public readonly array $delegatedAccounts = [],
    ) {
    }

    public function hasRole(Role ...$roles): bool
    {
        foreach ($roles as $role) {
            if (in_array($role, $this->roles, true)) {
                return true;
            }
        }

        return false;
    }

    public function canManage(): bool
    {
        foreach ($this->roles as $role) {
            if ($role->canManage()) {
                return true;
            }
        }

        return false;
    }

    /**
     * Account scoping rule shared by every account-scoped route:
     * support agents see everything, partners see their delegated accounts,
     * business users see only their own account.
     */
    public function canAccessAccount(string $accountId): bool
    {
        if ($this->hasRole(Role::SupportAgent)) {
            return true;
        }

        if ($this->accountId !== null && hash_equals($this->accountId, $accountId)) {
            return true;
        }

        if ($this->hasRole(Role::PartnerAdmin, Role::PartnerAgent)) {
            return in_array($accountId, $this->delegatedAccounts, true);
        }

        return false;
    }

    /**
     * Identifier recorded in audit columns (created_by / updated_by).
     */
    public function auditId(): string
    {
        return $this->subject;
    }
}
