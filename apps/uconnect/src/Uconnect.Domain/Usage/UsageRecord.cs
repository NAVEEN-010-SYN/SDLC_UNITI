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
