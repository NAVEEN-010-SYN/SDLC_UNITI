using FluentValidation;
using Uconnect.Application.Common;
using Uconnect.Domain.PlanChanges;

namespace Uconnect.Application.PlanChanges;

public sealed record PlanChangeQuoteRequest(Guid ServiceId, string ToPlanCode, DateOnly? EffectiveOn);

/// <summary>Accepting a quote. <see cref="AcceptedNetAmountMinor"/> guards against prices moving between quote and accept.</summary>
public sealed record RequestPlanChangeRequest(Guid ServiceId, string ToPlanCode, DateOnly? EffectiveOn, long AcceptedNetAmountMinor, bool AcceptTerms);

public sealed record ProrationDto(MoneyDto Credit, MoneyDto Charge, MoneyDto Net, int DaysRemaining, int DaysInPeriod, DateOnly PeriodStart, DateOnly PeriodEnd);

public sealed record PlanChangeQuoteDto(
    Guid ServiceId,
    string FromPlanCode,
    string ToPlanCode,
    string ChangeType,
    DateOnly EffectiveOn,
    MoneyDto CurrentMonthlyPrice,
    MoneyDto NewMonthlyPrice,
    MoneyDto MonthlyDifference,
    ProrationDto? Proration,
    MoneyDto EarlyTerminationFee,
    MoneyDto OneOffTotal,
    bool ResetsContract,
    DateOnly? ContractEndsOn);

public sealed record PlanChangeDto(
    Guid Id,
    Guid ServiceId,
    string FromPlanCode,
    string ToPlanCode,
    string ChangeType,
    string Status,
    DateOnly EffectiveOn,
    MoneyDto NewMonthlyPrice,
    MoneyDto ProrationCredit,
    MoneyDto ProrationCharge,
    MoneyDto EarlyTerminationFee,
    string? FailureReason,
    DateTimeOffset RequestedAt,
    DateTimeOffset? CompletedAt,
    bool CanCancel);

public sealed class PlanChangeQuoteRequestValidator : AbstractValidator<PlanChangeQuoteRequest>
{
    public PlanChangeQuoteRequestValidator()
    {
        RuleFor(r => r.ServiceId).NotEmpty();
        RuleFor(r => r.ToPlanCode).NotEmpty().MaximumLength(40).Matches("^[A-Za-z0-9-]+$");
    }
}

public sealed class RequestPlanChangeRequestValidator : AbstractValidator<RequestPlanChangeRequest>
{
    public RequestPlanChangeRequestValidator()
    {
        RuleFor(r => r.ServiceId).NotEmpty();
        RuleFor(r => r.ToPlanCode).NotEmpty().MaximumLength(40).Matches("^[A-Za-z0-9-]+$");
        RuleFor(r => r.AcceptTerms).Equal(true).WithMessage("You must accept the plan change terms.");
    }
}

internal static class PlanChangeMapping
{
    public static PlanChangeQuoteDto ToDto(this PlanChangeQuote quote, string fromCode, string toCode) => new(
        quote.ServiceId,
        fromCode,
        toCode,
        quote.ChangeType.ToString(),
        quote.EffectiveOn,
        quote.CurrentMonthlyPrice.ToDto(),
        quote.NewMonthlyPrice.ToDto(),
        quote.MonthlyDifference.ToDto(),
        quote.Proration is { } p
            ? new ProrationDto(p.Credit.ToDto(), p.Charge.ToDto(), p.Net.ToDto(), p.DaysRemaining, p.DaysInPeriod, p.Period.Start, p.Period.End)
            : null,
        quote.EarlyTerminationFee.ToDto(),
        quote.OneOffTotal.ToDto(),
        quote.ResetsContract,
        quote.ContractEndsOn);

    public static PlanChangeDto ToDto(this PlanChange change, string fromCode, string toCode) => new(
        change.Id,
        change.ServiceId,
        fromCode,
        toCode,
        change.ChangeType.ToString(),
        change.Status.ToString(),
        change.EffectiveOn,
        change.NewMonthlyPrice.ToDto(),
        change.ProrationCredit.ToDto(),
        change.ProrationCharge.ToDto(),
        change.EarlyTerminationFee.ToDto(),
        change.FailureReason,
        change.RequestedAt,
        change.CompletedAt,
        change.Status is PlanChangeStatus.Requested or PlanChangeStatus.Scheduled);
}
