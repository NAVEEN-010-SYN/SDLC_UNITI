using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Accounts;

public sealed record AddressDto(string Line1, string? Line2, string Town, string Postcode, string CountryCode = "GB");

public sealed record AccountSummaryDto(string AccountNumber, string Name, string AccountType, string Status, string Role);

public sealed record AccountProfileDto(
    string AccountNumber,
    string Name,
    string AccountType,
    string Status,
    string BillingEmail,
    string? Phone,
    AddressDto BillingAddress,
    string Currency,
    int BillingDay,
    DateOnly CurrentPeriodStart,
    DateOnly CurrentPeriodEnd,
    bool PaperlessBilling,
    bool MarketingOptIn,
    bool OutageSmsAlerts,
    MoneyDto OutstandingBalance,
    DateTimeOffset CreatedAt);

public sealed record UpdateProfileRequest(string Name, string BillingEmail, string? Phone, AddressDto BillingAddress);

public sealed record UpdatePreferencesRequest(bool PaperlessBilling, bool MarketingOptIn, bool OutageSmsAlerts);

public sealed record ChangeBillingDayRequest(int BillingDay);

public sealed record AccountUserDto(Guid Id, string DisplayName, string Email, string Role, bool IsActive, DateTimeOffset InvitedAt);

public sealed record InviteUserRequest(string SubjectId, string Email, string DisplayName, string Role);

public sealed record ChangeUserRoleRequest(string Role);

internal static class AccountMapping
{
    public static AddressDto ToDto(this PostalAddress address) =>
        new(address.Line1, address.Line2, address.Town, address.Postcode, address.CountryCode);

    public static PostalAddress ToDomain(this AddressDto dto) =>
        new(dto.Line1, dto.Line2, dto.Town, dto.Postcode, string.IsNullOrWhiteSpace(dto.CountryCode) ? "GB" : dto.CountryCode);

    public static AccountProfileDto ToProfileDto(this Account account, Money outstanding, DateOnly today)
    {
        var period = account.CurrentBillingPeriod(today);
        return new AccountProfileDto(
            account.Number.Value,
            account.Name,
            account.Type.ToString(),
            account.Status.ToString(),
            account.BillingEmail.Value,
            account.Phone?.Value,
            account.BillingAddress.ToDto(),
            account.Currency,
            account.BillingDay,
            period.Start,
            period.End,
            account.PaperlessBilling,
            account.MarketingOptIn,
            account.OutageSmsAlerts,
            outstanding.ToDto(),
            account.CreatedAt);
    }

    public static AccountUserDto ToDto(this AccountUser user) =>
        new(user.Id, user.DisplayName, user.Email.Value, user.Role, user.IsActive, user.InvitedAt);
}
