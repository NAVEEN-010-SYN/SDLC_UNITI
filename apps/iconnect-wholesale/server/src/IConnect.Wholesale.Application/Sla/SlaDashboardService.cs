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
        var targets = Enum.GetValues<CareLevel>()
            .SelectMany(care => Enum.GetValues<FaultPriority>().Select(p => _policy.RepairTarget(care, p)))
            .Select(t => new RepairTargetDto(t.CareLevel.ToString(), t.Priority.ToString(), t.Calendar.ToString(), t.Target.TotalHours))
            .ToList();

        var leadTimes = Enum.GetValues<OrderType>()
            .ToDictionary(t => t.ToString().ToUpperInvariant(), t => _policy.OrderLeadTimeWorkingDays(t));

        var terms = Enum.GetValues<CareLevel>()
            .Select(_credits.TermsFor)
            .Select(t => new CreditTermsDto(t.CareLevel.ToString(), t.FaultCreditBpsPerBreachDay, t.FaultCreditCapBps,
                t.LateDeliveryPerDayMinor, t.LateDeliveryMaxDays, t.MissedAppointmentMinor))
            .ToList();

        return new SlaPolicyDto(targets, leadTimes, terms);
    }

    public async Task<SlaSummaryDto> GetSummaryAsync(CancellationToken ct)
    {
        var partner = await _partners.GetAsync(_caller.PartnerId, ct) ?? throw new NotFoundException("Partner", _caller.PartnerId);
        var now = _clock.UtcNow;
        var orderCalendar = _calendars.Get(SlaPolicy.OrderCalendar);
        var today = orderCalendar.LocalDate(now);
        var periodStart = new DateOnly(today.Year, today.Month, 1);

        var items = new List<SlaItemDto>();
        foreach (var status in InFlightOrders)
        {
            await foreach (var order in ScanOrdersAsync(status, ct))
            {
                if (order.DeliveryClock is { } clock)
                {
                    items.Add(ToItem(order.Id, "ORDER", order.Reference, status.ToString(), clock, orderCalendar, now));
                }
            }
        }

        var openOrders = items.Count;
        foreach (var status in OpenFaults)
        {
            await foreach (var fault in ScanFaultsAsync(status, ct))
            {
                var calendar = _calendars.GetByName(fault.RepairClock.CalendarName);
                items.Add(ToItem(fault.Id, "FAULT", fault.Reference, status.ToString(), fault.RepairClock, calendar, now));
            }
        }

        var orders = items.Take(openOrders).ToList();
        var faults = items.Skip(openOrders).ToList();

        var fromInstant = new DateTimeOffset(periodStart.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var credited = await _faults.ListResolvedWithCreditBetweenAsync(partner.Id, fromInstant, now, ct);
        var faultCredits = Money.Sum(credited.Where(f => f.ServiceCredit is not null).Select(f => f.ServiceCredit!.Value), partner.Currency);

        var completed = await _orders.ListCompletedBetweenAsync(partner.Id, periodStart, today, ct);
        var lateCredits = Money.Sum(
            completed.Select(o => _credits.ForLateDelivery(o.CareLevel, o.WorkingDaysLate(orderCalendar), partner.Currency).Amount),
            partner.Currency);

        return new SlaSummaryDto(
            periodStart,
            today,
            orders.Count,
            orders.Count(i => i.SlaStatus == nameof(SlaStatus.AtRisk)),
            orders.Count(i => i.SlaStatus == nameof(SlaStatus.Breached)),
            faults.Count,
            faults.Count(i => i.SlaStatus == nameof(SlaStatus.AtRisk)),
            faults.Count(i => i.SlaStatus == nameof(SlaStatus.Breached)),
            faultCredits.MinorUnits,
            lateCredits.MinorUnits,
            partner.Currency,
            RankForAttention(items));
    }

    /// <summary>Breached items first, then at-risk items soonest-due first; healthy and paused items are omitted.</summary>
    internal static IReadOnlyList<SlaItemDto> RankForAttention(IEnumerable<SlaItemDto> items) => items
        .Where(i => i.SlaStatus is nameof(SlaStatus.Breached) or nameof(SlaStatus.AtRisk))
        .OrderBy(i => i.SlaStatus == nameof(SlaStatus.Breached) ? 0 : 1)
        .ThenBy(i => i.DueAt ?? DateTimeOffset.MaxValue)
        .ThenBy(i => i.Reference, StringComparer.Ordinal)
        .Take(AttentionListSize)
        .ToList();

    private static SlaItemDto ToItem(Guid id, string kind, string reference, string status, SlaClock clock, WorkingCalendar calendar,
        DateTimeOffset now) =>
        new(id, kind, reference, ToScreamingSnake(status), clock.Status(calendar, now).ToString(), clock.DueAt(calendar, now),
            Math.Round(clock.Remaining(calendar, now).TotalHours, 2));

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
            var result = await _orders.QueryAsync(new OrderQuery(_caller.PartnerId, status, null, null, null, null,
                new PageRequest(page, PageRequest.MaxPageSize)), ct);
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
            var result = await _faults.QueryAsync(new FaultQuery(_caller.PartnerId, status, null, new PageRequest(page, PageRequest.MaxPageSize)), ct);
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
