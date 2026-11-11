using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Domain.Orders;

/// <summary>Order state transitions: pricing, submission, validation, holds, completion and cancellation.</summary>
public sealed partial class Order
{
    public void AttachToBulkUpload(Guid bulkUploadId)
    {
        BulkUploadId = bulkUploadId;
    }

    public void Price(Money monthlyRental, Money oneOffCharge)
    {
        EnsureAmendable();
        MonthlyRental = monthlyRental;
        OneOffCharge = oneOffCharge;
    }

    public void Submit(DateTimeOffset now, string actor)
    {
        bool needsPrice = Type == OrderType.Provide || Type == OrderType.Modify || Type == OrderType.Migrate;
        if (needsPrice && MonthlyRental is null)
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
        var today = calendar.LocalDate(now);
        var earliest = calendar.AddWorkingDays(today, leadTimeWorkingDays);
        CommittedDate = RequestedDate > earliest ? RequestedDate : earliest;

        int workingDays = calendar.WorkingDaysBetween(today, CommittedDate.Value);
        var target = TimeSpan.FromTicks(calendar.NominalDayLength.Ticks * workingDays);
        if (target <= TimeSpan.Zero)
        {
            target = calendar.NominalDayLength;
        }

        DeliveryClock = new SlaClock(now, target, calendar.Name);
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
        bool needsAppointment = Type == OrderType.Provide || Type == OrderType.Migrate;
        if (needsAppointment && AppointmentSlotId is null)
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

        if (Status == OrderStatus.Validated && CommittedDate is not null && slotDate > CommittedDate.Value)
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
        if (Status != OrderStatus.Validated && Status != OrderStatus.Provisioning)
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
        if (Status == OrderStatus.Provisioning && AppointmentSlotId is not null && OneOffCharge is not null)
        {
            CancellationCharge = OneOffCharge;
        }

        DeliveryClock?.Stop(now);
        HoldReason = null;
        Move(OrderStatus.Cancelled, now, reason, actor);
    }

    public void AmendRequestedDate(DateOnly requestedDate)
    {
        EnsureAmendable();
        RequestedDate = requestedDate;
        if (CommittedDate is not null && requestedDate > CommittedDate.Value)
        {
            CommittedDate = requestedDate;
        }
    }

    /// <summary>Working days late against the committed date, using the supplied calendar.</summary>
    public int WorkingDaysLate(WorkingCalendar calendar)
    {
        if (CommittedDate is null || CompletedDate is null)
        {
            return 0;
        }

        return calendar.WorkingDaysBetween(CommittedDate.Value, CompletedDate.Value);
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
