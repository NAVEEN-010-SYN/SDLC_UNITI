using Uconnect.Domain.Common;

namespace Uconnect.Domain.Appointments;

/// <summary>
/// An engineer visit to a service address. Flow: <c>Requested -> Confirmed -> Completed</c>;
/// a confirmed visit can also end <c>Missed</c> (by the customer or by us) and any open visit can
/// be <c>Cancelled</c>. Customers may reschedule up to <see cref="MaxReschedules"/> times, no later
/// than <see cref="ChangeCutoffHours"/> hours before the window starts.
/// </summary>
public sealed class Appointment : AggregateRoot
{
    public const int MaxReschedules = 3;
    public const int ChangeCutoffHours = 24;

    private Appointment()
    {
    }

    public Appointment(
        Guid id,
        string reference,
        Guid accountId,
        Guid? serviceId,
        Guid? ticketId,
        AppointmentType type,
        AppointmentSlot slot,
        PostalAddress visitAddress,
        string contactName,
        PhoneNumber contactPhone,
        string? accessNotes,
        DateTimeOffset createdAt)
        : base(id)
    {
        if (type == AppointmentType.Repair && ticketId is null)
        {
            throw new DomainException("appointment.repair_needs_ticket", "Repair visits must be linked to a fault ticket.");
        }

        Reference = Guard.NotBlank(reference, "appointment.reference", 20);
        AccountId = accountId;
        ServiceId = serviceId;
        TicketId = ticketId;
        Type = type;
        Date = slot.Date;
        Window = slot.Window;
        VisitAddress = visitAddress;
        ContactName = Guard.NotBlank(contactName, "appointment.contact_name", 120);
        ContactPhone = contactPhone;
        AccessNotes = NormaliseNotes(accessNotes);
        Status = AppointmentStatus.Requested;
        CreatedAt = createdAt;
    }

    public string Reference { get; private set; } = string.Empty;

    public Guid AccountId { get; private set; }

    public Guid? ServiceId { get; private set; }

    public Guid? TicketId { get; private set; }

    public AppointmentType Type { get; private set; }

    public DateOnly Date { get; private set; }

    public AppointmentWindow Window { get; private set; }

    public PostalAddress VisitAddress { get; private set; } = null!;

    public string ContactName { get; private set; } = string.Empty;

    public PhoneNumber ContactPhone { get; private set; } = null!;

    public string? AccessNotes { get; private set; }

    public AppointmentStatus Status { get; private set; }

    public string? EngineerName { get; private set; }

    public string? FieldWorkOrderRef { get; private set; }

    public int RescheduleCount { get; private set; }

    public bool LateCancellation { get; private set; }

    public string? CancellationReason { get; private set; }

    /// <summary>True when the visit was missed because the engineer did not attend.</summary>
    public bool MissedByProvider { get; private set; }

