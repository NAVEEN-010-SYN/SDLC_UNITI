using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Services;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;

namespace Uconnect.Application.PlanChanges;

/// <summary>
/// Customer-facing plan changes: quote (with proration and early-change fee), accept, list and
/// cancel. Immediate upgrades are sent to provisioning straight away; anything future-dated is
/// scheduled and picked up by <see cref="PlanChangeProcessor"/>.
/// </summary>
public sealed class PlanChangeService
{
    private readonly AccountAccessGuard _guard;
    private readonly ServiceInventoryService _inventory;
    private readonly IPlanRepository _plans;
    private readonly IPlanChangeRepository _planChanges;
    private readonly PlanChangeProcessor _processor;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<PlanChangeQuoteRequest> _quoteValidator;
    private readonly IValidator<RequestPlanChangeRequest> _requestValidator;
    private readonly ILogger<PlanChangeService> _logger;

    public PlanChangeService(
        AccountAccessGuard guard,
        ServiceInventoryService inventory,
        IPlanRepository plans,
        IPlanChangeRepository planChanges,
        PlanChangeProcessor processor,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<PlanChangeQuoteRequest> quoteValidator,
        IValidator<RequestPlanChangeRequest> requestValidator,
        ILogger<PlanChangeService> logger)
    {
        _guard = guard;
        _inventory = inventory;
        _plans = plans;
        _planChanges = planChanges;
        _processor = processor;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _quoteValidator = quoteValidator;
        _requestValidator = requestValidator;
        _logger = logger;
    }

    public async Task<PlanChangeQuoteDto> QuoteAsync(string accountNumber, PlanChangeQuoteRequest request, CancellationToken ct)
    {
        await _quoteValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var context = await LoadContextAsync(account, request.ServiceId, request.ToPlanCode, ct);

        var quote = PlanChangePolicy.Quote(account, context.Service, context.CurrentPlan, context.TargetPlan, _clock.Today, request.EffectiveOn);
        return quote.ToDto(context.CurrentPlan.Code, context.TargetPlan.Code);
    }

    /// <summary>
    /// Accepts a plan change. The quote is recomputed server-side and must match the amount the
    /// customer saw, otherwise the request is rejected so they can review the new figures.
    /// </summary>
    public async Task<PlanChangeDto> RequestAsync(string accountNumber, RequestPlanChangeRequest request, CancellationToken ct)
    {
        await _requestValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        var context = await LoadContextAsync(account, request.ServiceId, request.ToPlanCode, ct);
        var today = _clock.Today;

        var quote = PlanChangePolicy.Quote(account, context.Service, context.CurrentPlan, context.TargetPlan, today, request.EffectiveOn);
        if (quote.OneOffTotal.AmountMinor != request.AcceptedNetAmountMinor)
        {
            throw new ConflictException(
                "plan_change.quote_changed",
                $"The price for this change is now {quote.OneOffTotal}; please review the updated quote.");
        }

        var change = new PlanChange(Guid.NewGuid(), account.Id, quote, _currentUser.UserId, _clock.UtcNow);
        context.Service.AttachPendingPlanChange(change.Id);
        _planChanges.Add(change);

        if (change.EffectiveOn > today)
        {
            change.Schedule();
        }

        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation(
            "Plan change {PlanChangeId} ({ChangeType}) requested for service {ServiceReference}: {FromPlan} -> {ToPlan}, effective {EffectiveOn}",
            change.Id, change.ChangeType, context.Service.ServiceReference, context.CurrentPlan.Code, context.TargetPlan.Code, change.EffectiveOn);

        if (change.IsDue(today))
        {
            // Best effort: if provisioning is unavailable the scheduled processor retries the submission.
            await _processor.TrySubmitAsync(change, context.Service, context.CurrentPlan, context.TargetPlan, ct);
        }

        return change.ToDto(context.CurrentPlan.Code, context.TargetPlan.Code);
    }

    public async Task<IReadOnlyList<PlanChangeDto>> ListAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var changes = await _planChanges.ListByAccountAsync(account.Id, ct);
        if (changes.Count == 0)
        {
            return Array.Empty<PlanChangeDto>();
        }

        var planIds = changes.SelectMany(c => new[] { c.FromPlanId, c.ToPlanId }).Distinct();
        var codes = (await _plans.GetManyAsync(planIds, ct)).ToDictionary(p => p.Id, p => p.Code);
        return changes
            .OrderByDescending(c => c.RequestedAt)
            .Select(c => c.ToDto(codes.GetValueOrDefault(c.FromPlanId, "?"), codes.GetValueOrDefault(c.ToPlanId, "?")))
            .ToList();
    }

    /// <summary>Cancels a change that has not yet been sent to provisioning.</summary>
    public async Task<PlanChangeDto> CancelAsync(string accountNumber, Guid planChangeId, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        var change = await _planChanges.GetByIdAsync(planChangeId, ct);
        if (change is null || change.AccountId != account.Id)
        {
            throw new NotFoundException("PlanChange", planChangeId);
        }

        if (change.Status == PlanChangeStatus.Provisioning)
        {
            throw new ConflictException("plan_change.in_provisioning", "This change is already being applied to your service and can no longer be cancelled.");
        }

        var service = await _inventory.LoadOwnedServiceAsync(account.Id, change.ServiceId, ct);
        change.Cancel(_clock.UtcNow);
        service.ReleasePendingPlanChange(change.Id);
        await _unitOfWork.SaveChangesAsync(ct);

        var plans = (await _plans.GetManyAsync(new[] { change.FromPlanId, change.ToPlanId }, ct)).ToDictionary(p => p.Id, p => p.Code);
        return change.ToDto(plans.GetValueOrDefault(change.FromPlanId, "?"), plans.GetValueOrDefault(change.ToPlanId, "?"));
    }

    private async Task<(Service Service, Plan CurrentPlan, Plan TargetPlan)> LoadContextAsync(
        Account account, Guid serviceId, string toPlanCode, CancellationToken ct)
    {
        var service = await _inventory.LoadOwnedServiceAsync(account.Id, serviceId, ct);
        var currentPlan = await _plans.GetByIdAsync(service.PlanId, ct)
            ?? throw new NotFoundException("Plan", service.PlanId);
        var targetPlan = await _plans.GetByCodeAsync(toPlanCode.Trim().ToUpperInvariant(), ct)
            ?? throw new NotFoundException("Plan", toPlanCode);
        return (service, currentPlan, targetPlan);
    }
}
