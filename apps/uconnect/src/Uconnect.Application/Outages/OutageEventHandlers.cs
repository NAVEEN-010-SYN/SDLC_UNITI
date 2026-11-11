using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Notifications;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Services;

namespace Uconnect.Application.Outages;

/// <summary>
/// Tells affected customers when an outage is declared (or widened to their area) and when it is
/// resolved, then raises automatic service credits under <see cref="OutageCompensationPolicy"/>.
/// Every notification and credit is recorded so a re-delivered event never duplicates either.
/// </summary>
public sealed class OutageEventHandlers : IDomainEventHandler<OutageDeclared>, IDomainEventHandler<OutageResolved>
{
    private readonly IOutageRepository _outages;
    private readonly IServiceRepository _services;
    private readonly IAccountRepository _accounts;
    private readonly IAdjustmentRepository _adjustments;
    private readonly CustomerNotifier _notifier;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly CompensationOptions _compensation;
    private readonly ILogger<OutageEventHandlers> _logger;

    public OutageEventHandlers(
        IOutageRepository outages,
        IServiceRepository services,
        IAccountRepository accounts,
        IAdjustmentRepository adjustments,
        CustomerNotifier notifier,
        IUnitOfWork unitOfWork,
        IClock clock,
        IOptions<CompensationOptions> compensation,
        ILogger<OutageEventHandlers> logger)
    {
        _outages = outages;
        _services = services;
        _accounts = accounts;
        _adjustments = adjustments;
        _notifier = notifier;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _compensation = compensation.Value;
        _logger = logger;
    }

    public async Task HandleAsync(OutageDeclared domainEvent, CancellationToken cancellationToken)
    {
        var outage = await _outages.GetByIdAsync(domainEvent.OutageId, cancellationToken);
        if (outage is null || outage.IsResolved)
        {
            return;
        }

        var message = new CustomerMessage(
            $"Service disruption in your area ({outage.Reference})",
            new[]
            {
                $"We are aware of a problem affecting services in your area: {outage.Title}.",
                outage.EstimatedResolutionAt is { } eta
                    ? $"We expect service to be restored by {eta:dd MMM yyyy HH:mm} UTC."
                    : "Our engineers are investigating and we will update you as soon as we know more.",
                "There is no need to raise a fault ticket for this issue.",
            },
            "outages",
            $"Uniti: known service issue in your area ({outage.Reference}). Updates at our status page; no need to contact us.");

        var affected = await AffectedAccountsAsync(domainEvent.OutwardCodes, cancellationToken);
        await NotifyAsync(outage, affected.Keys, OutageNotificationKind.Declared, message, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task HandleAsync(OutageResolved domainEvent, CancellationToken cancellationToken)
    {
        var outage = await _outages.GetByIdAsync(domainEvent.OutageId, cancellationToken);
        if (outage is null)
        {
            return;
        }

        var affected = await AffectedAccountsAsync(outage.AffectedOutwardCodes, cancellationToken);
        var duration = outage.Duration(_clock.UtcNow);
        var credits = _compensation.AutomaticOutageCredits
            ? await RaiseCreditsAsync(outage, affected, duration, cancellationToken)
            : new Dictionary<Guid, Money>();

        foreach (var accountId in affected.Keys)
        {
            var paragraphs = new List<string>
            {
                $"The problem affecting your area ({outage.Title}) has been fixed and service has been restored.",
                "If your connection is still not working, please restart your router and raise a fault ticket if the problem continues.",
            };
            if (credits.TryGetValue(accountId, out var credit))
            {
                paragraphs.Add($"We're sorry for the disruption. A credit of {credit} will appear on your next invoice.");
            }

            var message = new CustomerMessage(
                $"Service restored ({outage.Reference})",
                paragraphs,
                "outages",
                $"Uniti: the service issue in your area ({outage.Reference}) is fixed. Restart your router if you still have problems.");
            await NotifyAsync(outage, new[] { accountId }, OutageNotificationKind.Resolved, message, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        _logger.LogInformation(
            "Outage {Reference} resolved after {Duration}: {Accounts} accounts notified, {Credits} credited",
            outage.Reference, duration, affected.Count, credits.Count);
    }

    private async Task<Dictionary<Guid, Money>> RaiseCreditsAsync(
        Outage outage, IReadOnlyDictionary<Guid, List<Service>> affected, TimeSpan duration, CancellationToken ct)
    {
        var credited = new Dictionary<Guid, Money>();
        foreach (var (accountId, services) in affected)
        {
            var account = await _accounts.GetByIdAsync(accountId, ct);
            if (account is null)
            {
                continue;
            }

            foreach (var service in services)
            {
                var credit = OutageCompensationPolicy.CalculateCredit(account.Type, outage.Severity, service.MonthlyPrice, duration);
                if (!credit.IsPositive || await _adjustments.ExistsForSourceAsync(accountId, service.Id, outage.Reference, ct))
                {
                    continue;
                }

                _adjustments.Add(new AccountAdjustment(
                    Guid.NewGuid(),
                    accountId,
                    service.Id,
                    AdjustmentReason.OutageCompensation,
                    $"Service credit for outage {outage.Reference} ({service.ServiceReference})",
                    credit.Negate(),
                    SystemActors.OutageCompensation,
                    _clock.UtcNow,
                    sourceReference: outage.Reference));
                credited[accountId] = credited.TryGetValue(accountId, out var total) ? total + credit : credit;
            }
        }

        return credited;
    }

    private async Task<IReadOnlyDictionary<Guid, List<Service>>> AffectedAccountsAsync(IReadOnlyCollection<string> outwardCodes, CancellationToken ct)
    {
        var services = await _services.ListLiveInOutwardCodesAsync(outwardCodes, ct);
        return services.GroupBy(s => s.AccountId).ToDictionary(g => g.Key, g => g.ToList());
    }

    private async Task NotifyAsync(Outage outage, IEnumerable<Guid> accountIds, OutageNotificationKind kind, CustomerMessage message, CancellationToken ct)
    {
        foreach (var accountId in accountIds)
        {
            var account = await _accounts.GetByIdAsync(accountId, ct);
            if (account is null || account.Status == AccountStatus.Closed)
            {
                continue;
            }

            await SendOnceAsync(outage, account, kind, NotificationChannel.Email, () => _notifier.EmailAsync(account, message, ct), ct);
            await SendOnceAsync(outage, account, kind, NotificationChannel.Sms, () => _notifier.SmsAsync(account, message, ct), ct);
        }
    }

    private async Task SendOnceAsync(Outage outage, Account account, OutageNotificationKind kind, NotificationChannel channel, Func<Task<bool>> send, CancellationToken ct)
    {
        if (await _outages.HasNotificationAsync(outage.Id, account.Id, kind, channel, ct))
        {
            return;
        }

        if (await send())
        {
            _outages.AddNotification(new OutageNotification(Guid.NewGuid(), outage.Id, account.Id, kind, channel, _clock.UtcNow));
        }
    }
}
