using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Domain.Orders;

/// <summary>
/// A wholesale order placed by a partner (ISP) against a premise identified by its UPRN.
/// Provide orders create a new service; Cease, Modify and Migrate act on an existing service.
/// The delivery SLA clock starts on validation and runs against the business-hours calendar
/// until the order is completed; customer-caused holds pause it.
/// State transitions live in Order.Lifecycle.cs.
/// </summary>
public sealed partial class Order : AggregateRoot
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

        EnsureTypeRequirements(type, productCode, existingServiceId, migrationAuthCode);

        return new Order(reference, partnerId, partnerReference.Trim(), type, uprn, productCode, careLevel,
            existingServiceId, migrationAuthCode, requestedDate, now);
    }

    /// <summary>Per-type field requirements, checked in a fixed order.</summary>
    private static void EnsureTypeRequirements(OrderType type, string? productCode, Guid? existingServiceId, string? migrationAuthCode)
    {
        bool noProduct = string.IsNullOrWhiteSpace(productCode);

        if (type == OrderType.Provide)
        {
            if (noProduct)
            {
                throw new DomainException("order.product_required", "Provide orders require a product code.");
            }

            if (existingServiceId is not null)
            {
                throw new DomainException("order.unexpected_service", "Provide orders must not reference an existing service.");
            }

            return;
        }

        if ((type == OrderType.Cease || type == OrderType.Modify) && existingServiceId is null)
        {
            throw new DomainException("order.service_required", $"{type} orders require an existing service id.");
        }

        if (type == OrderType.Modify && noProduct)
        {
            throw new DomainException("order.product_required", "Modify orders require the target product code.");
        }

        if (type == OrderType.Migrate)
        {
            if (string.IsNullOrWhiteSpace(migrationAuthCode))
            {
                throw new DomainException("order.migration_code_required", "Migrate orders require the losing provider's switching code.");
            }

            if (noProduct)
            {
                throw new DomainException("order.product_required", "Migrate orders require a product code.");
            }
        }
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
