using System.Globalization;

namespace Uconnect.Domain.Common;

/// <summary>
/// An immutable monetary amount stored as integer minor units (e.g. pence/cents) with an
/// ISO-4217 currency code. Arithmetic is exact; any operation that can produce fractions of a
/// minor unit takes an explicit rounding mode. Floating point is never used.
/// </summary>
public sealed record Money : IComparable<Money>
{
    private static readonly HashSet<string> SupportedCurrencies = new(StringComparer.Ordinal) { "GBP", "USD", "EUR" };

    public Money(long amountMinor, string currency)
    {
        if (string.IsNullOrWhiteSpace(currency) || currency.Length != 3)
        {
            throw new DomainException("money.invalid_currency", "Currency must be a three-letter ISO-4217 code.");
        }

        var normalised = currency.ToUpperInvariant();
        if (!SupportedCurrencies.Contains(normalised))
        {
            throw new DomainException("money.unsupported_currency", $"Currency '{normalised}' is not supported.");
        }

        AmountMinor = amountMinor;
        Currency = normalised;
    }

    /// <summary>Amount in minor units (1/100 of the major unit for all supported currencies).</summary>
    public long AmountMinor { get; }

    public string Currency { get; }

    public bool IsZero => AmountMinor == 0;

    public bool IsNegative => AmountMinor < 0;

    public bool IsPositive => AmountMinor > 0;

    public static Money Zero(string currency) => new(0, currency);

    public static Money FromMinor(long amountMinor, string currency) => new(amountMinor, currency);

    /// <summary>Creates money from a decimal major-unit amount; rejects values with sub-minor precision.</summary>
    public static Money FromMajor(decimal amount, string currency)
    {
        var minor = amount * 100m;
        if (minor != decimal.Truncate(minor))
        {
            throw new DomainException("money.precision", "Amount has more than two decimal places.");
        }

        return new Money((long)minor, currency);
    }

    public Money Add(Money other)
    {
        EnsureSameCurrency(other);
        return new Money(checked(AmountMinor + other.AmountMinor), Currency);
    }

    public Money Subtract(Money other)
    {
        EnsureSameCurrency(other);
        return new Money(checked(AmountMinor - other.AmountMinor), Currency);
    }

    public Money Negate() => new(-AmountMinor, Currency);

    public Money Abs() => new(Math.Abs(AmountMinor), Currency);

    public Money Multiply(int quantity) => new(checked(AmountMinor * quantity), Currency);

    /// <summary>
    /// Scales the amount by <paramref name="numerator"/>/<paramref name="denominator"/> using integer
    /// arithmetic, rounding half away from zero. Used for proration (price × days used / days in period).
    /// </summary>
    public Money MultiplyRatio(long numerator, long denominator)
    {
        if (denominator <= 0)
        {
            throw new DomainException("money.invalid_ratio", "Denominator must be positive.");
        }

        var product = checked(AmountMinor * numerator);
        var quotient = Math.DivRem(product, denominator, out var remainder);
        if (Math.Abs(remainder) * 2 >= denominator)
        {
            quotient += product >= 0 ? 1 : -1;
        }

        return new Money(quotient, Currency);
    }

    /// <summary>
    /// Applies a rate expressed in basis points (1/100 of a percent), rounding half away from zero.
    /// 2000 bps = 20%.
    /// </summary>
    public Money ApplyBasisPoints(int basisPoints) => MultiplyRatio(basisPoints, 10_000);

    /// <summary>
    /// Splits the amount into parts proportional to <paramref name="ratios"/> without losing a minor unit:
    /// the remainder is distributed one unit at a time to the leading parts.
    /// </summary>
    public IReadOnlyList<Money> Allocate(IReadOnlyList<int> ratios)
    {
        if (ratios.Count == 0 || ratios.Any(r => r < 0) || ratios.Sum() == 0)
        {
            throw new DomainException("money.invalid_allocation", "Allocation ratios must be non-negative and not all zero.");
        }

        long total = ratios.Sum();
        var results = new long[ratios.Count];
        long allocated = 0;
        for (var i = 0; i < ratios.Count; i++)
        {
            results[i] = AmountMinor * ratios[i] / total;
            allocated += results[i];
        }

        var remainder = AmountMinor - allocated;
        var step = remainder >= 0 ? 1 : -1;
        for (var i = 0; remainder != 0; i = (i + 1) % results.Length)
        {
            if (ratios[i] == 0)
            {
                continue;
            }

            results[i] += step;
            remainder -= step;
        }

        return results.Select(r => new Money(r, Currency)).ToList();
    }

    public Money Min(Money other)
    {
        EnsureSameCurrency(other);
        return AmountMinor <= other.AmountMinor ? this : other;
    }

    public Money Max(Money other)
    {
        EnsureSameCurrency(other);
        return AmountMinor >= other.AmountMinor ? this : other;
    }

    public int CompareTo(Money? other)
    {
        if (other is null)
        {
            return 1;
        }

        EnsureSameCurrency(other);
        return AmountMinor.CompareTo(other.AmountMinor);
    }

    /// <summary>Decimal representation in major units, for display and wire formatting only.</summary>
    public decimal ToMajor() => AmountMinor / 100m;

    public override string ToString() =>
        string.Create(CultureInfo.InvariantCulture, $"{Currency} {ToMajor():0.00}");

    public static Money operator +(Money left, Money right) => left.Add(right);

    public static Money operator -(Money left, Money right) => left.Subtract(right);

    public static Money operator -(Money value) => value.Negate();

    public static bool operator >(Money left, Money right) => left.CompareTo(right) > 0;

    public static bool operator <(Money left, Money right) => left.CompareTo(right) < 0;

    public static bool operator >=(Money left, Money right) => left.CompareTo(right) >= 0;

    public static bool operator <=(Money left, Money right) => left.CompareTo(right) <= 0;

    private void EnsureSameCurrency(Money other)
    {
        if (!string.Equals(Currency, other.Currency, StringComparison.Ordinal))
        {
            throw new DomainException("money.currency_mismatch", $"Cannot combine {Currency} with {other.Currency}.");
        }
    }
}

public static class MoneyEnumerableExtensions
{
    /// <summary>Sums a sequence of money values; an empty sequence yields zero in <paramref name="currency"/>.</summary>
    public static Money Sum(this IEnumerable<Money> values, string currency) =>
        values.Aggregate(Money.Zero(currency), (acc, next) => acc + next);
}
