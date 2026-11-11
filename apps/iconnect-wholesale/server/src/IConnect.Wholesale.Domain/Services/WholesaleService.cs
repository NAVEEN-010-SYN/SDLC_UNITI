using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Domain.Services;

/// <summary>
/// An active wholesale line delivered to a partner at a premise. Product changes are recorded
/// as dated rental periods so that monthly statements can pro-rate each rate correctly.
/// </summary>
public sealed class WholesaleService : Entity
{
    private readonly List<RentalPeriod> _rentalPeriods = new();

    private WholesaleService()
    {
    }

    public WholesaleService(string reference, Guid partnerId, string uprn, string productCode, CareLevel careLevel,
        Money monthlyRental, DateOnly activatedOn)
    {
        Reference = reference;
        PartnerId = partnerId;
        Uprn = uprn;
        ProductCode = productCode;
        CareLevel = careLevel;
        MonthlyRental = monthlyRental;
        ActivatedOn = activatedOn;
        _rentalPeriods.Add(new RentalPeriod(productCode, monthlyRental.MinorUnits, monthlyRental.Currency, activatedOn, null));
    }

    public string Reference { get; private set; } = string.Empty;

    public Guid PartnerId { get; private set; }

    public string Uprn { get; private set; } = string.Empty;

    public string ProductCode { get; private set; } = string.Empty;

    public CareLevel CareLevel { get; private set; }

    public Money MonthlyRental { get; private set; }

    public DateOnly ActivatedOn { get; private set; }

    public DateOnly? CeasedOn { get; private set; }

    public IReadOnlyList<RentalPeriod> RentalPeriods => _rentalPeriods;

    public bool IsActive => CeasedOn is null;

    public void ChangeProduct(string productCode, CareLevel careLevel, Money monthlyRental, DateOnly effectiveFrom)
    {
        EnsureActive();
        if (effectiveFrom <= _rentalPeriods[^1].From)
        {
            throw new DomainException("service.change_before_current_period", "A product change must start after the current rental period.");
        }

        _rentalPeriods[^1] = _rentalPeriods[^1] with { To = effectiveFrom.AddDays(-1) };
        _rentalPeriods.Add(new RentalPeriod(productCode, monthlyRental.MinorUnits, monthlyRental.Currency, effectiveFrom, null));
        ProductCode = productCode;
        CareLevel = careLevel;
        MonthlyRental = monthlyRental;
    }

    /// <summary>Ceases the service; the cease date is the last billable day.</summary>
    public void Cease(DateOnly lastDay)
    {
        EnsureActive();
        if (lastDay < ActivatedOn)
        {
            throw new DomainException("service.cease_before_activation", "A service cannot cease before it was activated.");
        }

        CeasedOn = lastDay;
        _rentalPeriods[^1] = _rentalPeriods[^1] with { To = lastDay };
    }

    /// <summary>Transfers the line to the gaining partner on a migration.</summary>
    public void TransferTo(Guid gainingPartnerId, string productCode, CareLevel careLevel, Money monthlyRental, DateOnly effectiveFrom)
    {
        Cease(effectiveFrom.AddDays(-1));
        PartnerId = gainingPartnerId;
        CeasedOn = null;
        ProductCode = productCode;
        CareLevel = careLevel;
        MonthlyRental = monthlyRental;
        _rentalPeriods.Clear();
        _rentalPeriods.Add(new RentalPeriod(productCode, monthlyRental.MinorUnits, monthlyRental.Currency, effectiveFrom, null));
        ActivatedOn = effectiveFrom;
    }

    private void EnsureActive()
    {
        if (!IsActive)
        {
            throw new DomainException("service.ceased", $"Service {Reference} has been ceased.");
        }
    }
}

public sealed record RentalPeriod(string ProductCode, long MonthlyRentalMinor, string Currency, DateOnly From, DateOnly? To)
{
    /// <summary>Number of days of this period that fall within [start, end] inclusive.</summary>
    public int DaysWithin(DateOnly start, DateOnly end)
    {
        var effectiveStart = From > start ? From : start;
        var periodEnd = To ?? end;
        var effectiveEnd = periodEnd < end ? periodEnd : end;
        return effectiveEnd < effectiveStart ? 0 : effectiveEnd.DayNumber - effectiveStart.DayNumber + 1;
    }
}
