using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Domain.Sla;
using Microsoft.Extensions.Options;

namespace IConnect.Wholesale.Infrastructure.Time;

public sealed class CalendarOptions
{
    public const string Section = "Calendars";

    /// <summary>IANA time zone in which working windows are defined.</summary>
    public string TimeZoneId { get; set; } = "Europe/London";

    /// <summary>Public holidays excluded from business and extended-hours calendars.</summary>
    public List<DateOnly> BankHolidays { get; set; } = new();
}

/// <summary>
/// Builds the three contractual calendars once from configuration. Clocks persist the calendar
/// name, so <see cref="GetByName"/> must keep resolving every name that has ever been issued.
/// </summary>
internal sealed class CalendarProvider : ICalendarProvider
{
    private readonly IReadOnlyDictionary<CalendarKind, WorkingCalendar> _byKind;
    private readonly IReadOnlyDictionary<string, WorkingCalendar> _byName;

    public CalendarProvider(IOptions<CalendarOptions> options)
    {
        var settings = options.Value;
        var zone = ResolveTimeZone(settings.TimeZoneId);
        var holidays = settings.BankHolidays.Distinct().ToList();

        _byKind = new Dictionary<CalendarKind, WorkingCalendar>
        {
            [CalendarKind.BusinessHours] = WorkingCalendar.StandardBusinessHours(zone, holidays),
            [CalendarKind.ExtendedHours] = WorkingCalendar.ExtendedHours(zone, holidays),
            [CalendarKind.AlwaysOn] = WorkingCalendar.AlwaysOn(zone),
        };
        _byName = _byKind.Values.ToDictionary(c => c.Name, StringComparer.OrdinalIgnoreCase);
    }

    public WorkingCalendar Get(CalendarKind kind) => _byKind[kind];

    public WorkingCalendar GetByName(string name) =>
        _byName.TryGetValue(name, out var calendar)
            ? calendar
            : throw new InvalidOperationException($"No working calendar is registered under the name '{name}'.");

    internal static TimeZoneInfo ResolveTimeZone(string id)
    {
        if (TimeZoneInfo.TryFindSystemTimeZoneById(id, out var zone))
        {
            return zone;
        }

        if (TimeZoneInfo.TryConvertIanaIdToWindowsId(id, out var windowsId) && TimeZoneInfo.TryFindSystemTimeZoneById(windowsId, out zone))
        {
            return zone;
        }

        throw new InvalidOperationException($"Time zone '{id}' is not available on this host.");
    }
}