    public string? OutcomeNotes { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset? CompletedAt { get; private set; }

    public AppointmentSlot Slot => new(Date, Window);

    public bool IsActive => Status is AppointmentStatus.Requested or AppointmentStatus.Confirmed;

    /// <summary>Whether the customer may still change or cancel without it counting as late.</summary>
    public bool IsChangeable(DateTimeOffset now) =>
        IsActive && Slot.StartsAtUtc - now >= TimeSpan.FromHours(ChangeCutoffHours);

    public void Confirm(string fieldWorkOrderRef, string? engineerName)
    {
        if (Status != AppointmentStatus.Requested)
        {
            throw new InvalidStateTransitionException(nameof(Appointment), Status.ToString(), AppointmentStatus.Confirmed.ToString());
        }

        FieldWorkOrderRef = Guard.NotBlank(fieldWorkOrderRef, "appointment.work_order", 40);
        EngineerName = string.IsNullOrWhiteSpace(engineerName) ? null : engineerName.Trim();
        Status = AppointmentStatus.Confirmed;
    }

    public void Reschedule(AppointmentSlot newSlot, DateTimeOffset now)
    {
        if (!IsActive)
        {
            throw new DomainException("appointment.not_active", "Only upcoming appointments can be rescheduled.");
        }

        if (!IsChangeable(now))
        {
            throw new DomainException("appointment.too_late_to_change", $"Appointments cannot be changed within {ChangeCutoffHours} hours of the visit; please contact support.");
        }

        if (RescheduleCount >= MaxReschedules)
        {
            throw new DomainException("appointment.reschedule_limit", $"An appointment can be rescheduled at most {MaxReschedules} times.");
        }

        if (newSlot == Slot)
        {
            throw new DomainException("appointment.same_slot", "The new slot is the same as the current one.");
        }

        var previous = Slot;
        Date = newSlot.Date;
        Window = newSlot.Window;
        RescheduleCount++;

        // The field system re-plans the visit, so it returns to Requested until reconfirmed.
        Status = AppointmentStatus.Requested;
        EngineerName = null;
        Raise(new AppointmentRescheduled(Id, AccountId, Reference, previous, newSlot, now));
    }

    public void UpdateAccessNotes(string? notes, DateTimeOffset now)
    {
        if (!IsActive)
        {
            throw new DomainException("appointment.not_active", "Notes can only be changed on upcoming appointments.");
        }

        AccessNotes = NormaliseNotes(notes);
    }

    public void Cancel(string reason, DateTimeOffset now)
    {
        if (!IsActive)
        {
            throw new InvalidStateTransitionException(nameof(Appointment), Status.ToString(), AppointmentStatus.Cancelled.ToString());
        }

        if (now >= Slot.StartsAtUtc)
        {
            throw new DomainException("appointment.already_started", "The appointment window has already started.");
        }

        LateCancellation = !IsChangeable(now);
        CancellationReason = Guard.NotBlank(reason, "appointment.cancellation_reason", 500);
        Status = AppointmentStatus.Cancelled;
        Raise(new AppointmentCancelled(Id, AccountId, Reference, LateCancellation, now));
    }

    public void Complete(string outcomeNotes, DateTimeOffset now)
    {
        if (Status != AppointmentStatus.Confirmed)
        {
            throw new InvalidStateTransitionException(nameof(Appointment), Status.ToString(), AppointmentStatus.Completed.ToString());
        }

        if (now < Slot.StartsAtUtc)
        {
            throw new DomainException("appointment.not_started", "An appointment cannot be completed before its window starts.");
        }

        OutcomeNotes = Guard.NotBlank(outcomeNotes, "appointment.outcome", 2000);
        Status = AppointmentStatus.Completed;
        CompletedAt = now;
    }

    public void MarkMissed(bool missedByProvider, string notes, DateTimeOffset now)
    {
        if (Status != AppointmentStatus.Confirmed)
        {
            throw new InvalidStateTransitionException(nameof(Appointment), Status.ToString(), AppointmentStatus.Missed.ToString());
        }

        if (now < Slot.EndsAtUtc)
        {
            throw new DomainException("appointment.window_open", "An appointment can only be marked missed after its window has ended.");
        }

        MissedByProvider = missedByProvider;
        OutcomeNotes = Guard.NotBlank(notes, "appointment.outcome", 2000);
        Status = AppointmentStatus.Missed;
        Raise(new AppointmentMissed(Id, AccountId, ServiceId, Reference, missedByProvider, now));
    }

    private static string? NormaliseNotes(string? notes)
    {
        if (string.IsNullOrWhiteSpace(notes))
        {
            return null;
        }

        var trimmed = notes.Trim();
        return trimmed.Length > 500
            ? throw new DomainException("appointment.notes_too_long", "Access notes must be at most 500 characters.")
            : trimmed;
    }
}

public sealed record AppointmentRescheduled(Guid AppointmentId, Guid AccountId, string Reference, AppointmentSlot From, AppointmentSlot To, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record AppointmentCancelled(Guid AppointmentId, Guid AccountId, string Reference, bool Late, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record AppointmentMissed(Guid AppointmentId, Guid AccountId, Guid? ServiceId, string Reference, bool MissedByProvider, DateTimeOffset OccurredAt) : IDomainEvent;
