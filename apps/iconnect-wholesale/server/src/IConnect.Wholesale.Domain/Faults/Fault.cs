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
