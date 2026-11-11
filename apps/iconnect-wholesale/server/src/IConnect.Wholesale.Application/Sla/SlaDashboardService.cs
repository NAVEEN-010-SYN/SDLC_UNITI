using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Sla;

public sealed record SlaItemDto(Guid Id, string Kind, string Reference, string Status, string SlaStatus, DateTimeOffset? DueAt,
    double RemainingWorkingHours);

public sealed record SlaSummaryDto(
    DateOnly PeriodStart,
    DateOnly AsOf,
    int OpenOrders,
    int OrdersAtRisk,
    int OrdersBreached,
    int OpenFaults,
    int FaultsAtRisk,
    int FaultsBreached,
    long FaultCreditsMinor,
    long LateDeliveryCreditsMinor,
    string Currency,
    IReadOnlyList<SlaItemDto> Attention);

public sealed record RepairTargetDto(string CareLevel, string Priority, string Calendar, double TargetHours);

public sealed record CreditTermsDto(string CareLevel, int FaultCreditBpsPerBreachDay, int FaultCreditCapBps, long LateDeliveryPerDayMinor,
    int LateDeliveryMaxDays, long MissedAppointmentMinor);

public sealed record SlaPolicyDto(IReadOnlyList<RepairTargetDto> RepairTargets, IReadOnlyDictionary<string, int> OrderLeadTimeWorkingDays,
    IReadOnlyList<CreditTermsDto> CreditTerms);

/// <summary>
/// Partner-facing SLA view: the contractual schedule, live at-risk/breached counts for in-flight
/// orders and open faults, and the service credits accrued in the current month so far.
/// </summary>
public sealed class SlaDashboardService
{
    /// <summary>Upper bound on records scanned per status so a dashboard request stays bounded.</summary>
    internal const int MaxScanPerStatus = 2_000;
    internal const int AttentionListSize = 20;

    private static readonly OrderStatus[] InFlightOrders = { OrderStatus.Validated, OrderStatus.Provisioning };
    private static readonly FaultStatus[] OpenFaults = { FaultStatus.Open, FaultStatus.InProgress, FaultStatus.PendingCustomer };

    private readonly IOrderRepository _orders;
    private readonly IFaultRepository _faults;
    private readonly IPartnerRepository _partners;
    private readonly ICalendarProvider _calendars;
    private readonly SlaPolicy _policy;
    private readonly ServiceCreditCalculator _credits;
    private readonly ICurrentCaller _caller;
    private readonly IClock _clock;

    public SlaDashboardService(IOrderRepository orders, IFaultRepository faults, IPartnerRepository partners, ICalendarProvider calendars,
        SlaPolicy policy, ServiceCreditCalculator credits, ICurrentCaller caller, IClock clock)
    {
        _orders = orders;
        _faults = faults;
        _partners = partners;
        _calendars = calendars;
        _policy = policy;
        _credits = credits;
        _caller = caller;
        _clock = clock;
    }

    public SlaPolicyDto GetPolicy()
    {
        var targets = new List<RepairTargetDto>();
        foreach (var care in Enum.GetValues<CareLevel>())
        {
            foreach (var priority in Enum.GetValues<FaultPriority>())
            {
                var t = _policy.RepairTarget(care, priority);
                targets.Add(new RepairTargetDto(t.CareLevel.ToString(), t.Priority.ToString(), t.Calendar.ToString(), t.Target.TotalHours));
            }
        }

        var leadTimes = new Dictionary<string, int>();
        foreach (var type in Enum.GetValues<OrderType>())
        {
            leadTimes[type.ToString().ToUpperInvariant()] = _policy.OrderLeadTimeWorkingDays(type);
        }

        var terms = new List<CreditTermsDto>();
        foreach (var care in Enum.GetValues<CareLevel>())
        {
            var t = _credits.TermsFor(care);
            terms.Add(new CreditTermsDto(t.CareLevel.ToString(), t.FaultCreditBpsPerBreachDay, t.FaultCreditCapBps,
                t.LateDeliveryPerDayMinor, t.LateDeliveryMaxDays, t.MissedAppointmentMinor));
        }

        return new SlaPolicyDto(targets, leadTimes, terms);
    }

