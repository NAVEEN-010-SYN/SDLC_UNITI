using Uconnect.Domain.Common;

namespace Uconnect.Domain.Tickets;

/// <summary>
/// A support case. Status flow: <c>OPEN -> IN_PROGRESS -> PENDING_CUSTOMER -> RESOLVED -> CLOSED</c>.
/// SLA clocks (first response and resolution) run from creation and are paused while the ticket
/// waits on the customer. A resolved ticket can be reopened by the customer within
/// <see cref="ReopenWindowDays"/> days, after which it closes automatically.
/// </summary>
public sealed class Ticket : AggregateRoot
{
    public const int ReopenWindowDays = 14;
    public const int PendingCustomerAutoCloseDays = 14;
    public const int MaxReopens = 3;

    private static readonly Dictionary<TicketStatus, TicketStatus[]> AllowedTransitions = new()
    {
        [TicketStatus.Open] = new[] { TicketStatus.InProgress, TicketStatus.PendingCustomer, TicketStatus.Resolved, TicketStatus.Closed },
        [TicketStatus.InProgress] = new[] { TicketStatus.PendingCustomer, TicketStatus.Resolved },
        [TicketStatus.PendingCustomer] = new[] { TicketStatus.InProgress, TicketStatus.Resolved, TicketStatus.Closed },
        [TicketStatus.Resolved] = new[] { TicketStatus.InProgress, TicketStatus.Closed },
        [TicketStatus.Closed] = Array.Empty<TicketStatus>(),
    };

    private readonly List<TicketComment> _comments = new();

    private Ticket()
    {
    }

    public Ticket(
        Guid id,
        string reference,
        Guid accountId,
        Guid? serviceId,
        TicketCategory category,
        TicketPriority priority,
        string subject,
        string description,
        Guid createdByUserId,
        DateTimeOffset createdAt)
        : base(id)
    {
        Reference = Guard.NotBlank(reference, "ticket.reference", 20);
        AccountId = accountId;
        ServiceId = serviceId;
        Category = category;
        Priority = priority;
        Subject = Guard.NotBlank(subject, "ticket.subject", 150);
        Description = Guard.NotBlank(description, "ticket.description", 4000);
        CreatedByUserId = createdByUserId;
        CreatedAt = createdAt;
        LastActivityAt = createdAt;
        Status = TicketStatus.Open;
        Raise(new TicketCreated(Id, AccountId, Reference, Priority, createdAt));
    }

    /// <summary>Customer-visible reference, e.g. <c>TKT-004211</c>.</summary>
    public string Reference { get; private set; } = string.Empty;

    public Guid AccountId { get; private set; }

    public Guid? ServiceId { get; private set; }

    public TicketCategory Category { get; private set; }

    public TicketPriority Priority { get; private set; }

    public TicketStatus Status { get; private set; }

    public string Subject { get; private set; } = string.Empty;

    public string Description { get; private set; } = string.Empty;

    public Guid CreatedByUserId { get; private set; }

