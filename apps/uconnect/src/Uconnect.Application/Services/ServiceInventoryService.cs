using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.Services;

namespace Uconnect.Application.Services;

/// <summary>Read-side view of the services on an account and the plans each could move to.</summary>
public sealed class ServiceInventoryService
{
    private readonly AccountAccessGuard _guard;
    private readonly IServiceRepository _services;
    private readonly IPlanRepository _plans;
    private readonly ITicketRepository _tickets;
    private readonly IOutageRepository _outages;
    private readonly IClock _clock;

    public ServiceInventoryService(
        AccountAccessGuard guard,
        IServiceRepository services,
        IPlanRepository plans,
        ITicketRepository tickets,
        IOutageRepository outages,
        IClock clock)
    {
        _guard = guard;
        _services = services;
        _plans = plans;
        _tickets = tickets;
        _outages = outages;
        _clock = clock;
    }

    public async Task<IReadOnlyList<ServiceSummaryDto>> ListAsync(string accountNumber, bool includeCancelled, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var services = (await _services.ListByAccountAsync(account.Id, ct))
            .Where(s => includeCancelled || s.Status != ServiceStatus.Cancelled)
            .ToList();
        if (services.Count == 0)
        {
            return Array.Empty<ServiceSummaryDto>();
        }

        var plans = (await _plans.GetManyAsync(services.Select(s => s.PlanId).Distinct(), ct)).ToDictionary(p => p.Id);
        return services
            .OrderBy(s => s.Status == ServiceStatus.Cancelled)
            .ThenBy(s => s.ServiceReference, StringComparer.Ordinal)
            .Select(s => s.ToSummaryDto(plans[s.PlanId]))
            .ToList();
    }

    public async Task<ServiceDetailDto> GetAsync(string accountNumber, Guid serviceId, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var service = await LoadOwnedServiceAsync(account.Id, serviceId, ct);
        var currentPlan = await _plans.GetByIdAsync(service.PlanId, ct)
            ?? throw new NotFoundException("Plan", service.PlanId);

        var options = service.Status == ServiceStatus.Active
            ? await BuildPlanOptionsAsync(account.Type, service, currentPlan, ct)
            : Array.Empty<PlanOptionDto>();

        var openTickets = await _tickets.ListOpenByServiceAsync(service.Id, ct);
        var outages = await _outages.ListCurrentAsync(_clock.UtcNow, ct);
        var affected = outages.Any(o => !o.IsResolved && o.Affects(service.ServiceAddress));

        return new ServiceDetailDto(
            service.ToSummaryDto(currentPlan),
            service.RemainingContractMonths(_clock.Today),
            options,
            openTickets.Count,
            affected);
    }

    /// <summary>Loads a service and confirms it belongs to the account; otherwise reports not found.</summary>
    internal async Task<Service> LoadOwnedServiceAsync(Guid accountId, Guid serviceId, CancellationToken ct)
    {
        var service = await _services.GetByIdAsync(serviceId, ct);
        if (service is null || service.AccountId != accountId)
        {
            throw new NotFoundException("Service", serviceId);
        }

        return service;
    }

    private async Task<IReadOnlyList<PlanOptionDto>> BuildPlanOptionsAsync(AccountType accountType, Service service, Plan currentPlan, CancellationToken ct)
    {
        var candidates = await _plans.ListActiveAsync(service.ProductType, ct);
        return candidates
            .Where(p => p.Id != currentPlan.Id && p.IsAvailableTo(accountType) && p.MonthlyPrice.Currency == service.MonthlyPrice.Currency)
            .OrderBy(p => p.Tier)
            .ThenBy(p => p.MonthlyPrice.AmountMinor)
            .Select(p => new PlanOptionDto(
                p.ToDto(),
                currentPlan.ClassifyChangeTo(p).ToString(),
                (p.MonthlyPrice - service.MonthlyPrice).ToDto()))
            .ToList();
    }
}
