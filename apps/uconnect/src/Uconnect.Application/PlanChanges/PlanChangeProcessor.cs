using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;

namespace Uconnect.Application.PlanChanges;

/// <summary>Result of one processor pass, for logging and metrics.</summary>
public sealed record PlanChangeRunSummary(int Submitted, int Completed, int Failed, int Retried, int Errors);

/// <summary>
/// Drives plan changes through provisioning: submits due changes, polls in-flight orders, and
/// applies the outcome (or a webhook callback) to the service. Failed orders are retried until
/// <see cref="PlanChange.MaxProvisioningAttempts"/> is reached, after which the service is released
/// and a <see cref="PlanChangeFailed"/> event lets support follow up.
/// </summary>
public sealed class PlanChangeProcessor
{
    private readonly IPlanChangeRepository _planChanges;
    private readonly IServiceRepository _services;
    private readonly IPlanRepository _plans;
    private readonly IProvisioningClient _provisioning;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly ILogger<PlanChangeProcessor> _logger;

    public PlanChangeProcessor(
        IPlanChangeRepository planChanges,
        IServiceRepository services,
        IPlanRepository plans,
        IProvisioningClient provisioning,
        IUnitOfWork unitOfWork,
        IClock clock,
        ILogger<PlanChangeProcessor> logger)
    {
        _planChanges = planChanges;
        _services = services;
        _plans = plans;
        _provisioning = provisioning;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _logger = logger;
    }

    public async Task<PlanChangeRunSummary> RunAsync(CancellationToken ct)
    {
        var counts = new RunCounts();
        await SubmitDueChangesAsync(counts, ct);
        await PollProvisioningAsync(counts, ct);
        return new PlanChangeRunSummary(counts.Submitted, counts.Completed, counts.Failed, counts.Retried, counts.Errors);
    }

