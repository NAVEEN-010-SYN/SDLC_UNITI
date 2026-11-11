using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Accounts;

/// <summary>Account profile, contact details, billing day and communication preferences.</summary>
public sealed class ProfileService
{
    private readonly AccountAccessGuard _guard;
    private readonly IAccountUserRepository _accountUsers;
    private readonly IInvoiceRepository _invoices;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<UpdateProfileRequest> _profileValidator;
    private readonly IValidator<ChangeBillingDayRequest> _billingDayValidator;
    private readonly ILogger<ProfileService> _logger;

    public ProfileService(
        AccountAccessGuard guard,
        IAccountUserRepository accountUsers,
        IInvoiceRepository invoices,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<UpdateProfileRequest> profileValidator,
        IValidator<ChangeBillingDayRequest> billingDayValidator,
        ILogger<ProfileService> logger)
    {
        _guard = guard;
        _accountUsers = accountUsers;
        _invoices = invoices;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _profileValidator = profileValidator;
        _billingDayValidator = billingDayValidator;
        _logger = logger;
    }

    /// <summary>Accounts the signed-in user can access, for the account switcher.</summary>
    public async Task<IReadOnlyList<AccountSummaryDto>> ListMyAccountsAsync(CancellationToken ct)
    {
        var memberships = await _accountUsers.ListAccountsForSubjectAsync(_currentUser.SubjectId, ct);
        return memberships
            .Where(m => m.Account.Status != AccountStatus.Closed)
            .OrderBy(m => m.Account.Name, StringComparer.OrdinalIgnoreCase)
            .Select(m => new AccountSummaryDto(m.Account.Number.Value, m.Account.Name, m.Account.Type.ToString(), m.Account.Status.ToString(), m.Role))
            .ToList();
    }

    public async Task<AccountProfileDto> GetAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var outstanding = await OutstandingBalanceAsync(account.Id, account.Currency, ct);
        return account.ToProfileDto(outstanding, _clock.Today);
    }

    public async Task<AccountProfileDto> UpdateAsync(string accountNumber, UpdateProfileRequest request, CancellationToken ct)
    {
        await _profileValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);

        var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : PhoneNumber.Create(request.Phone);
        if (phone is null && account.OutageSmsAlerts)
        {
            throw new RequestValidationException("phone", "A phone number is required while SMS outage alerts are switched on.");
        }

        account.UpdateContactDetails(
            request.Name,
            EmailAddress.Create(request.BillingEmail),
            phone,
            request.BillingAddress.ToDomain(),
            _clock.UtcNow);

        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation("Profile updated for account {AccountNumber} by {UserId}", account.Number, _currentUser.UserId);

        var outstanding = await OutstandingBalanceAsync(account.Id, account.Currency, ct);
        return account.ToProfileDto(outstanding, _clock.Today);
    }

    public async Task<AccountProfileDto> UpdatePreferencesAsync(string accountNumber, UpdatePreferencesRequest request, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        account.UpdatePreferences(request.PaperlessBilling, request.MarketingOptIn, request.OutageSmsAlerts);
        await _unitOfWork.SaveChangesAsync(ct);

        var outstanding = await OutstandingBalanceAsync(account.Id, account.Currency, ct);
        return account.ToProfileDto(outstanding, _clock.Today);
    }

    /// <summary>
    /// Moves the billing day. Refused while invoices are outstanding so the change cannot be used to
    /// push a due date back.
    /// </summary>
    public async Task<AccountProfileDto> ChangeBillingDayAsync(string accountNumber, ChangeBillingDayRequest request, CancellationToken ct)
    {
        await _billingDayValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);

        var outstanding = await OutstandingBalanceAsync(account.Id, account.Currency, ct);
        if (outstanding.IsPositive)
        {
            throw new ConflictException("account.balance_outstanding", "Please settle your outstanding balance before changing your billing day.");
        }

        var previousDay = account.BillingDay;
        account.ChangeBillingDay(request.BillingDay, _clock.UtcNow);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Billing day for {AccountNumber} changed from {PreviousDay} to {NewDay}",
            account.Number, previousDay, request.BillingDay);
        return account.ToProfileDto(outstanding, _clock.Today);
    }

    private async Task<Money> OutstandingBalanceAsync(Guid accountId, string currency, CancellationToken ct)
    {
        var payable = await _invoices.ListPayableAsync(accountId, ct);
        return payable.Select(i => i.BalanceDue).Sum(currency);
    }
}
