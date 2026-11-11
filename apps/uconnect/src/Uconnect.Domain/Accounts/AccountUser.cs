using Uconnect.Domain.Common;

namespace Uconnect.Domain.Accounts;

/// <summary>
/// Links an identity-provider subject to an account with a role. Consumer accounts have a single
/// <c>CONSUMER</c> user; business accounts have one or more <c>BUSINESS_ADMIN</c>s who manage
/// <c>BUSINESS_USER</c>s (read-only access to billing and services, may raise tickets).
/// </summary>
public sealed class AccountUser : Entity
{
    private AccountUser()
    {
    }

    public AccountUser(Guid id, Guid accountId, string subjectId, EmailAddress email, string displayName, string role, DateTimeOffset invitedAt)
        : base(id)
    {
        if (role is not (UserRoles.Consumer or UserRoles.BusinessAdmin or UserRoles.BusinessUser))
        {
            throw new DomainException("account_user.invalid_role", $"Role '{role}' cannot be granted on a customer account.");
        }

        AccountId = accountId;
        SubjectId = Guard.NotBlank(subjectId, "account_user.subject", 128);
        Email = email;
        DisplayName = Guard.NotBlank(displayName, "account_user.display_name", 120);
        Role = role;
        InvitedAt = invitedAt;
        IsActive = true;
    }

    public Guid AccountId { get; private set; }

    /// <summary>OIDC <c>sub</c> claim of the user.</summary>
    public string SubjectId { get; private set; } = string.Empty;

    public EmailAddress Email { get; private set; } = null!;

    public string DisplayName { get; private set; } = string.Empty;

    public string Role { get; private set; } = string.Empty;

    public bool IsActive { get; private set; }

    public DateTimeOffset InvitedAt { get; private set; }

    public DateTimeOffset? DeactivatedAt { get; private set; }

    public bool IsAdmin => Role is UserRoles.BusinessAdmin or UserRoles.Consumer;

    internal void ChangeRole(string role) => Role = role;

    internal void Deactivate(DateTimeOffset now)
    {
        IsActive = false;
        DeactivatedAt = now;
    }
}

/// <summary>Rules for managing the users of a business account.</summary>
public static class AccountUserDirectory
{
    public const int MaxUsersPerBusinessAccount = 50;

    public static AccountUser Invite(
        Account account,
        IReadOnlyCollection<AccountUser> existing,
        string subjectId,
        EmailAddress email,
        string displayName,
        string role,
        DateTimeOffset now)
    {
        account.EnsureActive();
        if (!account.IsBusiness)
        {
            throw new DomainException("account_user.consumer_single_user", "Consumer accounts cannot have additional users.");
        }

        if (role == UserRoles.Consumer)
        {
            throw new DomainException("account_user.invalid_role", "Business accounts use BUSINESS_ADMIN or BUSINESS_USER roles.");
        }

        var active = existing.Where(u => u.IsActive).ToList();
        if (active.Count >= MaxUsersPerBusinessAccount)
        {
            throw new DomainException("account_user.limit", $"A business account can have at most {MaxUsersPerBusinessAccount} users.");
        }

        if (active.Any(u => u.Email == email || string.Equals(u.SubjectId, subjectId, StringComparison.Ordinal)))
        {
            throw new DomainException("account_user.duplicate", "This person already has access to the account.");
        }

        return new AccountUser(Guid.NewGuid(), account.Id, subjectId, email, displayName, role, now);
    }

    public static void ChangeRole(IReadOnlyCollection<AccountUser> users, Guid userId, string newRole)
    {
        if (newRole is not (UserRoles.BusinessAdmin or UserRoles.BusinessUser))
        {
            throw new DomainException("account_user.invalid_role", "Business accounts use BUSINESS_ADMIN or BUSINESS_USER roles.");
        }

        var user = FindActive(users, userId);
        if (user.Role == UserRoles.BusinessAdmin && newRole != UserRoles.BusinessAdmin)
        {
            EnsureAnotherAdmin(users, userId);
        }

        user.ChangeRole(newRole);
    }

    public static void Remove(IReadOnlyCollection<AccountUser> users, Guid userId, DateTimeOffset now)
    {
        var user = FindActive(users, userId);
        if (user.Role == UserRoles.BusinessAdmin)
        {
            EnsureAnotherAdmin(users, userId);
        }

        user.Deactivate(now);
    }

    private static AccountUser FindActive(IReadOnlyCollection<AccountUser> users, Guid userId) =>
        users.FirstOrDefault(u => u.Id == userId && u.IsActive)
        ?? throw new DomainException("account_user.not_found", "User not found on this account.");

    private static void EnsureAnotherAdmin(IReadOnlyCollection<AccountUser> users, Guid excludingUserId)
    {
        if (!users.Any(u => u.IsActive && u.Id != excludingUserId && u.Role == UserRoles.BusinessAdmin))
        {
            throw new DomainException("account_user.last_admin", "A business account must keep at least one administrator.");
        }
    }
}
