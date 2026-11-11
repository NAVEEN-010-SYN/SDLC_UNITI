using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Sla;

/// <summary>
/// Service-credit terms per care level.
/// <list type="bullet">
/// <item>Fault credits: a percentage (bps) of monthly rental per started breach day, capped at a
/// percentage of monthly rental.</item>
/// <item>Late delivery credits: a fixed amount per working day an order completes after its
/// committed date, capped at a number of days.</item>
/// <item>Missed appointment: a fixed credit when the engineer fails to attend.</item>
/// </list>
/// </summary>
public sealed record ServiceCreditTerms(
    CareLevel CareLevel,
    int FaultCreditBpsPerBreachDay,
    int FaultCreditCapBps,
    long LateDeliveryPerDayMinor,
    int LateDeliveryMaxDays,
    long MissedAppointmentMinor);

public sealed record ServiceCredit(CreditKind Kind, Money Amount, int Units, string Basis)
{
    public static ServiceCredit None(CreditKind kind, string currency) => new(kind, Money.Zero(currency), 0, "no breach");
}

public enum CreditKind
{
    FaultRepair,
    LateDelivery,
    MissedAppointment,
}

public sealed class ServiceCreditCalculator
{
    private readonly IReadOnlyDictionary<CareLevel, ServiceCreditTerms> _terms;

    public ServiceCreditCalculator(IEnumerable<ServiceCreditTerms> terms)
    {
        _terms = terms.ToDictionary(t => t.CareLevel);
        foreach (var care in Enum.GetValues<CareLevel>())
        {
            if (!_terms.ContainsKey(care))
            {
                throw new DomainException("credit.terms_incomplete", $"No service credit terms for {care}.");
            }
        }
    }

    public static ServiceCreditCalculator Default() => new(new[]
    {
        new ServiceCreditTerms(CareLevel.Standard, 500, 5_000, 250, 60, 3_000),
        new ServiceCreditTerms(CareLevel.Enhanced, 1_000, 10_000, 500, 60, 4_500),
        new ServiceCreditTerms(CareLevel.Premium, 2_000, 20_000, 1_000, 90, 6_000),
    });

    public ServiceCreditTerms TermsFor(CareLevel careLevel) => _terms[careLevel];

    /// <summary>
    /// Credit for a fault repaired after its target. The overrun is measured in working time on the
    /// care level's calendar and converted to started breach days using the calendar's nominal day
    /// length (a 10-hour business day for Standard, 24 hours for Premium).
    /// </summary>
    public ServiceCredit ForFaultRepair(CareLevel careLevel, Money monthlyRental, TimeSpan overrun, TimeSpan nominalDayLength)
    {
        if (overrun <= TimeSpan.Zero || monthlyRental.MinorUnits <= 0)
        {
            return ServiceCredit.None(CreditKind.FaultRepair, monthlyRental.Currency);
        }

        if (nominalDayLength <= TimeSpan.Zero)
        {
            throw new DomainException("credit.invalid_day_length", "Nominal day length must be positive.");
        }

        var terms = _terms[careLevel];
        var breachDays = (int)Math.Ceiling(overrun.TotalMinutes / nominalDayLength.TotalMinutes);
        var uncapped = monthlyRental.PercentageOf(checked(terms.FaultCreditBpsPerBreachDay * breachDays));
        var cap = monthlyRental.PercentageOf(terms.FaultCreditCapBps);
        var amount = uncapped.Min(cap);
        var capped = amount.MinorUnits < uncapped.MinorUnits;

        var basis = $"{breachDays} breach day(s) x {terms.FaultCreditBpsPerBreachDay / 100m:0.##}% of monthly rental"
            + (capped ? $", capped at {terms.FaultCreditCapBps / 100m:0.##}%" : string.Empty);
        return new ServiceCredit(CreditKind.FaultRepair, amount, breachDays, basis);
    }

    /// <summary>Credit for an order that completed after its committed date.</summary>
    public ServiceCredit ForLateDelivery(CareLevel careLevel, int workingDaysLate, string currency)
    {
        if (workingDaysLate <= 0)
        {
            return ServiceCredit.None(CreditKind.LateDelivery, currency);
        }

        var terms = _terms[careLevel];
        var days = Math.Min(workingDaysLate, terms.LateDeliveryMaxDays);
        var amount = new Money(checked(terms.LateDeliveryPerDayMinor * days), currency);
        var basis = $"{days} working day(s) late x {terms.LateDeliveryPerDayMinor / 100m:0.00} {currency}"
            + (days < workingDaysLate ? $", capped at {terms.LateDeliveryMaxDays} days" : string.Empty);
        return new ServiceCredit(CreditKind.LateDelivery, amount, days, basis);
    }

    public ServiceCredit ForMissedAppointment(CareLevel careLevel, string currency)
    {
        var terms = _terms[careLevel];
        return new ServiceCredit(
            CreditKind.MissedAppointment,
            new Money(terms.MissedAppointmentMinor, currency),
            1,
            "engineer did not attend booked appointment");
    }
}