    public async Task<SlaSummaryDto> GetSummaryAsync(CancellationToken ct)
    {
        var partner = await _partners.GetAsync(_caller.PartnerId, ct);
        if (partner is null)
        {
            throw new NotFoundException("Partner", _caller.PartnerId);
        }

        var now = _clock.UtcNow;
        var orderCalendar = _calendars.Get(SlaPolicy.OrderCalendar);
        var today = orderCalendar.LocalDate(now);
        var periodStart = new DateOnly(today.Year, today.Month, 1);

        var orders = await CollectOrderItemsAsync(orderCalendar, now, ct);
        var faults = await CollectFaultItemsAsync(now, ct);
        var allItems = new List<SlaItemDto>(orders);
        allItems.AddRange(faults);

        var fromInstant = new DateTimeOffset(periodStart.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var faultCredits = await SumFaultCreditsAsync(partner.Id, partner.Currency, fromInstant, now, ct);
        var lateCredits = await SumLateDeliveryCreditsAsync(partner.Id, partner.Currency, periodStart, today, orderCalendar, ct);

        return new SlaSummaryDto(
            periodStart,
            today,
            orders.Count,
            CountWithStatus(orders, SlaStatus.AtRisk),
            CountWithStatus(orders, SlaStatus.Breached),
            faults.Count,
            CountWithStatus(faults, SlaStatus.AtRisk),
            CountWithStatus(faults, SlaStatus.Breached),
            faultCredits.MinorUnits,
            lateCredits.MinorUnits,
            partner.Currency,
            RankForAttention(allItems));
    }

    private async Task<List<SlaItemDto>> CollectOrderItemsAsync(WorkingCalendar orderCalendar, DateTimeOffset now, CancellationToken ct)
    {
        var items = new List<SlaItemDto>();
        foreach (var status in InFlightOrders)
        {
            await foreach (var order in ScanOrdersAsync(status, ct))
            {
                if (order.DeliveryClock is not null)
                {
                    items.Add(ToItem(order.Id, "ORDER", order.Reference, status.ToString(), order.DeliveryClock, orderCalendar, now));
                }
            }
        }

        return items;
    }

    private async Task<List<SlaItemDto>> CollectFaultItemsAsync(DateTimeOffset now, CancellationToken ct)
    {
        var items = new List<SlaItemDto>();
        foreach (var status in OpenFaults)
        {
            await foreach (var fault in ScanFaultsAsync(status, ct))
            {
                var calendar = _calendars.GetByName(fault.RepairClock.CalendarName);
                items.Add(ToItem(fault.Id, "FAULT", fault.Reference, status.ToString(), fault.RepairClock, calendar, now));
            }
        }

        return items;
    }

    private async Task<Money> SumFaultCreditsAsync(Guid partnerId, string currency, DateTimeOffset from, DateTimeOffset now, CancellationToken ct)
    {
        var credited = await _faults.ListResolvedWithCreditBetweenAsync(partnerId, from, now, ct);
        var amounts = new List<Money>();
        foreach (var f in credited)
        {
            if (f.ServiceCredit is not null)
            {
                amounts.Add(f.ServiceCredit.Value);
            }
        }

        return Money.Sum(amounts, currency);
    }

    private async Task<Money> SumLateDeliveryCreditsAsync(Guid partnerId, string currency, DateOnly periodStart, DateOnly today,
        WorkingCalendar orderCalendar, CancellationToken ct)
    {
        var completed = await _orders.ListCompletedBetweenAsync(partnerId, periodStart, today, ct);
        var amounts = new List<Money>();
        foreach (var o in completed)
        {
            amounts.Add(_credits.ForLateDelivery(o.CareLevel, o.WorkingDaysLate(orderCalendar), currency).Amount);
        }

        return Money.Sum(amounts, currency);
    }

    private static int CountWithStatus(List<SlaItemDto> items, SlaStatus status)
    {
        var name = status.ToString();
        var count = 0;
        foreach (var item in items)
        {
            if (item.SlaStatus == name)
            {
                count++;
            }
        }

        return count;
    }

    /// <summary>Breached items first, then at-risk items soonest-due first; healthy and paused items are omitted.</summary>
    internal static IReadOnlyList<SlaItemDto> RankForAttention(IEnumerable<SlaItemDto> items)
    {
        var flagged = new List<SlaItemDto>();
        foreach (var item in items)
        {
            if (item.SlaStatus == nameof(SlaStatus.Breached) || item.SlaStatus == nameof(SlaStatus.AtRisk))
            {
                flagged.Add(item);
            }
        }

        var ranked = flagged
            .OrderBy(i => i.SlaStatus == nameof(SlaStatus.Breached) ? 0 : 1)
            .ThenBy(i => i.DueAt ?? DateTimeOffset.MaxValue)
            .ThenBy(i => i.Reference, StringComparer.Ordinal);
        return ranked.Take(AttentionListSize).ToList();
    }

    private static SlaItemDto ToItem(Guid id, string kind, string reference, string status, SlaClock clock, WorkingCalendar calendar,
        DateTimeOffset now)
    {
        var remainingHours = Math.Round(clock.Remaining(calendar, now).TotalHours, 2);
        return new SlaItemDto(id, kind, reference, ToScreamingSnake(status), clock.Status(calendar, now).ToString(),
            clock.DueAt(calendar, now), remainingHours);
    }

    /// <summary>"PendingCustomer" becomes "PENDING_CUSTOMER", matching the wire format of the other endpoints.</summary>
    internal static string ToScreamingSnake(string pascal)
    {
        var sb = new System.Text.StringBuilder(pascal.Length + 4);
        for (var i = 0; i < pascal.Length; i++)
        {
            if (i > 0 && char.IsUpper(pascal[i]))
            {
                sb.Append('_');
            }

            sb.Append(char.ToUpperInvariant(pascal[i]));
        }

        return sb.ToString();
    }

    private async IAsyncEnumerable<Order> ScanOrdersAsync(OrderStatus status, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var scanned = 0;
        for (var page = 1; scanned < MaxScanPerStatus; page++)
        {
            var pageRequest = new PageRequest(page, PageRequest.MaxPageSize);
            var query = new OrderQuery(_caller.PartnerId, status, null, null, null, null, pageRequest);
            var result = await _orders.QueryAsync(query, ct);
            foreach (var order in result.Items)
            {
                yield return order;
            }

            scanned += result.Items.Count;
            if (result.Items.Count < result.PageSize || scanned >= result.Total)
            {
                yield break;
            }
        }
    }

    private async IAsyncEnumerable<Fault> ScanFaultsAsync(FaultStatus status, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var scanned = 0;
        for (var page = 1; scanned < MaxScanPerStatus; page++)
        {
            var pageRequest = new PageRequest(page, PageRequest.MaxPageSize);
            var result = await _faults.QueryAsync(new FaultQuery(_caller.PartnerId, status, null, pageRequest), ct);
            foreach (var fault in result.Items)
            {
                yield return fault;
            }

            scanned += result.Items.Count;
            if (result.Items.Count < result.PageSize || scanned >= result.Total)
            {
                yield break;
            }
        }
    }
}
