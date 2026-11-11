# Uconnect account & service management: apps/uconnect/src (part 6 of 8)

- **Application:** Uconnect account & service management
- **Tech stack:** .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 15

## Files

- `apps/uconnect/src/Uconnect.Domain/Services/Service.cs` (195 lines)
- `apps/uconnect/src/Uconnect.Domain/Tickets/Ticket.cs` (284 lines)
- `apps/uconnect/src/Uconnect.Domain/Tickets/TicketComment.cs` (105 lines)
- `apps/uconnect/src/Uconnect.Domain/Uconnect.Domain.csproj` (13 lines)
- `apps/uconnect/src/Uconnect.Domain/Usage/UsageRecord.cs` (141 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/Common/PlatformServices.cs` (84 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/DependencyInjection.cs` (101 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/External/ExternalHttp.cs` (134 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/External/OperationsClients.cs` (213 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/External/PaymentGatewayClient.cs` (75 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/Persistence/Configurations/AccountConfigurations.cs` (100 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/Persistence/Configurations/BillingConfigurations.cs` (111 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/Persistence/Configurations/SupportConfigurations.cs` (118 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/Persistence/ReferenceGenerator.cs` (61 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/Persistence/Repositories/AccountRepositories.cs` (130 lines)

## apps/uconnect/src/Uconnect.Domain/Services/Service.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Services/Service.cs`.

```csharp
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Services;

/// <summary>
/// An active product instance on an account, tied to a service address. A service carries the
/// price the customer is actually paying (which can differ from the catalog price after a reprice)
/// and its contract term.
/// </summary>
public sealed class Service : AggregateRoot
{
    private Service()
    {
    }

    public Service(
        Guid id,
        Guid accountId,
        string serviceReference,
        Plan plan,
        PostalAddress serviceAddress,
        DateTimeOffset orderedAt)
        : base(id)
    {
        AccountId = accountId;
        ServiceReference = Guard.NotBlank(serviceReference, "service.reference", 32);
        PlanId = plan.Id;
        ProductType = plan.ProductType;
        MonthlyPrice = plan.MonthlyPrice;
        ServiceAddress = serviceAddress;
        Status = ServiceStatus.PendingActivation;
        OrderedAt = orderedAt;
        ContractTermMonths = plan.MinimumTermMonths;
    }

    public Guid AccountId { get; private set; }

    /// <summary>Customer-visible reference, e.g. <c>SVC-00012345</c>.</summary>
    public string ServiceReference { get; private set; } = string.Empty;

    public Guid PlanId { get; private set; }

    public ProductType ProductType { get; private set; }

    /// <summary>Price the customer currently pays per month for this service.</summary>
    public Money MonthlyPrice { get; private set; } = null!;

    public PostalAddress ServiceAddress { get; private set; } = null!;

    public ServiceStatus Status { get; private set; }

    public DateTimeOffset OrderedAt { get; private set; }

    public DateOnly? ActivatedOn { get; private set; }

    public DateOnly? CancelledOn { get; private set; }

    public int ContractTermMonths { get; private set; }

    /// <summary>Start of the current contract term; reset by an upgrade that carries a new term.</summary>
    public DateOnly? ContractStartedOn { get; private set; }

    /// <summary>Id of the open plan change, if one is in flight. Only one may exist at a time.</summary>
    public Guid? PendingPlanChangeId { get; private set; }

    public DateOnly? ContractEndsOn => ContractStartedOn?.AddMonths(ContractTermMonths);

    public bool IsLive => Status is ServiceStatus.Active or ServiceStatus.Suspended;

    public bool IsInContract(DateOnly date) => ContractEndsOn is { } end && date < end;

    /// <summary>Whole months left on the contract on <paramref name="date"/>, rounded up.</summary>
    public int RemainingContractMonths(DateOnly date)
    {
        if (ContractEndsOn is not { } end || date >= end)
        {
            return 0;
        }

        var months = (end.Year - date.Year) * 12 + end.Month - date.Month;
        if (date.AddMonths(months) < end)
        {
            months++;
        }

        return Math.Max(months, 0);
    }

    public void Activate(DateOnly activatedOn, DateTimeOffset now)
    {
        if (Status != ServiceStatus.PendingActivation)
        {
            throw new InvalidStateTransitionException(nameof(Service), Status.ToString(), ServiceStatus.Active.ToString());
        }

        Status = ServiceStatus.Active;
        ActivatedOn = activatedOn;
        ContractStartedOn = activatedOn;
        Raise(new ServiceActivated(Id, AccountId, activatedOn, now));
    }

    public void Suspend()
    {
        if (Status != ServiceStatus.Active)
        {
            throw new InvalidStateTransitionException(nameof(Service), Status.ToString(), ServiceStatus.Suspended.ToString());
        }

        Status = ServiceStatus.Suspended;
    }

    public void Resume()
    {
        if (Status != ServiceStatus.Suspended)
        {
            throw new InvalidStateTransitionException(nameof(Service), Status.ToString(), ServiceStatus.Active.ToString());
        }

        Status = ServiceStatus.Active;
    }

    public void Cancel(DateOnly effectiveOn, DateTimeOffset now)
    {
        if (Status == ServiceStatus.Cancelled)
        {
            throw new InvalidStateTransitionException(nameof(Service), Status.ToString(), ServiceStatus.Cancelled.ToString());
        }

        if (PendingPlanChangeId is not null)
        {
            throw new DomainException("service.plan_change_pending", "Cancel the pending plan change before cancelling the service.");
        }

        Status = ServiceStatus.Cancelled;
        CancelledOn = effectiveOn;
        Raise(new ServiceCancelled(Id, AccountId, effectiveOn, now));
    }

    /// <summary>Reserves the service for a plan change so concurrent changes are rejected.</summary>
    public void AttachPendingPlanChange(Guid planChangeId)
    {
        if (Status != ServiceStatus.Active)
        {
            throw new DomainException("service.not_active", "Only active services can change plan.");
        }

        if (PendingPlanChangeId is not null && PendingPlanChangeId != planChangeId)
        {
            throw new DomainException("service.plan_change_pending", "A plan change is already in progress for this service.");
        }

        PendingPlanChangeId = planChangeId;
    }

    public void ReleasePendingPlanChange(Guid planChangeId)
    {
        if (PendingPlanChangeId == planChangeId)
        {
            PendingPlanChangeId = null;
        }
    }

    /// <summary>
    /// Moves the service onto <paramref name="plan"/>. An upgrade with a minimum term starts a new
    /// contract from <paramref name="effectiveOn"/>; downgrades and lateral moves keep the existing term.
    /// </summary>
    public void ApplyPlan(Plan plan, PlanChangeType changeType, DateOnly effectiveOn, Guid planChangeId)
    {
        if (PendingPlanChangeId != planChangeId)
        {
            throw new DomainException("service.plan_change_mismatch", "The plan change being applied is not the one pending on this service.");
        }

        if (plan.ProductType != ProductType)
        {
            throw new DomainException("plan_change.product_mismatch", "Plans must be of the same product type.");
        }

        PlanId = plan.Id;
        MonthlyPrice = plan.MonthlyPrice;
        if (changeType == PlanChangeType.Upgrade && plan.MinimumTermMonths > 0)
        {
            ContractStartedOn = effectiveOn;
            ContractTermMonths = plan.MinimumTermMonths;
        }

        PendingPlanChangeId = null;
    }
}

public sealed record ServiceActivated(Guid ServiceId, Guid AccountId, DateOnly ActivatedOn, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record ServiceCancelled(Guid ServiceId, Guid AccountId, DateOnly EffectiveOn, DateTimeOffset OccurredAt) : IDomainEvent;
```

## apps/uconnect/src/Uconnect.Domain/Tickets/Ticket.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Tickets/Ticket.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Tickets;

/// <summary>
/// A support case. Status flow: <c>OPEN → IN_PROGRESS → PENDING_CUSTOMER → RESOLVED → CLOSED</c>.
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
    /// which may put the ticket immediately into breach — that is intentional and visible to supervisors.
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
    public bool IsDueForAutoClose(DateTimeOffset now) => Status switch
    {
        TicketStatus.Resolved => ResolvedAt is { } r && (now - r).TotalDays > ReopenWindowDays,
        TicketStatus.PendingCustomer => (now - LastActivityAt).TotalDays > PendingCustomerAutoCloseDays,
        _ => false,
    };

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
```

## apps/uconnect/src/Uconnect.Domain/Tickets/TicketComment.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Tickets/TicketComment.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Tickets;

/// <summary>A message on a ticket from the customer or an agent. Internal notes are agent-only.</summary>
public sealed class TicketComment : Entity
{
    private TicketComment()
    {
    }

    internal TicketComment(
        Guid id,
        Guid ticketId,
        Guid authorUserId,
        string authorName,
        string body,
        bool isAgent,
        bool isInternal,
        DateTimeOffset createdAt)
        : base(id)
    {
        if (isInternal && !isAgent)
        {
            throw new DomainException("ticket.internal_note_customer", "Customers cannot add internal notes.");
        }

        TicketId = ticketId;
        AuthorUserId = authorUserId;
        AuthorName = Guard.NotBlank(authorName, "comment.author", 120);
        Body = Guard.NotBlank(body, "comment.body", 4000);
        IsAgent = isAgent;
        IsInternal = isInternal;
        CreatedAt = createdAt;
    }

    public Guid TicketId { get; private set; }

    public Guid AuthorUserId { get; private set; }

    public string AuthorName { get; private set; } = string.Empty;

    public string Body { get; private set; } = string.Empty;

    public bool IsAgent { get; private set; }

    public bool IsInternal { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }
}

/// <summary>SLA targets by priority.</summary>
public sealed record TicketSla(TimeSpan FirstResponse, TimeSpan Resolution);

/// <summary>
/// Service-level targets. P1 is a total loss of service for a business customer; P4 is a general
/// enquiry. Targets are in elapsed (24×7) time.
/// </summary>
public static class TicketSlaPolicy
{
    private static readonly IReadOnlyDictionary<TicketPriority, TicketSla> Targets = new Dictionary<TicketPriority, TicketSla>
    {
        [TicketPriority.P1] = new(TimeSpan.FromHours(1), TimeSpan.FromHours(4)),
        [TicketPriority.P2] = new(TimeSpan.FromHours(4), TimeSpan.FromHours(24)),
        [TicketPriority.P3] = new(TimeSpan.FromHours(8), TimeSpan.FromHours(72)),
        [TicketPriority.P4] = new(TimeSpan.FromHours(24), TimeSpan.FromHours(120)),
    };

    public static TicketSla For(TicketPriority priority) => Targets[priority];
}

/// <summary>
/// Derives a ticket's initial priority from what the customer tells us. Customers never choose a
/// priority directly; agents may escalate afterwards.
/// </summary>
public static class TicketTriage
{
    public static TicketPriority DeterminePriority(TicketCategory category, bool serviceDown, bool isBusiness, bool isInKnownOutage)
    {
        if (category == TicketCategory.Fault)
        {
            if (serviceDown && isInKnownOutage)
            {
                // Already tracked by the network operations centre; the ticket only links the customer.
                return TicketPriority.P3;
            }

            if (serviceDown)
            {
                return isBusiness ? TicketPriority.P1 : TicketPriority.P2;
            }

            return isBusiness ? TicketPriority.P2 : TicketPriority.P3;
        }

        return category switch
        {
            TicketCategory.Installation => TicketPriority.P2,
            TicketCategory.Complaint => TicketPriority.P3,
            TicketCategory.Billing or TicketCategory.PlanChange => isBusiness ? TicketPriority.P3 : TicketPriority.P4,
            _ => TicketPriority.P4,
        };
    }
}
```

## apps/uconnect/src/Uconnect.Domain/Uconnect.Domain.csproj

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: xml. Path: `apps/uconnect/src/Uconnect.Domain/Uconnect.Domain.csproj`.

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <RootNamespace>Uconnect.Domain</RootNamespace>
    <Description>Uconnect domain model: accounts, services, plans, billing, payments, tickets and appointments.</Description>
  </PropertyGroup>

  <ItemGroup>
    <InternalsVisibleTo Include="Uconnect.Tests" />
  </ItemGroup>

</Project>
```

## apps/uconnect/src/Uconnect.Domain/Usage/UsageRecord.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Usage/UsageRecord.cs`.

```csharp
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Usage;

/// <summary>Daily traffic totals for a service, as reported by the network mediation feed.</summary>
public sealed class UsageRecord : Entity
{
    public const long BytesPerGigabyte = 1_000_000_000L;

    private UsageRecord()
    {
    }

    public UsageRecord(Guid id, Guid serviceId, DateOnly usageDate, long downloadBytes, long uploadBytes, DateTimeOffset receivedAt)
        : base(id)
    {
        if (downloadBytes < 0 || uploadBytes < 0)
        {
            throw new DomainException("usage.negative", "Usage volumes must not be negative.");
        }

        ServiceId = serviceId;
        UsageDate = usageDate;
        DownloadBytes = downloadBytes;
        UploadBytes = uploadBytes;
        ReceivedAt = receivedAt;
    }

    public Guid ServiceId { get; private set; }

    public DateOnly UsageDate { get; private set; }

    public long DownloadBytes { get; private set; }

    public long UploadBytes { get; private set; }

    public DateTimeOffset ReceivedAt { get; private set; }

    public long TotalBytes => DownloadBytes + UploadBytes;

    /// <summary>
    /// Mediation may resend a day with corrected figures; the latest submission replaces the previous one.
    /// </summary>
    public void Correct(long downloadBytes, long uploadBytes, DateTimeOffset receivedAt)
    {
        if (downloadBytes < 0 || uploadBytes < 0)
        {
            throw new DomainException("usage.negative", "Usage volumes must not be negative.");
        }

        if (receivedAt <= ReceivedAt)
        {
            return;
        }

        DownloadBytes = downloadBytes;
        UploadBytes = uploadBytes;
        ReceivedAt = receivedAt;
    }
}

public enum FairUseState
{
    Unlimited = 0,
    WithinAllowance = 1,
    Approaching = 2,
    Exceeded = 3,
}

/// <summary>Billable usage above the fair-use allowance for one service and period.</summary>
public sealed record UsageCharge(Guid ServiceId, BillingPeriod Period, int AllowanceGb, int ExcessGb, Money RatePerGb)
{
    public Money Amount => RatePerGb.Multiply(ExcessGb);
}

/// <summary>Aggregated usage for a service over a billing period, evaluated against the plan's fair-use policy.</summary>
public sealed record UsageSummary(
    Guid ServiceId,
    BillingPeriod Period,
    long DownloadBytes,
    long UploadBytes,
    int? AllowanceGb,
    FairUseState State,
    int PercentOfAllowance,
    UsageCharge? Charge)
{
    public long TotalBytes => DownloadBytes + UploadBytes;
}

/// <summary>
/// Evaluates usage against a plan's fair-use allowance. Customers are warned at
/// <see cref="ApproachingThresholdPercent"/>; usage above the allowance is charged per whole GB
/// (rounded up) only where the plan defines an overage rate.
/// </summary>
public static class FairUsePolicy
{
    public const int ApproachingThresholdPercent = 80;

    public static UsageSummary Summarise(Guid serviceId, BillingPeriod period, Plan plan, IEnumerable<UsageRecord> records)
    {
        long down = 0, up = 0;
        foreach (var record in records.Where(r => r.ServiceId == serviceId && period.Contains(r.UsageDate)))
        {
            down += record.DownloadBytes;
            up += record.UploadBytes;
        }

        var total = down + up;
        if (plan.FairUseAllowanceGb is not { } allowanceGb)
        {
            return new UsageSummary(serviceId, period, down, up, null, FairUseState.Unlimited, 0, null);
        }

        var allowanceBytes = allowanceGb * UsageRecord.BytesPerGigabyte;
        var percent = (int)Math.Min(999, total * 100 / allowanceBytes);
        var state = percent >= 100 && total > allowanceBytes
            ? FairUseState.Exceeded
            : percent >= ApproachingThresholdPercent ? FairUseState.Approaching : FairUseState.WithinAllowance;

        UsageCharge? charge = null;
        if (state == FairUseState.Exceeded && plan.OveragePerGb is { } rate)
        {
            var excessBytes = total - allowanceBytes;
            var excessGb = (int)((excessBytes + UsageRecord.BytesPerGigabyte - 1) / UsageRecord.BytesPerGigabyte);
            charge = new UsageCharge(serviceId, period, allowanceGb, excessGb, rate);
        }

        return new UsageSummary(serviceId, period, down, up, allowanceGb, state, percent, charge);
    }

    /// <summary>
    /// Straight-line projection of total usage at period end, used to warn customers early.
    /// </summary>
    public static long ProjectEndOfPeriodBytes(UsageSummary summary, DateOnly today)
    {
        var elapsed = Math.Clamp(today.DayNumber - summary.Period.Start.DayNumber + 1, 1, summary.Period.TotalDays);
        return summary.TotalBytes * summary.Period.TotalDays / elapsed;
    }
}
```

## apps/uconnect/src/Uconnect.Infrastructure/Common/PlatformServices.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/Common/PlatformServices.cs`.

```csharp
using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;

namespace Uconnect.Infrastructure.Common;

/// <summary>System clock. "Today" is the UK business date, which differs from the UTC date around midnight in summer.</summary>
internal sealed class SystemClock : IClock
{
    private static readonly TimeZoneInfo UkTimeZone = ResolveUkTimeZone();

    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;

    public DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(UtcNow, UkTimeZone).DateTime);

    private static TimeZoneInfo ResolveUkTimeZone() =>
        TimeZoneInfo.TryFindSystemTimeZoneById("Europe/London", out var zone) || TimeZoneInfo.TryFindSystemTimeZoneById("GMT Standard Time", out zone)
            ? zone
            : TimeZoneInfo.Utc;
}

/// <summary>Public holidays configured per deployment (section <c>Uconnect:Holidays</c>), refreshed with the configuration.</summary>
public sealed class HolidayOptions
{
    public const string SectionName = "Uconnect:Holidays";

    public List<DateOnly> Dates { get; set; } = new();
}

internal sealed class ConfiguredHolidayCalendar : IHolidayCalendar
{
    private readonly IOptionsMonitor<HolidayOptions> _options;

    public ConfiguredHolidayCalendar(IOptionsMonitor<HolidayOptions> options) => _options = options;

    public Task<IReadOnlySet<DateOnly>> GetHolidaysAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        IReadOnlySet<DateOnly> holidays = _options.CurrentValue.Dates.Where(d => d >= from && d <= to).ToHashSet();
        return Task.FromResult(holidays);
    }
}

/// <summary>
/// Invokes every registered handler for each event. Handler failures are logged and isolated: the
/// business transaction has already committed and one failing handler must not starve the others.
/// </summary>
internal sealed class DomainEventDispatcher : IDomainEventDispatcher
{
    private static readonly ConcurrentDictionary<Type, Type> HandlerTypes = new();

    private readonly IServiceProvider _services;
    private readonly ILogger<DomainEventDispatcher> _logger;

    public DomainEventDispatcher(IServiceProvider services, ILogger<DomainEventDispatcher> logger)
    {
        _services = services;
        _logger = logger;
    }

    public async Task DispatchAsync(IEnumerable<IDomainEvent> events, CancellationToken cancellationToken)
    {
        foreach (var domainEvent in events)
        {
            var handlerType = HandlerTypes.GetOrAdd(domainEvent.GetType(), t => typeof(IDomainEventHandler<>).MakeGenericType(t));
            foreach (var handler in _services.GetServices(handlerType))
            {
                try
                {
                    var task = (Task)handlerType.GetMethod(nameof(IDomainEventHandler<IDomainEvent>.HandleAsync))!
                        .Invoke(handler, new object[] { domainEvent, cancellationToken })!;
                    await task;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogError(ex, "Handler {Handler} failed for {Event}", handler!.GetType().Name, domainEvent.GetType().Name);
                }
            }
        }
    }
}
```

## apps/uconnect/src/Uconnect.Infrastructure/DependencyInjection.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/DependencyInjection.cs`.

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Infrastructure.Common;
using Uconnect.Infrastructure.External;
using Uconnect.Infrastructure.Persistence;
using Uconnect.Infrastructure.Persistence.Repositories;

namespace Uconnect.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Registers persistence, downstream clients and validated options. The connection string and API
    /// keys are read from configuration, which in production is populated from environment variables.
    /// </summary>
    public static IServiceCollection AddUconnectInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        AddOptions<BillingOptions>(services, configuration, BillingOptions.SectionName);
        AddOptions<CompensationOptions>(services, configuration, CompensationOptions.SectionName);
        AddOptions<PortalOptions>(services, configuration, PortalOptions.SectionName);
        AddOptions<AppointmentOptions>(services, configuration, AppointmentOptions.SectionName);
        services.Configure<HolidayOptions>(configuration.GetSection(HolidayOptions.SectionName));

        var connectionString = configuration.GetConnectionString("Uconnect")
            ?? throw new InvalidOperationException("Connection string 'Uconnect' is not configured (set ConnectionStrings__Uconnect).");
        services.AddDbContext<UconnectDbContext>(options => options.UseSqlServer(connectionString, sql =>
        {
            sql.EnableRetryOnFailure(maxRetryCount: 3);
            sql.MigrationsHistoryTable("__ef_migrations", UconnectDbContext.Schema);
        }));

        services.AddSingleton<IClock, SystemClock>();
        services.AddSingleton<IHolidayCalendar, ConfiguredHolidayCalendar>();
        services.AddScoped<IDomainEventDispatcher, DomainEventDispatcher>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IReferenceGenerator, ReferenceGenerator>();

        services.AddScoped<IAccountRepository, AccountRepository>();
        services.AddScoped<IAccountUserRepository, AccountUserRepository>();
        services.AddScoped<IPlanRepository, PlanRepository>();
        services.AddScoped<IServiceRepository, ServiceRepository>();
        services.AddScoped<IPlanChangeRepository, PlanChangeRepository>();
        services.AddScoped<InvoiceRepository>();
        services.AddScoped<IInvoiceRepository>(sp => sp.GetRequiredService<InvoiceRepository>());
        services.AddScoped<IInvoiceNumberLookup>(sp => sp.GetRequiredService<InvoiceRepository>());
        services.AddScoped<IAdjustmentRepository, AdjustmentRepository>();
        services.AddScoped<IPaymentRepository, PaymentRepository>();
        services.AddScoped<IPaymentMethodRepository, PaymentMethodRepository>();
        services.AddScoped<IAutopayRepository, AutopayRepository>();
        services.AddScoped<IUsageRepository, UsageRepository>();
        services.AddScoped<IOutageRepository, OutageRepository>();
        services.AddScoped<ITicketRepository, TicketRepository>();
        services.AddScoped<IAppointmentRepository, AppointmentRepository>();

        AddDownstream<IProvisioningClient, ProvisioningClient>(services, configuration, ExternalSystems.Provisioning);
        AddDownstream<IBillingSystemClient, BillingSystemClient>(services, configuration, ExternalSystems.BillingSystem);
        AddDownstream<IFieldServiceClient, FieldServiceClient>(services, configuration, ExternalSystems.FieldService);
        AddDownstream<NotificationServiceClient, NotificationServiceClient>(services, configuration, ExternalSystems.Notifications);
        services.AddTransient<IEmailSender>(sp => sp.GetRequiredService<NotificationServiceClient>());
        services.AddTransient<ISmsSender>(sp => sp.GetRequiredService<NotificationServiceClient>());

        // Card charges are never retried by the HTTP pipeline beyond what the idempotency key makes safe.
        AddDownstream<IPaymentGateway, PaymentGatewayClient>(services, configuration, ExternalSystems.PaymentGateway);
        return services;
    }

    private static void AddOptions<TOptions>(IServiceCollection services, IConfiguration configuration, string section)
        where TOptions : class =>
        services.AddOptions<TOptions>().Bind(configuration.GetSection(section)).ValidateDataAnnotations().ValidateOnStart();

    private static void AddDownstream<TContract, TClient>(IServiceCollection services, IConfiguration configuration, string system)
        where TContract : class
        where TClient : class, TContract
    {
        services.AddOptions<ExternalEndpointOptions>(system)
            .Bind(configuration.GetSection($"{ExternalSystems.SectionPrefix}:{system}"))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddHttpClient<TContract, TClient>((sp, client) =>
            {
                var options = sp.GetRequiredService<IOptionsMonitor<ExternalEndpointOptions>>().Get(system);
                client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
                client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds * 4);
                client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
            })
            .AddHttpMessageHandler(sp => new DownstreamHeadersHandler(sp.GetRequiredService<IOptionsMonitor<ExternalEndpointOptions>>(), system))
            .AddStandardResilienceHandler(resilience =>
            {
                var timeout = TimeSpan.FromSeconds(configuration.GetValue($"{ExternalSystems.SectionPrefix}:{system}:TimeoutSeconds", 15));
                resilience.AttemptTimeout.Timeout = timeout;
                resilience.TotalRequestTimeout.Timeout = timeout * 3;
                resilience.CircuitBreaker.SamplingDuration = timeout * 2;
            });
    }
}
```

## apps/uconnect/src/Uconnect.Infrastructure/External/ExternalHttp.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/External/ExternalHttp.cs`.

```csharp
using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Uconnect.Application.Common;

namespace Uconnect.Infrastructure.External;

/// <summary>Connection settings for one downstream system. The API key comes from the environment, never from appsettings.json.</summary>
public sealed class ExternalEndpointOptions
{
    [Required]
    [Url]
    public string BaseUrl { get; set; } = string.Empty;

    [Required]
    public string ApiKey { get; set; } = string.Empty;

    [Range(1, 120)]
    public int TimeoutSeconds { get; set; } = 15;
}

/// <summary>Names of the configured downstream systems (sections under <c>Uconnect:External</c>).</summary>
public static class ExternalSystems
{
    public const string SectionPrefix = "Uconnect:External";
    public const string Provisioning = "Provisioning";
    public const string PaymentGateway = "PaymentGateway";
    public const string BillingSystem = "BillingSystem";
    public const string FieldService = "FieldService";
    public const string Notifications = "Notifications";
}

/// <summary>Correlation id of the current logical operation, set by the API middleware or a background job.</summary>
public static class CorrelationContext
{
    public const string HeaderName = "X-Correlation-Id";

    private static readonly AsyncLocal<string?> Current = new();

    public static string? CorrelationId
    {
        get => Current.Value;
        set => Current.Value = value;
    }
}

/// <summary>Adds the API key and propagates the correlation id on every outbound call to a downstream system.</summary>
internal sealed class DownstreamHeadersHandler : DelegatingHandler
{
    private readonly IOptionsMonitor<ExternalEndpointOptions> _options;
    private readonly string _system;

    public DownstreamHeadersHandler(IOptionsMonitor<ExternalEndpointOptions> options, string system)
    {
        _options = options;
        _system = system;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        request.Headers.TryAddWithoutValidation("X-Api-Key", _options.Get(_system).ApiKey);
        if (CorrelationContext.CorrelationId is { } correlationId)
        {
            request.Headers.TryAddWithoutValidation(CorrelationContext.HeaderName, correlationId);
        }

        return base.SendAsync(request, cancellationToken);
    }
}

/// <summary>
/// Shared request/response handling for downstream JSON APIs. Network errors, timeouts, 408, 429 and
/// 5xx become transient <see cref="ExternalServiceException"/>s (callers may retry later); other
/// non-success codes are permanent.
/// </summary>
internal static class ExternalHttp
{
    public static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static async Task<HttpResponseMessage> SendAsync(
        HttpClient client, string system, HttpRequestMessage request, CancellationToken ct, params HttpStatusCode[] acceptedErrors)
    {
        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, ct);
        }
        catch (HttpRequestException ex)
        {
            throw new ExternalServiceException(system, $"{system} could not be reached.", isTransient: true, ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new ExternalServiceException(system, $"{system} did not respond in time.", isTransient: true, ex);
        }

        if (response.IsSuccessStatusCode || acceptedErrors.Contains(response.StatusCode))
        {
            return response;
        }

        var status = (int)response.StatusCode;
        var transient = status >= 500 || response.StatusCode is HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests;
        response.Dispose();
        throw new ExternalServiceException(system, $"{system} returned HTTP {status} for {request.Method} {request.RequestUri?.AbsolutePath}.", transient);
    }

    public static HttpRequestMessage Json<T>(HttpMethod method, string path, T body) =>
        new(method, path) { Content = JsonContent.Create(body, options: SerializerOptions) };

    public static async Task<T> ReadAsync<T>(HttpResponseMessage response, string system, CancellationToken ct)
    {
        using (response)
        {
            try
            {
                return await response.Content.ReadFromJsonAsync<T>(SerializerOptions, ct)
                    ?? throw new ExternalServiceException(system, $"{system} returned an empty response.", isTransient: false);
            }
            catch (JsonException ex)
            {
                throw new ExternalServiceException(system, $"{system} returned an unreadable response.", isTransient: false, ex);
            }
        }
    }
}
```

## apps/uconnect/src/Uconnect.Infrastructure/External/OperationsClients.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/External/OperationsClients.cs`.

```csharp
using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Uconnect.Application.Abstractions;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;

namespace Uconnect.Infrastructure.External;

/// <summary>Network OSS: plan re-profile orders, idempotent on the plan change id.</summary>
internal sealed class ProvisioningClient : IProvisioningClient
{
    private const string System = ExternalSystems.Provisioning;

    private readonly HttpClient _http;

    public ProvisioningClient(HttpClient http) => _http = http;

    public async Task<ProvisioningOrderAccepted> SubmitPlanChangeAsync(ProvisioningOrderRequest order, CancellationToken ct)
    {
        using var request = ExternalHttp.Json(HttpMethod.Post, "orders/plan-change", order);
        request.Headers.Add("Idempotency-Key", order.PlanChangeId.ToString("N"));
        var response = await ExternalHttp.SendAsync(_http, System, request, ct);
        return await ExternalHttp.ReadAsync<ProvisioningOrderAccepted>(response, System, ct);
    }

    public async Task<ProvisioningOrderStatus> GetOrderStatusAsync(string orderRef, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"orders/{Uri.EscapeDataString(orderRef)}");
        var response = await ExternalHttp.SendAsync(_http, System, request, ct);
        return await ExternalHttp.ReadAsync<ProvisioningOrderStatus>(response, System, ct);
    }
}

/// <summary>Finance ledger: receives issued invoices and renders their PDFs.</summary>
internal sealed class BillingSystemClient : IBillingSystemClient
{
    private const string System = ExternalSystems.BillingSystem;

    private readonly HttpClient _http;

    public BillingSystemClient(HttpClient http) => _http = http;

    public async Task PostInvoiceAsync(Invoice invoice, string accountNumber, CancellationToken ct)
    {
        var body = new LedgerInvoice(
            invoice.InvoiceNumber,
            accountNumber,
            invoice.Currency,
            invoice.PeriodStart,
            invoice.PeriodEnd,
            invoice.IssuedOn,
            invoice.DueOn,
            invoice.Subtotal.AmountMinor,
            invoice.TaxTotal.AmountMinor,
            invoice.Total.AmountMinor,
            invoice.TaxRateBasisPoints,
            invoice.Lines.Select(l => new LedgerLine(l.Type.ToString(), l.Description, l.Quantity, l.UnitAmount.AmountMinor, l.Amount.AmountMinor, l.Taxable)).ToList());

        using var request = ExternalHttp.Json(HttpMethod.Put, $"invoices/{Uri.EscapeDataString(invoice.InvoiceNumber)}", body);
        (await ExternalHttp.SendAsync(_http, System, request, ct)).Dispose();
    }

    public async Task<InvoiceDocument?> GetInvoicePdfAsync(string invoiceNumber, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"invoices/{Uri.EscapeDataString(invoiceNumber)}/pdf");
        using var response = await ExternalHttp.SendAsync(_http, System, request, ct, HttpStatusCode.NotFound);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        var content = await response.Content.ReadAsByteArrayAsync(ct);
        return new InvoiceDocument($"{invoiceNumber}.pdf", "application/pdf", content);
    }

    private sealed record LedgerLine(string Type, string Description, int Quantity, long UnitAmountMinor, long AmountMinor, bool Taxable);

    private sealed record LedgerInvoice(
        string InvoiceNumber,
        string AccountNumber,
        string Currency,
        DateOnly PeriodStart,
        DateOnly PeriodEnd,
        DateOnly? IssuedOn,
        DateOnly? DueOn,
        long SubtotalMinor,
        long TaxMinor,
        long TotalMinor,
        int TaxRateBasisPoints,
        IReadOnlyList<LedgerLine> Lines);
}

/// <summary>Engineer workforce management: capacity by postcode district and work orders.</summary>
internal sealed class FieldServiceClient : IFieldServiceClient
{
    private const string System = ExternalSystems.FieldService;

    private readonly HttpClient _http;

    public FieldServiceClient(HttpClient http) => _http = http;

    public async Task<IReadOnlyDictionary<AppointmentSlot, int>> GetCapacityAsync(
        string outwardCode, IReadOnlyCollection<AppointmentSlot> slots, CancellationToken ct)
    {
        if (slots.Count == 0)
        {
            return new Dictionary<AppointmentSlot, int>();
        }

        var query = new CapacityQuery(outwardCode, slots.Min(s => s.Date), slots.Max(s => s.Date));
        using var request = ExternalHttp.Json(HttpMethod.Post, "capacity/query", query);
        var response = await ExternalHttp.SendAsync(_http, System, request, ct);
        var rows = await ExternalHttp.ReadAsync<List<CapacityRow>>(response, System, ct);

        var requested = slots.ToHashSet();
        return rows
            .Select(r => (Slot: new AppointmentSlot(r.Date, r.Window), r.Remaining))
            .Where(r => requested.Contains(r.Slot))
            .GroupBy(r => r.Slot)
            .ToDictionary(g => g.Key, g => g.Sum(r => Math.Max(0, r.Remaining)));
    }

    public async Task<WorkOrderConfirmation> CreateWorkOrderAsync(WorkOrderRequest order, CancellationToken ct)
    {
        var body = new WorkOrderBody(
            order.AppointmentReference,
            order.Type,
            order.Slot.Date,
            order.Slot.Window,
            order.Slot.StartsAtUtc,
            order.Slot.EndsAtUtc,
            new AddressBody(order.Address.Line1, order.Address.Line2, order.Address.Town, order.Address.Postcode),
            order.ContactName,
            order.ContactPhone,
            order.AccessNotes);
        using var request = ExternalHttp.Json(HttpMethod.Post, "work-orders", body);
        request.Headers.Add("Idempotency-Key", order.AppointmentId.ToString("N"));
        var response = await ExternalHttp.SendAsync(_http, System, request, ct);
        return await ExternalHttp.ReadAsync<WorkOrderConfirmation>(response, System, ct);
    }

    public async Task<WorkOrderConfirmation> RescheduleWorkOrderAsync(string workOrderRef, AppointmentSlot newSlot, CancellationToken ct)
    {
        using var request = ExternalHttp.Json(
            HttpMethod.Put, $"work-orders/{Uri.EscapeDataString(workOrderRef)}/slot", new SlotBody(newSlot.Date, newSlot.Window, newSlot.StartsAtUtc, newSlot.EndsAtUtc));
        var response = await ExternalHttp.SendAsync(_http, System, request, ct);
        return await ExternalHttp.ReadAsync<WorkOrderConfirmation>(response, System, ct);
    }

    public async Task CancelWorkOrderAsync(string workOrderRef, string reason, CancellationToken ct)
    {
        using var request = ExternalHttp.Json(HttpMethod.Post, $"work-orders/{Uri.EscapeDataString(workOrderRef)}/cancel", new { reason });

        // Already cancelled or unknown at the field system is the outcome we wanted.
        (await ExternalHttp.SendAsync(_http, System, request, ct, HttpStatusCode.NotFound, HttpStatusCode.Conflict)).Dispose();
    }

    private sealed record CapacityQuery(string OutwardCode, DateOnly From, DateOnly To);

    private sealed record CapacityRow(DateOnly Date, AppointmentWindow Window, int Remaining);

    private sealed record AddressBody(string Line1, string? Line2, string Town, string Postcode);

    private sealed record SlotBody(DateOnly Date, AppointmentWindow Window, DateTimeOffset StartsAt, DateTimeOffset EndsAt);

    private sealed record WorkOrderBody(
        string Reference,
        AppointmentType Type,
        DateOnly Date,
        AppointmentWindow Window,
        DateTimeOffset StartsAt,
        DateTimeOffset EndsAt,
        AddressBody Address,
        string ContactName,
        string ContactPhone,
        string? AccessNotes);
}

/// <summary>Group messaging service; implements both e-mail and SMS delivery.</summary>
internal sealed class NotificationServiceClient : IEmailSender, ISmsSender
{
    private const string System = ExternalSystems.Notifications;

    private readonly HttpClient _http;

    public NotificationServiceClient(HttpClient http) => _http = http;

    public async Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        using var request = ExternalHttp.Json(HttpMethod.Post, "email", new
        {
            to = message.To,
            subject = message.Subject,
            html = message.HtmlBody,
            text = message.TextBody,
            correlationId = message.CorrelationId ?? CorrelationContext.CorrelationId,
        });
        (await ExternalHttp.SendAsync(_http, System, request, ct)).Dispose();
    }

    public async Task SendAsync(PhoneNumber to, string text, CancellationToken ct)
    {
        var body = text.Length > 300 ? text[..300] : text;
        using var request = new HttpRequestMessage(HttpMethod.Post, "sms")
        {
            Content = JsonContent.Create(new { to = to.Value, text = body, sentAt = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture) }, options: ExternalHttp.SerializerOptions),
        };
        (await ExternalHttp.SendAsync(_http, System, request, ct)).Dispose();
    }
}
```

## apps/uconnect/src/Uconnect.Infrastructure/External/PaymentGatewayClient.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/External/PaymentGatewayClient.cs`.

```csharp
using System.Net;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;

namespace Uconnect.Infrastructure.External;

/// <summary>
/// Card / direct-debit gateway. A decline is a normal business outcome (HTTP 402) and is returned as
/// a result, not thrown. Every charge and refund carries an <c>Idempotency-Key</c> header so the
/// resilience pipeline's retries can never double-charge.
/// </summary>
internal sealed class PaymentGatewayClient : IPaymentGateway
{
    private const string System = ExternalSystems.PaymentGateway;

    private readonly HttpClient _http;

    public PaymentGatewayClient(HttpClient http) => _http = http;

    public async Task<GatewayInstrument> DescribeTokenAsync(string paymentToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"v1/tokens/{Uri.EscapeDataString(paymentToken)}");
        var response = await ExternalHttp.SendAsync(_http, System, request, ct, HttpStatusCode.NotFound);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            response.Dispose();
            throw new RequestValidationException("paymentToken", "The payment token is unknown or has expired.");
        }

        var token = await ExternalHttp.ReadAsync<TokenResponse>(response, System, ct);
        var type = token.Kind switch
        {
            "card" => PaymentMethodType.Card,
            "bacs_debit" => PaymentMethodType.DirectDebit,
            _ => throw new RequestValidationException("paymentToken", "This kind of payment method is not supported."),
        };
        return new GatewayInstrument(type, token.Label, token.Last4, token.ExpiryMonth, token.ExpiryYear);
    }

    public async Task<GatewayChargeResult> ChargeAsync(GatewayChargeRequest charge, CancellationToken ct)
    {
        using var request = ExternalHttp.Json(HttpMethod.Post, "v1/charges", new ChargeBody(
            charge.PaymentToken, charge.Amount.AmountMinor, charge.Amount.Currency, charge.Description, charge.AccountNumber));
        request.Headers.Add("Idempotency-Key", charge.IdempotencyKey);

        var response = await ExternalHttp.SendAsync(_http, System, request, ct, HttpStatusCode.PaymentRequired);
        var declined = response.StatusCode == HttpStatusCode.PaymentRequired;
        var body = await ExternalHttp.ReadAsync<ChargeResponse>(response, System, ct);
        return declined || body.Status != "succeeded"
            ? GatewayChargeResult.Declined(body.FailureCode ?? "declined", body.FailureMessage)
            : GatewayChargeResult.Success(body.Id);
    }

    public async Task<GatewayRefundResult> RefundAsync(string chargeReference, Money amount, string idempotencyKey, CancellationToken ct)
    {
        using var request = ExternalHttp.Json(HttpMethod.Post, "v1/refunds", new RefundBody(chargeReference, amount.AmountMinor, amount.Currency));
        request.Headers.Add("Idempotency-Key", idempotencyKey);

        var response = await ExternalHttp.SendAsync(_http, System, request, ct, HttpStatusCode.UnprocessableEntity);
        var body = await ExternalHttp.ReadAsync<RefundResponse>(response, System, ct);
        return new GatewayRefundResult(body.Status == "succeeded", body.Id, body.FailureCode);
    }

    private sealed record TokenResponse(string Kind, string Label, string Last4, int? ExpiryMonth, int? ExpiryYear);

    private sealed record ChargeBody(string Source, long AmountMinor, string Currency, string Description, string CustomerReference);

    private sealed record ChargeResponse(string Id, string Status, string? FailureCode, string? FailureMessage);

    private sealed record RefundBody(string Charge, long AmountMinor, string Currency);

    private sealed record RefundResponse(string? Id, string Status, string? FailureCode);
}
```

## apps/uconnect/src/Uconnect.Infrastructure/Persistence/Configurations/AccountConfigurations.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/Persistence/Configurations/AccountConfigurations.cs`.

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;

namespace Uconnect.Infrastructure.Persistence.Configurations;

internal sealed class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.ToTable("accounts");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Number).HasColumnName("account_number").IsRequired();
        builder.HasIndex(a => a.Number).IsUnique();
        builder.Property(a => a.Name).HasMaxLength(160).IsRequired();
        builder.Property(a => a.BillingEmail).IsRequired();
        builder.Property(a => a.Currency).HasMaxLength(3).IsFixedLength();
        builder.Property(a => a.SuspensionReason).HasMaxLength(500);
        builder.HasAddress(a => a.BillingAddress, "billing");
        builder.HasIndex(a => new { a.BillingDay, a.Status });
    }
}

