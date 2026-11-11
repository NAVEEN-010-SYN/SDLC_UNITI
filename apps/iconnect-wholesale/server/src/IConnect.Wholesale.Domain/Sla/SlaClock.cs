using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Sla;

/// <summary>
/// A stop-start SLA clock. Working time only accrues while the clock is running; intervals where
/// the clock is paused (e.g. a fault waiting on the partner, or an order on customer-caused hold)
/// are excluded. The clock is persisted as plain values so it can be owned by any aggregate.
/// </summary>
public sealed class SlaClock
{
    private readonly List<SlaPause> _pauses = new();

    private SlaClock()
    {
    }

    public SlaClock(DateTimeOffset startedAt, TimeSpan target, string calendarName)
    {
        if (target <= TimeSpan.Zero)
        {
            throw new DomainException("sla.invalid_target", "SLA target must be positive.");
        }

        StartedAt = startedAt;
        Target = target;
        CalendarName = calendarName;
    }

    public DateTimeOffset StartedAt { get; private set; }

    public TimeSpan Target { get; private set; }

    public string CalendarName { get; private set; } = string.Empty;

    public DateTimeOffset? StoppedAt { get; private set; }

    /// <summary>Set once by the breach monitor so breach notifications are raised exactly once.</summary>
    public DateTimeOffset? BreachRecordedAt { get; private set; }

    public IReadOnlyList<SlaPause> Pauses => _pauses;

    public bool IsPaused => _pauses.Count > 0 && _pauses[^1].ResumedAt is null;

    public bool IsStopped => StoppedAt.HasValue;

    public void Pause(DateTimeOffset at, string reason)
    {
        EnsureNotStopped();
        if (IsPaused)
        {
            return;
        }

        if (at < StartedAt)
        {
            throw new DomainException("sla.pause_before_start", "Cannot pause an SLA clock before it started.");
        }

        _pauses.Add(new SlaPause(at, null, reason));
    }

    public void Resume(DateTimeOffset at)
    {
        EnsureNotStopped();
        if (!IsPaused)
        {
            return;
        }

        var open = _pauses[^1];
        if (at < open.PausedAt)
        {
            throw new DomainException("sla.resume_before_pause", "Cannot resume an SLA clock before it was paused.");
        }

        _pauses[^1] = open with { ResumedAt = at };
    }

    public void Stop(DateTimeOffset at)
    {
        if (IsStopped)
        {
            return;
        }

        if (IsPaused)
        {
            Resume(at);
        }

        StoppedAt = at;
    }

    /// <summary>Restarts a stopped clock (e.g. a fault re-opened) without losing elapsed time.</summary>
    public void Reopen(DateTimeOffset at)
    {
        if (!IsStopped)
        {
            return;
        }

        _pauses.Add(new SlaPause(StoppedAt!.Value, at, "reopened"));
        StoppedAt = null;
    }

    public TimeSpan Elapsed(WorkingCalendar calendar, DateTimeOffset now)
    {
        var end = StoppedAt ?? now;
        var gross = calendar.WorkingTimeBetween(StartedAt, end);
        var paused = TimeSpan.Zero;
        foreach (var pause in _pauses)
        {
            var pauseEnd = pause.ResumedAt ?? end;
            if (pauseEnd > end)
            {
                pauseEnd = end;
            }

            paused += calendar.WorkingTimeBetween(pause.PausedAt, pauseEnd);
        }

        var net = gross - paused;
        return net < TimeSpan.Zero ? TimeSpan.Zero : net;
    }

    public TimeSpan Remaining(WorkingCalendar calendar, DateTimeOffset now)
    {
        var remaining = Target - Elapsed(calendar, now);
        return remaining < TimeSpan.Zero ? TimeSpan.Zero : remaining;
    }

    public TimeSpan Overrun(WorkingCalendar calendar, DateTimeOffset now)
    {
        var overrun = Elapsed(calendar, now) - Target;
        return overrun < TimeSpan.Zero ? TimeSpan.Zero : overrun;
    }

    public bool IsBreached(WorkingCalendar calendar, DateTimeOffset now) => Elapsed(calendar, now) > Target;

    /// <summary>Projected breach instant if the clock keeps running; null while paused or stopped.</summary>
    public DateTimeOffset? DueAt(WorkingCalendar calendar, DateTimeOffset now)
    {
        if (IsStopped || IsPaused)
        {
            return null;
        }

        return calendar.AddWorkingTime(now, Remaining(calendar, now));
    }

    public SlaStatus Status(WorkingCalendar calendar, DateTimeOffset now, double atRiskThreshold = 0.8)
    {
        var elapsed = Elapsed(calendar, now);
        if (elapsed > Target)
        {
            return SlaStatus.Breached;
        }

        if (IsStopped)
        {
            return SlaStatus.Met;
        }

        if (IsPaused)
        {
            return SlaStatus.Paused;
        }

        return elapsed.TotalSeconds >= Target.TotalSeconds * atRiskThreshold ? SlaStatus.AtRisk : SlaStatus.OnTrack;
    }

    public bool MarkBreachRecorded(DateTimeOffset at)
    {
        if (BreachRecordedAt.HasValue)
        {
            return false;
        }

        BreachRecordedAt = at;
        return true;
    }

    private void EnsureNotStopped()
    {
        if (IsStopped)
        {
            throw new DomainException("sla.stopped", "The SLA clock has already been stopped.");
        }
    }
}

public sealed record SlaPause(DateTimeOffset PausedAt, DateTimeOffset? ResumedAt, string Reason);

public enum SlaStatus
{
    OnTrack,
    AtRisk,
    Paused,
    Breached,
    Met,
}
