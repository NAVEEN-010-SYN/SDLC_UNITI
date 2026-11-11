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
