using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Abstractions;

public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

/// <summary>The authenticated caller: a portal user (JWT) or a partner integration (API key).</summary>
public interface ICurrentCaller
{
    Guid PartnerId { get; }

    string ActorId { get; }

    bool IsSupportAgent { get; }

    bool IsApiKey { get; }
}

public interface ICalendarProvider
{
    WorkingCalendar Get(CalendarKind kind);

    WorkingCalendar GetByName(string name);
}

/// <summary>Generates human-friendly sequential references such as ORD-00001234.</summary>
public interface IReferenceGenerator
{
    Task<string> NextAsync(string prefix, CancellationToken ct);
}

/// <summary>Outbound notification to the partner (webhook/email); implemented in infrastructure.</summary>
public interface IPartnerNotifier
{
    Task NotifyAsync(Guid partnerId, string eventType, object payload, CancellationToken ct);
}