    private async Task SubmitDueChangesAsync(RunCounts counts, CancellationToken ct)
    {
        foreach (var change in await _planChanges.ListDueAsync(_clock.Today, ct))
        {
            try
            {
                var (service, from, to) = await LoadAsync(change, ct);
                if (await TrySubmitAsync(change, service, from, to, ct))
                {
                    counts.Submitted++;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                counts.Errors++;
                _logger.LogError(ex, "Failed to submit plan change {PlanChangeId}", change.Id);
            }
        }
    }

    private async Task PollProvisioningAsync(RunCounts counts, CancellationToken ct)
    {
        foreach (var change in await _planChanges.ListProvisioningAsync(ct))
        {
            try
            {
                var status = await _provisioning.GetOrderStatusAsync(change.ProvisioningOrderRef!, ct);
                var result = await ApplyStatusAsync(change, status, ct);
                if (result == PlanChangeStatus.Completed)
                {
                    counts.Completed++;
                }
                else if (result == PlanChangeStatus.Failed)
                {
                    counts.Failed++;
                }
                else if (result == PlanChangeStatus.Provisioning && change.ProvisioningOrderRef != status.OrderRef)
                {
                    // Still provisioning under a new order ref: the failed order was resubmitted.
                    counts.Retried++;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                counts.Errors++;
                _logger.LogError(ex, "Failed to poll provisioning for plan change {PlanChangeId}", change.Id);
            }
        }
    }

    /// <summary>Handles an asynchronous status callback from the provisioning platform.</summary>
    public async Task HandleCallbackAsync(ProvisioningOrderStatus status, CancellationToken ct)
    {
        var change = await _planChanges.GetByProvisioningRefAsync(status.OrderRef, ct)
            ?? throw new NotFoundException("ProvisioningOrder", status.OrderRef);

        if (change.Status != PlanChangeStatus.Provisioning)
        {
            _logger.LogInformation("Ignoring duplicate provisioning callback for {OrderRef}; plan change is {Status}", status.OrderRef, change.Status);
            return;
        }

        await ApplyStatusAsync(change, status, ct);
    }

    /// <summary>
    /// Sends a change to provisioning. Returns false (leaving the change for the next run) when the
    /// platform is temporarily unavailable.
    /// </summary>
    internal async Task<bool> TrySubmitAsync(PlanChange change, Service service, Plan from, Plan to, CancellationToken ct)
    {
        try
        {
            var accepted = await _provisioning.SubmitPlanChangeAsync(
                new ProvisioningOrderRequest(change.Id, service.ServiceReference, from.Code, to.Code, to.DownloadMbps, to.UploadMbps, change.EffectiveOn),
                ct);
            change.MarkProvisioning(accepted.OrderRef, _clock.UtcNow);
            await _unitOfWork.SaveChangesAsync(ct);
            _logger.LogInformation("Plan change {PlanChangeId} submitted to provisioning as {OrderRef}", change.Id, accepted.OrderRef);
            return true;
        }
        catch (ExternalServiceException ex) when (ex.IsTransient)
        {
            _logger.LogWarning(ex, "Provisioning unavailable; plan change {PlanChangeId} will be retried", change.Id);
            return false;
        }
    }

    private async Task<PlanChangeStatus> ApplyStatusAsync(PlanChange change, ProvisioningOrderStatus status, CancellationToken ct)
    {
        switch (status.State)
        {
            case ProvisioningOrderState.Pending:
                return change.Status;
            case ProvisioningOrderState.Completed:
                return await ApplyCompletedAsync(change, status, ct);
            case ProvisioningOrderState.Failed:
                return await ApplyFailedAsync(change, status, ct);
            default:
                throw new ArgumentOutOfRangeException(nameof(status), status.State, "Unknown provisioning state.");
        }
    }

    private async Task<PlanChangeStatus> ApplyCompletedAsync(PlanChange change, ProvisioningOrderStatus status, CancellationToken ct)
    {
        var (service, _, to) = await LoadAsync(change, ct);
        service.ApplyPlan(to, change.ChangeType, change.EffectiveOn, change.Id);
        change.Complete(status.CompletedAt ?? _clock.UtcNow);
        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation("Plan change {PlanChangeId} completed; service {ServiceReference} now on {PlanCode}", change.Id, service.ServiceReference, to.Code);
        return PlanChangeStatus.Completed;
    }

    /// <summary>Retries a failed order until the attempt limit, then fails the change permanently.</summary>
    private async Task<PlanChangeStatus> ApplyFailedAsync(PlanChange change, ProvisioningOrderStatus status, CancellationToken ct)
    {
        var reason = string.IsNullOrWhiteSpace(status.FailureReason) ? "Provisioning reported a failure." : status.FailureReason;
        var (service, from, to) = await LoadAsync(change, ct);
        change.Fail(reason, _clock.UtcNow);

        if (change.ProvisioningAttempts < PlanChange.MaxProvisioningAttempts)
        {
            await _unitOfWork.SaveChangesAsync(ct);
            _logger.LogWarning("Plan change {PlanChangeId} failed (attempt {Attempt}): {Reason}; retrying", change.Id, change.ProvisioningAttempts, reason);
            var resubmitted = await TrySubmitAsync(change, service, from, to, ct);
            return resubmitted ? PlanChangeStatus.Provisioning : PlanChangeStatus.Failed;
        }

        service.ReleasePendingPlanChange(change.Id);
        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogError("Plan change {PlanChangeId} failed permanently after {Attempts} attempts: {Reason}", change.Id, change.ProvisioningAttempts, reason);
        return PlanChangeStatus.Failed;
    }

    private async Task<(Service Service, Plan From, Plan To)> LoadAsync(PlanChange change, CancellationToken ct)
    {
        var service = await _services.GetByIdAsync(change.ServiceId, ct) ?? throw new NotFoundException("Service", change.ServiceId);
        var from = await _plans.GetByIdAsync(change.FromPlanId, ct) ?? throw new NotFoundException("Plan", change.FromPlanId);
        var to = await _plans.GetByIdAsync(change.ToPlanId, ct) ?? throw new NotFoundException("Plan", change.ToPlanId);
        return (service, from, to);
    }

    /// <summary>Running totals for one plan-change run.</summary>
    private sealed class RunCounts
    {
        public int Submitted;
        public int Completed;
        public int Failed;
        public int Retried;
        public int Errors;
    }
}
