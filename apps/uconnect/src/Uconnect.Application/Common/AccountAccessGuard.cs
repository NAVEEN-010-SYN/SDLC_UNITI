using Uconnect.Application.Abstractions;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Common;

/// <summary>What the caller wants to do with an account.</summary>
public enum AccountPermission
{
    /// <summary>Read profile, services, invoices, usage, outages.</summary>
    View,

    /// <summary>Raise and comment on tickets, book visits.</summary>
    Support,

    /// <summary>Pay, manage payment methods and autopay, change plans, edit the profile.</summary>
    Manage,

    /// <summary>Manage other users on a business account.</summary>
    Administer,
}

/// <summary>
/// Resolves an account by number and verifies the caller may act on it. Customers must hold an
/// active <see cref="AccountUser"/> membership; support agents may access any account. A missing
/// membership is reported as "not found" so account numbers cannot be enumerated.
/// </summary>
public sealed class AccountAccessGuard
{
    private readonly IAccountRepository _accounts;
    private readonly IAccountUserRepository _accountUsers;
    private readonly ICurrentUser _currentUser;

    public AccountAccessGuard(IAccountRepository accounts, IAccountUserRepository accountUsers, ICurrentUser currentUser)
    {
        _accounts = accounts;
        _accountUsers = accountUsers;
        _currentUser = currentUser;
    }

    public async Task<Account> AuthorizeAsync(string accountNumber, AccountPermission permission, CancellationToken ct)
    {
        if (!_currentUser.IsAuthenticated)
        {
            throw new ForbiddenException("Authentication is required.");
        }

        if (!AccountNumber.TryParse(accountNumber, out var number))
        {
            throw new RequestValidationException("accountNumber", "Account number must look like ACC-12345678.");
        }

        var account = await _accounts.GetByNumberAsync(number!, ct).ConfigureAwait(false)
            ?? throw new NotFoundException("Account", number!.Value);

        if (_currentUser.IsSupportAgent)
        {
            return account;
        }

        var membership = await _accountUsers.FindActiveAsync(account.Id, _currentUser.SubjectId, ct).ConfigureAwait(false)
            ?? throw new NotFoundException("Account", number!.Value);

        if (!RoleAllows(membership.Role, permission))
        {
            throw new ForbiddenException($"Your role on account {number} does not allow this action.");
        }

        return account;
    }

    /// <summary>Role → permission matrix for customer roles.</summary>
    public static bool RoleAllows(string role, AccountPermission permission) => role switch
    {
        UserRoles.Consumer => permission != AccountPermission.Administer,
        UserRoles.BusinessAdmin => true,
        UserRoles.BusinessUser => permission is AccountPermission.View or AccountPermission.Support,
        _ => false,
    };
}
