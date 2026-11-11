# iConnect Wholesale ordering: apps/iconnect-wholesale/server/src (part 3 of 7)

- **Application:** iConnect Wholesale ordering
- **Tech stack:** .NET 8 Web API + Angular
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 14

## Files

- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Orders/OrderService.cs` (387 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Sla/SlaBreachMonitor.cs` (102 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Sla/SlaDashboardService.cs` (216 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Appointments/AppointmentSlot.cs` (96 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Billing/BillingStatement.cs` (164 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Billing/Dispute.cs` (138 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Catalogue/WholesaleProduct.cs` (145 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Common/DomainException.cs` (32 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Common/Entity.cs` (40 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Common/Money.cs` (97 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Faults/Fault.cs` (231 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/IConnect.Wholesale.Domain.csproj` (6 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Network/Premise.cs` (117 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Orders/BulkUpload.cs` (67 lines)

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Orders/OrderService.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Orders/OrderService.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Catalogue;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Services;
using IConnect.Wholesale.Domain.Sla;
using Microsoft.Extensions.Logging;

namespace IConnect.Wholesale.Application.Orders;

/// <summary>
/// Order placement and lifecycle. Placement is synchronous up to VALIDATED (or FAILED): the
/// request is syntax-checked, priced, submitted, and then checked against network inventory so
/// partners get an immediate accept/reject. Later transitions are driven by support agents
/// (field operations) or by the partner (cancel, amend).
/// </summary>
public sealed class OrderService
{
    private readonly IOrderRepository _orders;
    private readonly IPremiseRepository _premises;
    private readonly IServiceRepository _services;
    private readonly ICatalogueRepository _catalogue;
    private readonly IPartnerRepository _partners;
    private readonly IAppointmentSlotRepository _slots;
    private readonly PricingService _pricing;
    private readonly IReferenceGenerator _references;
    private readonly ICalendarProvider _calendars;
    private readonly SlaPolicy _policy;
    private readonly ICurrentCaller _caller;
    private readonly IClock _clock;
    private readonly IUnitOfWork _uow;
    private readonly ILogger<OrderService> _logger;

    public OrderService(IOrderRepository orders, IPremiseRepository premises, IServiceRepository services, ICatalogueRepository catalogue,
        IPartnerRepository partners, IAppointmentSlotRepository slots, PricingService pricing, IReferenceGenerator references,
        ICalendarProvider calendars, SlaPolicy policy, ICurrentCaller caller, IClock clock, IUnitOfWork uow, ILogger<OrderService> logger)
    {
        _orders = orders;
        _premises = premises;
        _services = services;
        _catalogue = catalogue;
        _partners = partners;
        _slots = slots;
        _pricing = pricing;
        _references = references;
        _calendars = calendars;
        _policy = policy;
        _caller = caller;
        _clock = clock;
        _uow = uow;
        _logger = logger;
    }

    private WorkingCalendar Calendar => _calendars.Get(SlaPolicy.OrderCalendar);

    public async Task<PlaceOrderResult> PlaceAsync(PlaceOrderRequest request, CancellationToken ct)
    {
        var now = _clock.UtcNow;
        var (validated, errors) = OrderRequestValidator.Validate(request, Calendar.LocalDate(now));
        if (validated is null)
        {
            throw new RequestValidationException(errors.GroupBy(e => e.Field).ToDictionary(g => g.Key, g => g.Select(e => e.Message).ToArray()));
        }

        var existing = await _orders.GetByPartnerReferenceAsync(_caller.PartnerId, validated.PartnerReference, ct);
        if (existing is not null)
        {
            if (!IsSameRequest(existing, validated))
            {
                throw new ConflictException("order.duplicate_reference",
                    $"Partner reference {validated.PartnerReference} is already used by order {existing.Reference} with different details.");
            }

            return new PlaceOrderResult(OrderMapping.ToDetail(existing, Calendar, now, _caller.IsSupportAgent), Created: false);
        }

        var order = await CreateAndValidateAsync(validated, bulkUploadId: null, ct);
        await _orders.AddAsync(order, ct);
        await _uow.SaveChangesAsync(ct);

        _logger.LogInformation("Order {Reference} placed by partner {PartnerId}: {Type} at UPRN {Uprn} -> {Status}",
            order.Reference, order.PartnerId, order.Type, order.Uprn, order.Status);
        return new PlaceOrderResult(OrderMapping.ToDetail(order, Calendar, now, _caller.IsSupportAgent), Created: true);
    }

    /// <summary>Creates, prices, submits and business-validates an order. Shared with bulk upload; does not persist.</summary>
    internal async Task<Order> CreateAndValidateAsync(ValidatedOrderRequest request, Guid? bulkUploadId, CancellationToken ct)
    {
        var now = _clock.UtcNow;
        var reference = await _references.NextAsync("ORD", ct);
        var order = Order.CreateDraft(reference, _caller.PartnerId, request.PartnerReference, request.Type, request.Uprn,
            request.ProductCode, request.CareLevel, request.ExistingServiceId, request.MigrationAuthCode, request.RequestedDate, now);

        if (bulkUploadId is { } bulkId)
        {
            order.AttachToBulkUpload(bulkId);
        }

        if (request.Type != OrderType.Cease)
        {
            var quote = await _pricing.QuoteAsync(_caller.PartnerId, request.Type, request.ProductCode!, request.CareLevel, request.RequestedDate, ct);
            order.Price(quote.MonthlyRental, quote.OneOffCharge);
        }

        order.Submit(now, _caller.ActorId);

        var rejection = await CheckInventoryAsync(order, ct);
        if (rejection is null)
        {
            order.Validate(now, Calendar, _policy.OrderLeadTimeWorkingDays(order.Type), "system");
        }
        else
        {
            order.Reject(now, rejection, "system");
        }

        return order;
    }

    /// <summary>Returns a rejection reason, or null when the order can be accepted.</summary>
    internal async Task<string?> CheckInventoryAsync(Order order, CancellationToken ct)
    {
        var partner = await _partners.GetAsync(order.PartnerId, ct);
        if (partner is null || !partner.CanTrade)
        {
            return "Partner account is not active for trading.";
        }

        if (await _orders.CountOpenAsync(order.PartnerId, ct) >= partner.MaxOpenOrders)
        {
            return $"Partner has reached its limit of {partner.MaxOpenOrders} open orders.";
        }

        var premise = await _premises.GetByUprnAsync(order.Uprn, ct);
        if (premise is null)
        {
            return $"UPRN {order.Uprn} is not on the network.";
        }

        if (!premise.IsOrderable(order.RequestedDate))
        {
            return premise.BuildStatus == PremiseBuildStatus.PlannedBuild
                ? $"Premise is not ready for service until {premise.ReadyForServiceDate:yyyy-MM-dd}."
                : "Premise is not serviceable.";
        }

        if (await _orders.HasOpenOrderForUprnAsync(order.Uprn, ct))
        {
            return "Another order is already in flight for this premise.";
        }

        if (order.ProductCode is { } code)
        {
            var product = await _catalogue.GetProductAsync(code, ct);
            if (product is null)
            {
                return $"Product {code} does not exist.";
            }

            if (product.DownstreamMbps > premise.MaxDownstreamMbps)
            {
                return $"Product {code} exceeds the premise capability of {premise.MaxDownstreamMbps} Mbps.";
            }
        }

        var activeAtPremise = await _services.GetActiveByUprnAsync(order.Uprn, ct);
        switch (order.Type)
        {
            case OrderType.Provide when activeAtPremise is not null:
                return activeAtPremise.PartnerId == order.PartnerId
                    ? "You already have an active service at this premise; place a modify order instead."
                    : "Another provider has an active service at this premise; place a migrate order instead.";
            case OrderType.Migrate when activeAtPremise is null:
                return "There is no active service to migrate at this premise; place a provide order instead.";
            case OrderType.Migrate when activeAtPremise!.PartnerId == order.PartnerId:
                return "You cannot migrate a service you already own.";
            case OrderType.Cease or OrderType.Modify:
                var service = order.ExistingServiceId is { } id ? await _services.GetAsync(id, ct) : null;
                if (service is null || service.PartnerId != order.PartnerId)
                {
                    return "The referenced service does not exist on your account.";
                }

                if (!service.IsActive)
                {
                    return "The referenced service has already been ceased.";
                }

                if (service.Uprn != order.Uprn)
                {
                    return "The referenced service is not at the ordered UPRN.";
                }

                if (order.Type == OrderType.Modify && service.ProductCode == order.ProductCode && service.CareLevel == order.CareLevel)
                {
                    return "The service already has the requested product and care level.";
                }

                break;
        }

        return null;
    }

    public async Task<PagedResult<OrderSummaryDto>> ListAsync(OrderStatus? status, OrderType? type, string? search,
        DateOnly? from, DateOnly? to, PageRequest page, CancellationToken ct)
    {
        var now = _clock.UtcNow;
        var result = await _orders.QueryAsync(new OrderQuery(_caller.PartnerId, status, type, search?.Trim(), from, to, page), ct);
        return result.Map(o => OrderMapping.ToSummary(o, Calendar, now));
    }

    public async Task<OrderDetailDto> GetAsync(Guid id, CancellationToken ct)
    {
        var order = await LoadOwnedAsync(id, ct);
        return OrderMapping.ToDetail(order, Calendar, _clock.UtcNow, _caller.IsSupportAgent);
    }

    public Task<OrderDetailDto> CancelAsync(Guid id, CancelOrderRequest request, CancellationToken ct) =>
        MutateAsync(id, async (order, now) =>
        {
            RequireText(request.Reason, "reason");
            order.Cancel(now, request.Reason.Trim(), _caller.ActorId);
            await ReleaseSlotAsync(order, ct);
        }, ct);

    public Task<OrderDetailDto> AmendAsync(Guid id, AmendOrderRequest request, CancellationToken ct) =>
        MutateAsync(id, (order, now) =>
        {
            var today = Calendar.LocalDate(now);
            if (request.RequestedDate <= today || request.RequestedDate > today.AddDays(OrderRequestValidator.MaxRequestedDateHorizonDays))
            {
                throw new RequestValidationException("requestedDate", "Requested date must be in the future and within the booking horizon.");
            }

            order.AmendRequestedDate(request.RequestedDate);
            return Task.CompletedTask;
        }, ct);

    public Task<OrderDetailDto> HoldAsync(Guid id, HoldOrderRequest request, CancellationToken ct) =>
        SupportMutateAsync(id, (order, now) =>
        {
            RequireText(request.Reason, "reason");
            order.PlaceOnHold(now, request.Reason.Trim(), _caller.ActorId);
            return Task.CompletedTask;
        }, ct);

    public Task<OrderDetailDto> ReleaseHoldAsync(Guid id, CancellationToken ct) =>
        SupportMutateAsync(id, (order, now) =>
        {
            order.ReleaseHold(now, _caller.ActorId);
            return Task.CompletedTask;
        }, ct);

    public Task<OrderDetailDto> StartProvisioningAsync(Guid id, CancellationToken ct) =>
        SupportMutateAsync(id, async (order, now) =>
        {
            if (order.AppointmentSlotId is { } slotId)
            {
                var slot = await _slots.GetAsync(slotId, ct) ?? throw new NotFoundException("AppointmentSlot", slotId);
                slot.Confirm(order.Id, now);
            }

            order.StartProvisioning(now, _caller.ActorId);
        }, ct);

    public Task<OrderDetailDto> RejectAsync(Guid id, RejectOrderRequest request, CancellationToken ct) =>
        SupportMutateAsync(id, async (order, now) =>
        {
            RequireText(request.Reason, "reason");
            order.Reject(now, request.Reason.Trim(), _caller.ActorId);
            await ReleaseSlotAsync(order, ct);
        }, ct);

    /// <summary>Completes the order and applies it to the service inventory.</summary>
    public Task<OrderDetailDto> CompleteAsync(Guid id, CompleteOrderRequest request, CancellationToken ct) =>
        SupportMutateAsync(id, async (order, now) =>
        {
            if (request.CompletedDate > Calendar.LocalDate(now))
            {
                throw new RequestValidationException("completedDate", "Completion date cannot be in the future.");
            }

            var serviceId = await ApplyToInventoryAsync(order, request.CompletedDate, ct);
            order.Complete(now, request.CompletedDate, serviceId, _caller.ActorId);
        }, ct);

    private async Task<Guid?> ApplyToInventoryAsync(Order order, DateOnly completedDate, CancellationToken ct)
    {
        var premise = await _premises.GetByUprnAsync(order.Uprn, ct) ?? throw new NotFoundException("Premise", order.Uprn);
        switch (order.Type)
        {
            case OrderType.Provide:
            {
                var reference = await _references.NextAsync("SVC", ct);
                var service = new WholesaleService(reference, order.PartnerId, order.Uprn, order.ProductCode!, order.CareLevel,
                    order.MonthlyRental!.Value, completedDate);
                await _services.AddAsync(service, ct);
                premise.MarkServiceActive(true);
                return service.Id;
            }

            case OrderType.Cease:
            {
                var service = await _services.GetAsync(order.ExistingServiceId!.Value, ct) ?? throw new NotFoundException("Service", order.ExistingServiceId);
                service.Cease(completedDate);
                premise.MarkServiceActive(false);
                return service.Id;
            }

            case OrderType.Modify:
            {
                var service = await _services.GetAsync(order.ExistingServiceId!.Value, ct) ?? throw new NotFoundException("Service", order.ExistingServiceId);
                service.ChangeProduct(order.ProductCode!, order.CareLevel, order.MonthlyRental!.Value, completedDate);
                return service.Id;
            }

            case OrderType.Migrate:
            {
                var service = await _services.GetActiveByUprnAsync(order.Uprn, ct)
                    ?? throw new ConflictException("order.nothing_to_migrate", "No active service remains at the premise to migrate.");
                service.TransferTo(order.PartnerId, order.ProductCode!, order.CareLevel, order.MonthlyRental!.Value, completedDate);
                return service.Id;
            }

            default:
                throw new DomainException("order.unknown_type", $"Unsupported order type {order.Type}.");
        }
    }

    private async Task ReleaseSlotAsync(Order order, CancellationToken ct)
    {
        if (order.ReleaseAppointment() is { } slotId && await _slots.GetAsync(slotId, ct) is { } slot)
        {
            slot.Release(order.Id);
        }
    }

    private Task<OrderDetailDto> SupportMutateAsync(Guid id, Func<Order, DateTimeOffset, Task> action, CancellationToken ct)
    {
        if (!_caller.IsSupportAgent)
        {
            throw new ForbiddenException("Only support agents can perform this action.");
        }

        return MutateAsync(id, action, ct);
    }

    private async Task<OrderDetailDto> MutateAsync(Guid id, Func<Order, DateTimeOffset, Task> action, CancellationToken ct)
    {
        var order = await LoadOwnedAsync(id, ct);
        var now = _clock.UtcNow;
        await action(order, now);
        await _uow.SaveChangesAsync(ct);
        return OrderMapping.ToDetail(order, Calendar, now, _caller.IsSupportAgent);
    }

    internal async Task<Order> LoadOwnedAsync(Guid id, CancellationToken ct)
    {
        var order = await _orders.GetAsync(id, ct);
        if (order is null || (!_caller.IsSupportAgent && order.PartnerId != _caller.PartnerId))
        {
            throw new NotFoundException("Order", id);
        }

        return order;
    }

    private static bool IsSameRequest(Order existing, ValidatedOrderRequest request) =>
        existing.Type == request.Type
        && existing.Uprn == request.Uprn
        && existing.ProductCode == request.ProductCode
        && existing.CareLevel == request.CareLevel
        && existing.ExistingServiceId == request.ExistingServiceId
        && existing.RequestedDate == request.RequestedDate;

    private static void RequireText(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Length < 5)
        {
            throw new RequestValidationException(field, "Provide at least 5 characters.");
        }
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Sla/SlaBreachMonitor.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Sla/SlaBreachMonitor.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Domain.Sla;
using Microsoft.Extensions.Logging;

namespace IConnect.Wholesale.Application.Sla;

public sealed record SlaSweepResult(int FaultsChecked, int FaultBreaches, int OrdersChecked, int OrderBreaches, int FaultsAutoClosed);

/// <summary>
/// One sweep of the SLA monitor, invoked periodically by the hosted service. Each breach is
/// recorded exactly once on the clock (so repeated sweeps never re-notify), the partner is
/// notified, and resolved faults past the reopen window are closed automatically.
/// </summary>
public sealed class SlaBreachMonitor
{
    public const string SystemActor = "system:sla-monitor";

    private readonly IFaultRepository _faults;
    private readonly IOrderRepository _orders;
    private readonly ICalendarProvider _calendars;
    private readonly IPartnerNotifier _notifier;
    private readonly IClock _clock;
    private readonly IUnitOfWork _uow;
    private readonly ILogger<SlaBreachMonitor> _logger;

    public SlaBreachMonitor(IFaultRepository faults, IOrderRepository orders, ICalendarProvider calendars, IPartnerNotifier notifier,
        IClock clock, IUnitOfWork uow, ILogger<SlaBreachMonitor> logger)
    {
        _faults = faults;
        _orders = orders;
        _calendars = calendars;
        _notifier = notifier;
        _clock = clock;
        _uow = uow;
        _logger = logger;
    }

    public async Task<SlaSweepResult> SweepAsync(CancellationToken ct)
    {
        var now = _clock.UtcNow;
        var faultBreaches = 0;
        var orderBreaches = 0;

        var faults = await _faults.ListWithRunningClocksAsync(ct);
        foreach (var fault in faults)
        {
            var calendar = _calendars.GetByName(fault.RepairClock.CalendarName);
            if (!fault.RepairClock.IsBreached(calendar, now) || !fault.RepairClock.MarkBreachRecorded(now))
            {
                continue;
            }

            faultBreaches++;
            _logger.LogWarning("Fault {Reference} breached its {Target}h repair target ({Priority}/{Care})",
                fault.Reference, fault.RepairClock.Target.TotalHours, fault.Priority, fault.CareLevel);
            await _notifier.NotifyAsync(fault.PartnerId, "fault.sla_breached", new
            {
                faultId = fault.Id,
                reference = fault.Reference,
                priority = fault.Priority.ToString(),
                targetHours = fault.RepairClock.Target.TotalHours,
                breachedAt = now,
            }, ct);
        }

        var orderCalendar = _calendars.Get(SlaPolicy.OrderCalendar);
        var today = orderCalendar.LocalDate(now);
        var orders = await _orders.ListWithRunningClocksAsync(ct);
        foreach (var order in orders)
        {
            var clock = order.DeliveryClock!;
            var pastCommitted = order.CommittedDate is { } committed && today > committed;
            if (!(pastCommitted || clock.IsBreached(orderCalendar, now)) || !clock.MarkBreachRecorded(now))
            {
                continue;
            }

            orderBreaches++;
            _logger.LogWarning("Order {Reference} missed its committed date {Committed}", order.Reference, order.CommittedDate);
            await _notifier.NotifyAsync(order.PartnerId, "order.sla_breached", new
            {
                orderId = order.Id,
                reference = order.Reference,
                partnerReference = order.PartnerReference,
                committedDate = order.CommittedDate,
                breachedAt = now,
            }, ct);
        }

        var autoClosed = 0;
        var closable = await _faults.ListAutoCloseCandidatesAsync(now - Domain.Faults.Fault.ReopenWindow, ct);
        foreach (var fault in closable.Where(f => f.CanAutoClose(now)))
        {
            fault.Close(now, SystemActor);
            autoClosed++;
        }

        await _uow.SaveChangesAsync(ct);
        return new SlaSweepResult(faults.Count, faultBreaches, orders.Count, orderBreaches, autoClosed);
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Sla/SlaDashboardService.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Sla/SlaDashboardService.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Sla;

public sealed record SlaItemDto(Guid Id, string Kind, string Reference, string Status, string SlaStatus, DateTimeOffset? DueAt,
    double RemainingWorkingHours);

public sealed record SlaSummaryDto(
    DateOnly PeriodStart,
    DateOnly AsOf,
    int OpenOrders,
    int OrdersAtRisk,
    int OrdersBreached,
    int OpenFaults,
    int FaultsAtRisk,
    int FaultsBreached,
    long FaultCreditsMinor,
    long LateDeliveryCreditsMinor,
    string Currency,
    IReadOnlyList<SlaItemDto> Attention);

public sealed record RepairTargetDto(string CareLevel, string Priority, string Calendar, double TargetHours);

public sealed record CreditTermsDto(string CareLevel, int FaultCreditBpsPerBreachDay, int FaultCreditCapBps, long LateDeliveryPerDayMinor,
    int LateDeliveryMaxDays, long MissedAppointmentMinor);

public sealed record SlaPolicyDto(IReadOnlyList<RepairTargetDto> RepairTargets, IReadOnlyDictionary<string, int> OrderLeadTimeWorkingDays,
    IReadOnlyList<CreditTermsDto> CreditTerms);

/// <summary>
/// Partner-facing SLA view: the contractual schedule, live at-risk/breached counts for in-flight
/// orders and open faults, and the service credits accrued in the current month so far.
/// </summary>
public sealed class SlaDashboardService
{
    /// <summary>Upper bound on records scanned per status so a dashboard request stays bounded.</summary>
    internal const int MaxScanPerStatus = 2_000;
    internal const int AttentionListSize = 20;

    private static readonly OrderStatus[] InFlightOrders = { OrderStatus.Validated, OrderStatus.Provisioning };
    private static readonly FaultStatus[] OpenFaults = { FaultStatus.Open, FaultStatus.InProgress, FaultStatus.PendingCustomer };

    private readonly IOrderRepository _orders;
    private readonly IFaultRepository _faults;
    private readonly IPartnerRepository _partners;
    private readonly ICalendarProvider _calendars;
    private readonly SlaPolicy _policy;
    private readonly ServiceCreditCalculator _credits;
    private readonly ICurrentCaller _caller;
    private readonly IClock _clock;

    public SlaDashboardService(IOrderRepository orders, IFaultRepository faults, IPartnerRepository partners, ICalendarProvider calendars,
        SlaPolicy policy, ServiceCreditCalculator credits, ICurrentCaller caller, IClock clock)
    {
        _orders = orders;
        _faults = faults;
        _partners = partners;
        _calendars = calendars;
        _policy = policy;
        _credits = credits;
        _caller = caller;
        _clock = clock;
    }

    public SlaPolicyDto GetPolicy()
    {
        var targets = Enum.GetValues<CareLevel>()
            .SelectMany(care => Enum.GetValues<FaultPriority>().Select(p => _policy.RepairTarget(care, p)))
            .Select(t => new RepairTargetDto(t.CareLevel.ToString(), t.Priority.ToString(), t.Calendar.ToString(), t.Target.TotalHours))
            .ToList();

        var leadTimes = Enum.GetValues<OrderType>()
            .ToDictionary(t => t.ToString().ToUpperInvariant(), t => _policy.OrderLeadTimeWorkingDays(t));

        var terms = Enum.GetValues<CareLevel>()
            .Select(_credits.TermsFor)
            .Select(t => new CreditTermsDto(t.CareLevel.ToString(), t.FaultCreditBpsPerBreachDay, t.FaultCreditCapBps,
                t.LateDeliveryPerDayMinor, t.LateDeliveryMaxDays, t.MissedAppointmentMinor))
            .ToList();

        return new SlaPolicyDto(targets, leadTimes, terms);
    }

    public async Task<SlaSummaryDto> GetSummaryAsync(CancellationToken ct)
    {
        var partner = await _partners.GetAsync(_caller.PartnerId, ct) ?? throw new NotFoundException("Partner", _caller.PartnerId);
        var now = _clock.UtcNow;
        var orderCalendar = _calendars.Get(SlaPolicy.OrderCalendar);
        var today = orderCalendar.LocalDate(now);
        var periodStart = new DateOnly(today.Year, today.Month, 1);

        var items = new List<SlaItemDto>();
        foreach (var status in InFlightOrders)
        {
            await foreach (var order in ScanOrdersAsync(status, ct))
            {
                if (order.DeliveryClock is { } clock)
                {
                    items.Add(ToItem(order.Id, "ORDER", order.Reference, status.ToString(), clock, orderCalendar, now));
                }
            }
        }

        var openOrders = items.Count;
        foreach (var status in OpenFaults)
        {
            await foreach (var fault in ScanFaultsAsync(status, ct))
            {
                var calendar = _calendars.GetByName(fault.RepairClock.CalendarName);
                items.Add(ToItem(fault.Id, "FAULT", fault.Reference, status.ToString(), fault.RepairClock, calendar, now));
            }
        }

        var orders = items.Take(openOrders).ToList();
        var faults = items.Skip(openOrders).ToList();

        var fromInstant = new DateTimeOffset(periodStart.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var credited = await _faults.ListResolvedWithCreditBetweenAsync(partner.Id, fromInstant, now, ct);
        var faultCredits = Money.Sum(credited.Where(f => f.ServiceCredit is not null).Select(f => f.ServiceCredit!.Value), partner.Currency);

        var completed = await _orders.ListCompletedBetweenAsync(partner.Id, periodStart, today, ct);
        var lateCredits = Money.Sum(
            completed.Select(o => _credits.ForLateDelivery(o.CareLevel, o.WorkingDaysLate(orderCalendar), partner.Currency).Amount),
            partner.Currency);

        return new SlaSummaryDto(
            periodStart,
            today,
            orders.Count,
            orders.Count(i => i.SlaStatus == nameof(SlaStatus.AtRisk)),
            orders.Count(i => i.SlaStatus == nameof(SlaStatus.Breached)),
            faults.Count,
            faults.Count(i => i.SlaStatus == nameof(SlaStatus.AtRisk)),
            faults.Count(i => i.SlaStatus == nameof(SlaStatus.Breached)),
            faultCredits.MinorUnits,
            lateCredits.MinorUnits,
            partner.Currency,
            RankForAttention(items));
    }

    /// <summary>Breached items first, then at-risk items soonest-due first; healthy and paused items are omitted.</summary>
    internal static IReadOnlyList<SlaItemDto> RankForAttention(IEnumerable<SlaItemDto> items) => items
        .Where(i => i.SlaStatus is nameof(SlaStatus.Breached) or nameof(SlaStatus.AtRisk))
        .OrderBy(i => i.SlaStatus == nameof(SlaStatus.Breached) ? 0 : 1)
        .ThenBy(i => i.DueAt ?? DateTimeOffset.MaxValue)
        .ThenBy(i => i.Reference, StringComparer.Ordinal)
        .Take(AttentionListSize)
        .ToList();

    private static SlaItemDto ToItem(Guid id, string kind, string reference, string status, SlaClock clock, WorkingCalendar calendar,
        DateTimeOffset now) =>
        new(id, kind, reference, ToScreamingSnake(status), clock.Status(calendar, now).ToString(), clock.DueAt(calendar, now),
            Math.Round(clock.Remaining(calendar, now).TotalHours, 2));

    /// <summary>"PendingCustomer" becomes "PENDING_CUSTOMER", matching the wire format of the other endpoints.</summary>
    internal static string ToScreamingSnake(string pascal)
    {
        var sb = new System.Text.StringBuilder(pascal.Length + 4);
        for (var i = 0; i < pascal.Length; i++)
        {
            if (i > 0 && char.IsUpper(pascal[i]))
            {
                sb.Append('_');
            }

            sb.Append(char.ToUpperInvariant(pascal[i]));
        }

        return sb.ToString();
    }

    private async IAsyncEnumerable<Order> ScanOrdersAsync(OrderStatus status, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var scanned = 0;
        for (var page = 1; scanned < MaxScanPerStatus; page++)
        {
            var result = await _orders.QueryAsync(new OrderQuery(_caller.PartnerId, status, null, null, null, null,
                new PageRequest(page, PageRequest.MaxPageSize)), ct);
            foreach (var order in result.Items)
            {
                yield return order;
            }

            scanned += result.Items.Count;
            if (result.Items.Count < result.PageSize || scanned >= result.Total)
            {
                yield break;
            }
        }
    }

    private async IAsyncEnumerable<Fault> ScanFaultsAsync(FaultStatus status, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var scanned = 0;
        for (var page = 1; scanned < MaxScanPerStatus; page++)
        {
            var result = await _faults.QueryAsync(new FaultQuery(_caller.PartnerId, status, null, new PageRequest(page, PageRequest.MaxPageSize)), ct);
            foreach (var fault in result.Items)
            {
                yield return fault;
            }

            scanned += result.Items.Count;
            if (result.Items.Count < result.PageSize || scanned >= result.Total)
            {
                yield break;
            }
        }
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Appointments/AppointmentSlot.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Appointments/AppointmentSlot.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Appointments;

public enum SlotBand
{
    Am,
    Pm,
    AllDay,
}

/// <summary>
/// Engineer capacity for an exchange patch on a given day and band. Reservations are held for a
/// short time while the partner completes an order, then confirmed or allowed to lapse.
/// </summary>
public sealed class AppointmentSlot : Entity
{
    public static readonly TimeSpan ReservationHold = TimeSpan.FromMinutes(20);

    private readonly List<SlotReservation> _reservations = new();

    private AppointmentSlot()
    {
    }

    public AppointmentSlot(string exchangeCode, DateOnly date, SlotBand band, int capacity)
    {
        if (capacity <= 0)
        {
            throw new DomainException("slot.invalid_capacity", "Slot capacity must be positive.");
        }

        ExchangeCode = exchangeCode;
        Date = date;
        Band = band;
        Capacity = capacity;
    }

    public string ExchangeCode { get; private set; } = string.Empty;

    public DateOnly Date { get; private set; }

    public SlotBand Band { get; private set; }

    public int Capacity { get; private set; }

    public IReadOnlyList<SlotReservation> Reservations => _reservations;

    public int Used(DateTimeOffset now) => _reservations.Count(r => r.IsLive(now));

    public int Remaining(DateTimeOffset now) => Capacity - Used(now);

    /// <summary>Places a temporary hold for an order. Idempotent for the same order.</summary>
    public SlotReservation Reserve(Guid orderId, DateTimeOffset now)
    {
        var existing = _reservations.FirstOrDefault(r => r.OrderId == orderId && r.IsLive(now));
        if (existing is not null)
        {
            return existing;
        }

        if (Remaining(now) <= 0)
        {
            throw new DomainException("slot.full", $"No capacity left on {Date:yyyy-MM-dd} {Band} at {ExchangeCode}.");
        }

        _reservations.RemoveAll(r => !r.IsLive(now));
        var reservation = new SlotReservation(orderId, now, now + ReservationHold, null);
        _reservations.Add(reservation);
        return reservation;
    }

    public void Confirm(Guid orderId, DateTimeOffset now)
    {
        var index = _reservations.FindIndex(r => r.OrderId == orderId && r.IsLive(now));
        if (index < 0)
        {
            throw new DomainException("slot.reservation_expired", "The reservation has expired; reserve the slot again.");
        }

        _reservations[index] = _reservations[index] with { ConfirmedAt = now };
    }

    public bool Release(Guid orderId) => _reservations.RemoveAll(r => r.OrderId == orderId) > 0;

    /// <summary>Appointments cannot be booked for today or in the past, nor within the minimum notice.</summary>
    public bool IsBookable(DateOnly today, int minimumNoticeDays) => Date > today.AddDays(Math.Max(0, minimumNoticeDays - 1));
}

public sealed record SlotReservation(Guid OrderId, DateTimeOffset ReservedAt, DateTimeOffset HoldExpiresAt, DateTimeOffset? ConfirmedAt)
{
    public bool IsConfirmed => ConfirmedAt.HasValue;

    public bool IsLive(DateTimeOffset now) => IsConfirmed || now < HoldExpiresAt;
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Billing/BillingStatement.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Billing/BillingStatement.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Billing;

public enum StatementStatus
{
    Draft,
    Issued,
    Disputed,
    Settled,
}

public enum ChargeType
{
    Rental,
    Connection,
    Migration,
    Modify,
    CancellationCharge,
    FaultCredit,
    LateDeliveryCredit,
    DisputeAdjustment,
}

/// <summary>
/// A partner's monthly wholesale statement. Lines are generated in Draft, then the statement is
/// issued with a payment due date. Credits are negative lines. Disputes reference specific lines.
/// </summary>
public sealed class BillingStatement : AggregateRoot
{
    public const int PaymentTermsDays = 30;

    private readonly List<StatementLine> _lines = new();

    private BillingStatement()
    {
    }

    public BillingStatement(string reference, Guid partnerId, DateOnly periodStart, DateOnly periodEnd, string currency)
    {
        if (periodEnd < periodStart)
        {
            throw new DomainException("statement.invalid_period", "Statement period end precedes start.");
        }

        Reference = reference;
        PartnerId = partnerId;
        PeriodStart = periodStart;
        PeriodEnd = periodEnd;
        Currency = currency;
        Status = StatementStatus.Draft;
    }

    public string Reference { get; private set; } = string.Empty;

    public Guid PartnerId { get; private set; }

    public DateOnly PeriodStart { get; private set; }

    public DateOnly PeriodEnd { get; private set; }

    public string Currency { get; private set; } = "GBP";

    public StatementStatus Status { get; private set; }

    public DateTimeOffset? IssuedAt { get; private set; }

    public DateOnly? DueDate { get; private set; }

    public IReadOnlyList<StatementLine> Lines => _lines;

    public int DaysInPeriod => PeriodEnd.DayNumber - PeriodStart.DayNumber + 1;

    public Money Subtotal(Func<StatementLine, bool> predicate) =>
        Money.Sum(_lines.Where(predicate).Select(l => l.Amount), Currency);

    public Money Charges => Subtotal(l => !l.Amount.IsNegative);

    public Money Credits => Subtotal(l => l.Amount.IsNegative);

    public Money Total => Subtotal(_ => true);

    public StatementLine AddLine(ChargeType type, string description, Money amount, string? sourceReference, int quantity = 1)
    {
        if (Status != StatementStatus.Draft && type != ChargeType.DisputeAdjustment)
        {
            throw new DomainException("statement.not_draft", "Lines can only be added while the statement is a draft.");
        }

        if (amount.Currency != Currency)
        {
            throw new DomainException("statement.currency_mismatch", $"Line currency {amount.Currency} differs from statement {Currency}.");
        }

        var isCredit = type is ChargeType.FaultCredit or ChargeType.LateDeliveryCredit;
        if (isCredit && amount.MinorUnits > 0)
        {
            amount = new Money(-amount.MinorUnits, amount.Currency);
        }

        var line = new StatementLine(Guid.NewGuid(), _lines.Count + 1, type, description, quantity, amount, sourceReference);
        _lines.Add(line);
        return line;
    }

    public void Issue(DateTimeOffset now)
    {
        if (Status != StatementStatus.Draft)
        {
            throw new InvalidTransitionException("statement", Status.ToString().ToUpperInvariant(), "ISSUED");
        }

        Status = StatementStatus.Issued;
        IssuedAt = now;
        DueDate = DateOnly.FromDateTime(now.UtcDateTime).AddDays(PaymentTermsDays);
        Touch(now);
    }

    public void MarkDisputed()
    {
        if (Status is not (StatementStatus.Issued or StatementStatus.Disputed))
        {
            throw new DomainException("statement.not_disputable", "Only issued statements can be disputed.");
        }

        Status = StatementStatus.Disputed;
    }

    public void ReturnToIssued()
    {
        if (Status == StatementStatus.Disputed)
        {
            Status = StatementStatus.Issued;
        }
    }

    public void MarkSettled(DateTimeOffset now)
    {
        if (Status == StatementStatus.Disputed)
        {
            throw new DomainException("statement.open_dispute", "Statements with an open dispute cannot be settled.");
        }

        if (Status != StatementStatus.Issued)
        {
            throw new InvalidTransitionException("statement", Status.ToString().ToUpperInvariant(), "SETTLED");
        }

        Status = StatementStatus.Settled;
        Touch(now);
    }

    public StatementLine? FindLine(Guid lineId) => _lines.FirstOrDefault(l => l.Id == lineId);
}

public sealed record StatementLine(
    Guid Id,
    int LineNumber,
    ChargeType Type,
    string Description,
    int Quantity,
    Money Amount,
    string? SourceReference);
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Billing/Dispute.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Billing/Dispute.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Billing;

public enum DisputeStatus
{
    Open,
    UnderReview,
    Upheld,
    PartiallyUpheld,
    Rejected,
}

/// <summary>
/// A partner's challenge to one or more statement lines. Must be raised within the dispute
/// window after issue; the claimed amount cannot exceed the disputed lines' total. When upheld,
/// the awarded amount becomes a credit adjustment on the statement.
/// </summary>
public sealed class Dispute : AggregateRoot
{
    public const int DisputeWindowDays = 90;

    private Dispute()
    {
    }

    private Dispute(string reference, Guid statementId, Guid partnerId, List<Guid> lineIds, string reason, Money claimed, DateTimeOffset now)
    {
        Reference = reference;
        StatementId = statementId;
        PartnerId = partnerId;
        LineIds = lineIds;
        Reason = reason;
        ClaimedAmount = claimed;
        Status = DisputeStatus.Open;
        Touch(now);
    }

    public string Reference { get; private set; } = string.Empty;

    public Guid StatementId { get; private set; }

    public Guid PartnerId { get; private set; }

    public List<Guid> LineIds { get; private set; } = new();

    public string Reason { get; private set; } = string.Empty;

    public Money ClaimedAmount { get; private set; }

    public DisputeStatus Status { get; private set; }

    public Money? AwardedAmount { get; private set; }

    public string? Outcome { get; private set; }

    public DateTimeOffset? DecidedAt { get; private set; }

    public bool IsOpen => Status is DisputeStatus.Open or DisputeStatus.UnderReview;

    public static Dispute Raise(string reference, BillingStatement statement, IReadOnlyCollection<Guid> lineIds, string reason,
        Money claimed, DateTimeOffset now)
    {
        if (statement.IssuedAt is not { } issued)
        {
            throw new DomainException("dispute.statement_not_issued", "Only issued statements can be disputed.");
        }

        if ((now - issued).TotalDays > DisputeWindowDays)
        {
            throw new DomainException("dispute.window_closed", $"Disputes must be raised within {DisputeWindowDays} days of issue.");
        }

        if (lineIds.Count == 0)
        {
            throw new DomainException("dispute.no_lines", "Select at least one statement line to dispute.");
        }

        var lines = new List<StatementLine>();
        foreach (var id in lineIds.Distinct())
        {
            lines.Add(statement.FindLine(id) ?? throw new DomainException("dispute.unknown_line", $"Line {id} is not on statement {statement.Reference}."));
        }

        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length < 20)
        {
            throw new DomainException("dispute.reason_too_short", "Explain the dispute in at least 20 characters.");
        }

        var disputable = Money.Sum(lines.Where(l => !l.Amount.IsNegative).Select(l => l.Amount), statement.Currency);
        if (claimed.MinorUnits <= 0 || claimed.MinorUnits > disputable.MinorUnits)
        {
            throw new DomainException("dispute.invalid_claim", $"Claimed amount must be positive and at most {disputable}.");
        }

        statement.MarkDisputed();
        return new Dispute(reference, statement.Id, statement.PartnerId, lines.Select(l => l.Id).ToList(), reason.Trim(), claimed, now);
    }

    public void StartReview(DateTimeOffset now)
    {
        if (Status != DisputeStatus.Open)
        {
            throw new InvalidTransitionException("dispute", Status.ToString().ToUpperInvariant(), "UNDER_REVIEW");
        }

        Status = DisputeStatus.UnderReview;
        Touch(now);
    }

    /// <summary>Decides the dispute. An award of zero rejects it; the full claim upholds it.</summary>
    public void Decide(Money awarded, string outcome, DateTimeOffset now)
    {
        if (!IsOpen)
        {
            throw new DomainException("dispute.closed", "Dispute has already been decided.");
        }

        if (awarded.IsNegative || awarded.MinorUnits > ClaimedAmount.MinorUnits)
        {
            throw new DomainException("dispute.invalid_award", "Award must be between zero and the claimed amount.");
        }

        if (string.IsNullOrWhiteSpace(outcome))
        {
            throw new DomainException("dispute.outcome_required", "An outcome explanation is required.");
        }

        AwardedAmount = awarded;
        Outcome = outcome.Trim();
        DecidedAt = now;
        Status = awarded.IsZero
            ? DisputeStatus.Rejected
            : awarded.MinorUnits == ClaimedAmount.MinorUnits ? DisputeStatus.Upheld : DisputeStatus.PartiallyUpheld;
        Touch(now);
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Catalogue/WholesaleProduct.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Catalogue/WholesaleProduct.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Domain.Catalogue;

/// <summary>A wholesale fibre access product (e.g. FTTP 500/75) sold to partners.</summary>
public sealed class WholesaleProduct
{
    private WholesaleProduct()
    {
    }

    public WholesaleProduct(string code, string name, int downstreamMbps, int upstreamMbps, IEnumerable<CareLevel> careLevels, bool isActive = true)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            throw new DomainException("product.code_required", "Product code is required.");
        }

        if (downstreamMbps <= 0 || upstreamMbps <= 0 || upstreamMbps > downstreamMbps)
        {
            throw new DomainException("product.invalid_speed", "Speeds must be positive and upstream must not exceed downstream.");
        }

        Code = code.ToUpperInvariant();
        Name = name;
        DownstreamMbps = downstreamMbps;
        UpstreamMbps = upstreamMbps;
        AvailableCareLevels = careLevels.Distinct().OrderBy(c => c).ToList();
        IsActive = isActive;

        if (AvailableCareLevels.Count == 0)
        {
            throw new DomainException("product.care_required", "At least one care level must be offered.");
        }
    }

    public string Code { get; private set; } = string.Empty;

    public string Name { get; private set; } = string.Empty;

    public int DownstreamMbps { get; private set; }

    public int UpstreamMbps { get; private set; }

    public List<CareLevel> AvailableCareLevels { get; private set; } = new();

    public bool IsActive { get; private set; }

    public bool SupportsCareLevel(CareLevel careLevel) => AvailableCareLevels.Contains(careLevel);

    public void Withdraw() => IsActive = false;
}

/// <summary>
/// A dated version of the price book. Exactly one version is effective on any date; a new
/// version takes effect from its <see cref="EffectiveFrom"/> and closes the previous one.
/// </summary>
public sealed class PriceBook
{
    private readonly List<PriceBookEntry> _entries = new();
    private readonly List<VolumeDiscountTier> _tiers = new();

    private PriceBook()
    {
    }

    public PriceBook(string version, DateOnly effectiveFrom, string currency)
    {
        Version = version;
        EffectiveFrom = effectiveFrom;
        Currency = currency;
    }

    public Guid Id { get; private set; } = Guid.NewGuid();

    public string Version { get; private set; } = string.Empty;

    public DateOnly EffectiveFrom { get; private set; }

    public DateOnly? EffectiveTo { get; private set; }

    public string Currency { get; private set; } = "GBP";

    public IReadOnlyList<PriceBookEntry> Entries => _entries;

    public IReadOnlyList<VolumeDiscountTier> Tiers => _tiers;

    public bool IsEffectiveOn(DateOnly date) => date >= EffectiveFrom && (EffectiveTo is null || date <= EffectiveTo);

    public void CloseOn(DateOnly lastDay)
    {
        if (lastDay < EffectiveFrom)
        {
            throw new DomainException("pricebook.invalid_close", "A price book cannot close before it opens.");
        }

        EffectiveTo = lastDay;
    }

    public void AddEntry(string productCode, CareLevel careLevel, long monthlyRentalMinor, long connectionMinor, long migrationMinor, long modifyMinor)
    {
        if (monthlyRentalMinor < 0 || connectionMinor < 0 || migrationMinor < 0 || modifyMinor < 0)
        {
            throw new DomainException("pricebook.negative_price", "Prices must not be negative.");
        }

        var code = productCode.ToUpperInvariant();
        if (_entries.Any(e => e.ProductCode == code && e.CareLevel == careLevel))
        {
            throw new DomainException("pricebook.duplicate_entry", $"{code}/{careLevel} is already priced in {Version}.");
        }

        _entries.Add(new PriceBookEntry(code, careLevel, monthlyRentalMinor, connectionMinor, migrationMinor, modifyMinor));
    }

    public void AddTier(int minimumActiveLines, int discountBps)
    {
        if (minimumActiveLines < 0 || discountBps is < 0 or > 5_000)
        {
            throw new DomainException("pricebook.invalid_tier", "Tier threshold must be non-negative and discount between 0 and 50%.");
        }

        _tiers.Add(new VolumeDiscountTier(minimumActiveLines, discountBps));
        _tiers.Sort((a, b) => a.MinimumActiveLines.CompareTo(b.MinimumActiveLines));
    }

    public PriceBookEntry? Find(string productCode, CareLevel careLevel) =>
        _entries.FirstOrDefault(e => e.ProductCode == productCode.ToUpperInvariant() && e.CareLevel == careLevel);

    /// <summary>The discount of the highest tier whose threshold the partner's active base meets.</summary>
    public int DiscountBpsFor(int activeLines) =>
        _tiers.LastOrDefault(t => activeLines >= t.MinimumActiveLines)?.DiscountBps ?? 0;
}

public sealed record PriceBookEntry(
    string ProductCode,
    CareLevel CareLevel,
    long MonthlyRentalMinor,
    long ConnectionChargeMinor,
    long MigrationChargeMinor,
    long ModifyChargeMinor);

public sealed record VolumeDiscountTier(int MinimumActiveLines, int DiscountBps);
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Common/DomainException.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Common/DomainException.cs`.

```csharp
namespace IConnect.Wholesale.Domain.Common;

/// <summary>
/// Raised when a business invariant is violated. <see cref="Code"/> is a stable,
/// machine-readable identifier surfaced to API callers in the problem details "code" field.
/// </summary>
public class DomainException : Exception
{
    public DomainException(string code, string message)
        : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}

/// <summary>Raised when an aggregate is asked to make a state transition it does not allow.</summary>
public sealed class InvalidTransitionException : DomainException
{
    public InvalidTransitionException(string aggregate, string from, string to)
        : base($"{aggregate}.invalid_transition", $"{aggregate} cannot move from {from} to {to}.")
    {
        From = from;
        To = to;
    }

    public string From { get; }

    public string To { get; }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Common/Entity.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Common/Entity.cs`.

```csharp
namespace IConnect.Wholesale.Domain.Common;

public abstract class Entity
{
    public Guid Id { get; protected set; } = Guid.NewGuid();

    public DateTimeOffset CreatedAt { get; protected set; }

    public DateTimeOffset UpdatedAt { get; protected set; }

    /// <summary>Optimistic concurrency token maintained by the persistence layer.</summary>
    public uint RowVersion { get; protected set; }

    public void Touch(DateTimeOffset now)
    {
        if (CreatedAt == default)
        {
            CreatedAt = now;
        }

        UpdatedAt = now;
    }
}

public abstract class AggregateRoot : Entity
{
    private readonly List<IDomainEvent> _events = new();

    public IReadOnlyCollection<IDomainEvent> DomainEvents => _events.AsReadOnly();

    protected void Raise(IDomainEvent domainEvent) => _events.Add(domainEvent);

    public void ClearDomainEvents() => _events.Clear();
}

public interface IDomainEvent
{
    DateTimeOffset OccurredAt { get; }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Common/Money.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Common/Money.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Faults/Fault.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Faults/Fault.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Domain.Faults;

public enum FaultPriority
{
    P1,
    P2,
    P3,
    P4,
}

public enum FaultStatus
{
    Open,
    InProgress,
    PendingCustomer,
    Resolved,
    Closed,
}

public enum FaultCategory
{
    TotalLossOfService,
    IntermittentService,
    SpeedDegradation,
    Ont,
    Other,
}

/// <summary>
/// A fault ticket raised by a partner against one of its wholesale services. The repair clock
/// starts when the fault is raised, pauses while PENDING_CUSTOMER and stops at RESOLVED.
/// A service credit is assessed at resolution if the repair target was exceeded.
/// </summary>
public sealed class Fault : AggregateRoot
{
    public static readonly TimeSpan ReopenWindow = TimeSpan.FromDays(7);

    private static readonly IReadOnlyDictionary<FaultStatus, FaultStatus[]> Transitions = new Dictionary<FaultStatus, FaultStatus[]>
    {
        [FaultStatus.Open] = new[] { FaultStatus.InProgress, FaultStatus.PendingCustomer, FaultStatus.Resolved },
        [FaultStatus.InProgress] = new[] { FaultStatus.PendingCustomer, FaultStatus.Resolved },
        [FaultStatus.PendingCustomer] = new[] { FaultStatus.InProgress, FaultStatus.Resolved },
        [FaultStatus.Resolved] = new[] { FaultStatus.Closed, FaultStatus.InProgress },
        [FaultStatus.Closed] = Array.Empty<FaultStatus>(),
    };

    private readonly List<FaultNote> _notes = new();

    private Fault()
    {
    }

    private Fault(string reference, Guid partnerId, Guid serviceId, string uprn, FaultPriority priority, FaultCategory category,
        CareLevel careLevel, string description, Money monthlyRental, SlaClock clock, DateTimeOffset now)
    {
        Reference = reference;
        PartnerId = partnerId;
        ServiceId = serviceId;
        Uprn = uprn;
        Priority = priority;
        Category = category;
        CareLevel = careLevel;
        Description = description;
        MonthlyRental = monthlyRental;
        RepairClock = clock;
        Status = FaultStatus.Open;
        Touch(now);
    }

    public string Reference { get; private set; } = string.Empty;

    public Guid PartnerId { get; private set; }

    public Guid ServiceId { get; private set; }

    public string Uprn { get; private set; } = string.Empty;

    public FaultPriority Priority { get; private set; }

    public FaultCategory Category { get; private set; }

    public CareLevel CareLevel { get; private set; }

    public FaultStatus Status { get; private set; }

    public string Description { get; private set; } = string.Empty;

    public Money MonthlyRental { get; private set; }

    public SlaClock RepairClock { get; private set; } = null!;

    public DateTimeOffset? ResolvedAt { get; private set; }

    public string? ResolutionCode { get; private set; }

    public Money? ServiceCredit { get; private set; }

    public string? ServiceCreditBasis { get; private set; }

    public IReadOnlyList<FaultNote> Notes => _notes;

    public static Fault Raise(string reference, Guid partnerId, Guid serviceId, string uprn, FaultPriority priority,
        FaultCategory category, CareLevel careLevel, string description, Money monthlyRental,
        FaultRepairTarget target, string calendarName, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(description) || description.Length < 10)
        {
            throw new DomainException("fault.description_too_short", "Describe the fault in at least 10 characters.");
        }

        if (category == FaultCategory.TotalLossOfService && priority is FaultPriority.P3 or FaultPriority.P4)
        {
            priority = FaultPriority.P2;
        }

        var clock = new SlaClock(now, target.Target, calendarName);
        var fault = new Fault(reference, partnerId, serviceId, uprn, priority, category, careLevel, description.Trim(), monthlyRental, clock, now);
        fault._notes.Add(new FaultNote(now, "partner", "Fault raised: " + description.Trim(), false));
        return fault;
    }

    public void AddNote(DateTimeOffset now, string author, string text, bool internalOnly)
    {
        if (Status == FaultStatus.Closed)
        {
            throw new DomainException("fault.closed", "Closed faults cannot be updated.");
        }

        if (string.IsNullOrWhiteSpace(text))
        {
            throw new DomainException("fault.empty_note", "Note text is required.");
        }

        _notes.Add(new FaultNote(now, author, text.Trim(), internalOnly));
        Touch(now);
    }

    public void StartWork(DateTimeOffset now, string actor)
    {
        if (Status == FaultStatus.PendingCustomer)
        {
            RepairClock.Resume(now);
        }

        Move(FaultStatus.InProgress, now, actor, "work started");
    }

    /// <summary>Waiting on the partner/end customer (access, information). Pauses the repair clock.</summary>
    public void AwaitCustomer(DateTimeOffset now, string actor, string reason)
    {
        Move(FaultStatus.PendingCustomer, now, actor, "awaiting customer: " + reason);
        RepairClock.Pause(now, reason);
    }

    public void CustomerResponded(DateTimeOffset now, string actor, string response)
    {
        if (Status != FaultStatus.PendingCustomer)
        {
            throw new DomainException("fault.not_pending_customer", "Fault is not awaiting a customer response.");
        }

        RepairClock.Resume(now);
        Move(FaultStatus.InProgress, now, actor, "customer responded: " + response);
    }

    /// <summary>Resolves the fault, stops the clock and assesses any service credit owed.</summary>
    public void Resolve(DateTimeOffset now, string actor, string resolutionCode, WorkingCalendar calendar, ServiceCreditCalculator credits)
    {
        if (string.IsNullOrWhiteSpace(resolutionCode))
        {
            throw new DomainException("fault.resolution_required", "A resolution code is required.");
        }

        Move(FaultStatus.Resolved, now, actor, "resolved: " + resolutionCode);
        RepairClock.Stop(now);
        ResolvedAt = now;
        ResolutionCode = resolutionCode;

        var overrun = RepairClock.Overrun(calendar, now);
        var credit = credits.ForFaultRepair(CareLevel, MonthlyRental, overrun, calendar.NominalDayLength);
        ServiceCredit = credit.Amount.IsZero ? null : credit.Amount;
        ServiceCreditBasis = credit.Amount.IsZero ? null : credit.Basis;
        if (ServiceCredit is { } amount)
        {
            Raise(new FaultCreditAssessed(Id, Reference, PartnerId, amount, credit.Basis, now));
        }
    }

    /// <summary>Partner disputes the fix within the reopen window; the clock continues from where it stopped.</summary>
    public void Reopen(DateTimeOffset now, string actor, string reason)
    {
        if (Status != FaultStatus.Resolved || ResolvedAt is null || now - ResolvedAt.Value > ReopenWindow)
        {
            throw new DomainException("fault.reopen_window_closed", $"Faults can only be reopened within {ReopenWindow.TotalDays} days of resolution.");
        }

        RepairClock.Reopen(now);
        ResolvedAt = null;
        ResolutionCode = null;
        ServiceCredit = null;
        ServiceCreditBasis = null;
        Move(FaultStatus.InProgress, now, actor, "reopened: " + reason);
    }

    public void Close(DateTimeOffset now, string actor) => Move(FaultStatus.Closed, now, actor, "closed");

    public bool CanAutoClose(DateTimeOffset now) =>
        Status == FaultStatus.Resolved && ResolvedAt is { } resolved && now - resolved > ReopenWindow;

    public static bool CanTransition(FaultStatus from, FaultStatus to) => Transitions[from].Contains(to);

    private void Move(FaultStatus to, DateTimeOffset now, string actor, string note)
    {
        if (!CanTransition(Status, to))
        {
            throw new InvalidTransitionException("fault", Status.ToString().ToUpperInvariant(), to.ToString().ToUpperInvariant());
        }

        Status = to;
        _notes.Add(new FaultNote(now, actor, note, false));
        Touch(now);
    }
}

public sealed record FaultNote(DateTimeOffset At, string Author, string Text, bool InternalOnly);

public sealed record FaultCreditAssessed(Guid FaultId, string Reference, Guid PartnerId, Money Amount, string Basis, DateTimeOffset OccurredAt) : IDomainEvent;
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/IConnect.Wholesale.Domain.csproj

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: xml. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/IConnect.Wholesale.Domain.csproj`.

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <RootNamespace>IConnect.Wholesale.Domain</RootNamespace>
  </PropertyGroup>
</Project>
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Network/Premise.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Network/Premise.cs`.

```csharp
using System.Text.RegularExpressions;
using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Network;

public enum PremiseBuildStatus
{
    /// <summary>Fibre is live and ready for service.</summary>
    ReadyForService,

    /// <summary>In the build plan; orders accepted with a forward requested date after RFS.</summary>
    PlannedBuild,

    /// <summary>Passed but requires a survey/civil works (e.g. long lead-in) before connection.</summary>
    SurveyRequired,

    NotServiceable,
}

/// <summary>A premise passed (or planned) by the fibre network, keyed by its Unique Property Reference Number.</summary>
public sealed class Premise
{
    private Premise()
    {
    }

    public Premise(string uprn, string addressLine1, string? addressLine2, string town, string postcode,
        string exchangeCode, PremiseBuildStatus buildStatus, int maxDownstreamMbps, DateOnly? readyForServiceDate)
    {
        Uprn = Uprns.Normalise(uprn);
        AddressLine1 = addressLine1;
        AddressLine2 = addressLine2;
        Town = town;
        Postcode = Postcodes.Normalise(postcode);
        ExchangeCode = exchangeCode;
        BuildStatus = buildStatus;
        MaxDownstreamMbps = maxDownstreamMbps;
        ReadyForServiceDate = readyForServiceDate;
    }

    public string Uprn { get; private set; } = string.Empty;

    public string AddressLine1 { get; private set; } = string.Empty;

    public string? AddressLine2 { get; private set; }

    public string Town { get; private set; } = string.Empty;

    public string Postcode { get; private set; } = string.Empty;

    public string ExchangeCode { get; private set; } = string.Empty;

    public PremiseBuildStatus BuildStatus { get; private set; }

    public int MaxDownstreamMbps { get; private set; }

    public DateOnly? ReadyForServiceDate { get; private set; }

    /// <summary>Set when a service (from any partner) is already live on the ONT port.</summary>
    public bool HasActiveService { get; private set; }

    public string SingleLineAddress =>
        string.Join(", ", new[] { AddressLine1, AddressLine2, Town, Postcode }.Where(s => !string.IsNullOrWhiteSpace(s)));

    public bool IsOrderable(DateOnly onDate) => BuildStatus switch
    {
        PremiseBuildStatus.ReadyForService => true,
        PremiseBuildStatus.PlannedBuild => ReadyForServiceDate is { } rfs && onDate >= rfs,
        PremiseBuildStatus.SurveyRequired => true,
        _ => false,
    };

    public void MarkServiceActive(bool active) => HasActiveService = active;
}

public static partial class Uprns
{
    /// <summary>UPRNs are 1-12 digit integers; leading zeros are not significant.</summary>
    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value) && UprnPattern().IsMatch(value.Trim()) && value.Trim().TrimStart('0').Length > 0;

    public static string Normalise(string value)
    {
        if (!IsValid(value))
        {
            throw new DomainException("uprn.invalid", $"'{value}' is not a valid UPRN.");
        }

        return value.Trim().TrimStart('0');
    }

    [GeneratedRegex("^[0-9]{1,12}$")]
    private static partial Regex UprnPattern();
}

public static partial class Postcodes
{
    public static bool IsValid(string? value) => !string.IsNullOrWhiteSpace(value) && PostcodePattern().IsMatch(Compact(value));

    /// <summary>Upper-cases and inserts the single space before the inward code ("sw1a1aa" → "SW1A 1AA").</summary>
    public static string Normalise(string value)
    {
        if (!IsValid(value))
        {
            throw new DomainException("postcode.invalid", $"'{value}' is not a valid UK postcode.");
        }

        var compact = Compact(value);
        return compact[..^3] + " " + compact[^3..];
    }

    private static string Compact(string value) => value.Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant();

    [GeneratedRegex("^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$")]
    private static partial Regex PostcodePattern();
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Orders/BulkUpload.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Domain/Orders/BulkUpload.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Orders;

public enum BulkUploadStatus
{
    Validated,
    Rejected,
    Submitted,
}

/// <summary>
/// A CSV batch of orders. Rows are validated as a whole first; the batch is only submittable
/// when every row is valid (all-or-nothing), which avoids partial batches that partners then
/// have to reconcile by hand.
/// </summary>
public sealed class BulkUpload : Entity
{
    public const int MaxRows = 2_000;

    private BulkUpload()
    {
    }

    public BulkUpload(Guid partnerId, string fileName, string contentSha256, int rowCount, IReadOnlyCollection<BulkRowError> errors, DateTimeOffset now, string uploadedBy)
    {
        PartnerId = partnerId;
        FileName = fileName;
        ContentSha256 = contentSha256;
        RowCount = rowCount;
        Errors = errors.ToList();
        Status = Errors.Count == 0 ? BulkUploadStatus.Validated : BulkUploadStatus.Rejected;
        UploadedBy = uploadedBy;
        Touch(now);
    }

    public Guid PartnerId { get; private set; }

    public string FileName { get; private set; } = string.Empty;

    public string ContentSha256 { get; private set; } = string.Empty;

    public int RowCount { get; private set; }

    public BulkUploadStatus Status { get; private set; }

    public List<BulkRowError> Errors { get; private set; } = new();

    public int OrdersCreated { get; private set; }

    public string UploadedBy { get; private set; } = string.Empty;

    public void MarkSubmitted(int ordersCreated, DateTimeOffset now)
    {
        if (Status != BulkUploadStatus.Validated)
        {
            throw new DomainException("bulk.not_submittable", "Only fully valid uploads can be submitted.");
        }

        Status = BulkUploadStatus.Submitted;
        OrdersCreated = ordersCreated;
        Touch(now);
    }
}

public sealed record BulkRowError(int Row, string Column, string Code, string Message);
```
