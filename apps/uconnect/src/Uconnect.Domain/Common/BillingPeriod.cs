namespace Uconnect.Domain.Common;

/// <summary>
/// A billing cycle expressed as a half-open date range <c>[Start, End)</c>. Monthly cycles are
/// anchored to the account's billing day (1..28), so every month has a valid anchor date.
/// </summary>
public sealed record BillingPeriod
{
    public BillingPeriod(DateOnly start, DateOnly end)
    {
        if (end <= start)
        {
            throw new DomainException("billing_period.invalid", "Billing period end must be after its start.");
        }

        Start = start;
        End = end;
    }

    /// <summary>First day of the period (inclusive).</summary>
    public DateOnly Start { get; }

    /// <summary>First day after the period (exclusive).</summary>
    public DateOnly End { get; }

    /// <summary>Last day of the period (inclusive).</summary>
    public DateOnly LastDay => End.AddDays(-1);

    public int TotalDays => End.DayNumber - Start.DayNumber;

    public bool Contains(DateOnly date) => date >= Start && date < End;

    /// <summary>Number of days from <paramref name="date"/> (inclusive) to the end of the period.</summary>
    public int DaysRemainingFrom(DateOnly date)
    {
        if (date <= Start)
        {
            return TotalDays;
        }

        return date >= End ? 0 : End.DayNumber - date.DayNumber;
    }

    /// <summary>
    /// Returns the cycle that contains <paramref name="date"/> for an account billed on
    /// <paramref name="billingDay"/> of each month.
    /// </summary>
    public static BillingPeriod Containing(DateOnly date, int billingDay)
    {
        Guard.InRange(billingDay, 1, 28, "billing_day");
        var anchorThisMonth = new DateOnly(date.Year, date.Month, billingDay);
        var start = date >= anchorThisMonth ? anchorThisMonth : anchorThisMonth.AddMonths(-1);
        return new BillingPeriod(start, start.AddMonths(1));
    }

    /// <summary>The cycle that starts where this one ends.</summary>
    public BillingPeriod Next() => new(End, End.AddMonths(1));

    /// <summary>The cycle that ends where this one starts.</summary>
    public BillingPeriod Previous() => new(Start.AddMonths(-1), Start);

    public override string ToString() => $"{Start:yyyy-MM-dd}..{LastDay:yyyy-MM-dd}";
}
