# Uconnect account & service management: apps/uconnect/src/Uconnect.Domain (part 5 of 8)

- **Application:** Uconnect account & service management
- **Tech stack:** .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 14

## Files

- `apps/uconnect/src/Uconnect.Domain/Common/BillingPeriod.cs` (64 lines)
- `apps/uconnect/src/Uconnect.Domain/Common/DomainException.cs` (78 lines)
- `apps/uconnect/src/Uconnect.Domain/Common/Entity.cs` (80 lines)
- `apps/uconnect/src/Uconnect.Domain/Common/Enums.cs` (183 lines)
- `apps/uconnect/src/Uconnect.Domain/Common/Money.cs` (197 lines)
- `apps/uconnect/src/Uconnect.Domain/Common/ValueObjects.cs` (158 lines)
- `apps/uconnect/src/Uconnect.Domain/Outages/Outage.cs` (187 lines)
- `apps/uconnect/src/Uconnect.Domain/Outages/OutageCompensationPolicy.cs` (92 lines)
- `apps/uconnect/src/Uconnect.Domain/Payments/AutopaySettings.cs` (129 lines)
- `apps/uconnect/src/Uconnect.Domain/Payments/Payment.cs` (116 lines)
- `apps/uconnect/src/Uconnect.Domain/Payments/PaymentMethod.cs` (175 lines)
- `apps/uconnect/src/Uconnect.Domain/PlanChanges/PlanChange.cs` (171 lines)
- `apps/uconnect/src/Uconnect.Domain/PlanChanges/PlanChangePolicy.cs` (154 lines)
- `apps/uconnect/src/Uconnect.Domain/PlanChanges/ProrationCalculator.cs` (69 lines)

## apps/uconnect/src/Uconnect.Domain/Common/BillingPeriod.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Common/BillingPeriod.cs`.

```csharp
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
```

## apps/uconnect/src/Uconnect.Domain/Common/DomainException.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Common/DomainException.cs`.

```csharp
namespace Uconnect.Domain.Common;

/// <summary>
/// Raised when a domain rule or invariant is violated. The <see cref="Code"/> is a stable,
/// machine-readable identifier surfaced to API consumers in problem details.
/// </summary>
public class DomainException : Exception
{
    public DomainException(string code, string message) : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}

/// <summary>Raised when a requested state transition is not permitted from the current state.</summary>
public sealed class InvalidStateTransitionException : DomainException
{
    public InvalidStateTransitionException(string entity, string from, string to)
        : base($"{entity.ToLowerInvariant()}.invalid_transition", $"{entity} cannot move from {from} to {to}.")
    {
        Entity = entity;
        From = from;
        To = to;
    }

    public string Entity { get; }

    public string From { get; }

    public string To { get; }
}

/// <summary>Guard helpers that throw <see cref="DomainException"/> with consistent codes.</summary>
public static class Guard
{
    public static string NotBlank(string? value, string field, int maxLength = 500)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new DomainException($"{field}.required", $"{field} is required.");
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
        {
            throw new DomainException($"{field}.too_long", $"{field} must be at most {maxLength} characters.");
        }

        return trimmed;
    }

    public static void Positive(Money amount, string field)
    {
        if (amount.AmountMinor <= 0)
        {
            throw new DomainException($"{field}.must_be_positive", $"{field} must be greater than zero.");
        }
    }

    public static void NotNegative(Money amount, string field)
    {
        if (amount.AmountMinor < 0)
        {
            throw new DomainException($"{field}.negative", $"{field} must not be negative.");
        }
    }

    public static void InRange(int value, int min, int max, string field)
    {
        if (value < min || value > max)
        {
            throw new DomainException($"{field}.out_of_range", $"{field} must be between {min} and {max}.");
        }
    }
}
```

## apps/uconnect/src/Uconnect.Domain/Common/Entity.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Common/Entity.cs`.

```csharp
namespace Uconnect.Domain.Common;

/// <summary>
/// Base type for all entities. Identity is a <see cref="Guid"/>; two entities are equal when
/// they are of the same concrete type and share the same id.
/// </summary>
public abstract class Entity : IEquatable<Entity>
{
    protected Entity(Guid id)
    {
        if (id == Guid.Empty)
        {
            throw new ArgumentException("Entity id must not be empty.", nameof(id));
        }

        Id = id;
    }

    /// <summary>Required by EF Core materialisation.</summary>
    protected Entity()
    {
    }

    public Guid Id { get; protected set; }

    public bool Equals(Entity? other)
    {
        if (other is null)
        {
            return false;
        }

        if (ReferenceEquals(this, other))
        {
            return true;
        }

        return other.GetType() == GetType() && other.Id == Id && Id != Guid.Empty;
    }

    public override bool Equals(object? obj) => obj is Entity other && Equals(other);

    public override int GetHashCode() => HashCode.Combine(GetType(), Id);

    public static bool operator ==(Entity? left, Entity? right) => Equals(left, right);

    public static bool operator !=(Entity? left, Entity? right) => !Equals(left, right);
}

/// <summary>
/// An entity that is the consistency boundary for a cluster of objects and can raise domain events.
/// </summary>
public abstract class AggregateRoot : Entity
{
    private readonly List<IDomainEvent> _domainEvents = new();

    protected AggregateRoot(Guid id) : base(id)
    {
    }

    protected AggregateRoot()
    {
    }

    /// <summary>Optimistic concurrency token maintained by the persistence layer.</summary>
    public byte[] RowVersion { get; private set; } = Array.Empty<byte>();

    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    protected void Raise(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);

    public void ClearDomainEvents() => _domainEvents.Clear();
}

/// <summary>Marker for something meaningful that happened in the domain.</summary>
public interface IDomainEvent
{
    DateTimeOffset OccurredAt { get; }
}
```

