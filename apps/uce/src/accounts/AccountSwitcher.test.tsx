import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeAuth, Providers, testUser } from '../test/fakes';
import { AccountSwitcher } from './AccountSwitcher';

const businessUser = testUser({
  roles: ['BUSINESS_ADMIN'],
  defaultAccountId: 'ACC-00000002',
  accounts: [
    { accountId: 'ACC-00000002', name: 'Northern Depot' },
    { accountId: 'ACC-00000001', name: 'Head Office' },
    { accountId: 'ACC-00000003', name: 'ACC-00000003' },
  ],
});

describe('AccountSwitcher', () => {
  it('is hidden for single-account users', () => {
    render(
      <Providers>
        <AccountSwitcher />
      </Providers>,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('is hidden for consumers even if the token lists several accounts', () => {
    const auth = fakeAuth({ user: { ...businessUser, roles: ['CONSUMER'] } });
    render(
      <Providers auth={auth}>
        <AccountSwitcher />
      </Providers>,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('lists accounts alphabetically with the active one selected', () => {
    render(
      <Providers auth={fakeAuth({ user: businessUser })}>
        <AccountSwitcher />
      </Providers>,
    );
    const select = screen.getByRole('combobox', { name: /Account/ });
    expect(select).toHaveValue('ACC-00000002');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'ACC-00000003',
      'Head Office (ACC-00000001)',
      'Northern Depot (ACC-00000002)',
    ]);
  });

  it('switches the active account and reports it', async () => {
    const auth = fakeAuth({ user: businessUser });
    const onSwitch = vi.fn();
    render(
      <Providers auth={auth}>
        <AccountSwitcher onSwitch={onSwitch} />
      </Providers>,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'ACC-00000001');
    expect(auth.setActiveAccount).toHaveBeenCalledWith('ACC-00000001');
    expect(onSwitch).toHaveBeenCalledWith('ACC-00000001');
  });
});
