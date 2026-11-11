# iConnect Wholesale ordering: apps/iconnect-wholesale/server/src (part 4 of 7)

- **Application:** iConnect Wholesale ordering
- **Tech stack:** .NET 8 Web API + Angular
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 17

## Files

- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Orders/Order.cs` (314 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Orders/OrderStateMachine.cs` (60 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Partners/ApiKey.cs` (114 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Partners/Partner.cs` (58 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Services/WholesaleService.cs` (113 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Sla/ServiceCreditCalculator.cs` (115 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Sla/SlaClock.cs` (203 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Sla/SlaPolicy.cs` (94 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Sla/WorkingCalendar.cs` (260 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/DependencyInjection.cs` (61 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/IConnect.Wholesale.Infrastructure.csproj` (16 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Notifications/WebhookPartnerNotifier.cs` (98 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Configurations/CommercialConfiguration.cs` (130 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Configurations/FaultConfiguration.cs` (54 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Configurations/OrderConfiguration.cs` (79 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Converters/MoneyConverter.cs` (34 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/EfUnitOfWork.cs` (101 lines)

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Orders/Order.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Orders/Order.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Domain.Orders;

/// <summary>
/// A wholesale order placed by a partner (ISP) against a premise identified by its UPRN.
/// Provide orders create a new service; Cease, Modify and Migrate act on an existing service.
/// The delivery SLA clock starts on validation and runs against the business-hours calendar
/// until the order is completed; customer-caused holds pause it.
/// </summary>
public sealed class Order : AggregateRoot
{
    private readonly List<OrderStatusChange> _history = new();

    private Order()
    {
    }

    private Order(
        string reference,
        Guid partnerId,
        string partnerReference,
        OrderType type,
        string uprn,
        string? productCode,
        CareLevel careLevel,
        Guid? existingServiceId,
        string? migrationAuthCode,
        DateOnly requestedDate,
        DateTimeOffset now)
    {
        Reference = reference;
        PartnerId = partnerId;
        PartnerReference = partnerReference;
        Type = type;
        Uprn = uprn;
        ProductCode = productCode;
        CareLevel = careLevel;
        ExistingServiceId = existingServiceId;
        MigrationAuthCode = migrationAuthCode;
        RequestedDate = requestedDate;
        Status = OrderStatus.Draft;
        Touch(now);
        _history.Add(new OrderStatusChange(null, OrderStatus.Draft, now, "created", null));
    }

    public string Reference { get; private set; } = string.Empty;

    public Guid PartnerId { get; private set; }

    /// <summary>The partner's own reference; unique per partner and used for idempotent submission.</summary>
    public string PartnerReference { get; private set; } = string.Empty;

    public OrderType Type { get; private set; }

    public OrderStatus Status { get; private set; }

    public string Uprn { get; private set; } = string.Empty;

    public string? ProductCode { get; private set; }

    public CareLevel CareLevel { get; private set; }

    public Guid? ExistingServiceId { get; private set; }

    public string? MigrationAuthCode { get; private set; }

    public DateOnly RequestedDate { get; private set; }

    public DateOnly? CommittedDate { get; private set; }

    public DateOnly? CompletedDate { get; private set; }

    public Guid? AppointmentSlotId { get; private set; }

    public Money? MonthlyRental { get; private set; }

    public Money? OneOffCharge { get; private set; }

    public Money? CancellationCharge { get; private set; }

    public string? FailureReason { get; private set; }

    public string? HoldReason { get; private set; }

    public Guid? ResultingServiceId { get; private set; }

    public SlaClock? DeliveryClock { get; private set; }

    public Guid? BulkUploadId { get; private set; }

    public IReadOnlyList<OrderStatusChange> History => _history;

    public bool IsOnHold => HoldReason is not null;

    public static Order CreateDraft(
        string reference,
        Guid partnerId,
        string partnerReference,
        OrderType type,
        string uprn,
        string? productCode,
        CareLevel careLevel,
        Guid? existingServiceId,
        string? migrationAuthCode,
        DateOnly requestedDate,
        DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(partnerReference) || partnerReference.Length > 40)
        {
            throw new DomainException("order.invalid_partner_reference", "Partner reference is required and must be at most 40 characters.");
        }

        switch (type)
        {
            case OrderType.Provide when string.IsNullOrWhiteSpace(productCode):
                throw new DomainException("order.product_required", "Provide orders require a product code.");
            case OrderType.Provide when existingServiceId is not null:
                throw new DomainException("order.unexpected_service", "Provide orders must not reference an existing service.");
            case OrderType.Cease or OrderType.Modify when existingServiceId is null:
                throw new DomainException("order.service_required", $"{type} orders require an existing service id.");
            case OrderType.Modify when string.IsNullOrWhiteSpace(productCode):
                throw new DomainException("order.product_required", "Modify orders require the target product code.");
            case OrderType.Migrate when string.IsNullOrWhiteSpace(migrationAuthCode):
                throw new DomainException("order.migration_code_required", "Migrate orders require the losing provider's switching code.");
            case OrderType.Migrate when string.IsNullOrWhiteSpace(productCode):
                throw new DomainException("order.product_required", "Migrate orders require a product code.");
        }

        return new Order(reference, partnerId, partnerReference.Trim(), type, uprn, productCode, careLevel,
            existingServiceId, migrationAuthCode, requestedDate, now);
    }

    public void AttachToBulkUpload(Guid bulkUploadId) => BulkUploadId = bulkUploadId;

    public void Price(Money monthlyRental, Money oneOffCharge)
    {
        EnsureAmendable();
        MonthlyRental = monthlyRental;
        OneOffCharge = oneOffCharge;
    }

    public void Submit(DateTimeOffset now, string actor)
    {
        if (Type is OrderType.Provide or OrderType.Modify or OrderType.Migrate && MonthlyRental is null)
        {
            throw new DomainException("order.not_priced", "Order must be priced before submission.");
        }

        Move(OrderStatus.Submitted, now, "submitted", actor);
    }

    /// <summary>
    /// Accepts the order, fixes the committed completion date and starts the delivery SLA clock.
    /// The committed date is the later of the requested date and the lead-time date.
    /// </summary>
    public void Validate(DateTimeOffset now, WorkingCalendar calendar, int leadTimeWorkingDays, string actor)
    {
        var earliest = calendar.AddWorkingDays(calendar.LocalDate(now), leadTimeWorkingDays);
        CommittedDate = RequestedDate > earliest ? RequestedDate : earliest;
        var target = TimeSpan.FromTicks(calendar.NominalDayLength.Ticks * calendar.WorkingDaysBetween(calendar.LocalDate(now), CommittedDate.Value));
        DeliveryClock = new SlaClock(now, target <= TimeSpan.Zero ? calendar.NominalDayLength : target, calendar.Name);
        Move(OrderStatus.Validated, now, $"committed for {CommittedDate:yyyy-MM-dd}", actor);
    }

    public void Reject(DateTimeOffset now, string reason, string actor)
    {
        FailureReason = reason;
        DeliveryClock?.Stop(now);
        Move(OrderStatus.Failed, now, reason, actor);
    }

    public void StartProvisioning(DateTimeOffset now, string actor)
    {
        if (Type is OrderType.Provide or OrderType.Migrate && AppointmentSlotId is null)
        {
            throw new DomainException("order.appointment_required", $"{Type} orders need a booked appointment before provisioning.");
        }

        Move(OrderStatus.Provisioning, now, "provisioning started", actor);
    }

    public void BookAppointment(Guid slotId, DateOnly slotDate)
    {
        if (!OrderStateMachine.IsAmendable(Status) && Status != OrderStatus.Provisioning)
        {
            throw new DomainException("order.not_amendable", $"Appointments cannot be changed while the order is {Status}.");
        }

        if (Status == OrderStatus.Validated && CommittedDate is { } committed && slotDate > committed)
        {
            CommittedDate = slotDate;
        }

        AppointmentSlotId = slotId;
    }

    public Guid? ReleaseAppointment()
    {
        var released = AppointmentSlotId;
        AppointmentSlotId = null;
        return released;
    }

    public void PlaceOnHold(DateTimeOffset now, string reason, string actor)
    {
        if (Status is not (OrderStatus.Validated or OrderStatus.Provisioning))
        {
            throw new DomainException("order.hold_not_allowed", "Only validated or provisioning orders can be placed on hold.");
        }

        if (IsOnHold)
        {
            return;
        }

        HoldReason = reason;
        DeliveryClock?.Pause(now, reason);
        _history.Add(new OrderStatusChange(Status, Status, now, $"on hold: {reason}", actor));
    }

    public void ReleaseHold(DateTimeOffset now, string actor)
    {
        if (!IsOnHold)
        {
            return;
        }

        HoldReason = null;
        DeliveryClock?.Resume(now);
        _history.Add(new OrderStatusChange(Status, Status, now, "hold released", actor));
    }

    public void Complete(DateTimeOffset now, DateOnly completedDate, Guid? resultingServiceId, string actor)
    {
        if (IsOnHold)
        {
            throw new DomainException("order.on_hold", "Release the hold before completing the order.");
        }

        CompletedDate = completedDate;
        ResultingServiceId = resultingServiceId ?? ExistingServiceId;
        DeliveryClock?.Stop(now);
        Move(OrderStatus.Active, now, "completed", actor);
    }

    /// <summary>
    /// Cancels the order. Once provisioning has started and an engineer visit is booked, a
    /// cancellation charge equal to the one-off charge applies (work has been dispatched).
    /// </summary>
    public void Cancel(DateTimeOffset now, string reason, string actor)
    {
        OrderStateMachine.EnsureCanTransition(Status, OrderStatus.Cancelled);
        if (Status == OrderStatus.Provisioning && AppointmentSlotId is not null && OneOffCharge is { } charge)
        {
            CancellationCharge = charge;
        }

        DeliveryClock?.Stop(now);
        HoldReason = null;
        Move(OrderStatus.Cancelled, now, reason, actor);
    }

    public void AmendRequestedDate(DateOnly requestedDate)
    {
        EnsureAmendable();
        RequestedDate = requestedDate;
        if (CommittedDate is { } committed && requestedDate > committed)
        {
            CommittedDate = requestedDate;
        }
    }

    /// <summary>Working days late against the committed date, using the supplied calendar.</summary>
    public int WorkingDaysLate(WorkingCalendar calendar)
    {
        if (CommittedDate is not { } committed || CompletedDate is not { } completed)
        {
            return 0;
        }

        return calendar.WorkingDaysBetween(committed, completed);
    }

    private void EnsureAmendable()
    {
        if (!OrderStateMachine.IsAmendable(Status))
        {
            throw new DomainException("order.not_amendable", $"Order cannot be amended while {Status}.");
        }
    }

    private void Move(OrderStatus to, DateTimeOffset now, string note, string? actor)
    {
        OrderStateMachine.EnsureCanTransition(Status, to);
        var from = Status;
        Status = to;
        Touch(now);
        _history.Add(new OrderStatusChange(from, to, now, note, actor));
        Raise(new OrderStatusChanged(Id, Reference, PartnerId, from, to, now));
    }
}

public sealed record OrderStatusChange(OrderStatus? From, OrderStatus To, DateTimeOffset At, string Note, string? Actor);

public sealed record OrderStatusChanged(
    Guid OrderId,
    string Reference,
    Guid PartnerId,
    OrderStatus From,
    OrderStatus To,
    DateTimeOffset OccurredAt) : IDomainEvent;
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Orders/OrderStateMachine.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Orders/OrderStateMachine.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Orders;

public enum OrderType
{
    Provide,
    Cease,
    Modify,
    Migrate,
}

public enum OrderStatus
{
    Draft,
    Submitted,
    Validated,
    Provisioning,
    Active,
    Cancelled,
    Failed,
}

/// <summary>
/// The wholesale order lifecycle: DRAFT → SUBMITTED → VALIDATED → PROVISIONING → ACTIVE,
/// with CANCELLED and FAILED as terminal side exits. The table is the single source of truth
/// for which moves are legal; aggregates call <see cref="EnsureCanTransition"/> before mutating.
/// </summary>
public static class OrderStateMachine
{
    private static readonly IReadOnlyDictionary<OrderStatus, OrderStatus[]> Allowed = new Dictionary<OrderStatus, OrderStatus[]>
    {
        [OrderStatus.Draft] = new[] { OrderStatus.Submitted, OrderStatus.Cancelled },
        [OrderStatus.Submitted] = new[] { OrderStatus.Validated, OrderStatus.Failed, OrderStatus.Cancelled },
        [OrderStatus.Validated] = new[] { OrderStatus.Provisioning, OrderStatus.Failed, OrderStatus.Cancelled },
        [OrderStatus.Provisioning] = new[] { OrderStatus.Active, OrderStatus.Failed, OrderStatus.Cancelled },
        [OrderStatus.Active] = Array.Empty<OrderStatus>(),
        [OrderStatus.Cancelled] = Array.Empty<OrderStatus>(),
        [OrderStatus.Failed] = Array.Empty<OrderStatus>(),
    };

    public static bool CanTransition(OrderStatus from, OrderStatus to) => Allowed[from].Contains(to);

    public static IReadOnlyCollection<OrderStatus> NextStates(OrderStatus from) => Allowed[from];

    public static bool IsTerminal(OrderStatus status) => Allowed[status].Length == 0;

    /// <summary>Statuses during which the partner may still amend the requested date or appointment.</summary>
    public static bool IsAmendable(OrderStatus status) =>
        status is OrderStatus.Draft or OrderStatus.Submitted or OrderStatus.Validated;

    public static void EnsureCanTransition(OrderStatus from, OrderStatus to)
    {
        if (!CanTransition(from, to))
        {
            throw new InvalidTransitionException("order", from.ToString().ToUpperInvariant(), to.ToString().ToUpperInvariant());
        }
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Partners/ApiKey.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Partners/ApiKey.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Partners;

/// <summary>Scopes a partner integration key can be granted. Mirrors the API's authorisation policies.</summary>
public static class ApiScopes
{
    public const string AvailabilityRead = "availability:read";
    public const string CatalogueRead = "catalogue:read";
    public const string OrdersRead = "orders:read";
    public const string OrdersWrite = "orders:write";
    public const string FaultsRead = "faults:read";
    public const string FaultsWrite = "faults:write";
    public const string BillingRead = "billing:read";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        AvailabilityRead, CatalogueRead, OrdersRead, OrdersWrite, FaultsRead, FaultsWrite, BillingRead,
    };
}

/// <summary>
/// A machine credential for partner system-to-system integration. Only a SHA-256 hash of the
/// secret is stored; the plaintext is shown once at creation. The public prefix lets the
/// authentication handler find the candidate key without scanning all hashes.
/// </summary>
public sealed class ApiKey : Entity
{
    public const int MaxActiveKeysPerPartner = 5;
    public static readonly TimeSpan MaxLifetime = TimeSpan.FromDays(365);

    private ApiKey()
    {
    }

    public ApiKey(Guid partnerId, string name, string prefix, string secretHash, IEnumerable<string> scopes,
        DateTimeOffset now, DateTimeOffset expiresAt, string createdBy)
    {
        var scopeList = scopes.Distinct(StringComparer.Ordinal).ToList();
        var unknown = scopeList.Where(s => !ApiScopes.All.Contains(s)).ToList();
        if (unknown.Count > 0)
        {
            throw new DomainException("apikey.unknown_scope", $"Unknown scope(s): {string.Join(", ", unknown)}.");
        }

        if (scopeList.Count == 0)
        {
            throw new DomainException("apikey.no_scopes", "An API key needs at least one scope.");
        }

        if (expiresAt <= now || expiresAt - now > MaxLifetime)
        {
            throw new DomainException("apikey.invalid_expiry", $"Expiry must be in the future and within {MaxLifetime.TotalDays} days.");
        }

        if (string.IsNullOrWhiteSpace(name) || name.Length > 60)
        {
            throw new DomainException("apikey.invalid_name", "Key name is required and must be at most 60 characters.");
        }

        PartnerId = partnerId;
        Name = name.Trim();
        Prefix = prefix;
        SecretHash = secretHash;
        Scopes = scopeList;
        ExpiresAt = expiresAt;
        CreatedBy = createdBy;
        Touch(now);
    }

    public Guid PartnerId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public string Prefix { get; private set; } = string.Empty;

    public string SecretHash { get; private set; } = string.Empty;

    public List<string> Scopes { get; private set; } = new();

    public DateTimeOffset ExpiresAt { get; private set; }

    public DateTimeOffset? RevokedAt { get; private set; }

    public DateTimeOffset? LastUsedAt { get; private set; }

    public string CreatedBy { get; private set; } = string.Empty;

    public bool IsUsable(DateTimeOffset now) => RevokedAt is null && now < ExpiresAt;

    public void Revoke(DateTimeOffset now)
    {
        if (RevokedAt is not null)
        {
            return;
        }

        RevokedAt = now;
        Touch(now);
    }

    /// <summary>Records usage, throttled to one write per minute to avoid a DB write on every request.</summary>
    public bool RecordUse(DateTimeOffset now)
    {
        if (LastUsedAt is { } last && now - last < TimeSpan.FromMinutes(1))
        {
            return false;
        }

        LastUsedAt = now;
        return true;
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Partners/Partner.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Partners/Partner.cs`.

```csharp
using System.Text.RegularExpressions;
using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Partners;

public enum PartnerStatus
{
    Active,
    Suspended,
    Terminated,
}

/// <summary>A wholesale partner (ISP). Its billing account follows the ACC-######## format.</summary>
public sealed partial class Partner : Entity
{
    private Partner()
    {
    }

    public Partner(string name, string accountNumber, string currency, int creditLimitOrders)
    {
        if (!AccountNumberPattern().IsMatch(accountNumber))
        {
            throw new DomainException("partner.invalid_account", $"'{accountNumber}' is not a valid account number (ACC-########).");
        }

        Name = name;
        AccountNumber = accountNumber;
        Currency = currency;
        MaxOpenOrders = creditLimitOrders;
        Status = PartnerStatus.Active;
    }

    public string Name { get; private set; } = string.Empty;

    public string AccountNumber { get; private set; } = string.Empty;

    public string Currency { get; private set; } = "GBP";

    public PartnerStatus Status { get; private set; }

    /// <summary>Commercial limit on concurrent in-flight orders (credit/forecast control).</summary>
    public int MaxOpenOrders { get; private set; }

    public bool CanTrade => Status == PartnerStatus.Active;

    public void Suspend() => Status = Status == PartnerStatus.Terminated
        ? throw new DomainException("partner.terminated", "Terminated partners cannot be suspended.")
        : PartnerStatus.Suspended;

    public void Reinstate() => Status = Status == PartnerStatus.Terminated
        ? throw new DomainException("partner.terminated", "Terminated partners cannot be reinstated.")
        : PartnerStatus.Active;

    [GeneratedRegex("^ACC-[0-9]{8}$")]
    private static partial Regex AccountNumberPattern();
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Services/WholesaleService.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Services/WholesaleService.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Sla/ServiceCreditCalculator.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Sla/ServiceCreditCalculator.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Sla/SlaClock.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Sla/SlaClock.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Sla;

/// <summary>
/// A stop-start SLA clock. Working time only accrues while the clock is running; intervals where
/// the clock is paused (e.g. a fault waiting on the partner, or an order on customer-caused hold)
/// are excluded. The clock is persisted as plain values so it can be owned by any aggregate.
/// </summary>
public sealed class SlaClock
{
    private readonly List<SlaPause> _pauses = new();

    private SlaClock()
    {
    }

    public SlaClock(DateTimeOffset startedAt, TimeSpan target, string calendarName)
    {
        if (target <= TimeSpan.Zero)
        {
            throw new DomainException("sla.invalid_target", "SLA target must be positive.");
        }

        StartedAt = startedAt;
        Target = target;
        CalendarName = calendarName;
    }

    public DateTimeOffset StartedAt { get; private set; }

    public TimeSpan Target { get; private set; }

    public string CalendarName { get; private set; } = string.Empty;

    public DateTimeOffset? StoppedAt { get; private set; }

    /// <summary>Set once by the breach monitor so breach notifications are raised exactly once.</summary>
    public DateTimeOffset? BreachRecordedAt { get; private set; }

    public IReadOnlyList<SlaPause> Pauses => _pauses;

    public bool IsPaused => _pauses.Count > 0 && _pauses[^1].ResumedAt is null;

    public bool IsStopped => StoppedAt.HasValue;

    public void Pause(DateTimeOffset at, string reason)
    {
        EnsureNotStopped();
        if (IsPaused)
        {
            return;
        }

        if (at < StartedAt)
        {
            throw new DomainException("sla.pause_before_start", "Cannot pause an SLA clock before it started.");
        }

        _pauses.Add(new SlaPause(at, null, reason));
    }

    public void Resume(DateTimeOffset at)
    {
        EnsureNotStopped();
        if (!IsPaused)
        {
            return;
        }

        var open = _pauses[^1];
        if (at < open.PausedAt)
        {
            throw new DomainException("sla.resume_before_pause", "Cannot resume an SLA clock before it was paused.");
        }

        _pauses[^1] = open with { ResumedAt = at };
    }

    public void Stop(DateTimeOffset at)
    {
        if (IsStopped)
        {
            return;
        }

        if (IsPaused)
        {
            Resume(at);
        }

        StoppedAt = at;
    }

    /// <summary>Restarts a stopped clock (e.g. a fault re-opened) without losing elapsed time.</summary>
    public void Reopen(DateTimeOffset at)
    {
        if (!IsStopped)
        {
            return;
        }

        _pauses.Add(new SlaPause(StoppedAt!.Value, at, "reopened"));
        StoppedAt = null;
    }

    public TimeSpan Elapsed(WorkingCalendar calendar, DateTimeOffset now)
    {
        var end = StoppedAt ?? now;
        var gross = calendar.WorkingTimeBetween(StartedAt, end);
        var paused = TimeSpan.Zero;
        foreach (var pause in _pauses)
        {
            var pauseEnd = pause.ResumedAt ?? end;
            if (pauseEnd > end)
            {
                pauseEnd = end;
            }

            paused += calendar.WorkingTimeBetween(pause.PausedAt, pauseEnd);
        }

        var net = gross - paused;
        return net < TimeSpan.Zero ? TimeSpan.Zero : net;
    }

    public TimeSpan Remaining(WorkingCalendar calendar, DateTimeOffset now)
    {
        var remaining = Target - Elapsed(calendar, now);
        return remaining < TimeSpan.Zero ? TimeSpan.Zero : remaining;
    }

    public TimeSpan Overrun(WorkingCalendar calendar, DateTimeOffset now)
    {
        var overrun = Elapsed(calendar, now) - Target;
        return overrun < TimeSpan.Zero ? TimeSpan.Zero : overrun;
    }

    public bool IsBreached(WorkingCalendar calendar, DateTimeOffset now) => Elapsed(calendar, now) > Target;

    /// <summary>Projected breach instant if the clock keeps running; null while paused or stopped.</summary>
    public DateTimeOffset? DueAt(WorkingCalendar calendar, DateTimeOffset now)
    {
        if (IsStopped || IsPaused)
        {
            return null;
        }

        return calendar.AddWorkingTime(now, Remaining(calendar, now));
    }

    public SlaStatus Status(WorkingCalendar calendar, DateTimeOffset now, double atRiskThreshold = 0.8)
    {
        var elapsed = Elapsed(calendar, now);
        if (elapsed > Target)
        {
            return SlaStatus.Breached;
        }

        if (IsStopped)
        {
            return SlaStatus.Met;
        }

        if (IsPaused)
        {
            return SlaStatus.Paused;
        }

        return elapsed.TotalSeconds >= Target.TotalSeconds * atRiskThreshold ? SlaStatus.AtRisk : SlaStatus.OnTrack;
    }

    public bool MarkBreachRecorded(DateTimeOffset at)
    {
        if (BreachRecordedAt.HasValue)
        {
            return false;
        }

        BreachRecordedAt = at;
        return true;
    }

    private void EnsureNotStopped()
    {
        if (IsStopped)
        {
            throw new DomainException("sla.stopped", "The SLA clock has already been stopped.");
        }
    }
}

public sealed record SlaPause(DateTimeOffset PausedAt, DateTimeOffset? ResumedAt, string Reason);

public enum SlaStatus
{
    OnTrack,
    AtRisk,
    Paused,
    Breached,
    Met,
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Sla/SlaPolicy.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Sla/SlaPolicy.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Orders;

namespace IConnect.Wholesale.Domain.Sla;

/// <summary>
/// Wholesale care level purchased per service. It selects the calendar against which fault
/// repair clocks run and the service-credit regime that applies on breach.
/// </summary>
public enum CareLevel
{
    Standard,
    Enhanced,
    Premium,
}

public enum CalendarKind
{
    BusinessHours,
    ExtendedHours,
    AlwaysOn,
}

/// <summary>Repair target for a fault at a given care level and priority.</summary>
public sealed record FaultRepairTarget(CareLevel CareLevel, FaultPriority Priority, CalendarKind Calendar, TimeSpan Target);

/// <summary>
/// The contractual SLA schedule. Kept as data so it can be loaded from configuration and
/// unit-tested; the defaults mirror the published wholesale contract schedule.
/// </summary>
public sealed class SlaPolicy
{
    private readonly Dictionary<(CareLevel, FaultPriority), FaultRepairTarget> _faultTargets;
    private readonly Dictionary<OrderType, int> _orderLeadTimeWorkingDays;

    public SlaPolicy(IEnumerable<FaultRepairTarget> faultTargets, IReadOnlyDictionary<OrderType, int> orderLeadTimes)
    {
        _faultTargets = faultTargets.ToDictionary(t => (t.CareLevel, t.Priority));
        _orderLeadTimeWorkingDays = orderLeadTimes.ToDictionary(kv => kv.Key, kv => kv.Value);

        foreach (var care in Enum.GetValues<CareLevel>())
        {
            foreach (var priority in Enum.GetValues<FaultPriority>())
            {
                if (!_faultTargets.ContainsKey((care, priority)))
                {
                    throw new DomainException("sla.policy_incomplete", $"No repair target for {care}/{priority}.");
                }
            }
        }

        foreach (var type in Enum.GetValues<OrderType>())
        {
            if (!_orderLeadTimeWorkingDays.ContainsKey(type))
            {
                throw new DomainException("sla.policy_incomplete", $"No lead time for {type} orders.");
            }
        }
    }

    public static SlaPolicy Default()
    {
        var targets = new List<FaultRepairTarget>();
        void Add(CareLevel care, CalendarKind cal, double p1, double p2, double p3, double p4)
        {
            targets.Add(new(care, FaultPriority.P1, cal, TimeSpan.FromHours(p1)));
            targets.Add(new(care, FaultPriority.P2, cal, TimeSpan.FromHours(p2)));
            targets.Add(new(care, FaultPriority.P3, cal, TimeSpan.FromHours(p3)));
            targets.Add(new(care, FaultPriority.P4, cal, TimeSpan.FromHours(p4)));
        }

        Add(CareLevel.Standard, CalendarKind.BusinessHours, 10, 20, 30, 50);
        Add(CareLevel.Enhanced, CalendarKind.ExtendedHours, 6, 12, 20, 40);
        Add(CareLevel.Premium, CalendarKind.AlwaysOn, 4, 8, 16, 32);

        var leadTimes = new Dictionary<OrderType, int>
        {
            [OrderType.Provide] = 10,
            [OrderType.Cease] = 5,
            [OrderType.Modify] = 3,
            [OrderType.Migrate] = 7,
        };

        return new SlaPolicy(targets, leadTimes);
    }

    public FaultRepairTarget RepairTarget(CareLevel careLevel, FaultPriority priority) => _faultTargets[(careLevel, priority)];

    public int OrderLeadTimeWorkingDays(OrderType type) => _orderLeadTimeWorkingDays[type];

    public static CalendarKind OrderCalendar => CalendarKind.BusinessHours;
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Sla/WorkingCalendar.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Sla/WorkingCalendar.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Sla;

/// <summary>
/// A working-time calendar in a specific time zone. Each day of the week has an optional
/// working window (start/end offsets from local midnight); bank holidays have no window.
/// All arithmetic is done on UTC instants, with day windows resolved in local time so that
/// daylight-saving transitions shorten or lengthen the window exactly as the clock on the wall does.
/// </summary>
public sealed class WorkingCalendar
{
    private const int MaxDaysToScan = 3_660;

    private readonly IReadOnlyDictionary<DayOfWeek, WorkingWindow> _windows;
    private readonly HashSet<DateOnly> _holidays;

    public WorkingCalendar(
        string name,
        TimeZoneInfo timeZone,
        IReadOnlyDictionary<DayOfWeek, WorkingWindow> windows,
        IEnumerable<DateOnly>? holidays = null)
    {
        ArgumentNullException.ThrowIfNull(timeZone);
        ArgumentNullException.ThrowIfNull(windows);

        if (windows.Count == 0)
        {
            throw new DomainException("calendar.no_working_days", "A calendar needs at least one working day.");
        }

        Name = name;
        TimeZone = timeZone;
        _windows = windows;
        _holidays = holidays is null ? new HashSet<DateOnly>() : new HashSet<DateOnly>(holidays);
    }

    public string Name { get; }

    public TimeZoneInfo TimeZone { get; }

    public IReadOnlyCollection<DateOnly> Holidays => _holidays;

    /// <summary>Monday-Friday 08:00-18:00 excluding the supplied holidays.</summary>
    public static WorkingCalendar StandardBusinessHours(TimeZoneInfo timeZone, IEnumerable<DateOnly> holidays)
    {
        var window = new WorkingWindow(TimeSpan.FromHours(8), TimeSpan.FromHours(18));
        var windows = new Dictionary<DayOfWeek, WorkingWindow>
        {
            [DayOfWeek.Monday] = window,
            [DayOfWeek.Tuesday] = window,
            [DayOfWeek.Wednesday] = window,
            [DayOfWeek.Thursday] = window,
            [DayOfWeek.Friday] = window,
        };
        return new WorkingCalendar("standard", timeZone, windows, holidays);
    }

    /// <summary>Monday-Saturday 07:00-21:00 excluding the supplied holidays.</summary>
    public static WorkingCalendar ExtendedHours(TimeZoneInfo timeZone, IEnumerable<DateOnly> holidays)
    {
        var window = new WorkingWindow(TimeSpan.FromHours(7), TimeSpan.FromHours(21));
        var windows = Enum.GetValues<DayOfWeek>()
            .Where(d => d != DayOfWeek.Sunday)
            .ToDictionary(d => d, _ => window);
        return new WorkingCalendar("extended", timeZone, windows, holidays);
    }

    /// <summary>Every hour of every day, including holidays.</summary>
    public static WorkingCalendar AlwaysOn(TimeZoneInfo timeZone)
    {
        var window = new WorkingWindow(TimeSpan.Zero, TimeSpan.FromHours(24));
        var windows = Enum.GetValues<DayOfWeek>().ToDictionary(d => d, _ => window);
        return new WorkingCalendar("24x7", timeZone, windows);
    }

    public bool IsWorkingDay(DateOnly day) => HasWindow(day);

    public bool IsWorkingTime(DateTimeOffset instant)
    {
        var window = GetWindowUtc(LocalDate(instant));
        return window is { } w && instant >= w.Start && instant < w.End;
    }

    /// <summary>Returns the UTC instant reached after consuming <paramref name="duration"/> of working time.</summary>
    public DateTimeOffset AddWorkingTime(DateTimeOffset start, TimeSpan duration)
    {
        if (duration < TimeSpan.Zero)
        {
            throw new DomainException("calendar.negative_duration", "Working time to add must not be negative.");
        }

        var remaining = duration;
        var day = LocalDate(start);

        for (var i = 0; i < MaxDaysToScan; i++, day = day.AddDays(1))
        {
            if (GetWindowUtc(day) is not { } window)
            {
                continue;
            }

            var effectiveStart = start > window.Start ? start : window.Start;
            if (effectiveStart >= window.End)
            {
                continue;
            }

            var available = window.End - effectiveStart;
            if (remaining <= available)
            {
                return effectiveStart + remaining;
            }

            remaining -= available;
        }

        throw new DomainException("calendar.horizon_exceeded", "Working time could not be scheduled within ten years.");
    }

    /// <summary>Working time elapsed between two instants. Returns zero when <paramref name="to"/> precedes <paramref name="from"/>.</summary>
    public TimeSpan WorkingTimeBetween(DateTimeOffset from, DateTimeOffset to)
    {
        if (to <= from)
        {
            return TimeSpan.Zero;
        }

        var total = TimeSpan.Zero;
        var lastDay = LocalDate(to);
        var day = LocalDate(from);

        for (var i = 0; i < MaxDaysToScan && day <= lastDay; i++, day = day.AddDays(1))
        {
            if (GetWindowUtc(day) is not { } window)
            {
                continue;
            }

            var overlapStart = from > window.Start ? from : window.Start;
            var overlapEnd = to < window.End ? to : window.End;
            if (overlapEnd > overlapStart)
            {
                total += overlapEnd - overlapStart;
            }
        }

        return total;
    }

    /// <summary>Adds whole working days to a calendar date (lead-time arithmetic for order commitments).</summary>
    public DateOnly AddWorkingDays(DateOnly from, int workingDays)
    {
        if (workingDays < 0)
        {
            throw new DomainException("calendar.negative_duration", "Working days to add must not be negative.");
        }

        var day = from;
        var added = 0;
        var guard = 0;
        while (added < workingDays)
        {
            day = day.AddDays(1);
            if (HasWindow(day))
            {
                added++;
            }

            if (++guard > MaxDaysToScan)
            {
                throw new DomainException("calendar.horizon_exceeded", "Working days could not be scheduled within ten years.");
            }
        }

        return day;
    }

    /// <summary>Counts working days strictly after <paramref name="from"/> up to and including <paramref name="to"/>.</summary>
    public int WorkingDaysBetween(DateOnly from, DateOnly to)
    {
        if (to <= from)
        {
            return 0;
        }

        var count = 0;
        for (var day = from.AddDays(1); day <= to; day = day.AddDays(1))
        {
            if (HasWindow(day))
            {
                count++;
            }
        }

        return count;
    }

    /// <summary>Length of the nominal working day, used to convert working hours into working days.</summary>
    public TimeSpan NominalDayLength => _windows.Values.Max(w => w.Length);

    public DateOnly LocalDate(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, TimeZone).DateTime);

    private bool HasWindow(DateOnly day) => GetWindowUtc(day) is not null;

    private (DateTimeOffset Start, DateTimeOffset End)? GetWindowUtc(DateOnly day)
    {
        if (!_windows.TryGetValue(day.DayOfWeek, out var window))
        {
            return null;
        }

        if (_holidays.Contains(day))
        {
            return null;
        }

        var midnight = day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        var start = ToUtc(midnight + window.Start);
        var end = ToUtc(midnight + window.End);
        return end > start ? (start, end) : null;
    }

    private DateTimeOffset ToUtc(DateTime local)
    {
        // Wall-clock times that do not exist (spring-forward gap) are moved past the gap.
        while (TimeZone.IsInvalidTime(local))
        {
            local = local.AddMinutes(30);
        }

        var utc = TimeZoneInfo.ConvertTimeToUtc(local, TimeZone);
        return new DateTimeOffset(utc, TimeSpan.Zero);
    }
}

/// <summary>A working window expressed as offsets from local midnight; End may be 24:00.</summary>
public readonly record struct WorkingWindow
{
    public WorkingWindow(TimeSpan start, TimeSpan end)
    {
        if (start < TimeSpan.Zero || end > TimeSpan.FromHours(24) || end <= start)
        {
            throw new DomainException("calendar.invalid_window", $"Working window {start}-{end} is not valid.");
        }

        Start = start;
        End = end;
    }

    public TimeSpan Start { get; }

    public TimeSpan End { get; }

    public TimeSpan Length => End - Start;

    public bool IsFullDay => Start == TimeSpan.Zero && End == TimeSpan.FromHours(24);
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/DependencyInjection.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/DependencyInjection.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Infrastructure.Notifications;
using IConnect.Wholesale.Infrastructure.Persistence;
using IConnect.Wholesale.Infrastructure.Persistence.Repositories;
using IConnect.Wholesale.Infrastructure.Time;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace IConnect.Wholesale.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Registers persistence, calendars, references and outbound notifications.
    /// <paramref name="configureWebhookClient"/> lets the host add message handlers (e.g. correlation-id propagation).
    /// </summary>
    public static IServiceCollection AddWholesaleInfrastructure(this IServiceCollection services, IConfiguration configuration,
        Action<IHttpClientBuilder>? configureWebhookClient = null)
    {
        var connectionString = configuration.GetConnectionString("Wholesale");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("ConnectionStrings:Wholesale is not configured (set ConnectionStrings__Wholesale).");
        }

        services.AddDbContext<WholesaleDbContext>(options => options.UseNpgsql(connectionString, npgsql =>
        {
            npgsql.MigrationsHistoryTable("__ef_migrations", "wholesale");
            npgsql.EnableRetryOnFailure(3);
        }));

        services.AddScoped<IPremiseRepository, PremiseRepository>();
        services.AddScoped<ICatalogueRepository, CatalogueRepository>();
        services.AddScoped<IPartnerRepository, PartnerRepository>();
        services.AddScoped<IApiKeyRepository, ApiKeyRepository>();
        services.AddScoped<IOrderRepository, OrderRepository>();
        services.AddScoped<IServiceRepository, ServiceRepository>();
        services.AddScoped<IBulkUploadRepository, BulkUploadRepository>();
        services.AddScoped<IFaultRepository, FaultRepository>();
        services.AddScoped<IAppointmentSlotRepository, AppointmentSlotRepository>();
        services.AddScoped<IStatementRepository, StatementRepository>();
        services.AddScoped<IDisputeRepository, DisputeRepository>();
        services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        services.AddScoped<IReferenceGenerator, SequenceReferenceGenerator>();

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IClock, SystemClock>();

        services.Configure<CalendarOptions>(configuration.GetSection(CalendarOptions.Section));
        services.AddSingleton<ICalendarProvider, CalendarProvider>();

        services.Configure<WebhookOptions>(configuration.GetSection(WebhookOptions.Section));
        var webhookClient = services.AddHttpClient(WebhookPartnerNotifier.ClientName);
        configureWebhookClient?.Invoke(webhookClient);
        services.AddScoped<IPartnerNotifier, WebhookPartnerNotifier>();

        return services;
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/IConnect.Wholesale.Infrastructure.csproj

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: xml. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/IConnect.Wholesale.Infrastructure.csproj`.

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <RootNamespace>IConnect.Wholesale.Infrastructure</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="..\IConnect.Wholesale.Application\IConnect.Wholesale.Application.csproj" />
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.11" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Relational" Version="8.0.11" />
    <PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" Version="8.0.11" />
    <PackageReference Include="Microsoft.Extensions.Http" Version="8.0.1" />
    <PackageReference Include="Microsoft.Extensions.Options.ConfigurationExtensions" Version="8.0.0" />
  </ItemGroup>
</Project>
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Notifications/WebhookPartnerNotifier.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Notifications/WebhookPartnerNotifier.cs`.

```csharp
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IConnect.Wholesale.Application.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace IConnect.Wholesale.Infrastructure.Notifications;

public sealed class WebhookOptions
{
    public const string Section = "PartnerWebhooks";

    /// <summary>Event gateway that fans notifications out to each partner's registered endpoint. Empty disables delivery.</summary>
    public string? GatewayUrl { get; set; }

    /// <summary>HMAC-SHA256 key used to sign payloads; supplied via environment (PartnerWebhooks__SigningSecret).</summary>
    public string? SigningSecret { get; set; }

    public int TimeoutSeconds { get; set; } = 10;
}

/// <summary>
/// Delivers partner events to the notification gateway as a signed JSON envelope. The signature
/// header (<c>X-Signature: t=unix,v1=hex</c>) binds the timestamp to the body so receivers can
/// reject replays. Delivery is best-effort here; retries are owned by the gateway.
/// </summary>
internal sealed class WebhookPartnerNotifier : IPartnerNotifier
{
    public const string ClientName = "partner-webhooks";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _httpClients;
    private readonly IOptionsMonitor<WebhookOptions> _options;
    private readonly IClock _clock;
    private readonly ILogger<WebhookPartnerNotifier> _logger;

    public WebhookPartnerNotifier(IHttpClientFactory httpClients, IOptionsMonitor<WebhookOptions> options, IClock clock,
        ILogger<WebhookPartnerNotifier> logger)
    {
        _httpClients = httpClients;
        _options = options;
        _clock = clock;
        _logger = logger;
    }

    public async Task NotifyAsync(Guid partnerId, string eventType, object payload, CancellationToken ct)
    {
        var options = _options.CurrentValue;
        if (string.IsNullOrWhiteSpace(options.GatewayUrl))
        {
            _logger.LogInformation("Webhook delivery disabled; event {EventType} for partner {PartnerId} not sent", eventType, partnerId);
            return;
        }

        if (string.IsNullOrEmpty(options.SigningSecret))
        {
            throw new InvalidOperationException("PartnerWebhooks:SigningSecret must be configured when a gateway URL is set.");
        }

        var now = _clock.UtcNow;
        var envelope = new
        {
            id = Guid.NewGuid(),
            type = eventType,
            partnerId,
            occurredAt = now.UtcDateTime,
            data = payload,
        };
        var body = JsonSerializer.Serialize(envelope, Json);

        using var request = new HttpRequestMessage(HttpMethod.Post, options.GatewayUrl)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("X-Signature", Sign(options.SigningSecret, now.ToUnixTimeSeconds(), body));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var client = _httpClients.CreateClient(ClientName);
        client.Timeout = TimeSpan.FromSeconds(Math.Clamp(options.TimeoutSeconds, 1, 60));
        using var response = await client.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Webhook gateway returned {StatusCode} for {EventType} to partner {PartnerId}",
                (int)response.StatusCode, eventType, partnerId);
        }
    }

    internal static string Sign(string secret, long unixSeconds, string body)
    {
        var material = Encoding.UTF8.GetBytes(unixSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture) + "." + body);
        var mac = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), material);
        return $"t={unixSeconds},v1={Convert.ToHexString(mac).ToLowerInvariant()}";
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Configurations/CommercialConfiguration.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Configurations/CommercialConfiguration.cs`.

```csharp
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IConnect.Wholesale.Infrastructure.Persistence.Configurations;

internal sealed class PartnerConfiguration : IEntityTypeConfiguration<Partner>
{
    public void Configure(EntityTypeBuilder<Partner> builder)
    {
        builder.ToTable("partners");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.RowVersion).IsRowVersion();
        builder.Ignore(p => p.CanTrade);
        builder.Property(p => p.Name).HasMaxLength(120).IsRequired();
        builder.Property(p => p.AccountNumber).HasMaxLength(12).IsFixedLength().IsRequired();
        builder.HasIndex(p => p.AccountNumber).IsUnique();
        builder.Property(p => p.Currency).HasMaxLength(3).IsFixedLength();
    }
}

internal sealed class ApiKeyConfiguration : IEntityTypeConfiguration<ApiKey>
{
    public void Configure(EntityTypeBuilder<ApiKey> builder)
    {
        builder.ToTable("api_keys");
        builder.HasKey(k => k.Id);
        builder.Property(k => k.RowVersion).IsRowVersion();
        builder.Property(k => k.Name).HasMaxLength(60).IsRequired();
        builder.Property(k => k.Prefix).HasMaxLength(12).IsFixedLength().IsRequired();
        builder.HasIndex(k => k.Prefix).IsUnique();
        builder.Property(k => k.SecretHash).HasMaxLength(64).IsFixedLength().IsRequired();
        builder.Property(k => k.CreatedBy).HasMaxLength(128).IsRequired();
        builder.HasIndex(k => k.PartnerId);
        builder.HasOne<Partner>().WithMany().HasForeignKey(k => k.PartnerId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class PremiseConfiguration : IEntityTypeConfiguration<Premise>
{
    public void Configure(EntityTypeBuilder<Premise> builder)
    {
        builder.ToTable("premises");
        builder.HasKey(p => p.Uprn);
        builder.Property(p => p.Uprn).HasMaxLength(12);
        builder.Ignore(p => p.SingleLineAddress);
        builder.Property(p => p.AddressLine1).HasMaxLength(120).IsRequired();
        builder.Property(p => p.AddressLine2).HasMaxLength(120);
        builder.Property(p => p.Town).HasMaxLength(60).IsRequired();
        builder.Property(p => p.Postcode).HasMaxLength(8).IsRequired();
        builder.Property(p => p.ExchangeCode).HasMaxLength(8).IsRequired();
        builder.HasIndex(p => p.Postcode);
    }
}

internal sealed class ProductConfiguration : IEntityTypeConfiguration<WholesaleProduct>
{
    public void Configure(EntityTypeBuilder<WholesaleProduct> builder)
    {
        builder.ToTable("products");
        builder.HasKey(p => p.Code);
        builder.Property(p => p.Code).HasMaxLength(24);
        builder.Property(p => p.Name).HasMaxLength(80).IsRequired();
        builder.PrimitiveCollection(p => p.AvailableCareLevels);
    }
}

internal sealed class PriceBookConfiguration : IEntityTypeConfiguration<PriceBook>
{
    public void Configure(EntityTypeBuilder<PriceBook> builder)
    {
        builder.ToTable("price_books");
        builder.HasKey(b => b.Id);
        builder.Property(b => b.Version).HasMaxLength(20).IsRequired();
        builder.HasIndex(b => b.Version).IsUnique();
        builder.HasIndex(b => b.EffectiveFrom).IsUnique();
        builder.Property(b => b.Currency).HasMaxLength(3).IsFixedLength();

        builder.OwnsMany(b => b.Entries, e => e.ToJson("entries"));
        builder.Navigation(b => b.Entries).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_entries");
        builder.OwnsMany(b => b.Tiers, t => t.ToJson("tiers"));
        builder.Navigation(b => b.Tiers).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_tiers");
    }
}

internal sealed class StatementConfiguration : IEntityTypeConfiguration<BillingStatement>
{
    public void Configure(EntityTypeBuilder<BillingStatement> builder)
    {
        builder.ToTable("statements");
        builder.HasKey(s => s.Id);
        builder.Property(s => s.RowVersion).IsRowVersion();
        builder.Ignore(s => s.DomainEvents);
        builder.Ignore(s => s.Charges);
        builder.Ignore(s => s.Credits);
        builder.Ignore(s => s.Total);
        builder.Ignore(s => s.DaysInPeriod);
        builder.Property(s => s.Reference).HasMaxLength(16).IsRequired();
        builder.HasIndex(s => s.Reference).IsUnique();
        builder.HasIndex(s => new { s.PartnerId, s.PeriodStart }).IsUnique();
        builder.Property(s => s.Currency).HasMaxLength(3).IsFixedLength();

        builder.OwnsMany(s => s.Lines, l => l.ToJson("lines"));
        builder.Navigation(s => s.Lines).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_lines");
    }
}

internal sealed class DisputeConfiguration : IEntityTypeConfiguration<Dispute>
{
    public void Configure(EntityTypeBuilder<Dispute> builder)
    {
        builder.ToTable("disputes");
        builder.HasKey(d => d.Id);
        builder.Property(d => d.RowVersion).IsRowVersion();
        builder.Ignore(d => d.DomainEvents);
        builder.Ignore(d => d.IsOpen);
        builder.Property(d => d.Reference).HasMaxLength(16).IsRequired();
        builder.HasIndex(d => d.Reference).IsUnique();
        builder.HasIndex(d => d.StatementId);
        builder.HasIndex(d => d.PartnerId);
        builder.Property(d => d.Reason).HasMaxLength(2000).IsRequired();
        builder.Property(d => d.Outcome).HasMaxLength(2000);
        builder.PrimitiveCollection(d => d.LineIds);
        builder.HasOne<BillingStatement>().WithMany().HasForeignKey(d => d.StatementId).OnDelete(DeleteBehavior.Restrict);
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Configurations/FaultConfiguration.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Configurations/FaultConfiguration.cs`.

```csharp
using IConnect.Wholesale.Domain.Appointments;
using IConnect.Wholesale.Domain.Faults;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IConnect.Wholesale.Infrastructure.Persistence.Configurations;

internal sealed class FaultConfiguration : IEntityTypeConfiguration<Fault>
{
    public void Configure(EntityTypeBuilder<Fault> builder)
    {
        builder.ToTable("faults");
        builder.HasKey(f => f.Id);
        builder.Property(f => f.RowVersion).IsRowVersion();
        builder.Ignore(f => f.DomainEvents);

        builder.Property(f => f.Reference).HasMaxLength(16).IsRequired();
        builder.HasIndex(f => f.Reference).IsUnique();
        builder.HasIndex(f => new { f.PartnerId, f.Status, f.CreatedAt });
        builder.HasIndex(f => new { f.ServiceId, f.Status });
        builder.Property(f => f.Uprn).HasMaxLength(12).IsRequired();
        builder.Property(f => f.Description).HasMaxLength(2000).IsRequired();
        builder.Property(f => f.ResolutionCode).HasMaxLength(40);
        builder.Property(f => f.ServiceCreditBasis).HasMaxLength(200);

        builder.OwnsOne(f => f.RepairClock, clock =>
        {
            clock.ToJson("repair_clock");
            clock.OwnsMany(c => c.Pauses);
            clock.Navigation(c => c.Pauses).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_pauses");
        });

        builder.OwnsMany(f => f.Notes, notes => notes.ToJson("notes"));
        builder.Navigation(f => f.Notes).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_notes");
    }
}

internal sealed class AppointmentSlotConfiguration : IEntityTypeConfiguration<AppointmentSlot>
{
    public void Configure(EntityTypeBuilder<AppointmentSlot> builder)
    {
        builder.ToTable("appointment_slots");
        builder.HasKey(s => s.Id);

        // Concurrency token matters here: two partners reserving the last unit of capacity.
        builder.Property(s => s.RowVersion).IsRowVersion();
        builder.Property(s => s.ExchangeCode).HasMaxLength(8).IsRequired();
        builder.HasIndex(s => new { s.ExchangeCode, s.Date, s.Band }).IsUnique();

        builder.OwnsMany(s => s.Reservations, r => r.ToJson("reservations"));
        builder.Navigation(s => s.Reservations).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_reservations");
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Configurations/OrderConfiguration.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Configurations/OrderConfiguration.cs`.

```csharp
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IConnect.Wholesale.Infrastructure.Persistence.Configurations;

internal sealed class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("orders");
        builder.HasKey(o => o.Id);
        builder.Property(o => o.RowVersion).IsRowVersion();
        builder.Ignore(o => o.DomainEvents);
        builder.Ignore(o => o.IsOnHold);

        builder.Property(o => o.Reference).HasMaxLength(16).IsRequired();
        builder.HasIndex(o => o.Reference).IsUnique();
        builder.Property(o => o.PartnerReference).HasMaxLength(40).IsRequired();
        builder.HasIndex(o => new { o.PartnerId, o.PartnerReference }).IsUnique();
        builder.HasIndex(o => new { o.PartnerId, o.Status, o.CreatedAt });
        builder.HasIndex(o => new { o.Uprn, o.Status });

        builder.Property(o => o.Uprn).HasMaxLength(12).IsRequired();
        builder.Property(o => o.ProductCode).HasMaxLength(24);
        builder.Property(o => o.MigrationAuthCode).HasMaxLength(9);
        builder.Property(o => o.FailureReason).HasMaxLength(500);
        builder.Property(o => o.HoldReason).HasMaxLength(500);

        builder.OwnsOne(o => o.DeliveryClock, clock =>
        {
            clock.ToJson("delivery_clock");
            clock.OwnsMany(c => c.Pauses);
            clock.Navigation(c => c.Pauses).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_pauses");
        });

        builder.OwnsMany(o => o.History, history => history.ToJson("history"));
        builder.Navigation(o => o.History).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_history");
    }
}

internal sealed class BulkUploadConfiguration : IEntityTypeConfiguration<BulkUpload>
{
    public void Configure(EntityTypeBuilder<BulkUpload> builder)
    {
        builder.ToTable("bulk_uploads");
        builder.HasKey(b => b.Id);
        builder.Property(b => b.RowVersion).IsRowVersion();
        builder.Property(b => b.FileName).HasMaxLength(255).IsRequired();
        builder.Property(b => b.ContentSha256).HasMaxLength(64).IsFixedLength().IsRequired();
        builder.Property(b => b.UploadedBy).HasMaxLength(128).IsRequired();
        builder.HasIndex(b => new { b.PartnerId, b.ContentSha256 });
        builder.OwnsMany(b => b.Errors, errors => errors.ToJson("errors"));
    }
}

internal sealed class WholesaleServiceConfiguration : IEntityTypeConfiguration<WholesaleService>
{
    public void Configure(EntityTypeBuilder<WholesaleService> builder)
    {
        builder.ToTable("services");
        builder.HasKey(s => s.Id);
        builder.Property(s => s.RowVersion).IsRowVersion();
        builder.Ignore(s => s.IsActive);
        builder.Property(s => s.Reference).HasMaxLength(16).IsRequired();
        builder.HasIndex(s => s.Reference).IsUnique();
        builder.Property(s => s.Uprn).HasMaxLength(12).IsRequired();
        builder.Property(s => s.ProductCode).HasMaxLength(24).IsRequired();
        builder.HasIndex(s => new { s.PartnerId, s.CeasedOn });

        // At most one live service per premise (single ONT port).
        builder.HasIndex(s => s.Uprn).IsUnique().HasFilter("\"CeasedOn\" IS NULL");

        builder.OwnsMany(s => s.RentalPeriods, periods => periods.ToJson("rental_periods"));
        builder.Navigation(s => s.RentalPeriods).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_rentalPeriods");
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Converters/MoneyConverter.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Converters/MoneyConverter.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/EfUnitOfWork.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/EfUnitOfWork.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Orders;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace IConnect.Wholesale.Infrastructure.Persistence;

/// <summary>
/// Commits the scoped DbContext and, only after a successful commit, publishes the domain events
/// raised by tracked aggregates as partner notifications. Optimistic-concurrency and unique-key
/// violations are translated into <see cref="ConflictException"/> so the API returns 409.
/// </summary>
internal sealed class EfUnitOfWork : IUnitOfWork
{
    private const string UniqueViolation = "23505";

    private readonly WholesaleDbContext _db;
    private readonly IPartnerNotifier _notifier;
    private readonly ILogger<EfUnitOfWork> _logger;

    public EfUnitOfWork(WholesaleDbContext db, IPartnerNotifier notifier, ILogger<EfUnitOfWork> logger)
    {
        _db = db;
        _notifier = notifier;
        _logger = logger;
    }

    public async Task SaveChangesAsync(CancellationToken ct)
    {
        var aggregates = _db.ChangeTracker.Entries<AggregateRoot>()
            .Select(e => e.Entity)
            .Where(a => a.DomainEvents.Count > 0)
            .ToList();
        var events = aggregates.SelectMany(a => a.DomainEvents).ToList();

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("concurrency.stale", "The resource was changed by someone else; reload and try again.");
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: UniqueViolation } pg)
        {
            throw new ConflictException("persistence.duplicate", $"A record with the same key already exists ({pg.ConstraintName}).");
        }

        aggregates.ForEach(a => a.ClearDomainEvents());
        foreach (var domainEvent in events)
        {
            await PublishAsync(domainEvent, ct);
        }
    }

    private async Task PublishAsync(IDomainEvent domainEvent, CancellationToken ct)
    {
        var (partnerId, type, payload) = domainEvent switch
        {
            OrderStatusChanged e => (e.PartnerId, "order.status_changed", (object)new
            {
                orderId = e.OrderId,
                reference = e.Reference,
                from = e.From.ToString().ToUpperInvariant(),
                to = e.To.ToString().ToUpperInvariant(),
                occurredAt = e.OccurredAt,
            }),
            FaultCreditAssessed e => (e.PartnerId, "fault.credit_assessed", new
            {
                faultId = e.FaultId,
                reference = e.Reference,
                amountMinor = e.Amount.MinorUnits,
                currency = e.Amount.Currency,
                basis = e.Basis,
                occurredAt = e.OccurredAt,
            }),
            _ => (Guid.Empty, string.Empty, new object()),
        };

        if (partnerId == Guid.Empty)
        {
            _logger.LogDebug("No partner notification mapped for {EventType}", domainEvent.GetType().Name);
            return;
        }

        try
        {
            await _notifier.NotifyAsync(partnerId, type, payload, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // The state change is committed; a failed webhook must not turn a success into an error.
            _logger.LogError(ex, "Failed to notify partner {PartnerId} of {EventType}", partnerId, type);
        }
    }
}
```
