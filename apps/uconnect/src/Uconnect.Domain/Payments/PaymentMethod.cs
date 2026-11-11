using Uconnect.Domain.Common;

namespace Uconnect.Domain.Payments;

/// <summary>
/// A stored, tokenised way to pay. Card numbers and bank details never reach this system: the
/// browser tokenises them with the payment gateway and only the token and display data are kept.
/// </summary>
public sealed class PaymentMethod : AggregateRoot
{
    private PaymentMethod()
    {
    }

    private PaymentMethod(
        Guid id,
        Guid accountId,
        PaymentMethodType type,
        string gatewayToken,
        string displayLabel,
        string last4,
        int? expiryMonth,
        int? expiryYear,
        DateTimeOffset createdAt)
        : base(id)
    {
        AccountId = accountId;
        Type = type;
        GatewayToken = Guard.NotBlank(gatewayToken, "payment_method.token", 128);
        DisplayLabel = Guard.NotBlank(displayLabel, "payment_method.label", 60);
        if (last4.Length != 4 || !last4.All(char.IsDigit))
        {
            throw new DomainException("payment_method.last4", "Last four digits must be exactly four digits.");
        }

        Last4 = last4;
        ExpiryMonth = expiryMonth;
        ExpiryYear = expiryYear;
        CreatedAt = createdAt;
    }

    public Guid AccountId { get; private set; }

    public PaymentMethodType Type { get; private set; }

    /// <summary>Opaque gateway token; never shown to users.</summary>
    public string GatewayToken { get; private set; } = string.Empty;

    /// <summary>E.g. card brand ("Visa") or bank name.</summary>
    public string DisplayLabel { get; private set; } = string.Empty;

    public string Last4 { get; private set; } = string.Empty;

    public int? ExpiryMonth { get; private set; }

    public int? ExpiryYear { get; private set; }

    public bool IsDefault { get; private set; }

    public bool IsRemoved { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public static PaymentMethod CreateCard(
        Guid id, Guid accountId, string gatewayToken, string brand, string last4, int expiryMonth, int expiryYear, DateOnly today, DateTimeOffset now)
    {
        Guard.InRange(expiryMonth, 1, 12, "payment_method.expiry_month");
        Guard.InRange(expiryYear, 2000, 2100, "payment_method.expiry_year");
        var method = new PaymentMethod(id, accountId, PaymentMethodType.Card, gatewayToken, brand, last4, expiryMonth, expiryYear, now);
        if (method.IsExpired(today))
        {
            throw new DomainException("payment_method.expired", "The card has expired.");
        }

        return method;
    }

    public static PaymentMethod CreateDirectDebit(Guid id, Guid accountId, string mandateToken, string bankName, string accountLast4, DateTimeOffset now) =>
        new(id, accountId, PaymentMethodType.DirectDebit, mandateToken, bankName, accountLast4, null, null, now);

    /// <summary>A card is valid through the last day of its expiry month.</summary>
    public bool IsExpired(DateOnly today)
    {
        if (Type != PaymentMethodType.Card || ExpiryMonth is null || ExpiryYear is null)
        {
            return false;
        }

        var firstInvalidDay = new DateOnly(ExpiryYear.Value, ExpiryMonth.Value, 1).AddMonths(1);
        return today >= firstInvalidDay;
    }

    /// <summary>True when the card expires within <paramref name="days"/> days.</summary>
    public bool ExpiresWithin(DateOnly today, int days) =>
        Type == PaymentMethodType.Card && !IsExpired(today) && IsExpired(today.AddDays(days));

    public bool IsUsable(DateOnly today) => !IsRemoved && !IsExpired(today);

    public void EnsureUsable(DateOnly today)
    {
        if (IsRemoved)
        {
            throw new DomainException("payment_method.removed", "This payment method has been removed.");
        }

        if (IsExpired(today))
        {
            throw new DomainException("payment_method.expired", "This payment method has expired.");
        }
    }

    internal void SetDefault(bool isDefault) => IsDefault = isDefault;

    internal void MarkRemoved()
    {
        IsRemoved = true;
        IsDefault = false;
    }

    public string Masked => Type == PaymentMethodType.Card
        ? $"{DisplayLabel} \u2022\u2022\u2022\u2022 {Last4} ({ExpiryMonth:00}/{ExpiryYear % 100:00})"
        : $"{DisplayLabel} Direct Debit \u2022\u2022\u2022\u2022 {Last4}";
}

/// <summary>
/// Rules spanning all payment methods on an account: exactly one default among the usable methods,
/// and the method backing autopay cannot be removed while autopay is on.
/// </summary>
public static class PaymentMethodWallet
{
    public const int MaxMethodsPerAccount = 5;

    public static void EnsureCanAdd(IReadOnlyCollection<PaymentMethod> existing)
    {
        if (existing.Count(m => !m.IsRemoved) >= MaxMethodsPerAccount)
        {
            throw new DomainException("payment_method.limit", $"An account can hold at most {MaxMethodsPerAccount} payment methods.");
        }
    }

    public static void MakeDefault(IReadOnlyCollection<PaymentMethod> methods, Guid methodId, DateOnly today)
    {
        var target = methods.FirstOrDefault(m => m.Id == methodId)
            ?? throw new DomainException("payment_method.not_found", "Payment method not found.");
        target.EnsureUsable(today);
        foreach (var method in methods)
        {
            method.SetDefault(method.Id == methodId);
        }
    }

    /// <summary>Removes a method; if it was the default, the newest remaining usable method is promoted.</summary>
    public static void Remove(IReadOnlyCollection<PaymentMethod> methods, Guid methodId, AutopaySettings? autopay, DateOnly today)
    {
        var target = methods.FirstOrDefault(m => m.Id == methodId && !m.IsRemoved)
            ?? throw new DomainException("payment_method.not_found", "Payment method not found.");

        if (autopay is { Enabled: true } && autopay.PaymentMethodId == methodId)
        {
            throw new DomainException("payment_method.in_use_by_autopay", "Choose another autopay method or turn autopay off before removing this one.");
        }

        var wasDefault = target.IsDefault;
        target.MarkRemoved();
        if (wasDefault)
        {
            var replacement = methods
                .Where(m => m.Id != methodId && m.IsUsable(today))
                .OrderByDescending(m => m.CreatedAt)
                .FirstOrDefault();
            replacement?.SetDefault(true);
        }
    }
}
