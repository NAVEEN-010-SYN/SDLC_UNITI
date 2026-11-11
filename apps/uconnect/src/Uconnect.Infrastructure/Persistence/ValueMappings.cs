using System.Globalization;
using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Uconnect.Domain.Common;

namespace Uconnect.Infrastructure.Persistence;

internal sealed class AccountNumberConverter : ValueConverter<AccountNumber, string>
{
    public AccountNumberConverter() : base(v => v.Value, v => AccountNumber.Parse(v))
    {
    }
}

internal sealed class EmailAddressConverter : ValueConverter<EmailAddress, string>
{
    public EmailAddressConverter() : base(v => v.Value, v => EmailAddress.Create(v))
    {
    }
}

internal sealed class PhoneNumberConverter : ValueConverter<PhoneNumber, string>
{
    public PhoneNumberConverter() : base(v => v.Value, v => PhoneNumber.Create(v))
    {
    }
}

/// <summary>
/// Stores an optional <see cref="Money"/> in a single column as <c>"GBP:1234"</c>. Used only for
/// optional limits (overage rate, autopay ceiling) that are never aggregated in SQL; amounts that
/// are summed or sorted use two-column complex properties instead.
/// </summary>
internal sealed class OptionalMoneyConverter : ValueConverter<Money, string>
{
    public OptionalMoneyConverter()
        : base(v => string.Create(CultureInfo.InvariantCulture, $"{v.Currency}:{v.AmountMinor}"), v => Parse(v))
    {
    }

    private static Money Parse(string value)
    {
        var separator = value.IndexOf(':', StringComparison.Ordinal);
        return Money.FromMinor(long.Parse(value[(separator + 1)..], CultureInfo.InvariantCulture), value[..separator]);
    }
}

internal static class MappingExtensions
{
    /// <summary>Maps a <see cref="Money"/> as two columns: <c>{column}_minor</c> (bigint) and <c>{column}_currency</c> (char(3)).</summary>
    public static EntityTypeBuilder<TEntity> HasMoney<TEntity>(this EntityTypeBuilder<TEntity> builder, Expression<Func<TEntity, Money>> property, string column)
        where TEntity : class
    {
        builder.ComplexProperty(property, money =>
        {
            money.Property(m => m.AmountMinor).HasColumnName($"{column}_minor").IsRequired();
            money.Property(m => m.Currency).HasColumnName($"{column}_currency").HasMaxLength(3).IsFixedLength().IsRequired();
        });
        return builder;
    }

    /// <summary>Maps a <see cref="PostalAddress"/> as columns prefixed with <paramref name="prefix"/>.</summary>
    public static EntityTypeBuilder<TEntity> HasAddress<TEntity>(this EntityTypeBuilder<TEntity> builder, Expression<Func<TEntity, PostalAddress>> property, string prefix)
        where TEntity : class
    {
        builder.ComplexProperty(property, address =>
        {
            address.Property(a => a.Line1).HasColumnName($"{prefix}_line1").HasMaxLength(120).IsRequired();
            address.Property(a => a.Line2).HasColumnName($"{prefix}_line2").HasMaxLength(120);
            address.Property(a => a.Town).HasColumnName($"{prefix}_town").HasMaxLength(80).IsRequired();
            address.Property(a => a.Postcode).HasColumnName($"{prefix}_postcode").HasMaxLength(10).IsRequired();
            address.Property(a => a.CountryCode).HasColumnName($"{prefix}_country").HasMaxLength(2).IsFixedLength().IsRequired();
        });
        return builder;
    }
}
