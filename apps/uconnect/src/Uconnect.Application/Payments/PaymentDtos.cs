using FluentValidation;
using Uconnect.Application.Common;
using Uconnect.Domain.Payments;

namespace Uconnect.Application.Payments;

public sealed record PaymentDto(
    Guid Id,
    string? InvoiceNumber,
    MoneyDto Amount,
    MoneyDto RefundedAmount,
    string Status,
    string Channel,
    string? FailureCode,
    string? FailureMessage,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt);

/// <summary>Pays (part of) an invoice with a saved method. The amount must not exceed the balance due.</summary>
public sealed record PayInvoiceRequest(Guid PaymentMethodId, MoneyDto? Amount);

public sealed record RefundPaymentRequest(MoneyDto? Amount, string Reason);

public sealed record PaymentMethodDto(
    Guid Id,
    string Type,
    string Masked,
    string Label,
    string Last4,
    int? ExpiryMonth,
    int? ExpiryYear,
    bool IsDefault,
    bool IsExpired,
    bool ExpiresSoon,
    bool UsedByAutopay);

/// <summary>Registers a card or direct-debit mandate the browser has already tokenised with the gateway.</summary>
public sealed record AddPaymentMethodRequest(string PaymentToken, bool MakeDefault);

public sealed record AutopayDto(
    bool Enabled,
    Guid? PaymentMethodId,
    int DaysBeforeDue,
    MoneyDto? MaxAmount,
    int ConsecutiveFailures,
    DateTimeOffset? SuspendedAt);

public sealed record UpdateAutopayRequest(bool Enabled, Guid? PaymentMethodId, int DaysBeforeDue, MoneyDto? MaxAmount);

public sealed record AutopayRunSummary(int InvoicesEvaluated, int Charged, int Declined, int Skipped, int Errors);

/// <summary>The gateway declined a charge. Maps to 402 with the gateway's failure code.</summary>
public sealed class PaymentDeclinedException : ApplicationExceptionBase
{
    public PaymentDeclinedException(Guid paymentId, string failureCode, string? failureMessage)
        : base("payment.declined", failureMessage ?? "Your payment was declined. Please try another payment method.")
    {
        PaymentId = paymentId;
        FailureCode = failureCode;
    }

    public Guid PaymentId { get; }

    public string FailureCode { get; }
}

public sealed class PayInvoiceRequestValidator : AbstractValidator<PayInvoiceRequest>
{
    public PayInvoiceRequestValidator()
    {
        RuleFor(r => r.PaymentMethodId).NotEmpty();
        RuleFor(r => r.Amount).PositiveMoney();
    }
}

public sealed class RefundPaymentRequestValidator : AbstractValidator<RefundPaymentRequest>
{
    public RefundPaymentRequestValidator()
    {
        RuleFor(r => r.Amount).PositiveMoney();
        RuleFor(r => r.Reason).NotEmpty().MaximumLength(300).SafeText(300);
    }
}

public sealed class AddPaymentMethodRequestValidator : AbstractValidator<AddPaymentMethodRequest>
{
    public AddPaymentMethodRequestValidator()
    {
        RuleFor(r => r.PaymentToken).NotEmpty().MaximumLength(128).Matches("^[A-Za-z0-9_-]+$")
            .WithMessage("Payment token is not in the expected format.");
    }
}

public sealed class UpdateAutopayRequestValidator : AbstractValidator<UpdateAutopayRequest>
{
    public UpdateAutopayRequestValidator()
    {
        RuleFor(r => r.PaymentMethodId).NotEmpty().When(r => r.Enabled)
            .WithMessage("Choose the payment method autopay should use.");
        RuleFor(r => r.DaysBeforeDue).InclusiveBetween(0, 10);
        RuleFor(r => r.MaxAmount).PositiveMoney().When(r => r.MaxAmount is not null);
    }
}

internal static class PaymentMapping
{
    /// <summary>Cards expiring within this many days are flagged so the customer can replace them in time.</summary>
    public const int ExpiryWarningDays = 45;

    public static PaymentDto ToDto(this Payment payment, string? invoiceNumber) => new(
        payment.Id,
        invoiceNumber,
        payment.Amount.ToDto(),
        payment.RefundedAmount.ToDto(),
        payment.Status.ToString(),
        payment.Channel.ToString(),
        payment.FailureCode,
        payment.FailureMessage,
        payment.CreatedAt,
        payment.CompletedAt);

    public static PaymentMethodDto ToDto(this PaymentMethod method, DateOnly today, AutopaySettings? autopay) => new(
        method.Id,
        method.Type.ToString(),
        method.Masked,
        method.DisplayLabel,
        method.Last4,
        method.ExpiryMonth,
        method.ExpiryYear,
        method.IsDefault,
        method.IsExpired(today),
        method.ExpiresWithin(today, ExpiryWarningDays),
        autopay is { Enabled: true } && autopay.PaymentMethodId == method.Id);

    public static AutopayDto ToDto(this AutopaySettings? settings) => settings is null
        ? new AutopayDto(false, null, 3, null, 0, null)
        : new AutopayDto(
            settings.Enabled,
            settings.PaymentMethodId,
            settings.DaysBeforeDue,
            settings.MaxAmount.ToDtoOrNull(),
            settings.ConsecutiveFailures,
            settings.SuspendedAt);
}