internal sealed class AccountUserConfiguration : IEntityTypeConfiguration<AccountUser>
{
    public void Configure(EntityTypeBuilder<AccountUser> builder)
    {
        builder.ToTable("account_users");
        builder.HasKey(u => u.Id);
        builder.Property(u => u.SubjectId).HasMaxLength(128).IsRequired();
        builder.Property(u => u.DisplayName).HasMaxLength(120).IsRequired();
        builder.Property(u => u.Role).HasMaxLength(32).IsRequired();
        builder.HasOne<Account>().WithMany().HasForeignKey(u => u.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(u => new { u.AccountId, u.SubjectId }).IsUnique().HasFilter("[IsActive] = 1");
        builder.HasIndex(u => u.SubjectId);
    }
}

internal sealed class PlanConfiguration : IEntityTypeConfiguration<Plan>
{
    public void Configure(EntityTypeBuilder<Plan> builder)
    {
        builder.ToTable("plans");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Code).HasMaxLength(40).IsRequired();
        builder.HasIndex(p => p.Code).IsUnique();
        builder.Property(p => p.Name).HasMaxLength(120).IsRequired();
        builder.HasMoney(p => p.MonthlyPrice, "monthly_price");
        builder.HasMoney(p => p.SetupFee, "setup_fee");
        builder.Property(p => p.OveragePerGb).HasConversion<OptionalMoneyConverter>().HasMaxLength(32);
        builder.HasIndex(p => new { p.ProductType, p.IsActive });
    }
}