## apps/uconnect/src/Uconnect.Domain/Common/Enums.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Common/Enums.cs`.

```csharp
namespace Uconnect.Domain.Common;

/// <summary>Whether an account is a consumer household or a business.</summary>
public enum AccountType
{
    Consumer = 1,
    Business = 2,
}

public enum AccountStatus
{
    Active = 1,
    Suspended = 2,
    Closed = 3,
}

/// <summary>Platform roles (see CONVENTIONS.md). Values are the JWT role claim strings.</summary>
public static class UserRoles
{
    public const string Consumer = "CONSUMER";
    public const string BusinessAdmin = "BUSINESS_ADMIN";
    public const string BusinessUser = "BUSINESS_USER";
    public const string PartnerAdmin = "PARTNER_ADMIN";
    public const string PartnerAgent = "PARTNER_AGENT";
    public const string WholesaleBuyer = "WHOLESALE_BUYER";
    public const string SupportAgent = "SUPPORT_AGENT";

    public static readonly IReadOnlyList<string> All = new[]
    {
        Consumer, BusinessAdmin, BusinessUser, PartnerAdmin, PartnerAgent, WholesaleBuyer, SupportAgent,
    };
}

public enum ProductType
{
    Broadband = 1,
    Voice = 2,
    SdWan = 3,
    HostedServices = 4,
}

public enum ServiceStatus
{
    PendingActivation = 1,
    Active = 2,
    Suspended = 3,
    Cancelled = 4,
}

public enum PlanChangeType
{
    Upgrade = 1,
    Downgrade = 2,
    Lateral = 3,
}

public enum PlanChangeStatus
{
    Requested = 1,
    Scheduled = 2,
    Provisioning = 3,
    Completed = 4,
    Failed = 5,
    Cancelled = 6,
}

public enum InvoiceStatus
{
    Draft = 1,
    Issued = 2,
    PartiallyPaid = 3,
    Paid = 4,
    Overdue = 5,
    Void = 6,
}

public enum InvoiceLineType
{
    Recurring = 1,
    Proration = 2,
    OneOff = 3,
    Usage = 4,
    Credit = 5,
    Discount = 6,
    EarlyTerminationFee = 7,
}

public enum PaymentStatus
{
    Pending = 1,
    Succeeded = 2,
    Failed = 3,
    Refunded = 4,
    PartiallyRefunded = 5,
}

public enum PaymentMethodType
{
    Card = 1,
    DirectDebit = 2,
}

/// <summary>How a payment was initiated.</summary>
public enum PaymentChannel
{
    Portal = 1,
    Autopay = 2,
    Agent = 3,
}

public enum TicketPriority
{
    P1 = 1,
    P2 = 2,
    P3 = 3,
    P4 = 4,
}

public enum TicketStatus
{
    Open = 1,
    InProgress = 2,
    PendingCustomer = 3,
    Resolved = 4,
    Closed = 5,
}

public enum TicketCategory
{
    Fault = 1,
    Billing = 2,
    PlanChange = 3,
    Installation = 4,
    General = 5,
    Complaint = 6,
}

public enum AppointmentType
{
    Installation = 1,
    Repair = 2,
    Upgrade = 3,
    Survey = 4,
}

public enum AppointmentStatus
{
    Requested = 1,
    Confirmed = 2,
    Completed = 3,
    Cancelled = 4,
    Missed = 5,
}

/// <summary>Engineer visit time windows offered to customers.</summary>
public enum AppointmentWindow
{
    Morning = 1,
    Afternoon = 2,
    AllDay = 3,
}

public enum OutageSeverity
{
    Minor = 1,
    Major = 2,
    Critical = 3,
}

public enum OutageStatus
{
    Investigating = 1,
    Identified = 2,
    Monitoring = 3,
    Resolved = 4,
}

public enum NotificationChannel
{
    Email = 1,
    Sms = 2,
}
```

## apps/uconnect/src/Uconnect.Domain/Common/Money.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Common/Money.cs`.

```csharp
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
```

## apps/uconnect/src/Uconnect.Domain/Common/ValueObjects.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Common/ValueObjects.cs`.

