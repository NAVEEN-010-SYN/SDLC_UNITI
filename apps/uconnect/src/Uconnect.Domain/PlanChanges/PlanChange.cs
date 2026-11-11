using Uconnect.Domain.Common;

namespace Uconnect.Domain.PlanChanges;

/// <summary>
/// A customer's accepted request to move a service between plans. Lifecycle:
/// <c>Requested → Scheduled → Provisioning → Completed</c>, with <c>Failed</c> from provisioning and
/// <c>Cancelled</c> allowed until provisioning starts.
/// </summary>
public sealed class PlanChange : AggregateRoot
{
    private static readonly Dictionary<PlanChangeStatus, PlanChangeStatus[]> AllowedTransitions = new()
    {
        [PlanChangeStatus.Requested] = new[] { PlanChangeStatus.Scheduled, PlanChangeStatus.Provisioning, PlanChangeStatus.Cancelled },
        [PlanChangeStatus.Scheduled] = new[] { PlanChangeStatus.Provisioning, PlanChangeStatus.Cancelled },
        [PlanChangeStatus.Provisioning] = new[] { PlanChangeStatus.Completed, PlanChangeStatus.Failed },
        [PlanChangeStatus.Failed] = new[] { PlanChangeStatus.Provisioning, PlanChangeStatus.Cancelled },
        [PlanChangeStatus.Completed] = Array.Empty<PlanChangeStatus>(),
        [PlanChangeStatus.Cancelled] = Array.Empty<PlanChangeStatus>(),
    };

    public const int MaxProvisioningAttempts = 3;

    private PlanChange()
    {
    }

    public PlanChange(Guid id, Guid accountId, PlanChangeQuote quote, Guid requestedByUserId, DateTimeOffset requestedAt)
        : base(id)
    {
        AccountId = accountId;
        ServiceId = quote.ServiceId;
        FromPlanId = quote.FromPlanId;
        ToPlanId = quote.ToPlanId;
        ChangeType = quote.ChangeType;
        EffectiveOn = quote.EffectiveOn;
        PreviousMonthlyPrice = quote.CurrentMonthlyPrice;
        NewMonthlyPrice = quote.NewMonthlyPrice;
        ProrationCredit = quote.Proration?.Credit ?? Money.Zero(quote.NewMonthlyPrice.Currency);
        ProrationCharge = quote.Proration?.Charge ?? Money.Zero(quote.NewMonthlyPrice.Currency);
        ProrationDays = quote.Proration?.DaysRemaining ?? 0;
        EarlyTerminationFee = quote.EarlyTerminationFee;
        RequestedByUserId = requestedByUserId;
        RequestedAt = requestedAt;
        Status = PlanChangeStatus.Requested;
    }

    public Guid AccountId { get; private set; }

    public Guid ServiceId { get; private set; }

    public Guid FromPlanId { get; private set; }

    public Guid ToPlanId { get; private set; }

    public PlanChangeType ChangeType { get; private set; }

    public PlanChangeStatus Status { get; private set; }

    public DateOnly EffectiveOn { get; private set; }

    public Money PreviousMonthlyPrice { get; private set; } = null!;

    public Money NewMonthlyPrice { get; private set; } = null!;

    public Money ProrationCredit { get; private set; } = null!;

    public Money ProrationCharge { get; private set; } = null!;

    public int ProrationDays { get; private set; }

    public Money EarlyTerminationFee { get; private set; } = null!;

    public Guid RequestedByUserId { get; private set; }

    public DateTimeOffset RequestedAt { get; private set; }

    /// <summary>Order reference returned by the provisioning platform.</summary>
    public string? ProvisioningOrderRef { get; private set; }

    public int ProvisioningAttempts { get; private set; }

    public string? FailureReason { get; private set; }

    public DateTimeOffset? CompletedAt { get; private set; }

    /// <summary>Invoice on which the proration / fee lines were billed, once billed.</summary>
    public Guid? BilledOnInvoiceId { get; private set; }

    public bool IsOpen => Status is PlanChangeStatus.Requested or PlanChangeStatus.Scheduled
        or PlanChangeStatus.Provisioning or PlanChangeStatus.Failed;

    public bool HasBillableAmounts => !ProrationCredit.IsZero || !ProrationCharge.IsZero || !EarlyTerminationFee.IsZero;

    /// <summary>True when the change should be sent to provisioning on <paramref name="today"/>.</summary>
    public bool IsDue(DateOnly today) =>
        (Status == PlanChangeStatus.Requested || Status == PlanChangeStatus.Scheduled) && EffectiveOn <= today;

    public void Schedule()
    {
        TransitionTo(PlanChangeStatus.Scheduled);
    }

    public void MarkProvisioning(string orderRef, DateTimeOffset now)
    {
        if (Status == PlanChangeStatus.Failed && ProvisioningAttempts >= MaxProvisioningAttempts)
        {
            throw new DomainException("plan_change.retries_exhausted", "Provisioning has failed too many times; raise a support ticket.");
        }

        TransitionTo(PlanChangeStatus.Provisioning);
        ProvisioningOrderRef = Guard.NotBlank(orderRef, "plan_change.order_ref", 64);
        ProvisioningAttempts++;
        FailureReason = null;
        Raise(new PlanChangeProvisioningStarted(Id, ServiceId, orderRef, now));
    }

    public void Complete(DateTimeOffset now)
    {
        TransitionTo(PlanChangeStatus.Completed);
        CompletedAt = now;
        Raise(new PlanChangeCompleted(Id, AccountId, ServiceId, ToPlanId, ChangeType, now));
    }

    public void Fail(string reason, DateTimeOffset now)
    {
        TransitionTo(PlanChangeStatus.Failed);
        FailureReason = Guard.NotBlank(reason, "plan_change.failure_reason", 500);
        Raise(new PlanChangeFailed(Id, AccountId, ServiceId, FailureReason, now));
    }

    public void Cancel(DateTimeOffset now)
    {
        TransitionTo(PlanChangeStatus.Cancelled);
        Raise(new PlanChangeCancelled(Id, ServiceId, now));
    }

    public void MarkBilled(Guid invoiceId)
    {
        if (Status != PlanChangeStatus.Completed)
        {
            throw new DomainException("plan_change.not_completed", "Only completed plan changes can be billed.");
        }

        if (BilledOnInvoiceId is not null)
        {
            throw new DomainException("plan_change.already_billed", "This plan change has already been billed.");
        }

        BilledOnInvoiceId = invoiceId;
    }

    private void TransitionTo(PlanChangeStatus target)
    {
        if (!AllowedTransitions[Status].Contains(target))
        {
            throw new InvalidStateTransitionException(nameof(PlanChange), Status.ToString(), target.ToString());
        }

        Status = target;
    }
}

public sealed record PlanChangeProvisioningStarted(Guid PlanChangeId, Guid ServiceId, string OrderRef, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record PlanChangeCompleted(Guid PlanChangeId, Guid AccountId, Guid ServiceId, Guid ToPlanId, PlanChangeType ChangeType, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record PlanChangeFailed(Guid PlanChangeId, Guid AccountId, Guid ServiceId, string Reason, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record PlanChangeCancelled(Guid PlanChangeId, Guid ServiceId, DateTimeOffset OccurredAt) : IDomainEvent;
