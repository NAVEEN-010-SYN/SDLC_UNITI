using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Services;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Billing;

/// <summary>
/// One-off credits and charges awaiting the next invoice. Customers can see them; only support
/// agents can raise them, and goodwill above the agent limit needs a team-lead approval reference.
/// </summary>
public sealed class AdjustmentService
{
    private const int HistorySize = 50;

    private readonly AccountAccessGuard _guard;
    private readonly ServiceInventoryService _inventory;
    private readonly IAdjustmentRepository _adjustments;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<RaiseAdjustmentRequest> _validator;
    private readonly ILogger<AdjustmentService> _logger;

    public AdjustmentService(
        AccountAccessGuard guard,
        ServiceInventoryService inventory,
        IAdjustmentRepository adjustments,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<RaiseAdjustmentRequest> validator,
        ILogger<AdjustmentService> logger)
    {
        _guard = guard;
        _inventory = inventory;
        _adjustments = adjustments;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _validator = validator;
        _logger = logger;
    }

    public async Task<IReadOnlyList<AdjustmentDto>> ListAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var adjustments = await _adjustments.ListByAccountAsync(account.Id, HistorySize, ct);
        return adjustments.OrderByDescending(a => a.RaisedAt).Select(a => a.ToDto()).ToList();
    }

    public async Task<AdjustmentDto> RaiseAsync(string accountNumber, RaiseAdjustmentRequest request, CancellationToken ct)
    {
        if (!_currentUser.IsSupportAgent)
        {
            throw new ForbiddenException("Only support agents can raise account adjustments.");
        }

        await _validator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        if (request.ServiceId is { } serviceId)
        {
            await _inventory.LoadOwnedServiceAsync(account.Id, serviceId, ct);
        }

        var amount = request.Amount!.ToMoney();
        if (amount.Currency != account.Currency)
        {
            throw new RequestValidationException("amount.currency", $"Adjustments on this account must be in {account.Currency}.");
        }

        var adjustment = new AccountAdjustment(
            Guid.NewGuid(),
            account.Id,
            request.ServiceId,
            EnumParsing.Parse<AdjustmentReason>(request.Reason, "reason"),
            request.Description,
            amount,
            _currentUser.UserId,
            _clock.UtcNow,
            string.IsNullOrWhiteSpace(request.ApprovalReference) ? null : request.ApprovalReference.Trim());

        _adjustments.Add(adjustment);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Adjustment {AdjustmentId} ({Reason}, {Amount}) raised on {AccountNumber} by agent {UserId}",
            adjustment.Id, adjustment.Reason, adjustment.Amount, account.Number, _currentUser.UserId);
        return adjustment.ToDto();
    }
}
