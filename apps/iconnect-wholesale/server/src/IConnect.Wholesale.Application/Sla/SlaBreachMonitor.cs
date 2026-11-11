using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Domain.Sla;
using Microsoft.Extensions.Logging;

namespace IConnect.Wholesale.Application.Sla;

public sealed record SlaSweepResult(int FaultsChecked, int FaultBreaches, int OrdersChecked, int OrderBreaches, int FaultsAutoClosed);

/// <summary>
/// One sweep of the SLA monitor, invoked periodically by the hosted service. Each breach is
/// recorded exactly once on the clock (so repeated sweeps never re-notify), the partner is
/// notified, and resolved faults past the reopen window are closed automatically.
/// </summary>
public sealed class SlaBreachMonitor
{
    public const string SystemActor = "system:sla-monitor";

    private readonly IFaultRepository _faults;
    private readonly IOrderRepository _orders;
    private readonly ICalendarProvider _calendars;
    private readonly IPartnerNotifier _notifier;
    private readonly IClock _clock;
    private readonly IUnitOfWork _uow;
    private readonly ILogger<SlaBreachMonitor> _logger;

    public SlaBreachMonitor(IFaultRepository faults, IOrderRepository orders, ICalendarProvider calendars, IPartnerNotifier notifier,
        IClock clock, IUnitOfWork uow, ILogger<SlaBreachMonitor> logger)
    {
        _faults = faults;
        _orders = orders;
        _calendars = calendars;
        _notifier = notifier;
        _clock = clock;
        _uow = uow;
        _logger = logger;
    }

    public async Task<SlaSweepResult> SweepAsync(CancellationToken ct)
    {
        var now = _clock.UtcNow;
        var faultBreaches = 0;
        var orderBreaches = 0;

        var faults = await _faults.ListWithRunningClocksAsync(ct);
        foreach (var fault in faults)
        {
            var calendar = _calendars.GetByName(fault.RepairClock.CalendarName);
            if (!fault.RepairClock.IsBreached(calendar, now) || !fault.RepairClock.MarkBreachRecorded(now))
            {
                continue;
            }

            faultBreaches++;
            _logger.LogWarning("Fault {Reference} breached its {Target}h repair target ({Priority}/{Care})",
                fault.Reference, fault.RepairClock.Target.TotalHours, fault.Priority, fault.CareLevel);
            await _notifier.NotifyAsync(fault.PartnerId, "fault.sla_breached", new
            {
                faultId = fault.Id,
                reference = fault.Reference,
                priority = fault.Priority.ToString(),
                targetHours = fault.RepairClock.Target.TotalHours,
                breachedAt = now,
            }, ct);
        }

        var orderCalendar = _calendars.Get(SlaPolicy.OrderCalendar);
        var today = orderCalendar.LocalDate(now);
        var orders = await _orders.ListWithRunningClocksAsync(ct);
        foreach (var order in orders)
        {
            var clock = order.DeliveryClock!;
            var pastCommitted = order.CommittedDate is { } committed && today > committed;
            if (!(pastCommitted || clock.IsBreached(orderCalendar, now)) || !clock.MarkBreachRecorded(now))
            {
                continue;
            }

            orderBreaches++;
            _logger.LogWarning("Order {Reference} missed its committed date {Committed}", order.Reference, order.CommittedDate);
            await _notifier.NotifyAsync(order.PartnerId, "order.sla_breached", new
            {
                orderId = order.Id,
                reference = order.Reference,
                partnerReference = order.PartnerReference,
                committedDate = order.CommittedDate,
                breachedAt = now,
            }, ct);
        }

        var autoClosed = 0;
        var closable = await _faults.ListAutoCloseCandidatesAsync(now - Domain.Faults.Fault.ReopenWindow, ct);
        foreach (var fault in closable.Where(f => f.CanAutoClose(now)))
        {
            fault.Close(now, SystemActor);
            autoClosed++;
        }

        await _uow.SaveChangesAsync(ct);
        return new SlaSweepResult(faults.Count, faultBreaches, orders.Count, orderBreaches, autoClosed);
    }
}
