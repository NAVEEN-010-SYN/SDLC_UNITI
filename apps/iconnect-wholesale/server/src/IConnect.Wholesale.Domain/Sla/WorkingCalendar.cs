using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Sla;

/// <summary>
/// A working-time calendar in a specific time zone. Each day of the week has an optional
/// working window (start/end offsets from local midnight); bank holidays have no window.
/// All arithmetic is done on UTC instants, with day windows resolved in local time so that
/// daylight-saving transitions shorten or lengthen the window exactly as the clock on the wall does.
/// </summary>
public sealed class WorkingCalendar
{
    private const int MaxDaysToScan = 3_660;

    private readonly IReadOnlyDictionary<DayOfWeek, WorkingWindow> _windows;
    private readonly HashSet<DateOnly> _holidays;

    public WorkingCalendar(
        string name,
        TimeZoneInfo timeZone,
        IReadOnlyDictionary<DayOfWeek, WorkingWindow> windows,
        IEnumerable<DateOnly>? holidays = null)
    {
        ArgumentNullException.ThrowIfNull(timeZone);
        ArgumentNullException.ThrowIfNull(windows);

        if (windows.Count == 0)
        {
            throw new DomainException("calendar.no_working_days", "A calendar needs at least one working day.");
        }

        Name = name;
        TimeZone = timeZone;
        _windows = windows;
        _holidays = holidays is null ? new HashSet<DateOnly>() : new HashSet<DateOnly>(holidays);
    }

    public string Name { get; }

    public TimeZoneInfo TimeZone { get; }

    public IReadOnlyCollection<DateOnly> Holidays => _holidays;

    /// <summary>Monday-Friday 08:00-18:00 excluding the supplied holidays.</summary>
    public static WorkingCalendar StandardBusinessHours(TimeZoneInfo timeZone, IEnumerable<DateOnly> holidays)
    {
        var window = new WorkingWindow(TimeSpan.FromHours(8), TimeSpan.FromHours(18));
        var windows = new Dictionary<DayOfWeek, WorkingWindow>
        {
            [DayOfWeek.Monday] = window,
            [DayOfWeek.Tuesday] = window,
            [DayOfWeek.Wednesday] = window,
            [DayOfWeek.Thursday] = window,
            [DayOfWeek.Friday] = window,
        };
        return new WorkingCalendar("standard", timeZone, windows, holidays);
    }

    /// <summary>Monday-Saturday 07:00-21:00 excluding the supplied holidays.</summary>
    public static WorkingCalendar ExtendedHours(TimeZoneInfo timeZone, IEnumerable<DateOnly> holidays)
    {
        var window = new WorkingWindow(TimeSpan.FromHours(7), TimeSpan.FromHours(21));
        var windows = Enum.GetValues<DayOfWeek>()
            .Where(d => d != DayOfWeek.Sunday)
            .ToDictionary(d => d, _ => window);
        return new WorkingCalendar("extended", timeZone, windows, holidays);
    }

    /// <summary>Every hour of every day, including holidays.</summary>
    public static WorkingCalendar AlwaysOn(TimeZoneInfo timeZone)
    {
        var window = new WorkingWindow(TimeSpan.Zero, TimeSpan.FromHours(24));
        var windows = Enum.GetValues<DayOfWeek>().ToDictionary(d => d, _ => window);
        return new WorkingCalendar("24x7", timeZone, windows);
    }

    public bool IsWorkingDay(DateOnly day) => HasWindow(day);

    public bool IsWorkingTime(DateTimeOffset instant)
    {
        var window = GetWindowUtc(LocalDate(instant));
        return window is { } w && instant >= w.Start && instant < w.End;
    }

    /// <summary>Returns the UTC instant reached after consuming <paramref name="duration"/> of working time.</summary>
    public DateTimeOffset AddWorkingTime(DateTimeOffset start, TimeSpan duration)
    {
        if (duration < TimeSpan.Zero)
        {
            throw new DomainException("calendar.negative_duration", "Working time to add must not be negative.");
        }

        var remaining = duration;
        var day = LocalDate(start);

        for (var i = 0; i < MaxDaysToScan; i++, day = day.AddDays(1))
        {
            if (GetWindowUtc(day) is not { } window)
            {
                continue;
            }

            var effectiveStart = start > window.Start ? start : window.Start;
            if (effectiveStart >= window.End)
            {
                continue;
            }

            var available = window.End - effectiveStart;
            if (remaining <= available)
            {
                return effectiveStart + remaining;
            }

            remaining -= available;
        }

        throw new DomainException("calendar.horizon_exceeded", "Working time could not be scheduled within ten years.");
    }

