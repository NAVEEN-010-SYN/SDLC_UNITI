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
