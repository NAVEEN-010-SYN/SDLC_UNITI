using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Accounts;

/// <summary>Business account administrators manage who else can access the account.</summary>
public sealed class AccountUserService
{
    private readonly AccountAccessGuard _guard;
    private readonly IAccountUserRepository _accountUsers;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<InviteUserRequest> _inviteValidator;
    private readonly IValidator<ChangeUserRoleRequest> _roleValidator;
    private readonly ILogger<AccountUserService> _logger;

    public AccountUserService(
        AccountAccessGuard guard,
        IAccountUserRepository accountUsers,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<InviteUserRequest> inviteValidator,
        IValidator<ChangeUserRoleRequest> roleValidator,
        ILogger<AccountUserService> logger)
    {
        _guard = guard;
        _accountUsers = accountUsers;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _inviteValidator = inviteValidator;
        _roleValidator = roleValidator;
        _logger = logger;
    }

    public async Task<IReadOnlyList<AccountUserDto>> ListAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Administer, ct);
        var users = await _accountUsers.ListByAccountAsync(account.Id, ct);
        return users
            .OrderByDescending(u => u.IsActive)
            .ThenBy(u => u.DisplayName, StringComparer.OrdinalIgnoreCase)
            .Select(u => u.ToDto())
            .ToList();
    }

    public async Task<AccountUserDto> InviteAsync(string accountNumber, InviteUserRequest request, CancellationToken ct)
    {
        await _inviteValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Administer, ct);
        var existing = await _accountUsers.ListByAccountAsync(account.Id, ct);

        var user = AccountUserDirectory.Invite(
            account, existing, request.SubjectId, EmailAddress.Create(request.Email), request.DisplayName, request.Role, _clock.UtcNow);
        _accountUsers.Add(user);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation("User {InvitedUserId} granted {Role} on {AccountNumber} by {UserId}", user.Id, user.Role, account.Number, _currentUser.UserId);
        return user.ToDto();
    }

    public async Task<AccountUserDto> ChangeRoleAsync(string accountNumber, Guid userId, ChangeUserRoleRequest request, CancellationToken ct)
    {
        await _roleValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Administer, ct);
        var users = await _accountUsers.ListByAccountAsync(account.Id, ct);

        EnsureNotSelf(users, userId, "change your own role");
        AccountUserDirectory.ChangeRole(users, userId, request.Role);
        await _unitOfWork.SaveChangesAsync(ct);
        return users.First(u => u.Id == userId).ToDto();
    }

    public async Task RemoveAsync(string accountNumber, Guid userId, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Administer, ct);
        var users = await _accountUsers.ListByAccountAsync(account.Id, ct);

        EnsureNotSelf(users, userId, "remove yourself");
        AccountUserDirectory.Remove(users, userId, _clock.UtcNow);
        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation("User {RemovedUserId} removed from {AccountNumber} by {UserId}", userId, account.Number, _currentUser.UserId);
    }

    private void EnsureNotSelf(IReadOnlyList<AccountUser> users, Guid targetUserId, string action)
    {
        var target = users.FirstOrDefault(u => u.Id == targetUserId);
        if (target is not null && string.Equals(target.SubjectId, _currentUser.SubjectId, StringComparison.Ordinal))
        {
            throw new ConflictException("account_user.self_change", $"You cannot {action}; ask another administrator.");
        }
    }
}
