using Uconnect.Application.Abstractions;
using Uconnect.Application.Appointments;
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Application.Outages;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Dashboard;

public sealed record DashboardDto(
    string AccountNumber,
    string AccountName,
    string AccountStatus,
    AccountBalanceDto Balance,
    InvoiceSummaryDto? LatestInvoice,
    int LiveServices,
    int ServicesWithPendingPlanChange,
    int OpenTickets,
    AppointmentDto? NextAppointment,
    IReadOnlyList<AccountOutageDto> Outages,
    bool AutopayEnabled);

/// <summary>The landing-page snapshot: what is owed, what is happening, and what needs attention.</summary>
public sealed class DashboardService
{
    private readonly AccountAccessGuard _guard;
    private readonly IInvoiceRepository _invoices;
    private readonly IServiceRepository _services;
    private readonly ITicketRepository _tickets;
    private readonly IAppointmentRepository _appointments;
    private readonly IAutopayRepository _autopay;
    private readonly OutageService _outages;
    private readonly IClock _clock;

    public DashboardService(
        AccountAccessGuard guard,
        IInvoiceRepository invoices,
        IServiceRepository services,
        ITicketRepository tickets,
        IAppointmentRepository appointments,
        IAutopayRepository autopay,
        OutageService outages,
        IClock clock)
    {
        _guard = guard;
        _invoices = invoices;
        _services = services;
        _tickets = tickets;
        _appointments = appointments;
        _autopay = autopay;
        _outages = outages;
        _clock = clock;
    }

    public async Task<DashboardDto> GetAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var today = _clock.Today;
        var now = _clock.UtcNow;

        var payable = await _invoices.ListPayableAsync(account.Id, ct);
        var latest = await _invoices.GetLatestIssuedAsync(account.Id, ct);
        var services = await _services.ListByAccountAsync(account.Id, ct);
        var openTickets = await _tickets.ListByAccountAsync(account.Id, openOnly: true, new PageRequest(1, 1), ct);
        var upcoming = await _appointments.ListByAccountAsync(account.Id, upcomingOnly: true, today, ct);
        var autopay = await _autopay.GetByAccountAsync(account.Id, ct);
        var outages = await _outages.ListForAccountAsync(accountNumber, ct);

        return new DashboardDto(
            account.Number.Value,
            account.Name,
            account.Status.ToString(),
            InvoiceService.BuildBalance(payable, account.Currency),
            latest?.ToSummaryDto(today),
            services.Count(s => s.IsLive),
            services.Count(s => s.PendingPlanChangeId is not null),
            openTickets.Total,
            upcoming.Where(a => a.IsActive).OrderBy(a => a.Slot.StartsAtUtc).FirstOrDefault()?.ToDto(now),
            outages,
            autopay?.Enabled == true);
    }
}