```csharp
using System.Text.RegularExpressions;

namespace Uconnect.Domain.Common;

/// <summary>Customer-facing account identifier in the form <c>ACC-########</c>.</summary>
public sealed partial record AccountNumber
{
    private AccountNumber(string value) => Value = value;

    public string Value { get; }

    public static AccountNumber Parse(string? value)
    {
        if (!TryParse(value, out var result))
        {
            throw new DomainException("account_number.invalid", "Account number must match ACC-########.");
        }

        return result!;
    }

    public static bool TryParse(string? value, out AccountNumber? result)
    {
        result = null;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var candidate = value.Trim().ToUpperInvariant();
        if (!Pattern().IsMatch(candidate))
        {
            return false;
        }

        result = new AccountNumber(candidate);
        return true;
    }

    public override string ToString() => Value;

    [GeneratedRegex(@"^ACC-\d{8}$", RegexOptions.CultureInvariant)]
    private static partial Regex Pattern();
}

/// <summary>A syntactically valid, lower-cased e-mail address.</summary>
public sealed partial record EmailAddress
{
    private EmailAddress(string value) => Value = value;

    public string Value { get; }

    public static EmailAddress Create(string? value)
    {
        var trimmed = value?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(trimmed) || trimmed.Length > 254 || !Pattern().IsMatch(trimmed))
        {
            throw new DomainException("email.invalid", "E-mail address is not valid.");
        }

        return new EmailAddress(trimmed);
    }

    public override string ToString() => Value;

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$", RegexOptions.CultureInvariant)]
    private static partial Regex Pattern();
}

/// <summary>A UK telephone number normalised to E.164 (+44...).</summary>
public sealed partial record PhoneNumber
{
    private PhoneNumber(string value) => Value = value;

    public string Value { get; }

    public static PhoneNumber Create(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new DomainException("phone.required", "Phone number is required.");
        }

        var digits = NonDigit().Replace(value, string.Empty);
        if (value.TrimStart().StartsWith('+'))
        {
            digits = "+" + digits;
        }
        else if (digits.StartsWith('0'))
        {
            digits = "+44" + digits[1..];
        }

        if (!E164().IsMatch(digits))
        {
            throw new DomainException("phone.invalid", "Phone number is not valid.");
        }

        return new PhoneNumber(digits);
    }

    public override string ToString() => Value;

    [GeneratedRegex(@"[^\d]")]
    private static partial Regex NonDigit();

    [GeneratedRegex(@"^\+[1-9]\d{8,14}$")]
    private static partial Regex E164();
}

/// <summary>A postal address. For services this is the premises where the fibre terminates.</summary>
public sealed partial record PostalAddress
{
    public PostalAddress(string line1, string? line2, string town, string postcode, string countryCode = "GB")
    {
        Line1 = Guard.NotBlank(line1, "address.line1", 120);
        Line2 = string.IsNullOrWhiteSpace(line2) ? null : line2.Trim();
        Town = Guard.NotBlank(town, "address.town", 80);
        CountryCode = Guard.NotBlank(countryCode, "address.country", 2).ToUpperInvariant();

        var normalisedPostcode = NormalisePostcode(postcode);
        if (CountryCode == "GB" && !UkPostcode().IsMatch(normalisedPostcode))
        {
            throw new DomainException("address.postcode_invalid", "Postcode is not a valid UK postcode.");
        }

        Postcode = normalisedPostcode;
    }

    public string Line1 { get; }

    public string? Line2 { get; }

    public string Town { get; }

    public string Postcode { get; }

    public string CountryCode { get; }

    /// <summary>The outward code, e.g. "LS1" for "LS1 4AP" — used to match outages to premises.</summary>
    public string OutwardCode => Postcode.Split(' ')[0];

    public static string NormalisePostcode(string? postcode)
    {
        var compact = Whitespace().Replace(postcode ?? string.Empty, string.Empty).ToUpperInvariant();
        return compact.Length > 3 ? $"{compact[..^3]} {compact[^3..]}" : compact;
    }

    public override string ToString() =>
        string.Join(", ", new[] { Line1, Line2, Town, Postcode }.Where(p => !string.IsNullOrEmpty(p)));

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    [GeneratedRegex(@"^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$")]
    private static partial Regex UkPostcode();
}
```

## apps/uconnect/src/Uconnect.Domain/Outages/Outage.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Outages/Outage.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Outages;

/// <summary>
/// A network incident affecting one or more postcode districts (outward codes). Customers whose
/// service address falls in an affected district see it in the portal and are notified on
/// declaration and on resolution.
/// </summary>
public sealed class Outage : AggregateRoot
{
    private readonly List<OutageUpdate> _updates = new();

    private Outage()
    {
    }

    public Outage(
        Guid id,
        string reference,
        string title,
        string description,
        OutageSeverity severity,
        IEnumerable<string> affectedOutwardCodes,
        DateTimeOffset startedAt,
        DateTimeOffset? estimatedResolutionAt,
        DateTimeOffset now)
        : base(id)
    {
        Reference = Guard.NotBlank(reference, "outage.reference", 20);
        Title = Guard.NotBlank(title, "outage.title", 150);
        Description = Guard.NotBlank(description, "outage.description", 2000);
        Severity = severity;
        AffectedOutwardCodes = NormaliseCodes(affectedOutwardCodes);
        if (startedAt > now)
        {
            throw new DomainException("outage.start_in_future", "An outage cannot start in the future.");
        }

        StartedAt = startedAt;
        SetEta(estimatedResolutionAt);
        Status = OutageStatus.Investigating;
        _updates.Add(new OutageUpdate(Guid.NewGuid(), Id, Status, Description, now));
        Raise(new OutageDeclared(Id, Reference, AffectedOutwardCodes, now));
    }

    public string Reference { get; private set; } = string.Empty;

    public string Title { get; private set; } = string.Empty;

    public string Description { get; private set; } = string.Empty;

    public OutageSeverity Severity { get; private set; }

    public OutageStatus Status { get; private set; }

    /// <summary>Postcode outward codes, e.g. "LS1", "LS2".</summary>
    public List<string> AffectedOutwardCodes { get; private set; } = new();

    public DateTimeOffset StartedAt { get; private set; }

    public DateTimeOffset? EstimatedResolutionAt { get; private set; }

    public DateTimeOffset? ResolvedAt { get; private set; }

    public IReadOnlyList<OutageUpdate> Updates => _updates.OrderBy(u => u.PostedAt).ToList();

    public bool IsResolved => Status == OutageStatus.Resolved;

    public bool Affects(PostalAddress address) =>
        AffectedOutwardCodes.Contains(address.OutwardCode, StringComparer.OrdinalIgnoreCase);

    public TimeSpan Duration(DateTimeOffset now) => (ResolvedAt ?? now) - StartedAt;

    /// <summary>
    /// Posts a progress update. Status may only move forward (Investigating → Identified → Monitoring →
    /// Resolved); Monitoring can fall back to Identified if the fix did not hold.
    /// </summary>
    public void PostUpdate(OutageStatus status, string message, DateTimeOffset? newEta, DateTimeOffset now)
    {
        if (IsResolved)
        {
            throw new DomainException("outage.resolved", "Resolved outages cannot be updated.");
        }

        var regressing = status < Status && !(Status == OutageStatus.Monitoring && status == OutageStatus.Identified);
        if (regressing)
        {
            throw new InvalidStateTransitionException(nameof(Outage), Status.ToString(), status.ToString());
        }

        Status = status;
        if (newEta is not null)
        {
            SetEta(newEta);
        }

        _updates.Add(new OutageUpdate(Guid.NewGuid(), Id, status, Guard.NotBlank(message, "outage.update_message", 2000), now));

        if (status == OutageStatus.Resolved)
        {
            ResolvedAt = now;
            EstimatedResolutionAt = null;
            Raise(new OutageResolved(Id, Reference, AffectedOutwardCodes, StartedAt, now));
        }
    }

