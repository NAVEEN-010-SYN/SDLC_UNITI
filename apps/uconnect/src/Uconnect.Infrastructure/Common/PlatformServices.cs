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
