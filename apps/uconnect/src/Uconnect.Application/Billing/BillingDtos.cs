using FluentValidation;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Billing;

public sealed record InvoiceSummaryDto(
    string InvoiceNumber,
    string Status,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    DateOnly? IssuedOn,
    DateOnly? DueOn,
    MoneyDto Total,
    MoneyDto BalanceDue,
    int DaysOverdue);

public sealed record InvoiceLineDto(
    string Type,
    string Description,
    MoneyDto UnitAmount,
    int Quantity,
    MoneyDto Amount,
    bool Taxable,
    string? ServiceReference,
    DateOnly? ServicePeriodStart,
    DateOnly? ServicePeriodEnd);

public sealed record InvoiceDetailDto(
    InvoiceSummaryDto Summary,
    IReadOnlyList<InvoiceLineDto> Lines,
    MoneyDto Subtotal,
    MoneyDto TaxTotal,
    int TaxRateBasisPoints,
    MoneyDto AmountPaid,
    MoneyDto CreditCarriedForward,
    string? VoidReason,
    IReadOnlyList<PaymentDto> Payments);

/// <summary>What the account owes now: everything payable, the overdue part, and the next due date.</summary>
public sealed record AccountBalanceDto(
    MoneyDto Outstanding,
    MoneyDto Overdue,
    int PayableInvoiceCount,
    DateOnly? NextDueOn,
    string? NextDueInvoiceNumber);

public sealed record AdjustmentDto(
    Guid Id,
    string Reason,
    string Description,
    MoneyDto Amount,
    Guid? ServiceId,
    bool Billed,
    DateTimeOffset RaisedAt,
    string? ApprovalReference);

/// <summary>An agent-raised credit or charge. Credits are negative amounts.</summary>
public sealed record RaiseAdjustmentRequest(Guid? ServiceId, string Reason, string Description, MoneyDto? Amount, string? ApprovalReference);

public sealed record BillingRunSummary(DateOnly RunDate, int AccountsConsidered, int InvoicesIssued, int AlreadyBilled, int Errors);

public sealed record CollectionsRunSummary(int MarkedOverdue, int LateFeesRaised, int AccountsSuspended, int Errors);

public sealed class RaiseAdjustmentRequestValidator : AbstractValidator<RaiseAdjustmentRequest>
{
    /// <summary>Reasons an agent may raise by hand; the others are created only by automated policies.</summary>
    public static readonly IReadOnlySet<AdjustmentReason> AgentReasons = new HashSet<AdjustmentReason>
    {
        AdjustmentReason.Goodwill,
        AdjustmentReason.BillingCorrection,
        AdjustmentReason.EngineerCallOutFee,
    };

    public RaiseAdjustmentRequestValidator()
    {
        RuleFor(r => r.Reason)
            .Must(r => EnumParsing.TryParse<AdjustmentReason>(r, out var reason) && AgentReasons.Contains(reason))
            .WithMessage($"Reason must be one of: {string.Join(", ", AgentReasons)}.");
        RuleFor(r => r.Description).NotEmpty().MaximumLength(200).SafeText(200);
        RuleFor(r => r.Amount).NotNull()
            .Must(m => m is not null && m.AmountMinor != 0).WithMessage("Amount must not be zero.")
            .Must(m => m is not null && m.Currency is "GBP" or "USD" or "EUR").WithMessage("Currency is not supported.");
        RuleFor(r => r.ApprovalReference).MaximumLength(40).SafeText(40);
    }
}

internal static class BillingMapping
{
    public static InvoiceSummaryDto ToSummaryDto(this Invoice invoice, DateOnly today) => new(
        invoice.InvoiceNumber,
        invoice.Status.ToString(),
        invoice.PeriodStart,
        invoice.PeriodEnd,
        invoice.IssuedOn,
        invoice.DueOn,
        invoice.Total.ToDto(),
        invoice.BalanceDue.ToDto(),
        invoice.DaysOverdue(today));

    public static InvoiceLineDto ToDto(this InvoiceLine line, IReadOnlyDictionary<Guid, string> serviceReferences) => new(
        line.Type.ToString(),
        line.Description,
        line.UnitAmount.ToDto(),
        line.Quantity,
        line.Amount.ToDto(),
        line.Taxable,
        line.ServiceId is { } id ? serviceReferences.GetValueOrDefault(id) : null,
        line.ServicePeriodStart,
        line.ServicePeriodEnd);

    public static AdjustmentDto ToDto(this AccountAdjustment adjustment) => new(
        adjustment.Id,
        adjustment.Reason.ToString(),
        adjustment.Description,
        adjustment.Amount.ToDto(),
        adjustment.ServiceId,
        adjustment.IsBilled,
        adjustment.RaisedAt,
        adjustment.ApprovalReference);

    public static Money SumBalance(this IEnumerable<Invoice> invoices, string currency) =>
        invoices.Select(i => i.BalanceDue).Sum(currency);
}
