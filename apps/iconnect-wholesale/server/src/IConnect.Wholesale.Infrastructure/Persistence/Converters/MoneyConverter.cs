using System.Globalization;
using IConnect.Wholesale.Domain.Common;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace IConnect.Wholesale.Infrastructure.Persistence.Converters;

/// <summary>
/// Persists <see cref="Money"/> as "CCC:minor" (e.g. "GBP:2499") in a single column. Money is a
/// struct that may be optional on aggregates, which EF Core 8 complex types do not support; a
/// lossless text encoding keeps integer minor units and the currency together. Amount
/// aggregation happens in the domain, never in SQL.
/// </summary>
public sealed class MoneyConverter : ValueConverter<Money, string>
{
    public MoneyConverter()
        : base(m => Serialize(m), s => Deserialize(s))
    {
    }

    public static string Serialize(Money money) =>
        money.Currency + ":" + money.MinorUnits.ToString(CultureInfo.InvariantCulture);

    public static Money Deserialize(string value)
    {
        var separator = value.IndexOf(':', StringComparison.Ordinal);
        if (separator != 3)
        {
            throw new FormatException($"Stored money value '{value}' is malformed.");
        }

        return new Money(long.Parse(value.AsSpan(4), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture), value[..3]);
    }
}