    /// <summary>Working time elapsed between two instants. Returns zero when <paramref name="to"/> precedes <paramref name="from"/>.</summary>
    public TimeSpan WorkingTimeBetween(DateTimeOffset from, DateTimeOffset to)
    {
        if (to <= from)
        {
            return TimeSpan.Zero;
        }

        var total = TimeSpan.Zero;
        var lastDay = LocalDate(to);
        var day = LocalDate(from);

        for (var i = 0; i < MaxDaysToScan && day <= lastDay; i++, day = day.AddDays(1))
        {
            if (GetWindowUtc(day) is not { } window)
            {
                continue;
            }

            var overlapStart = from > window.Start ? from : window.Start;
            var overlapEnd = to < window.End ? to : window.End;
            if (overlapEnd > overlapStart)
            {
                total += overlapEnd - overlapStart;
            }
        }

        return total;
    }

    /// <summary>Adds whole working days to a calendar date (lead-time arithmetic for order commitments).</summary>
    public DateOnly AddWorkingDays(DateOnly from, int workingDays)
    {
        if (workingDays < 0)
        {
            throw new DomainException("calendar.negative_duration", "Working days to add must not be negative.");
        }

        var day = from;
        var added = 0;
        var guard = 0;
        while (added < workingDays)
        {
            day = day.AddDays(1);
            if (HasWindow(day))
            {
                added++;
            }

            if (++guard > MaxDaysToScan)
            {
                throw new DomainException("calendar.horizon_exceeded", "Working days could not be scheduled within ten years.");
            }
        }

        return day;
    }

    /// <summary>Counts working days strictly after <paramref name="from"/> up to and including <paramref name="to"/>.</summary>
    public int WorkingDaysBetween(DateOnly from, DateOnly to)
    {
        if (to <= from)
        {
            return 0;
        }

        var count = 0;
        for (var day = from.AddDays(1); day <= to; day = day.AddDays(1))
        {
            if (HasWindow(day))
            {
                count++;
            }
        }

        return count;
    }

    /// <summary>Length of the nominal working day, used to convert working hours into working days.</summary>
    public TimeSpan NominalDayLength => _windows.Values.Max(w => w.Length);

    public DateOnly LocalDate(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, TimeZone).DateTime);

    private bool HasWindow(DateOnly day) => GetWindowUtc(day) is not null;

    private (DateTimeOffset Start, DateTimeOffset End)? GetWindowUtc(DateOnly day)
    {
        if (!_windows.TryGetValue(day.DayOfWeek, out var window))
        {
            return null;
        }

        if (_holidays.Contains(day))
        {
            return null;
        }

        var midnight = day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        var start = ToUtc(midnight + window.Start);
        var end = ToUtc(midnight + window.End);
        return end > start ? (start, end) : null;
    }

    private DateTimeOffset ToUtc(DateTime local)
    {
        // Wall-clock times that do not exist (spring-forward gap) are moved past the gap.
        while (TimeZone.IsInvalidTime(local))
        {
            local = local.AddMinutes(30);
        }

        var utc = TimeZoneInfo.ConvertTimeToUtc(local, TimeZone);
        return new DateTimeOffset(utc, TimeSpan.Zero);
    }
}

/// <summary>A working window expressed as offsets from local midnight; End may be 24:00.</summary>
public readonly record struct WorkingWindow
{
    public WorkingWindow(TimeSpan start, TimeSpan end)
    {
        if (start < TimeSpan.Zero || end > TimeSpan.FromHours(24) || end <= start)
        {
            throw new DomainException("calendar.invalid_window", $"Working window {start}-{end} is not valid.");
        }

        Start = start;
        End = end;
    }

    public TimeSpan Start { get; }

    public TimeSpan End { get; }

    public TimeSpan Length => End - Start;

    public bool IsFullDay => Start == TimeSpan.Zero && End == TimeSpan.FromHours(24);
}