    /// <summary>Widens the affected area as the incident is diagnosed; returns the newly added codes.</summary>
    public IReadOnlyList<string> AddAffectedAreas(IEnumerable<string> outwardCodes, DateTimeOffset now)
    {
        if (IsResolved)
        {
            throw new DomainException("outage.resolved", "Resolved outages cannot be updated.");
        }

        var added = NormaliseCodes(outwardCodes).Except(AffectedOutwardCodes, StringComparer.OrdinalIgnoreCase).ToList();
        if (added.Count > 0)
        {
            AffectedOutwardCodes = AffectedOutwardCodes.Concat(added).OrderBy(c => c, StringComparer.Ordinal).ToList();
            Raise(new OutageDeclared(Id, Reference, added, now));
        }

        return added;
    }

    private void SetEta(DateTimeOffset? eta)
    {
        if (eta is not null && eta <= StartedAt)
        {
            throw new DomainException("outage.eta_before_start", "Estimated resolution must be after the outage start.");
        }

        EstimatedResolutionAt = eta;
    }

    private static List<string> NormaliseCodes(IEnumerable<string> codes)
    {
        var list = codes
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Select(c => c.Trim().ToUpperInvariant())
            .Distinct(StringComparer.Ordinal)
            .OrderBy(c => c, StringComparer.Ordinal)
            .ToList();

        if (list.Count == 0)
        {
            throw new DomainException("outage.no_area", "At least one affected postcode district is required.");
        }

        if (list.Any(c => c.Length > 4 || !char.IsLetter(c[0])))
        {
            throw new DomainException("outage.invalid_area", "Affected areas must be postcode outward codes such as 'LS1'.");
        }

        return list;
    }
}

/// <summary>A timestamped status message on an outage, shown to customers.</summary>
public sealed class OutageUpdate : Entity
{
    private OutageUpdate()
    {
    }

    internal OutageUpdate(Guid id, Guid outageId, OutageStatus status, string message, DateTimeOffset postedAt)
        : base(id)
    {
        OutageId = outageId;
        Status = status;
        Message = message;
        PostedAt = postedAt;
    }

    public Guid OutageId { get; private set; }

    public OutageStatus Status { get; private set; }

    public string Message { get; private set; } = string.Empty;

    public DateTimeOffset PostedAt { get; private set; }
}

