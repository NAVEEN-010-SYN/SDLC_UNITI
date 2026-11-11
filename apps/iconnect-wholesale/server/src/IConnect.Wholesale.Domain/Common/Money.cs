namespace IConnect.Wholesale.Domain.Common;

/// <summary>
/// Monetary amount held as integer minor units (pence/cents) plus an ISO-4217 currency.
/// Never use floating point for money; percentage arithmetic rounds half away from zero
/// on the minor unit so that statement totals reconcile line-by-line.
/// </summary>
public readonly record struct Money
{
    public long MinorUnits { get; }
    public string Currency { get; }

    public Money(long minorUnits, string currency)
    {
        if (string.IsNullOrWhiteSpace(currency) || currency.Length != 3 || !currency.All(char.IsAsciiLetterUpper))
        {
            throw new DomainException("money.invalid_currency", $"'{currency}' is not an ISO-4217 currency code.");
        }

        MinorUnits = minorUnits;
        Currency = currency;
    }

    public static Money Zero(string currency) => new(0, currency);

    public static Money Gbp(long pence) => new(pence, "GBP");

    public bool IsZero => MinorUnits == 0;

    public bool IsNegative => MinorUnits < 0;

    public Money Add(Money other)
    {
        EnsureSameCurrency(other);
        return new Money(checked(MinorUnits + other.MinorUnits), Currency);
    }

    public Money Subtract(Money other)
    {
        EnsureSameCurrency(other);
        return new Money(checked(MinorUnits - other.MinorUnits), Currency);
    }

    public Money Multiply(int quantity) => new(checked(MinorUnits * quantity), Currency);

    /// <summary>Applies a percentage expressed in basis points (1% = 100 bps).</summary>
    public Money PercentageOf(int basisPoints)
    {
        var raw = (decimal)MinorUnits * basisPoints / 10_000m;
        return new Money((long)Math.Round(raw, MidpointRounding.AwayFromZero), Currency);
    }

    /// <summary>Pro-rates the amount over a number of days in a period.</summary>
    public Money ProRate(int days, int daysInPeriod)
    {
        if (daysInPeriod <= 0)
        {
            throw new DomainException("money.invalid_period", "Period length must be positive.");
        }

        var clamped = Math.Clamp(days, 0, daysInPeriod);
        var raw = (decimal)MinorUnits * clamped / daysInPeriod;
        return new Money((long)Math.Round(raw, MidpointRounding.AwayFromZero), Currency);
    }

    public Money Min(Money other)
    {
        EnsureSameCurrency(other);
        return MinorUnits <= other.MinorUnits ? this : other;
    }

    public static Money Sum(IEnumerable<Money> amounts, string currency)
    {
        var total = Zero(currency);
        foreach (var amount in amounts)
        {
            total = total.Add(amount);
        }

        return total;
    }

    public static Money operator +(Money a, Money b) => a.Add(b);

    public static Money operator -(Money a, Money b) => a.Subtract(b);

    private void EnsureSameCurrency(Money other)
    {
        if (!string.Equals(Currency, other.Currency, StringComparison.Ordinal))
        {
            throw new DomainException("money.currency_mismatch", $"Cannot combine {Currency} with {other.Currency}.");
        }
    }

    public override string ToString() => $"{MinorUnits / 100m:0.00} {Currency}";
}
