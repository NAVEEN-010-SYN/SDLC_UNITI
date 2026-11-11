using Uconnect.Domain.Common;

namespace Uconnect.Application.Common;

/// <summary>Source of the current time; injected so business rules are testable.</summary>
public interface IClock
{
    DateTimeOffset UtcNow { get; }

    /// <summary>Today's date in the business time zone (UK).</summary>
    DateOnly Today { get; }
}

/// <summary>The authenticated caller, resolved from the bearer token.</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }

    /// <summary>Stable internal id derived from the identity provider subject.</summary>
    Guid UserId { get; }

    /// <summary>OIDC <c>sub</c> claim.</summary>
    string SubjectId { get; }

    string DisplayName { get; }

    string? Email { get; }

    IReadOnlyCollection<string> Roles { get; }

    bool IsInRole(string role);

    bool IsSupportAgent => IsInRole(UserRoles.SupportAgent);
}

/// <summary>Commits a business transaction and dispatches the domain events it raised.</summary>
public interface IUnitOfWork
{
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}

public enum ReferenceKind
{
    Ticket,
    Appointment,
    Outage,
    Service,
}

/// <summary>Generates human-friendly, unique references (TKT-000123, APT-000045, INV-202611-000001...).</summary>
public interface IReferenceGenerator
{
    Task<string> NextAsync(ReferenceKind kind, CancellationToken cancellationToken = default);

    Task<string> NextInvoiceNumberAsync(DateOnly periodStart, CancellationToken cancellationToken = default);
}

/// <summary>Public holidays used for engineer scheduling and working-day calculations.</summary>
public interface IHolidayCalendar
{
    Task<IReadOnlySet<DateOnly>> GetHolidaysAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
}

/// <summary>Handles a domain event after the transaction that raised it has committed.</summary>
public interface IDomainEventHandler<in TEvent>
    where TEvent : IDomainEvent
{
    Task HandleAsync(TEvent domainEvent, CancellationToken cancellationToken);
}

/// <summary>Routes domain events to their registered handlers.</summary>
public interface IDomainEventDispatcher
{
    Task DispatchAsync(IEnumerable<IDomainEvent> events, CancellationToken cancellationToken);
}
