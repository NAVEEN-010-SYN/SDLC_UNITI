using Uconnect.Domain.Accounts;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.Services;

namespace Uconnect.Domain.PlanChanges;

/// <summary>A priced proposal for moving a service between plans. Nothing is persisted until accepted.</summary>
public sealed record PlanChangeQuote(
    Guid ServiceId,
    Guid FromPlanId,
    Guid ToPlanId,
    PlanChangeType ChangeType,
    DateOnly EffectiveOn,
    Money CurrentMonthlyPrice,
    Money NewMonthlyPrice,
    ProrationResult? Proration,
    Money EarlyTerminationFee,
    bool ResetsContract,
    DateOnly? ContractEndsOn)
{
    public Money MonthlyDifference => NewMonthlyPrice - CurrentMonthlyPrice;

    /// <summary>One-off amount that will appear on the next invoice as a result of the change.</summary>
    public Money OneOffTotal => (Proration?.Net ?? Money.Zero(NewMonthlyPrice.Currency)) + EarlyTerminationFee;
}

/// <summary>
/// Business rules for plan changes:
/// <list type="bullet">
/// <item>Upgrades take effect immediately (or on a requested future date) and are prorated for the
/// remainder of the current cycle. An upgrade onto a plan with a minimum term starts a new contract.</item>
/// <item>Downgrades and lateral moves take effect at the start of the next billing cycle, so no
/// proration is needed. A downgrade inside the minimum term incurs an early-change fee equal to the
/// monthly price difference for each remaining contract month, capped at <see cref="EarlyTerminationFeeCapMonths"/>.</item>
/// <item>The target plan must be active, of the same product type and sold to the account type.</item>
/// </list>
/// </summary>
public static class PlanChangePolicy
{
    /// <summary>Furthest in the future a customer may schedule an upgrade.</summary>
    public const int MaxScheduleAheadDays = 60;

    public const int EarlyTerminationFeeCapMonths = 12;

    public static PlanChangeQuote Quote(
        Account account,
        Service service,
        Plan currentPlan,
        Plan targetPlan,
        DateOnly today,
        DateOnly? requestedDate = null)
    {
        account.EnsureActive();
        if (service.AccountId != account.Id)
        {
            throw new DomainException("service.not_on_account", "The service does not belong to this account.");
        }

        if (service.Status != ServiceStatus.Active)
        {
            throw new DomainException("service.not_active", "Only active services can change plan.");
        }

        if (service.PendingPlanChangeId is not null)
        {
            throw new DomainException("service.plan_change_pending", "A plan change is already in progress for this service.");
        }

        if (!targetPlan.IsAvailableTo(account.Type))
        {
            throw new DomainException("plan.not_available", $"Plan {targetPlan.Code} is not available for this account.");
        }

        if (targetPlan.MonthlyPrice.Currency != account.Currency)
        {
            throw new DomainException("plan.currency_mismatch", "Plan is not priced in the account currency.");
        }

        var changeType = currentPlan.ClassifyChangeTo(targetPlan);
        var period = account.CurrentBillingPeriod(today);
        var zero = Money.Zero(account.Currency);

        if (changeType == PlanChangeType.Upgrade)
        {
            var effectiveOn = ResolveUpgradeDate(today, requestedDate);
            var prorationPeriod = BillingPeriod.Containing(effectiveOn, account.BillingDay);
            var proration = ProrationCalculator.Calculate(prorationPeriod, effectiveOn, service.MonthlyPrice, targetPlan.MonthlyPrice);
            var resets = targetPlan.MinimumTermMonths > 0;
            var contractEnds = resets ? effectiveOn.AddMonths(targetPlan.MinimumTermMonths) : service.ContractEndsOn;
            return new PlanChangeQuote(
                service.Id, currentPlan.Id, targetPlan.Id, changeType, effectiveOn,
                service.MonthlyPrice, targetPlan.MonthlyPrice, proration, zero, resets, contractEnds);
        }

        if (requestedDate is not null && requestedDate != period.End)
        {
            throw new DomainException(
                "plan_change.downgrade_date",
                $"Downgrades and lateral changes take effect at the start of the next billing cycle ({period.End:yyyy-MM-dd}).");
        }

        var etf = changeType == PlanChangeType.Downgrade
            ? EarlyTerminationFee(service, targetPlan, period.End)
            : zero;

        return new PlanChangeQuote(
            service.Id, currentPlan.Id, targetPlan.Id, changeType, period.End,
            service.MonthlyPrice, targetPlan.MonthlyPrice, null, etf, false, service.ContractEndsOn);
    }

    /// <summary>
    /// Fee for leaving the current price commitment early: (current price − new price) × remaining
    /// contract months, capped. Zero outside contract or when the new plan is not cheaper.
    /// </summary>
    public static Money EarlyTerminationFee(Service service, Plan targetPlan, DateOnly effectiveOn)
    {
        var zero = Money.Zero(service.MonthlyPrice.Currency);
        if (!service.IsInContract(effectiveOn))
        {
            return zero;
        }

        var difference = service.MonthlyPrice - targetPlan.MonthlyPrice;
        if (!difference.IsPositive)
        {
            return zero;
        }

        var months = Math.Min(service.RemainingContractMonths(effectiveOn), EarlyTerminationFeeCapMonths);
        return difference.Multiply(months);
    }

    private static DateOnly ResolveUpgradeDate(DateOnly today, DateOnly? requested)
    {
        if (requested is null)
        {
            return today;
        }

        if (requested < today)
        {
            throw new DomainException("plan_change.date_in_past", "The effective date cannot be in the past.");
        }

        if (requested.Value.DayNumber - today.DayNumber > MaxScheduleAheadDays)
        {
            throw new DomainException("plan_change.date_too_far", $"Upgrades can be scheduled at most {MaxScheduleAheadDays} days ahead.");
        }

        return requested.Value;
    }
}
