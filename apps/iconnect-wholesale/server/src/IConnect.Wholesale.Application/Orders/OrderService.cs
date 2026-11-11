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
/// Split into partial files: this file (placement, queries), OrderService.Inventory.cs, OrderService.Lifecycle.cs.
/// </summary>
public sealed partial class OrderService
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
            throw new RequestValidationException(GroupErrorsByField(errors));
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

        if (bulkUploadId is not null)
        {
            order.AttachToBulkUpload(bulkUploadId.Value);
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

    public async Task<PagedResult<OrderSummaryDto>> ListAsync(OrderStatus? status, OrderType? type, string? search,
        DateOnly? from, DateOnly? to, PageRequest page, CancellationToken ct)
    {
        var now = _clock.UtcNow;
        var query = new OrderQuery(_caller.PartnerId, status, type, search?.Trim(), from, to, page);
        var result = await _orders.QueryAsync(query, ct);
        return result.Map(o => OrderMapping.ToSummary(o, Calendar, now));
    }

    public async Task<OrderDetailDto> GetAsync(Guid id, CancellationToken ct)
    {
        var order = await LoadOwnedAsync(id, ct);
        return OrderMapping.ToDetail(order, Calendar, _clock.UtcNow, _caller.IsSupportAgent);
    }

    internal async Task<Order> LoadOwnedAsync(Guid id, CancellationToken ct)
    {
        var order = await _orders.GetAsync(id, ct);
        if (order is null)
        {
            throw new NotFoundException("Order", id);
        }

        if (!_caller.IsSupportAgent && order.PartnerId != _caller.PartnerId)
        {
            throw new NotFoundException("Order", id);
        }

        return order;
    }

    private static Dictionary<string, string[]> GroupErrorsByField(IReadOnlyList<FieldError> errors)
    {
        var grouped = new Dictionary<string, List<string>>();
        foreach (var error in errors)
        {
            if (!grouped.TryGetValue(error.Field, out var messages))
            {
                messages = new List<string>();
                grouped[error.Field] = messages;
            }

            messages.Add(error.Message);
        }

        var result = new Dictionary<string, string[]>();
        foreach (var pair in grouped)
        {
            result[pair.Key] = pair.Value.ToArray();
        }

        return result;
    }

    private static bool IsSameRequest(Order existing, ValidatedOrderRequest request)
    {
        return existing.Type == request.Type
            && existing.Uprn == request.Uprn
            && existing.ProductCode == request.ProductCode
            && existing.CareLevel == request.CareLevel
            && existing.ExistingServiceId == request.ExistingServiceId
            && existing.RequestedDate == request.RequestedDate;
    }
}