public sealed record OutageDeclared(Guid OutageId, string Reference, IReadOnlyList<string> OutwardCodes, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record OutageResolved(Guid OutageId, string Reference, IReadOnlyList<string> OutwardCodes, DateTimeOffset StartedAt, DateTimeOffset OccurredAt) : IDomainEvent;
```

## apps/uconnect/src/Uconnect.Domain/Outages/OutageCompensationPolicy.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Outages/OutageCompensationPolicy.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Outages;

/// <summary>Kind of outage notification sent to an account; used to prevent duplicates.</summary>
public enum OutageNotificationKind
{
    Declared = 1,
    Resolved = 2,
}

/// <summary>Record that an account was told about an outage over a channel. Unique per (outage, account, kind, channel).</summary>
public sealed class OutageNotification : Entity
{
    private OutageNotification()
    {
    }

    public OutageNotification(Guid id, Guid outageId, Guid accountId, OutageNotificationKind kind, NotificationChannel channel, DateTimeOffset sentAt)
        : base(id)
    {
        OutageId = outageId;
        AccountId = accountId;
        Kind = kind;
        Channel = channel;
        SentAt = sentAt;
    }

    public Guid OutageId { get; private set; }

    public Guid AccountId { get; private set; }

    public OutageNotificationKind Kind { get; private set; }

    public NotificationChannel Channel { get; private set; }

    public DateTimeOffset SentAt { get; private set; }
}

/// <summary>
/// Automatic service credits for prolonged outages.
/// <list type="bullet">
/// <item>Business: SLA credit of <see cref="BusinessCreditPercentPerBlock"/>% of the monthly price for every
/// started <see cref="BusinessBlockHours"/>-hour block beyond the first block, capped at <see cref="BusinessCapPercent"/>%.</item>
/// <item>Consumer: after <see cref="ConsumerGraceDays"/> full days without service, the daily rate of the
/// monthly price for each further started day, capped at one month's price.</item>
/// </list>
/// Minor-severity outages (degraded, not down) attract no credit.
/// </summary>
public static class OutageCompensationPolicy
{
    public const int BusinessBlockHours = 4;
    public const int BusinessCreditPercentPerBlock = 5;
    public const int BusinessCapPercent = 50;
    public const int ConsumerGraceDays = 2;

    public static Money CalculateCredit(AccountType accountType, OutageSeverity severity, Money monthlyPrice, TimeSpan duration)
    {
        var zero = Money.Zero(monthlyPrice.Currency);
        if (severity == OutageSeverity.Minor || duration <= TimeSpan.Zero || monthlyPrice.IsZero)
        {
            return zero;
        }

        return accountType == AccountType.Business
            ? BusinessCredit(monthlyPrice, duration)
            : ConsumerCredit(monthlyPrice, duration);
    }

    private static Money BusinessCredit(Money monthlyPrice, TimeSpan duration)
    {
        var blocks = (int)Math.Ceiling(duration.TotalHours / BusinessBlockHours);
        var creditableBlocks = Math.Max(0, blocks - 1);
        var percent = Math.Min(creditableBlocks * BusinessCreditPercentPerBlock, BusinessCapPercent);
        return monthlyPrice.MultiplyRatio(percent, 100);
    }

    private static Money ConsumerCredit(Money monthlyPrice, TimeSpan duration)
    {
        var startedDays = (int)Math.Ceiling(duration.TotalDays);
        var creditableDays = Math.Max(0, startedDays - ConsumerGraceDays);
        if (creditableDays == 0)
        {
            return Money.Zero(monthlyPrice.Currency);
        }

        // A notional 30-day month keeps the daily rate stable regardless of the calendar month.
        var credit = monthlyPrice.MultiplyRatio(creditableDays, 30);
        return credit.Min(monthlyPrice);
    }
}
```

## apps/uconnect/src/Uconnect.Domain/Payments/AutopaySettings.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Payments/AutopaySettings.cs`.

```csharp
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Payments;

/// <summary>
/// Per-account autopay configuration: which method to charge, how many days before the due date,
/// and an optional ceiling above which the customer must pay manually. After
/// <see cref="MaxConsecutiveFailures"/> failed attempts autopay suspends itself.
/// </summary>
public sealed class AutopaySettings : AggregateRoot
{
    public const int MaxConsecutiveFailures = 3;

    private AutopaySettings()
    {
    }

    public AutopaySettings(Guid id, Guid accountId) : base(id)
    {
        AccountId = accountId;
        DaysBeforeDue = 3;
    }

    public Guid AccountId { get; private set; }

    public bool Enabled { get; private set; }

    public Guid? PaymentMethodId { get; private set; }

    /// <summary>Charge this many days before the invoice due date (0 = on the due date).</summary>
    public int DaysBeforeDue { get; private set; }

    /// <summary>Invoices above this amount are not auto-charged; <c>null</c> means no ceiling.</summary>
    public Money? MaxAmount { get; private set; }

    public int ConsecutiveFailures { get; private set; }

    public DateTimeOffset? SuspendedAt { get; private set; }

    public DateTimeOffset? EnabledAt { get; private set; }

    public void Enable(PaymentMethod method, int daysBeforeDue, Money? maxAmount, DateOnly today, DateTimeOffset now)
    {
        if (method.AccountId != AccountId)
        {
            throw new DomainException("autopay.method_not_on_account", "The payment method does not belong to this account.");
        }

        method.EnsureUsable(today);
        Guard.InRange(daysBeforeDue, 0, 10, "autopay.days_before_due");
        if (maxAmount is not null)
        {
            Guard.Positive(maxAmount, "autopay.max_amount");
        }

        Enabled = true;
        PaymentMethodId = method.Id;
        DaysBeforeDue = daysBeforeDue;
        MaxAmount = maxAmount;
        ConsecutiveFailures = 0;
        SuspendedAt = null;
        EnabledAt = now;
    }

    public void Disable()
    {
        Enabled = false;
    }

    /// <summary>Date on which autopay should attempt to collect <paramref name="invoice"/>.</summary>
    public DateOnly? CollectionDateFor(Invoice invoice) => invoice.DueOn?.AddDays(-DaysBeforeDue);

    /// <summary>
    /// Decides whether to charge an invoice today. Returns a reason when the invoice is skipped so
    /// that the customer can be told why autopay did not collect it.
    /// </summary>
    public AutopayDecision Evaluate(Invoice invoice, DateOnly today)
    {
        if (!Enabled || PaymentMethodId is null)
        {
            return AutopayDecision.Skip("autopay_disabled");
        }

        if (invoice.AccountId != AccountId || !invoice.IsPayable || !invoice.BalanceDue.IsPositive)
        {
            return AutopayDecision.Skip("not_payable");
        }

        if (CollectionDateFor(invoice) is not { } collectOn || today < collectOn)
        {
            return AutopayDecision.Skip("not_yet_due");
        }

        if (MaxAmount is not null && invoice.BalanceDue > MaxAmount)
        {
            return AutopayDecision.Skip("above_max_amount");
        }

        return AutopayDecision.Charge(invoice.BalanceDue, PaymentMethodId.Value);
    }

    public void RecordSuccess() => ConsecutiveFailures = 0;

    /// <summary>Counts a failed collection; returns true if autopay has now been suspended.</summary>
    public bool RecordFailure(DateTimeOffset now)
    {
        ConsecutiveFailures++;
        if (ConsecutiveFailures < MaxConsecutiveFailures)
        {
            return false;
        }

        Enabled = false;
        SuspendedAt = now;
        Raise(new AutopaySuspended(Id, AccountId, ConsecutiveFailures, now));
        return true;
    }
}

public sealed record AutopayDecision(bool ShouldCharge, Money? Amount, Guid? PaymentMethodId, string? SkipReason)
{
    public static AutopayDecision Charge(Money amount, Guid methodId) => new(true, amount, methodId, null);

    public static AutopayDecision Skip(string reason) => new(false, null, null, reason);
}

public sealed record AutopaySuspended(Guid AutopayId, Guid AccountId, int Failures, DateTimeOffset OccurredAt) : IDomainEvent;
```

## apps/uconnect/src/Uconnect.Domain/Payments/Payment.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Payments/Payment.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Payments;

/// <summary>
/// A payment attempt against an invoice. Created <c>Pending</c> before the gateway is called so that
/// a crash mid-call leaves an auditable record; the idempotency key guarantees a retried request
/// never charges the customer twice.
/// </summary>
public sealed class Payment : AggregateRoot
{
    private Payment()
    {
    }

    public Payment(
        Guid id,
        Guid accountId,
        Guid invoiceId,
        Guid paymentMethodId,
        Money amount,
        PaymentChannel channel,
        string idempotencyKey,
        DateTimeOffset createdAt)
        : base(id)
    {
        Guard.Positive(amount, "payment.amount");
        AccountId = accountId;
        InvoiceId = invoiceId;
        PaymentMethodId = paymentMethodId;
        Amount = amount;
        RefundedAmount = Money.Zero(amount.Currency);
        Channel = channel;
        IdempotencyKey = Guard.NotBlank(idempotencyKey, "payment.idempotency_key", 80);
        Status = PaymentStatus.Pending;
        CreatedAt = createdAt;
    }

    public Guid AccountId { get; private set; }

    public Guid InvoiceId { get; private set; }

    public Guid PaymentMethodId { get; private set; }

    public Money Amount { get; private set; } = null!;

    public Money RefundedAmount { get; private set; } = null!;

    public PaymentChannel Channel { get; private set; }

    public PaymentStatus Status { get; private set; }

    public string IdempotencyKey { get; private set; } = string.Empty;

    public string? GatewayReference { get; private set; }

    public string? FailureCode { get; private set; }

    public string? FailureMessage { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset? CompletedAt { get; private set; }

    public Money RefundableAmount => Status is PaymentStatus.Succeeded or PaymentStatus.PartiallyRefunded
        ? Amount - RefundedAmount
        : Money.Zero(Amount.Currency);

    public void MarkSucceeded(string gatewayReference, DateTimeOffset completedAt)
    {
        EnsurePending(PaymentStatus.Succeeded);
        GatewayReference = Guard.NotBlank(gatewayReference, "payment.gateway_reference", 100);
        Status = PaymentStatus.Succeeded;
        CompletedAt = completedAt;
        Raise(new PaymentSucceeded(Id, AccountId, InvoiceId, Amount, completedAt));
    }

    public void MarkFailed(string failureCode, string? failureMessage, DateTimeOffset completedAt)
    {
        EnsurePending(PaymentStatus.Failed);
        FailureCode = Guard.NotBlank(failureCode, "payment.failure_code", 50);
        FailureMessage = failureMessage?.Length > 300 ? failureMessage[..300] : failureMessage;
        Status = PaymentStatus.Failed;
        CompletedAt = completedAt;
        Raise(new PaymentFailed(Id, AccountId, InvoiceId, Amount, FailureCode, Channel, completedAt));
    }

    /// <summary>Records a (partial) refund. The total refunded can never exceed the original amount.</summary>
    public void Refund(Money amount, DateTimeOffset now)
    {
        Guard.Positive(amount, "refund.amount");
        if (amount > RefundableAmount)
        {
            throw new DomainException("payment.refund_exceeds", $"Refund of {amount} exceeds the refundable amount of {RefundableAmount}.");
        }

        RefundedAmount += amount;
        Status = RefundedAmount == Amount ? PaymentStatus.Refunded : PaymentStatus.PartiallyRefunded;
        Raise(new PaymentRefunded(Id, AccountId, InvoiceId, amount, now));
    }

    private void EnsurePending(PaymentStatus target)
    {
        if (Status != PaymentStatus.Pending)
        {
            throw new InvalidStateTransitionException(nameof(Payment), Status.ToString(), target.ToString());
        }
    }
}

public sealed record PaymentSucceeded(Guid PaymentId, Guid AccountId, Guid InvoiceId, Money Amount, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record PaymentFailed(Guid PaymentId, Guid AccountId, Guid InvoiceId, Money Amount, string FailureCode, PaymentChannel Channel, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record PaymentRefunded(Guid PaymentId, Guid AccountId, Guid InvoiceId, Money Amount, DateTimeOffset OccurredAt) : IDomainEvent;
```

## apps/uconnect/src/Uconnect.Domain/Payments/PaymentMethod.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Payments/PaymentMethod.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Payments;

/// <summary>
/// A stored, tokenised way to pay. Card numbers and bank details never reach this system: the
/// browser tokenises them with the payment gateway and only the token and display data are kept.
/// </summary>
public sealed class PaymentMethod : AggregateRoot
{
    private PaymentMethod()
    {
    }

    private PaymentMethod(
        Guid id,
        Guid accountId,
        PaymentMethodType type,
        string gatewayToken,
        string displayLabel,
        string last4,
        int? expiryMonth,
        int? expiryYear,
        DateTimeOffset createdAt)
        : base(id)
    {
        AccountId = accountId;
        Type = type;
        GatewayToken = Guard.NotBlank(gatewayToken, "payment_method.token", 128);
        DisplayLabel = Guard.NotBlank(displayLabel, "payment_method.label", 60);
        if (last4.Length != 4 || !last4.All(char.IsDigit))
        {
            throw new DomainException("payment_method.last4", "Last four digits must be exactly four digits.");
        }

        Last4 = last4;
        ExpiryMonth = expiryMonth;
        ExpiryYear = expiryYear;
        CreatedAt = createdAt;
    }

    public Guid AccountId { get; private set; }

    public PaymentMethodType Type { get; private set; }

    /// <summary>Opaque gateway token; never shown to users.</summary>
    public string GatewayToken { get; private set; } = string.Empty;

    /// <summary>E.g. card brand ("Visa") or bank name.</summary>
    public string DisplayLabel { get; private set; } = string.Empty;

    public string Last4 { get; private set; } = string.Empty;

    public int? ExpiryMonth { get; private set; }

    public int? ExpiryYear { get; private set; }

    public bool IsDefault { get; private set; }

    public bool IsRemoved { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public static PaymentMethod CreateCard(
        Guid id, Guid accountId, string gatewayToken, string brand, string last4, int expiryMonth, int expiryYear, DateOnly today, DateTimeOffset now)
    {
        Guard.InRange(expiryMonth, 1, 12, "payment_method.expiry_month");
        Guard.InRange(expiryYear, 2000, 2100, "payment_method.expiry_year");
        var method = new PaymentMethod(id, accountId, PaymentMethodType.Card, gatewayToken, brand, last4, expiryMonth, expiryYear, now);
        if (method.IsExpired(today))
        {
            throw new DomainException("payment_method.expired", "The card has expired.");
        }

        return method;
    }

    public static PaymentMethod CreateDirectDebit(Guid id, Guid accountId, string mandateToken, string bankName, string accountLast4, DateTimeOffset now) =>
        new(id, accountId, PaymentMethodType.DirectDebit, mandateToken, bankName, accountLast4, null, null, now);

    /// <summary>A card is valid through the last day of its expiry month.</summary>
    public bool IsExpired(DateOnly today)
    {
        if (Type != PaymentMethodType.Card || ExpiryMonth is null || ExpiryYear is null)
        {
            return false;
        }

        var firstInvalidDay = new DateOnly(ExpiryYear.Value, ExpiryMonth.Value, 1).AddMonths(1);
        return today >= firstInvalidDay;
    }

    /// <summary>True when the card expires within <paramref name="days"/> days.</summary>
    public bool ExpiresWithin(DateOnly today, int days) =>
        Type == PaymentMethodType.Card && !IsExpired(today) && IsExpired(today.AddDays(days));

    public bool IsUsable(DateOnly today) => !IsRemoved && !IsExpired(today);

    public void EnsureUsable(DateOnly today)
    {
        if (IsRemoved)
        {
            throw new DomainException("payment_method.removed", "This payment method has been removed.");
        }

        if (IsExpired(today))
        {
            throw new DomainException("payment_method.expired", "This payment method has expired.");
        }
    }

    internal void SetDefault(bool isDefault) => IsDefault = isDefault;

    internal void MarkRemoved()
    {
        IsRemoved = true;
        IsDefault = false;
    }

    public string Masked => Type == PaymentMethodType.Card
        ? $"{DisplayLabel} •••• {Last4} ({ExpiryMonth:00}/{ExpiryYear % 100:00})"
        : $"{DisplayLabel} Direct Debit •••• {Last4}";
}

/// <summary>
/// Rules spanning all payment methods on an account: exactly one default among the usable methods,
/// and the method backing autopay cannot be removed while autopay is on.
/// </summary>
public static class PaymentMethodWallet
{
    public const int MaxMethodsPerAccount = 5;

    public static void EnsureCanAdd(IReadOnlyCollection<PaymentMethod> existing)
    {
        if (existing.Count(m => !m.IsRemoved) >= MaxMethodsPerAccount)
        {
            throw new DomainException("payment_method.limit", $"An account can hold at most {MaxMethodsPerAccount} payment methods.");
        }
    }

    public static void MakeDefault(IReadOnlyCollection<PaymentMethod> methods, Guid methodId, DateOnly today)
    {
        var target = methods.FirstOrDefault(m => m.Id == methodId)
            ?? throw new DomainException("payment_method.not_found", "Payment method not found.");
        target.EnsureUsable(today);
        foreach (var method in methods)
        {
            method.SetDefault(method.Id == methodId);
        }
    }

    /// <summary>Removes a method; if it was the default, the newest remaining usable method is promoted.</summary>
    public static void Remove(IReadOnlyCollection<PaymentMethod> methods, Guid methodId, AutopaySettings? autopay, DateOnly today)
    {
        var target = methods.FirstOrDefault(m => m.Id == methodId && !m.IsRemoved)
            ?? throw new DomainException("payment_method.not_found", "Payment method not found.");

        if (autopay is { Enabled: true } && autopay.PaymentMethodId == methodId)
        {
            throw new DomainException("payment_method.in_use_by_autopay", "Choose another autopay method or turn autopay off before removing this one.");
        }

        var wasDefault = target.IsDefault;
        target.MarkRemoved();
        if (wasDefault)
        {
            var replacement = methods
                .Where(m => m.Id != methodId && m.IsUsable(today))
                .OrderByDescending(m => m.CreatedAt)
                .FirstOrDefault();
            replacement?.SetDefault(true);
        }
    }
}
```

## apps/uconnect/src/Uconnect.Domain/PlanChanges/PlanChange.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/PlanChanges/PlanChange.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.PlanChanges;

/// <summary>
/// A customer's accepted request to move a service between plans. Lifecycle:
/// <c>Requested → Scheduled → Provisioning → Completed</c>, with <c>Failed</c> from provisioning and
/// <c>Cancelled</c> allowed until provisioning starts.
/// </summary>
public sealed class PlanChange : AggregateRoot
{
    private static readonly Dictionary<PlanChangeStatus, PlanChangeStatus[]> AllowedTransitions = new()
    {
        [PlanChangeStatus.Requested] = new[] { PlanChangeStatus.Scheduled, PlanChangeStatus.Provisioning, PlanChangeStatus.Cancelled },
        [PlanChangeStatus.Scheduled] = new[] { PlanChangeStatus.Provisioning, PlanChangeStatus.Cancelled },
        [PlanChangeStatus.Provisioning] = new[] { PlanChangeStatus.Completed, PlanChangeStatus.Failed },
        [PlanChangeStatus.Failed] = new[] { PlanChangeStatus.Provisioning, PlanChangeStatus.Cancelled },
        [PlanChangeStatus.Completed] = Array.Empty<PlanChangeStatus>(),
        [PlanChangeStatus.Cancelled] = Array.Empty<PlanChangeStatus>(),
    };

    public const int MaxProvisioningAttempts = 3;

    private PlanChange()
    {
    }

    public PlanChange(Guid id, Guid accountId, PlanChangeQuote quote, Guid requestedByUserId, DateTimeOffset requestedAt)
        : base(id)
    {
        AccountId = accountId;
        ServiceId = quote.ServiceId;
        FromPlanId = quote.FromPlanId;
        ToPlanId = quote.ToPlanId;
        ChangeType = quote.ChangeType;
        EffectiveOn = quote.EffectiveOn;
        PreviousMonthlyPrice = quote.CurrentMonthlyPrice;
        NewMonthlyPrice = quote.NewMonthlyPrice;
        ProrationCredit = quote.Proration?.Credit ?? Money.Zero(quote.NewMonthlyPrice.Currency);
        ProrationCharge = quote.Proration?.Charge ?? Money.Zero(quote.NewMonthlyPrice.Currency);
        ProrationDays = quote.Proration?.DaysRemaining ?? 0;
        EarlyTerminationFee = quote.EarlyTerminationFee;
        RequestedByUserId = requestedByUserId;
        RequestedAt = requestedAt;
        Status = PlanChangeStatus.Requested;
    }

    public Guid AccountId { get; private set; }

    public Guid ServiceId { get; private set; }

    public Guid FromPlanId { get; private set; }

    public Guid ToPlanId { get; private set; }

    public PlanChangeType ChangeType { get; private set; }

    public PlanChangeStatus Status { get; private set; }

    public DateOnly EffectiveOn { get; private set; }

    public Money PreviousMonthlyPrice { get; private set; } = null!;

    public Money NewMonthlyPrice { get; private set; } = null!;

    public Money ProrationCredit { get; private set; } = null!;

    public Money ProrationCharge { get; private set; } = null!;

    public int ProrationDays { get; private set; }

    public Money EarlyTerminationFee { get; private set; } = null!;

    public Guid RequestedByUserId { get; private set; }

    public DateTimeOffset RequestedAt { get; private set; }

    /// <summary>Order reference returned by the provisioning platform.</summary>
    public string? ProvisioningOrderRef { get; private set; }

    public int ProvisioningAttempts { get; private set; }

    public string? FailureReason { get; private set; }

    public DateTimeOffset? CompletedAt { get; private set; }

    /// <summary>Invoice on which the proration / fee lines were billed, once billed.</summary>
    public Guid? BilledOnInvoiceId { get; private set; }

    public bool IsOpen => Status is PlanChangeStatus.Requested or PlanChangeStatus.Scheduled
        or PlanChangeStatus.Provisioning or PlanChangeStatus.Failed;

    public bool HasBillableAmounts => !ProrationCredit.IsZero || !ProrationCharge.IsZero || !EarlyTerminationFee.IsZero;

    /// <summary>True when the change should be sent to provisioning on <paramref name="today"/>.</summary>
    public bool IsDue(DateOnly today) =>
        (Status == PlanChangeStatus.Requested || Status == PlanChangeStatus.Scheduled) && EffectiveOn <= today;

    public void Schedule()
    {
        TransitionTo(PlanChangeStatus.Scheduled);
    }

    public void MarkProvisioning(string orderRef, DateTimeOffset now)
    {
        if (Status == PlanChangeStatus.Failed && ProvisioningAttempts >= MaxProvisioningAttempts)
        {
            throw new DomainException("plan_change.retries_exhausted", "Provisioning has failed too many times; raise a support ticket.");
        }

        TransitionTo(PlanChangeStatus.Provisioning);
        ProvisioningOrderRef = Guard.NotBlank(orderRef, "plan_change.order_ref", 64);
        ProvisioningAttempts++;
        FailureReason = null;
        Raise(new PlanChangeProvisioningStarted(Id, ServiceId, orderRef, now));
    }

    public void Complete(DateTimeOffset now)
    {
        TransitionTo(PlanChangeStatus.Completed);
        CompletedAt = now;
        Raise(new PlanChangeCompleted(Id, AccountId, ServiceId, ToPlanId, ChangeType, now));
    }

    public void Fail(string reason, DateTimeOffset now)
    {
        TransitionTo(PlanChangeStatus.Failed);
        FailureReason = Guard.NotBlank(reason, "plan_change.failure_reason", 500);
        Raise(new PlanChangeFailed(Id, AccountId, ServiceId, FailureReason, now));
    }

    public void Cancel(DateTimeOffset now)
    {
        TransitionTo(PlanChangeStatus.Cancelled);
        Raise(new PlanChangeCancelled(Id, ServiceId, now));
    }

    public void MarkBilled(Guid invoiceId)
    {
        if (Status != PlanChangeStatus.Completed)
        {
            throw new DomainException("plan_change.not_completed", "Only completed plan changes can be billed.");
        }

        if (BilledOnInvoiceId is not null)
        {
            throw new DomainException("plan_change.already_billed", "This plan change has already been billed.");
        }

        BilledOnInvoiceId = invoiceId;
    }

    private void TransitionTo(PlanChangeStatus target)
    {
        if (!AllowedTransitions[Status].Contains(target))
        {
            throw new InvalidStateTransitionException(nameof(PlanChange), Status.ToString(), target.ToString());
        }

        Status = target;
    }
}

public sealed record PlanChangeProvisioningStarted(Guid PlanChangeId, Guid ServiceId, string OrderRef, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record PlanChangeCompleted(Guid PlanChangeId, Guid AccountId, Guid ServiceId, Guid ToPlanId, PlanChangeType ChangeType, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record PlanChangeFailed(Guid PlanChangeId, Guid AccountId, Guid ServiceId, string Reason, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record PlanChangeCancelled(Guid PlanChangeId, Guid ServiceId, DateTimeOffset OccurredAt) : IDomainEvent;
```

## apps/uconnect/src/Uconnect.Domain/PlanChanges/PlanChangePolicy.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/PlanChanges/PlanChangePolicy.cs`.

```csharp
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
```

## apps/uconnect/src/Uconnect.Domain/PlanChanges/ProrationCalculator.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/PlanChanges/ProrationCalculator.cs`.

```csharp
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
/// Daily-rate proration: <c>amount × daysRemaining / daysInPeriod</c>, computed in integer minor
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
```
