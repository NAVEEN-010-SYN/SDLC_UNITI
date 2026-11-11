using Uconnect.Domain.Common;

namespace Uconnect.Domain.Outages;

/// <summary>Kind of outage notification sent to an account; used to prevent duplicates.</summary>
public enum OutageNotificationKind
{
    Declared = 1,
    Resolved = 2,
}

/// <summary>Record that an account was told about an outage over a channel. Unique per (outage, account, kind, channel).</summary>
public sealed class OutageNotification : Entity
{
    private OutageNotification()
    {
    }

    public OutageNotification(Guid id, Guid outageId, Guid accountId, OutageNotificationKind kind, NotificationChannel channel, DateTimeOffset sentAt)
        : base(id)
    {
        OutageId = outageId;
        AccountId = accountId;
        Kind = kind;
        Channel = channel;
        SentAt = sentAt;
    }

    public Guid OutageId { get; private set; }

    public Guid AccountId { get; private set; }

    public OutageNotificationKind Kind { get; private set; }

    public NotificationChannel Channel { get; private set; }

    public DateTimeOffset SentAt { get; private set; }
}

/// <summary>
/// Automatic service credits for prolonged outages.
/// <list type="bullet">
/// <item>Business: SLA credit of <see cref="BusinessCreditPercentPerBlock"/>% of the monthly price for every
/// started <see cref="BusinessBlockHours"/>-hour block beyond the first block, capped at <see cref="BusinessCapPercent"/>%.</item>
/// <item>Consumer: after <see cref="ConsumerGraceDays"/> full days without service, the daily rate of the
/// monthly price for each further started day, capped at one month's price.</item>
/// </list>
/// Minor-severity outages (degraded, not down) attract no credit.
/// </summary>
public static class OutageCompensationPolicy
{
    public const int BusinessBlockHours = 4;
    public const int BusinessCreditPercentPerBlock = 5;
    public const int BusinessCapPercent = 50;
    public const int ConsumerGraceDays = 2;

    public static Money CalculateCredit(AccountType accountType, OutageSeverity severity, Money monthlyPrice, TimeSpan duration)
    {
        var zero = Money.Zero(monthlyPrice.Currency);
        if (severity == OutageSeverity.Minor || duration <= TimeSpan.Zero || monthlyPrice.IsZero)
        {
            return zero;
        }

        return accountType == AccountType.Business
            ? BusinessCredit(monthlyPrice, duration)
            : ConsumerCredit(monthlyPrice, duration);
    }

    private static Money BusinessCredit(Money monthlyPrice, TimeSpan duration)
    {
        var blocks = (int)Math.Ceiling(duration.TotalHours / BusinessBlockHours);
        var creditableBlocks = Math.Max(0, blocks - 1);
        var percent = Math.Min(creditableBlocks * BusinessCreditPercentPerBlock, BusinessCapPercent);
        return monthlyPrice.MultiplyRatio(percent, 100);
    }

    private static Money ConsumerCredit(Money monthlyPrice, TimeSpan duration)
    {
        var startedDays = (int)Math.Ceiling(duration.TotalDays);
        var creditableDays = Math.Max(0, startedDays - ConsumerGraceDays);
        if (creditableDays == 0)
        {
            return Money.Zero(monthlyPrice.Currency);
        }

        // A notional 30-day month keeps the daily rate stable regardless of the calendar month.
        var credit = monthlyPrice.MultiplyRatio(creditableDays, 30);
        return credit.Min(monthlyPrice);
    }
}
