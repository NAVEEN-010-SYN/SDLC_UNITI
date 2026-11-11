using Uconnect.Domain.Common;

namespace Uconnect.Domain.Appointments;

/// <summary>
/// A bookable visit window on a date. Windows are defined in UK local time
/// (morning 08:00-13:00, afternoon 12:00-18:00, all day 08:00-18:00) and exposed as UTC instants.
/// </summary>
public sealed record AppointmentSlot(DateOnly Date, AppointmentWindow Window)
{
    private static readonly TimeZoneInfo UkTimeZone = ResolveUkTimeZone();

    public TimeOnly LocalStart => Window switch
    {
        AppointmentWindow.Afternoon => new TimeOnly(12, 0),
        _ => new TimeOnly(8, 0),
    };

    public TimeOnly LocalEnd => Window switch
    {
        AppointmentWindow.Morning => new TimeOnly(13, 0),
        _ => new TimeOnly(18, 0),
    };

    public DateTimeOffset StartsAtUtc => ToUtc(LocalStart);

    public DateTimeOffset EndsAtUtc => ToUtc(LocalEnd);

    public override string ToString() => $"{Date:yyyy-MM-dd} {Window}";

    private DateTimeOffset ToUtc(TimeOnly localTime)
    {
        var local = DateTime.SpecifyKind(Date.ToDateTime(localTime), DateTimeKind.Unspecified);
        var utc = TimeZoneInfo.ConvertTimeToUtc(local, UkTimeZone);
        return new DateTimeOffset(utc, TimeSpan.Zero);
    }

    private static TimeZoneInfo ResolveUkTimeZone()
    {
        foreach (var id in new[] { "Europe/London", "GMT Standard Time" })
        {
            if (TimeZoneInfo.TryFindSystemTimeZoneById(id, out var zone))
            {
                return zone;
            }
        }

        return TimeZoneInfo.Utc;
    }
}

/// <summary>A slot with the remaining field-engineer capacity for the visit's area.</summary>
public sealed record AvailableSlot(AppointmentSlot Slot, int RemainingCapacity);

/// <summary>
/// Booking rules for engineer visits:
/// <list type="bullet">
/// <item>Lead time depends on visit type: repairs from the next working day, upgrades and surveys
/// after two working days, installations after five.</item>
/// <item>Visits are offered up to <see cref="BookingHorizonDays"/> days ahead, never on Sundays or
/// public holidays; Saturdays offer the morning window only.</item>
/// <item>All-day windows are offered only for installations, which may need civil works.</item>
/// </list>
/// </summary>
public static class AppointmentSchedulingPolicy
{
    public const int BookingHorizonDays = 30;

    public static int LeadTimeWorkingDays(AppointmentType type) => type switch
    {
        AppointmentType.Repair => 1,
        AppointmentType.Upgrade => 2,
        AppointmentType.Survey => 2,
        AppointmentType.Installation => 5,
        _ => 2,
    };

    public static bool IsWorkingDay(DateOnly date, IReadOnlySet<DateOnly> holidays) =>
        date.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday) && !holidays.Contains(date);

    public static DateOnly EarliestBookableDate(AppointmentType type, DateOnly today, IReadOnlySet<DateOnly> holidays)
    {
        var date = today;
        var remaining = LeadTimeWorkingDays(type);
        while (remaining > 0)
        {
            date = date.AddDays(1);
            if (IsWorkingDay(date, holidays))
            {
                remaining--;
            }
        }

        return date;
    }

    public static IEnumerable<AppointmentWindow> WindowsOffered(AppointmentType type, DateOnly date, IReadOnlySet<DateOnly> holidays)
    {
        if (date.DayOfWeek == DayOfWeek.Sunday || holidays.Contains(date))
        {
            yield break;
        }

        yield return AppointmentWindow.Morning;
        if (date.DayOfWeek == DayOfWeek.Saturday)
        {
            yield break;
        }

        yield return AppointmentWindow.Afternoon;
        if (type == AppointmentType.Installation)
        {
            yield return AppointmentWindow.AllDay;
        }
    }

    /// <summary>All candidate slots for <paramref name="type"/> from the earliest date to the booking horizon.</summary>
    public static IReadOnlyList<AppointmentSlot> CandidateSlots(AppointmentType type, DateOnly today, IReadOnlySet<DateOnly> holidays)
    {
        var slots = new List<AppointmentSlot>();
        var earliest = EarliestBookableDate(type, today, holidays);
        var horizon = today.AddDays(BookingHorizonDays);
        for (var date = earliest; date <= horizon; date = date.AddDays(1))
        {
            slots.AddRange(WindowsOffered(type, date, holidays).Select(w => new AppointmentSlot(date, w)));
        }

        return slots;
    }

    /// <summary>Validates that a requested slot obeys the booking rules (capacity is checked separately).</summary>
    public static void EnsureBookable(AppointmentType type, AppointmentSlot slot, DateOnly today, IReadOnlySet<DateOnly> holidays)
    {
        if (slot.Date < EarliestBookableDate(type, today, holidays))
        {
            throw new DomainException("appointment.too_soon", $"The earliest date for a {type.ToString().ToLowerInvariant()} visit is {EarliestBookableDate(type, today, holidays):yyyy-MM-dd}.");
        }

        if (slot.Date > today.AddDays(BookingHorizonDays))
        {
            throw new DomainException("appointment.too_far", $"Visits can be booked at most {BookingHorizonDays} days ahead.");
        }

        if (!WindowsOffered(type, slot.Date, holidays).Contains(slot.Window))
        {
            throw new DomainException("appointment.window_unavailable", $"The {slot.Window} window is not offered on {slot.Date:dddd d MMMM}.");
        }
    }
}
