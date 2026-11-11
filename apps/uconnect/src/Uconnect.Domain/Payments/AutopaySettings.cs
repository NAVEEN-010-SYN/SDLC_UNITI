using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Payments;

/// <summary>
/// Per-account autopay configuration: which method to charge, how many days before the due date,
/// and an optional ceiling above which the customer must pay manually. After
/// <see cref="MaxConsecutiveFailures"/> failed attempts autopay suspends itself.
/// </summary>
public sealed class AutopaySettings : AggregateRoot
{
    public const int MaxConsecutiveFailures = 3;

    private AutopaySettings()
    {
    }

    public AutopaySettings(Guid id, Guid accountId) : base(id)
    {
        AccountId = accountId;
        DaysBeforeDue = 3;
    }

    public Guid AccountId { get; private set; }

    public bool Enabled { get; private set; }

    public Guid? PaymentMethodId { get; private set; }

    /// <summary>Charge this many days before the invoice due date (0 = on the due date).</summary>
    public int DaysBeforeDue { get; private set; }

    /// <summary>Invoices above this amount are not auto-charged; <c>null</c> means no ceiling.</summary>
    public Money? MaxAmount { get; private set; }

    public int ConsecutiveFailures { get; private set; }

    public DateTimeOffset? SuspendedAt { get; private set; }

    public DateTimeOffset? EnabledAt { get; private set; }

    public void Enable(PaymentMethod method, int daysBeforeDue, Money? maxAmount, DateOnly today, DateTimeOffset now)
    {
        if (method.AccountId != AccountId)
        {
            throw new DomainException("autopay.method_not_on_account", "The payment method does not belong to this account.");
        }

        method.EnsureUsable(today);
        Guard.InRange(daysBeforeDue, 0, 10, "autopay.days_before_due");
        if (maxAmount is not null)
        {
            Guard.Positive(maxAmount, "autopay.max_amount");
        }

        Enabled = true;
        PaymentMethodId = method.Id;
        DaysBeforeDue = daysBeforeDue;
        MaxAmount = maxAmount;
        ConsecutiveFailures = 0;
        SuspendedAt = null;
        EnabledAt = now;
    }

    public void Disable()
    {
        Enabled = false;
    }

    /// <summary>Date on which autopay should attempt to collect <paramref name="invoice"/>.</summary>
    public DateOnly? CollectionDateFor(Invoice invoice) => invoice.DueOn?.AddDays(-DaysBeforeDue);

    /// <summary>
    /// Decides whether to charge an invoice today. Returns a reason when the invoice is skipped so
    /// that the customer can be told why autopay did not collect it.
    /// </summary>
    public AutopayDecision Evaluate(Invoice invoice, DateOnly today)
    {
        if (!Enabled || PaymentMethodId is null)
        {
            return AutopayDecision.Skip("autopay_disabled");
        }

        if (invoice.AccountId != AccountId || !invoice.IsPayable || !invoice.BalanceDue.IsPositive)
        {
            return AutopayDecision.Skip("not_payable");
        }

        if (CollectionDateFor(invoice) is not { } collectOn || today < collectOn)
        {
            return AutopayDecision.Skip("not_yet_due");
        }

        if (MaxAmount is not null && invoice.BalanceDue > MaxAmount)
        {
            return AutopayDecision.Skip("above_max_amount");
        }

        return AutopayDecision.Charge(invoice.BalanceDue, PaymentMethodId.Value);
    }

    public void RecordSuccess() => ConsecutiveFailures = 0;

    /// <summary>Counts a failed collection; returns true if autopay has now been suspended.</summary>
    public bool RecordFailure(DateTimeOffset now)
    {
        ConsecutiveFailures++;
        if (ConsecutiveFailures < MaxConsecutiveFailures)
        {
            return false;
        }

        Enabled = false;
        SuspendedAt = now;
        Raise(new AutopaySuspended(Id, AccountId, ConsecutiveFailures, now));
        return true;
    }
}

public sealed record AutopayDecision(bool ShouldCharge, Money? Amount, Guid? PaymentMethodId, string? SkipReason)
{
    public static AutopayDecision Charge(Money amount, Guid methodId) => new(true, amount, methodId, null);

    public static AutopayDecision Skip(string reason) => new(false, null, null, reason);
}

public sealed record AutopaySuspended(Guid AutopayId, Guid AccountId, int Failures, DateTimeOffset OccurredAt) : IDomainEvent;