internal sealed class ServiceConfiguration : IEntityTypeConfiguration<Service>
{
    /// <summary>Persisted outward code of the service postcode, so outage impact is an indexed lookup.</summary>
    public const string OutwardCodeColumn = "ServiceOutwardCode";

    public void Configure(EntityTypeBuilder<Service> builder)
    {
        builder.ToTable("services");
        builder.HasKey(s => s.Id);
        builder.Property(s => s.ServiceReference).HasMaxLength(32).IsRequired();
        builder.HasIndex(s => s.ServiceReference).IsUnique();
        builder.HasOne<Account>().WithMany().HasForeignKey(s => s.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Plan>().WithMany().HasForeignKey(s => s.PlanId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMoney(s => s.MonthlyPrice, "monthly_price");
        builder.HasAddress(s => s.ServiceAddress, "service");
        builder.Property<string>(OutwardCodeColumn)
            .HasMaxLength(4)
            .HasComputedColumnSql("LEFT([service_postcode], CHARINDEX(' ', [service_postcode] + ' ') - 1)", stored: true);
        builder.HasIndex(OutwardCodeColumn, nameof(Service.Status));
        builder.HasIndex(s => s.AccountId);
    }
}

internal sealed class PlanChangeConfiguration : IEntityTypeConfiguration<PlanChange>
{
    public void Configure(EntityTypeBuilder<PlanChange> builder)
    {
        builder.ToTable("plan_changes");
        builder.HasKey(c => c.Id);
        builder.HasOne<Service>().WithMany().HasForeignKey(c => c.ServiceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMoney(c => c.PreviousMonthlyPrice, "previous_monthly_price");
        builder.HasMoney(c => c.NewMonthlyPrice, "new_monthly_price");
        builder.HasMoney(c => c.ProrationCredit, "proration_credit");
        builder.HasMoney(c => c.ProrationCharge, "proration_charge");
        builder.HasMoney(c => c.EarlyTerminationFee, "early_termination_fee");
        builder.Property(c => c.ProvisioningOrderRef).HasMaxLength(64);
        builder.Property(c => c.FailureReason).HasMaxLength(500);
        builder.HasIndex(c => c.ProvisioningOrderRef).IsUnique().HasFilter("[ProvisioningOrderRef] IS NOT NULL");
        builder.HasIndex(c => new { c.Status, c.EffectiveOn });
        builder.HasIndex(c => c.AccountId);
    }
}
```

## apps/uconnect/src/Uconnect.Infrastructure/Persistence/Configurations/BillingConfigurations.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/Persistence/Configurations/BillingConfigurations.cs`.

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Payments;

namespace Uconnect.Infrastructure.Persistence.Configurations;

internal sealed class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.ToTable("invoices");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.InvoiceNumber).HasMaxLength(32).IsRequired();
        builder.HasIndex(i => i.InvoiceNumber).IsUnique();
        builder.HasOne<Account>().WithMany().HasForeignKey(i => i.AccountId).OnDelete(DeleteBehavior.Restrict);

        // One invoice per account per cycle: a concurrent second billing run fails on this index.
        builder.HasIndex(i => new { i.AccountId, i.PeriodStart }).IsUnique();
        builder.HasIndex(i => new { i.Status, i.DueOn });

        builder.Property(i => i.Currency).HasMaxLength(3).IsFixedLength();
        builder.Property(i => i.VoidReason).HasMaxLength(500);
        builder.HasMoney(i => i.Subtotal, "subtotal");
        builder.HasMoney(i => i.TaxTotal, "tax_total");
        builder.HasMoney(i => i.Total, "total");
        builder.HasMoney(i => i.AmountPaid, "amount_paid");
        builder.HasMoney(i => i.CreditCarriedForward, "credit_carried_forward");

        builder.HasMany(i => i.Lines).WithOne().HasForeignKey(l => l.InvoiceId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(i => i.Lines).UsePropertyAccessMode(PropertyAccessMode.Field).AutoInclude();
    }
}

internal sealed class InvoiceLineConfiguration : IEntityTypeConfiguration<InvoiceLine>
{
    public void Configure(EntityTypeBuilder<InvoiceLine> builder)
    {
        builder.ToTable("invoice_lines");
        builder.HasKey(l => l.Id);
        builder.Property(l => l.Id).ValueGeneratedNever();
        builder.Property(l => l.Description).HasMaxLength(200).IsRequired();
        builder.HasMoney(l => l.UnitAmount, "unit_amount");
        builder.HasMoney(l => l.Amount, "amount");
    }
}

internal sealed class AccountAdjustmentConfiguration : IEntityTypeConfiguration<AccountAdjustment>
{
    public void Configure(EntityTypeBuilder<AccountAdjustment> builder)
    {
        builder.ToTable("account_adjustments");
        builder.HasKey(a => a.Id);
        builder.HasOne<Account>().WithMany().HasForeignKey(a => a.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(a => a.Description).HasMaxLength(200).IsRequired();
        builder.Property(a => a.ApprovalReference).HasMaxLength(40);
        builder.Property(a => a.SourceReference).HasMaxLength(64);
        builder.HasMoney(a => a.Amount, "amount");
        builder.HasIndex(a => new { a.AccountId, a.BilledOnInvoiceId });

        // Compensation is paid once per source (outage / visit / late invoice) and service.
        builder.HasIndex(a => new { a.AccountId, a.SourceReference, a.ServiceId }).IsUnique().HasFilter("[SourceReference] IS NOT NULL");
    }
}

internal sealed class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder.ToTable("payments");
        builder.HasKey(p => p.Id);
        builder.HasOne<Invoice>().WithMany().HasForeignKey(p => p.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<PaymentMethod>().WithMany().HasForeignKey(p => p.PaymentMethodId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(p => p.IdempotencyKey).HasMaxLength(80).IsRequired();
        builder.HasIndex(p => new { p.AccountId, p.IdempotencyKey }).IsUnique();
        builder.Property(p => p.GatewayReference).HasMaxLength(100);
        builder.Property(p => p.FailureCode).HasMaxLength(50);
        builder.Property(p => p.FailureMessage).HasMaxLength(300);
        builder.HasMoney(p => p.Amount, "amount");
        builder.HasMoney(p => p.RefundedAmount, "refunded_amount");
        builder.HasIndex(p => new { p.AccountId, p.CreatedAt });
    }
}

internal sealed class PaymentMethodConfiguration : IEntityTypeConfiguration<PaymentMethod>
{
    public void Configure(EntityTypeBuilder<PaymentMethod> builder)
    {
        builder.ToTable("payment_methods");
        builder.HasKey(m => m.Id);
        builder.HasOne<Account>().WithMany().HasForeignKey(m => m.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(m => m.GatewayToken).HasMaxLength(128).IsRequired();
        builder.Property(m => m.DisplayLabel).HasMaxLength(60).IsRequired();
        builder.Property(m => m.Last4).HasMaxLength(4).IsFixedLength().IsRequired();
        builder.HasIndex(m => m.AccountId);
    }
}

internal sealed class AutopaySettingsConfiguration : IEntityTypeConfiguration<AutopaySettings>
{
    public void Configure(EntityTypeBuilder<AutopaySettings> builder)
    {
        builder.ToTable("autopay_settings");
        builder.HasKey(a => a.Id);
        builder.HasOne<Account>().WithOne().HasForeignKey<AutopaySettings>(a => a.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(a => a.MaxAmount).HasConversion<OptionalMoneyConverter>().HasMaxLength(32);
        builder.HasIndex(a => a.Enabled);
    }
}
```

## apps/uconnect/src/Uconnect.Infrastructure/Persistence/Configurations/SupportConfigurations.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/Persistence/Configurations/SupportConfigurations.cs`.

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Services;
using Uconnect.Domain.Tickets;
using Uconnect.Domain.Usage;

namespace Uconnect.Infrastructure.Persistence.Configurations;

internal sealed class TicketConfiguration : IEntityTypeConfiguration<Ticket>
{
    public void Configure(EntityTypeBuilder<Ticket> builder)
    {
        builder.ToTable("tickets");
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Reference).HasMaxLength(20).IsRequired();
        builder.HasIndex(t => t.Reference).IsUnique();
        builder.HasOne<Account>().WithMany().HasForeignKey(t => t.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(t => t.Subject).HasMaxLength(150).IsRequired();
        builder.Property(t => t.Description).HasMaxLength(4000).IsRequired();
        builder.Property(t => t.ResolutionSummary).HasMaxLength(2000);
        builder.HasIndex(t => new { t.AccountId, t.Status, t.LastActivityAt });
        builder.HasIndex(t => new { t.ServiceId, t.Status });

        builder.HasMany(t => t.Comments).WithOne().HasForeignKey(c => c.TicketId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(t => t.Comments).UsePropertyAccessMode(PropertyAccessMode.Field).AutoInclude();
    }
}

internal sealed class TicketCommentConfiguration : IEntityTypeConfiguration<TicketComment>
{
    public void Configure(EntityTypeBuilder<TicketComment> builder)
    {
        builder.ToTable("ticket_comments");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).ValueGeneratedNever();
        builder.Property(c => c.AuthorName).HasMaxLength(120).IsRequired();
        builder.Property(c => c.Body).HasMaxLength(4000).IsRequired();
    }
}

internal sealed class AppointmentConfiguration : IEntityTypeConfiguration<Appointment>
{
    public void Configure(EntityTypeBuilder<Appointment> builder)
    {
        builder.ToTable("appointments");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Reference).HasMaxLength(20).IsRequired();
        builder.HasIndex(a => a.Reference).IsUnique();
        builder.HasOne<Account>().WithMany().HasForeignKey(a => a.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Service>().WithMany().HasForeignKey(a => a.ServiceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Ticket>().WithMany().HasForeignKey(a => a.TicketId).OnDelete(DeleteBehavior.Restrict);
        builder.HasAddress(a => a.VisitAddress, "visit");
        builder.Property(a => a.ContactName).HasMaxLength(120).IsRequired();
        builder.Property(a => a.ContactPhone).IsRequired();
        builder.Property(a => a.AccessNotes).HasMaxLength(500);
        builder.Property(a => a.EngineerName).HasMaxLength(120);
        builder.Property(a => a.FieldWorkOrderRef).HasMaxLength(40);
        builder.Property(a => a.CancellationReason).HasMaxLength(500);
        builder.Property(a => a.OutcomeNotes).HasMaxLength(2000);
        builder.HasIndex(a => new { a.AccountId, a.Date });
        builder.HasIndex(a => new { a.ServiceId, a.Type, a.Status });
    }
}

internal sealed class OutageConfiguration : IEntityTypeConfiguration<Outage>
{
    public void Configure(EntityTypeBuilder<Outage> builder)
    {
        builder.ToTable("outages");
        builder.HasKey(o => o.Id);
        builder.Property(o => o.Reference).HasMaxLength(20).IsRequired();
        builder.HasIndex(o => o.Reference).IsUnique();
        builder.Property(o => o.Title).HasMaxLength(150).IsRequired();
        builder.Property(o => o.Description).HasMaxLength(2000).IsRequired();
        builder.Property(o => o.AffectedOutwardCodes).HasMaxLength(4000);
        builder.HasIndex(o => new { o.Status, o.ResolvedAt });

        builder.HasMany(o => o.Updates).WithOne().HasForeignKey(u => u.OutageId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(o => o.Updates).HasField("_updates").UsePropertyAccessMode(PropertyAccessMode.Field).AutoInclude();
    }
}

internal sealed class OutageUpdateConfiguration : IEntityTypeConfiguration<OutageUpdate>
{
    public void Configure(EntityTypeBuilder<OutageUpdate> builder)
    {
        builder.ToTable("outage_updates");
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Id).ValueGeneratedNever();
        builder.Property(u => u.Message).HasMaxLength(2000).IsRequired();
    }
}

internal sealed class OutageNotificationConfiguration : IEntityTypeConfiguration<OutageNotification>
{
    public void Configure(EntityTypeBuilder<OutageNotification> builder)
    {
        builder.ToTable("outage_notifications");
        builder.HasKey(n => n.Id);
        builder.HasOne<Outage>().WithMany().HasForeignKey(n => n.OutageId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(n => new { n.OutageId, n.AccountId, n.Kind, n.Channel }).IsUnique();
    }
}

internal sealed class UsageRecordConfiguration : IEntityTypeConfiguration<UsageRecord>
{
    public void Configure(EntityTypeBuilder<UsageRecord> builder)
    {
        builder.ToTable("usage_records");
        builder.HasKey(u => u.Id);
        builder.HasOne<Service>().WithMany().HasForeignKey(u => u.ServiceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(u => new { u.ServiceId, u.UsageDate }).IsUnique();
    }
}
```

## apps/uconnect/src/Uconnect.Infrastructure/Persistence/ReferenceGenerator.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/Persistence/ReferenceGenerator.cs`.

```csharp
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Uconnect.Application.Common;

namespace Uconnect.Infrastructure.Persistence;

/// <summary>SQL Server sequences backing customer-visible references.</summary>
internal static class ReferenceSequences
{
    public const string Ticket = "ticket_reference_seq";
    public const string Appointment = "appointment_reference_seq";
    public const string Outage = "outage_reference_seq";
    public const string Service = "service_reference_seq";
    public const string Invoice = "invoice_number_seq";

    public static readonly IReadOnlyList<string> All = new[] { Ticket, Appointment, Outage, Service, Invoice };
}

/// <summary>
/// Allocates references from database sequences, so they are unique across all API instances without
/// locking. Gaps (from rolled-back transactions) are acceptable; duplicates are not.
/// </summary>
internal sealed class ReferenceGenerator : IReferenceGenerator
{
    private readonly UconnectDbContext _db;

    public ReferenceGenerator(UconnectDbContext db) => _db = db;

    public async Task<string> NextAsync(ReferenceKind kind, CancellationToken cancellationToken = default)
    {
        var (sequence, prefix, digits) = kind switch
        {
            ReferenceKind.Ticket => (ReferenceSequences.Ticket, "TKT", 6),
            ReferenceKind.Appointment => (ReferenceSequences.Appointment, "APT", 6),
            ReferenceKind.Outage => (ReferenceSequences.Outage, "OUT", 6),
            ReferenceKind.Service => (ReferenceSequences.Service, "SVC", 8),
            _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Unknown reference kind."),
        };

        var value = await NextValueAsync(sequence, cancellationToken);
        return string.Create(CultureInfo.InvariantCulture, $"{prefix}-{value.ToString(new string('0', digits), CultureInfo.InvariantCulture)}");
    }

    public async Task<string> NextInvoiceNumberAsync(DateOnly periodStart, CancellationToken cancellationToken = default)
    {
        var value = await NextValueAsync(ReferenceSequences.Invoice, cancellationToken);
        return string.Create(CultureInfo.InvariantCulture, $"INV-{periodStart:yyyyMM}-{value:000000}");
    }

    private async Task<long> NextValueAsync(string sequence, CancellationToken ct)
    {
        // NEXT VALUE FOR cannot appear in a derived table, so the query is materialised without composition.
#pragma warning disable EF1002 // Sequence names are compile-time constants, not user input.
        var values = await _db.Database
            .SqlQueryRaw<long>($"SELECT NEXT VALUE FOR [{UconnectDbContext.Schema}].[{sequence}] AS [Value]")
            .ToListAsync(ct);
#pragma warning restore EF1002
        return values.Single();
    }
}
```

## apps/uconnect/src/Uconnect.Infrastructure/Persistence/Repositories/AccountRepositories.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/Persistence/Repositories/AccountRepositories.cs`.

```csharp
using Microsoft.EntityFrameworkCore;
using Uconnect.Application.Abstractions;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;
using Uconnect.Infrastructure.Persistence.Configurations;

namespace Uconnect.Infrastructure.Persistence.Repositories;

internal sealed class AccountRepository : IAccountRepository
{
    private readonly UconnectDbContext _db;

    public AccountRepository(UconnectDbContext db) => _db = db;

    public Task<Account?> GetByIdAsync(Guid id, CancellationToken ct) =>
        _db.Accounts.FirstOrDefaultAsync(a => a.Id == id, ct);

    public Task<Account?> GetByNumberAsync(AccountNumber number, CancellationToken ct) =>
        _db.Accounts.FirstOrDefaultAsync(a => a.Number == number, ct);

    public async Task<IReadOnlyList<Account>> ListByBillingDayAsync(int billingDay, CancellationToken ct) =>
        await _db.Accounts.Where(a => a.BillingDay == billingDay && a.Status == AccountStatus.Active).ToListAsync(ct);

    public void Add(Account account) => _db.Accounts.Add(account);
}

internal sealed class AccountUserRepository : IAccountUserRepository
{
    private readonly UconnectDbContext _db;

    public AccountUserRepository(UconnectDbContext db) => _db = db;

    public Task<AccountUser?> FindActiveAsync(Guid accountId, string subjectId, CancellationToken ct) =>
        _db.AccountUsers.FirstOrDefaultAsync(u => u.AccountId == accountId && u.SubjectId == subjectId && u.IsActive, ct);

    public async Task<IReadOnlyList<AccountUser>> ListByAccountAsync(Guid accountId, CancellationToken ct) =>
        await _db.AccountUsers.Where(u => u.AccountId == accountId).ToListAsync(ct);

    public async Task<IReadOnlyList<(Account Account, string Role)>> ListAccountsForSubjectAsync(string subjectId, CancellationToken ct)
    {
        var rows = await (
                from user in _db.AccountUsers
                join account in _db.Accounts on user.AccountId equals account.Id
                where user.SubjectId == subjectId && user.IsActive
                select new { account, user.Role })
            .ToListAsync(ct);
        return rows.Select(r => (r.account, r.Role)).ToList();
    }

    public void Add(AccountUser user) => _db.AccountUsers.Add(user);
}

internal sealed class PlanRepository : IPlanRepository
{
    private readonly UconnectDbContext _db;

    public PlanRepository(UconnectDbContext db) => _db = db;

    public Task<Plan?> GetByIdAsync(Guid id, CancellationToken ct) => _db.Plans.FirstOrDefaultAsync(p => p.Id == id, ct);

    public Task<Plan?> GetByCodeAsync(string code, CancellationToken ct) => _db.Plans.FirstOrDefaultAsync(p => p.Code == code, ct);

    public async Task<IReadOnlyList<Plan>> GetManyAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var idList = ids.Distinct().ToList();
        return await _db.Plans.Where(p => idList.Contains(p.Id)).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<Plan>> ListActiveAsync(ProductType productType, CancellationToken ct) =>
        await _db.Plans.Where(p => p.ProductType == productType && p.IsActive).ToListAsync(ct);
}

internal sealed class ServiceRepository : IServiceRepository
{
    private readonly UconnectDbContext _db;

    public ServiceRepository(UconnectDbContext db) => _db = db;

    public Task<Service?> GetByIdAsync(Guid id, CancellationToken ct) => _db.Services.FirstOrDefaultAsync(s => s.Id == id, ct);

    public async Task<IReadOnlyList<Service>> ListByAccountAsync(Guid accountId, CancellationToken ct) =>
        await _db.Services.Where(s => s.AccountId == accountId).ToListAsync(ct);

    public async Task<IReadOnlyList<Service>> ListLiveInOutwardCodesAsync(IReadOnlyCollection<string> outwardCodes, CancellationToken ct)
    {
        var codes = outwardCodes.Select(c => c.Trim().ToUpperInvariant()).Distinct().ToList();
        return await _db.Services
            .Where(s => codes.Contains(EF.Property<string>(s, ServiceConfiguration.OutwardCodeColumn)))
            .Where(s => s.Status == ServiceStatus.Active || s.Status == ServiceStatus.Suspended)
            .ToListAsync(ct);
    }

    public Task<int> CountLiveAsync(Guid accountId, CancellationToken ct) =>
        _db.Services.CountAsync(s => s.AccountId == accountId && (s.Status == ServiceStatus.Active || s.Status == ServiceStatus.Suspended), ct);
}

internal sealed class PlanChangeRepository : IPlanChangeRepository
{
    private readonly UconnectDbContext _db;

    public PlanChangeRepository(UconnectDbContext db) => _db = db;

    public Task<PlanChange?> GetByIdAsync(Guid id, CancellationToken ct) => _db.PlanChanges.FirstOrDefaultAsync(c => c.Id == id, ct);

    public Task<PlanChange?> GetByProvisioningRefAsync(string orderRef, CancellationToken ct) =>
        _db.PlanChanges.FirstOrDefaultAsync(c => c.ProvisioningOrderRef == orderRef, ct);

    public async Task<IReadOnlyList<PlanChange>> ListByAccountAsync(Guid accountId, CancellationToken ct) =>
        await _db.PlanChanges.Where(c => c.AccountId == accountId).ToListAsync(ct);

    public async Task<IReadOnlyList<PlanChange>> ListDueAsync(DateOnly today, CancellationToken ct) =>
        await _db.PlanChanges
            .Where(c => (c.Status == PlanChangeStatus.Requested || c.Status == PlanChangeStatus.Scheduled) && c.EffectiveOn <= today)
            .OrderBy(c => c.EffectiveOn)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<PlanChange>> ListProvisioningAsync(CancellationToken ct) =>
        await _db.PlanChanges.Where(c => c.Status == PlanChangeStatus.Provisioning).ToListAsync(ct);

    public async Task<IReadOnlyList<PlanChange>> ListUnbilledCompletedAsync(Guid accountId, CancellationToken ct) =>
        await _db.PlanChanges
            .Where(c => c.AccountId == accountId && c.Status == PlanChangeStatus.Completed && c.BilledOnInvoiceId == null)
            .ToListAsync(ct);

    public void Add(PlanChange planChange) => _db.PlanChanges.Add(planChange);
}
```