    public Guid? AssignedAgentId { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset LastActivityAt { get; private set; }

    public DateTimeOffset? FirstRespondedAt { get; private set; }

    public DateTimeOffset? ResolvedAt { get; private set; }

    public DateTimeOffset? ClosedAt { get; private set; }

    public string? ResolutionSummary { get; private set; }

    public int ReopenCount { get; private set; }

    /// <summary>When the SLA clock was paused (ticket moved to PendingCustomer), if currently paused.</summary>
    public DateTimeOffset? SlaPausedAt { get; private set; }

    /// <summary>Accumulated time the SLA clock has been paused, in ticks (for persistence).</summary>
    public long SlaPausedTicks { get; private set; }

    public IReadOnlyList<TicketComment> Comments => _comments.AsReadOnly();

    public TimeSpan SlaPaused => TimeSpan.FromTicks(SlaPausedTicks);

    public bool IsOpen => Status is not (TicketStatus.Resolved or TicketStatus.Closed);

    public DateTimeOffset FirstResponseDueAt => CreatedAt + TicketSlaPolicy.For(Priority).FirstResponse;

    public DateTimeOffset ResolutionDueAt => CreatedAt + TicketSlaPolicy.For(Priority).Resolution + SlaPaused;

    public bool IsFirstResponseBreached(DateTimeOffset now) =>
        (FirstRespondedAt ?? now) > FirstResponseDueAt;

    public bool IsResolutionBreached(DateTimeOffset now)
    {
        if (ResolvedAt is { } resolved)
        {
            return resolved > ResolutionDueAt;
        }

        var currentPause = SlaPausedAt is { } pausedAt ? now - pausedAt : TimeSpan.Zero;
        return now > ResolutionDueAt + currentPause;
    }

    public TicketComment AddCustomerComment(Guid userId, string authorName, string body, DateTimeOffset now)
    {
        if (Status == TicketStatus.Closed)
        {
            throw new DomainException("ticket.closed", "This ticket is closed; please raise a new ticket.");
        }

        var comment = AppendComment(userId, authorName, body, isAgent: false, isInternal: false, now);
        if (Status == TicketStatus.PendingCustomer)
        {
            TransitionTo(TicketStatus.InProgress, now);
        }

        return comment;
    }

    /// <summary>
    /// Adds an agent comment. The first public agent comment satisfies the first-response SLA.
    /// Internal notes are hidden from customers and do not count as a response.
    /// </summary>
    public TicketComment AddAgentComment(Guid agentId, string authorName, string body, bool isInternal, DateTimeOffset now)
    {
        if (Status == TicketStatus.Closed)
        {
            throw new DomainException("ticket.closed", "This ticket is closed.");
        }

        var comment = AppendComment(agentId, authorName, body, isAgent: true, isInternal, now);
        if (!isInternal && FirstRespondedAt is null)
        {
            FirstRespondedAt = now;
        }

        return comment;
    }

    public void Assign(Guid agentId, DateTimeOffset now)
    {
        if (!IsOpen)
        {
            throw new DomainException("ticket.not_open", "Only open tickets can be assigned.");
        }

        AssignedAgentId = agentId;
        if (Status == TicketStatus.Open)
        {
            TransitionTo(TicketStatus.InProgress, now);
        }
    }

    public void StartWork(DateTimeOffset now) => TransitionTo(TicketStatus.InProgress, now);

    public void AwaitCustomer(DateTimeOffset now) => TransitionTo(TicketStatus.PendingCustomer, now);

    public void Resolve(string summary, DateTimeOffset now)
    {
        ResolutionSummary = Guard.NotBlank(summary, "ticket.resolution_summary", 2000);
        TransitionTo(TicketStatus.Resolved, now);
        ResolvedAt = now;
        Raise(new TicketResolved(Id, AccountId, Reference, now));
    }

    /// <summary>Customer reopens a resolved ticket because the issue persists.</summary>
    public void Reopen(string reason, Guid userId, string authorName, DateTimeOffset now)
    {
        if (Status != TicketStatus.Resolved || ResolvedAt is not { } resolvedAt)
        {
            throw new DomainException("ticket.not_resolved", "Only resolved tickets can be reopened.");
        }

        if ((now - resolvedAt).TotalDays > ReopenWindowDays)
        {
            throw new DomainException("ticket.reopen_window_passed", $"Tickets can only be reopened within {ReopenWindowDays} days of resolution.");
        }

        if (ReopenCount >= MaxReopens)
        {
            throw new DomainException("ticket.reopen_limit", "This ticket has been reopened too many times; please raise a new ticket.");
        }

        AppendComment(userId, authorName, $"Reopened: {Guard.NotBlank(reason, "ticket.reopen_reason", 1000)}", isAgent: false, isInternal: false, now);
        ReopenCount++;
        ResolvedAt = null;
        ResolutionSummary = null;
        TransitionTo(TicketStatus.InProgress, now);
    }

    /// <summary>Closes the ticket. Customers may withdraw an open ticket; resolved tickets close after confirmation or timeout.</summary>
    public void Close(DateTimeOffset now)
    {
        TransitionTo(TicketStatus.Closed, now);
        ClosedAt = now;
    }

    /// <summary>
    /// Escalates to a higher priority (lower P-number). SLA targets are recalculated from creation time,
    /// which may put the ticket immediately into breach - that is intentional and visible to supervisors.
    /// </summary>
    public void Escalate(TicketPriority newPriority, string reason, Guid agentId, string agentName, DateTimeOffset now)
    {
        if (!IsOpen)
        {
            throw new DomainException("ticket.not_open", "Only open tickets can be escalated.");
        }

        if (newPriority >= Priority)
        {
            throw new DomainException("ticket.escalation_not_higher", "Escalation must raise the priority.");
        }

        var previous = Priority;
        Priority = newPriority;
        AppendComment(agentId, agentName, $"Escalated from {previous} to {newPriority}: {Guard.NotBlank(reason, "ticket.escalation_reason", 1000)}", isAgent: true, isInternal: true, now);
        Raise(new TicketEscalated(Id, AccountId, Reference, previous, newPriority, now));
    }

    /// <summary>True when the ticket should be auto-closed by the housekeeping job.</summary>
    public bool IsDueForAutoClose(DateTimeOffset now)
    {
        if (Status == TicketStatus.Resolved)
        {
            return ResolvedAt.HasValue && (now - ResolvedAt.Value).TotalDays > ReopenWindowDays;
        }

        if (Status == TicketStatus.PendingCustomer)
        {
            return (now - LastActivityAt).TotalDays > PendingCustomerAutoCloseDays;
        }

        return false;
    }

    private TicketComment AppendComment(Guid authorId, string authorName, string body, bool isAgent, bool isInternal, DateTimeOffset now)
    {
        var comment = new TicketComment(Guid.NewGuid(), Id, authorId, authorName, body, isAgent, isInternal, now);
        _comments.Add(comment);
        LastActivityAt = now;
        return comment;
    }

    private void TransitionTo(TicketStatus target, DateTimeOffset now)
    {
        if (!AllowedTransitions[Status].Contains(target))
        {
            throw new InvalidStateTransitionException(nameof(Ticket), Status.ToString(), target.ToString());
        }

        if (Status == TicketStatus.PendingCustomer && SlaPausedAt is { } pausedAt)
        {
            SlaPausedTicks += (now - pausedAt).Ticks;
            SlaPausedAt = null;
        }

        if (target == TicketStatus.PendingCustomer)
        {
            SlaPausedAt = now;
        }

        Status = target;
        LastActivityAt = now;
    }
}

public sealed record TicketCreated(Guid TicketId, Guid AccountId, string Reference, TicketPriority Priority, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record TicketResolved(Guid TicketId, Guid AccountId, string Reference, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record TicketEscalated(Guid TicketId, Guid AccountId, string Reference, TicketPriority From, TicketPriority To, DateTimeOffset OccurredAt) : IDomainEvent;
