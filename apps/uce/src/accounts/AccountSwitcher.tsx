import { ChangeEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { hasAnyRole, MULTI_ACCOUNT_ROLES } from '../auth/roles';

interface AccountSwitcherProps {
  onSwitch?: (accountId: string) => void;
}

/**
 * Lets multi-account business, partner and support users choose which billing
 * account the shell (and every API call, via X-Account-Id) acts on.
 * Hidden for single-account users.
 */
export function AccountSwitcher({ onSwitch }: AccountSwitcherProps) {
  const { user, activeAccountId, setActiveAccount } = useAuth();
  if (!user || user.accounts.length < 2 || !hasAnyRole(user.roles, MULTI_ACCOUNT_ROLES)) return null;

  const accounts = [...user.accounts].sort((a, b) => a.name.localeCompare(b.name));

  const change = (event: ChangeEvent<HTMLSelectElement>) => {
    const accountId = event.target.value;
    if (accountId === activeAccountId) return;
    setActiveAccount(accountId);
    onSwitch?.(accountId);
  };

  return (
    <label className="uce-account-switcher">
      <span>Account</span>
      <select value={activeAccountId} onChange={change}>
        {accounts.map((a) => (
          <option key={a.accountId} value={a.accountId}>
            {a.name === a.accountId ? a.accountId : `${a.name} (${a.accountId})`}
          </option>
        ))}
      </select>
    </label>
  );
}
