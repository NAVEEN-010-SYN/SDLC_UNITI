using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Services;

/// <summary>
/// An active product instance on an account, tied to a service address. A service carries the
/// price the customer is actually paying (which can differ from the catalog price after a reprice)
/// and its contract term.
/// </summary>
public sealed class Service : AggregateRoot
{
    private Service()
    {
    }

    public Service(
        Guid id,
        Guid accountId,
        string serviceReference,
        Plan plan,
        PostalAddress serviceAddress,
        DateTimeOffset orderedAt)
        : base(id)
    {
        AccountId = accountId;
        ServiceReference = Guard.NotBlank(serviceReference, "service.reference", 32);
        PlanId = plan.Id;
        ProductType = plan.ProductType;
        MonthlyPrice = plan.MonthlyPrice;
        ServiceAddress = serviceAddress;
        Status = ServiceStatus.PendingActivation;
        OrderedAt = orderedAt;
        ContractTermMonths = plan.MinimumTermMonths;
    }

    public Guid AccountId { get; private set; }

    /// <summary>Customer-visible reference, e.g. <c>SVC-00012345</c>.</summary>
    public string ServiceReference { get; private set; } = string.Empty;

    public Guid PlanId { get; private set; }

    public ProductType ProductType { get; private set; }

    /// <summary>Price the customer currently pays per month for this service.</summary>
    public Money MonthlyPrice { get; private set; } = null!;

    public PostalAddress ServiceAddress { get; private set; } = null!;

    public ServiceStatus Status { get; private set; }

    public DateTimeOffset OrderedAt { get; private set; }

    public DateOnly? ActivatedOn { get; private set; }

    public DateOnly? CancelledOn { get; private set; }

    public int ContractTermMonths { get; private set; }

    /// <summary>Start of the current contract term; reset by an upgrade that carries a new term.</summary>
    public DateOnly? ContractStartedOn { get; private set; }

    /// <summary>Id of the open plan change, if one is in flight. Only one may exist at a time.</summary>
    public Guid? PendingPlanChangeId { get; private set; }

    public DateOnly? ContractEndsOn => ContractStartedOn?.AddMonths(ContractTermMonths);

    public bool IsLive => Status is ServiceStatus.Active or ServiceStatus.Suspended;

    public bool IsInContract(DateOnly date) => ContractEndsOn is { } end && date < end;

    /// <summary>Whole months left on the contract on <paramref name="date"/>, rounded up.</summary>
    public int RemainingContractMonths(DateOnly date)
    {
        if (ContractEndsOn is not { } end || date >= end)
        {
            return 0;
        }

        var months = (end.Year - date.Year) * 12 + end.Month - date.Month;
        if (date.AddMonths(months) < end)
        {
            months++;
        }

        return Math.Max(months, 0);
    }

    public void Activate(DateOnly activatedOn, DateTimeOffset now)
    {
        if (Status != ServiceStatus.PendingActivation)
        {
            throw new InvalidStateTransitionException(nameof(Service), Status.ToString(), ServiceStatus.Active.ToString());
        }

        Status = ServiceStatus.Active;
        ActivatedOn = activatedOn;
        ContractStartedOn = activatedOn;
        Raise(new ServiceActivated(Id, AccountId, activatedOn, now));
    }

    public void Suspend()
    {
        if (Status != ServiceStatus.Active)
        {
            throw new InvalidStateTransitionException(nameof(Service), Status.ToString(), ServiceStatus.Suspended.ToString());
        }

        Status = ServiceStatus.Suspended;
    }

    public void Resume()
    {
        if (Status != ServiceStatus.Suspended)
        {
            throw new InvalidStateTransitionException(nameof(Service), Status.ToString(), ServiceStatus.Active.ToString());
        }

        Status = ServiceStatus.Active;
    }

    public void Cancel(DateOnly effectiveOn, DateTimeOffset now)
    {
        if (Status == ServiceStatus.Cancelled)
        {
            throw new InvalidStateTransitionException(nameof(Service), Status.ToString(), ServiceStatus.Cancelled.ToString());
        }

        if (PendingPlanChangeId is not null)
        {
            throw new DomainException("service.plan_change_pending", "Cancel the pending plan change before cancelling the service.");
        }

        Status = ServiceStatus.Cancelled;
        CancelledOn = effectiveOn;
        Raise(new ServiceCancelled(Id, AccountId, effectiveOn, now));
    }

    /// <summary>Reserves the service for a plan change so concurrent changes are rejected.</summary>
    public void AttachPendingPlanChange(Guid planChangeId)
    {
        if (Status != ServiceStatus.Active)
        {
            throw new DomainException("service.not_active", "Only active services can change plan.");
        }

        if (PendingPlanChangeId is not null && PendingPlanChangeId != planChangeId)
        {
            throw new DomainException("service.plan_change_pending", "A plan change is already in progress for this service.");
        }

        PendingPlanChangeId = planChangeId;
    }

    public void ReleasePendingPlanChange(Guid planChangeId)
    {
        if (PendingPlanChangeId == planChangeId)
        {
            PendingPlanChangeId = null;
        }
    }

    /// <summary>
    /// Moves the service onto <paramref name="plan"/>. An upgrade with a minimum term starts a new
    /// contract from <paramref name="effectiveOn"/>; downgrades and lateral moves keep the existing term.
    /// </summary>
    public void ApplyPlan(Plan plan, PlanChangeType changeType, DateOnly effectiveOn, Guid planChangeId)
    {
        if (PendingPlanChangeId != planChangeId)
        {
            throw new DomainException("service.plan_change_mismatch", "The plan change being applied is not the one pending on this service.");
        }

        if (plan.ProductType != ProductType)
        {
            throw new DomainException("plan_change.product_mismatch", "Plans must be of the same product type.");
        }

        PlanId = plan.Id;
        MonthlyPrice = plan.MonthlyPrice;
        if (changeType == PlanChangeType.Upgrade && plan.MinimumTermMonths > 0)
        {
            ContractStartedOn = effectiveOn;
            ContractTermMonths = plan.MinimumTermMonths;
        }

        PendingPlanChangeId = null;
    }
}

public sealed record ServiceActivated(Guid ServiceId, Guid AccountId, DateOnly ActivatedOn, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record ServiceCancelled(Guid ServiceId, Guid AccountId, DateOnly EffectiveOn, DateTimeOffset OccurredAt) : IDomainEvent;
