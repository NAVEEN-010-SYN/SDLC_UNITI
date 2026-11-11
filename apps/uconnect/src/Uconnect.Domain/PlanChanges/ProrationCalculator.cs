using Uconnect.Domain.Common;

namespace Uconnect.Domain.PlanChanges;

/// <summary>
/// Outcome of prorating a mid-cycle price change. Service is billed in advance, so the customer
/// has already paid the old price for the whole period: they receive a <see cref="Credit"/> for the
/// unused days at the old price and a <see cref="Charge"/> for the same days at the new price.
/// </summary>
public sealed record ProrationResult(
    Money Credit,
    Money Charge,
    int DaysRemaining,
    int DaysInPeriod,
    DateOnly EffectiveFrom,
    BillingPeriod Period)
{
    /// <summary>Charge minus credit; positive means the customer owes money.</summary>
    public Money Net => Charge - Credit;

    public bool IsEmpty => DaysRemaining == 0;
}

/// <summary>
/// Daily-rate proration: <c>amount x daysRemaining / daysInPeriod</c>, computed in integer minor
/// units and rounded half away from zero. Credit and charge are rounded independently so that each
/// invoice line stands on its own and can be explained to the customer.
/// </summary>
public static class ProrationCalculator
{
    public static ProrationResult Calculate(BillingPeriod period, DateOnly effectiveFrom, Money oldMonthlyPrice, Money newMonthlyPrice)
    {
        if (oldMonthlyPrice.Currency != newMonthlyPrice.Currency)
        {
            throw new DomainException("proration.currency_mismatch", "Old and new prices must share a currency.");
        }

        if (!period.Contains(effectiveFrom) && effectiveFrom != period.End)
        {
            throw new DomainException("proration.date_outside_period", $"{effectiveFrom:yyyy-MM-dd} is outside billing period {period}.");
        }

        var daysRemaining = period.DaysRemainingFrom(effectiveFrom);
        var totalDays = period.TotalDays;

        var credit = oldMonthlyPrice.MultiplyRatio(daysRemaining, totalDays);
        var charge = newMonthlyPrice.MultiplyRatio(daysRemaining, totalDays);

        return new ProrationResult(credit, charge, daysRemaining, totalDays, effectiveFrom, period);
    }

    /// <summary>
    /// Prorates a single recurring charge for a partial first or last period (activation or
    /// cancellation part-way through a cycle). <paramref name="from"/> is inclusive, <paramref name="until"/> exclusive.
    /// </summary>
    public static Money PartialPeriodCharge(BillingPeriod period, DateOnly from, DateOnly until, Money monthlyPrice)
    {
        var start = from < period.Start ? period.Start : from;
        var end = until > period.End ? period.End : until;
        if (end <= start)
        {
            return Money.Zero(monthlyPrice.Currency);
        }

        var days = end.DayNumber - start.DayNumber;
        return days == period.TotalDays ? monthlyPrice : monthlyPrice.MultiplyRatio(days, period.TotalDays);
    }
}
