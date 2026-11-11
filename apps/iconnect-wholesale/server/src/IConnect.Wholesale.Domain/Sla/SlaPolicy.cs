using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Orders;

namespace IConnect.Wholesale.Domain.Sla;

/// <summary>
/// Wholesale care level purchased per service. It selects the calendar against which fault
/// repair clocks run and the service-credit regime that applies on breach.
/// </summary>
public enum CareLevel
{
    Standard,
    Enhanced,
    Premium,
}

public enum CalendarKind
{
    BusinessHours,
    ExtendedHours,
    AlwaysOn,
}

/// <summary>Repair target for a fault at a given care level and priority.</summary>
public sealed record FaultRepairTarget(CareLevel CareLevel, FaultPriority Priority, CalendarKind Calendar, TimeSpan Target);

/// <summary>
/// The contractual SLA schedule. Kept as data so it can be loaded from configuration and
/// unit-tested; the defaults mirror the published wholesale contract schedule.
/// </summary>
public sealed class SlaPolicy
{
    private readonly Dictionary<(CareLevel, FaultPriority), FaultRepairTarget> _faultTargets;
    private readonly Dictionary<OrderType, int> _orderLeadTimeWorkingDays;

    public SlaPolicy(IEnumerable<FaultRepairTarget> faultTargets, IReadOnlyDictionary<OrderType, int> orderLeadTimes)
    {
        _faultTargets = faultTargets.ToDictionary(t => (t.CareLevel, t.Priority));
        _orderLeadTimeWorkingDays = orderLeadTimes.ToDictionary(kv => kv.Key, kv => kv.Value);

        foreach (var care in Enum.GetValues<CareLevel>())
        {
            foreach (var priority in Enum.GetValues<FaultPriority>())
            {
                if (!_faultTargets.ContainsKey((care, priority)))
                {
                    throw new DomainException("sla.policy_incomplete", $"No repair target for {care}/{priority}.");
                }
            }
        }

        foreach (var type in Enum.GetValues<OrderType>())
        {
            if (!_orderLeadTimeWorkingDays.ContainsKey(type))
            {
                throw new DomainException("sla.policy_incomplete", $"No lead time for {type} orders.");
            }
        }
    }

    public static SlaPolicy Default()
    {
        var targets = new List<FaultRepairTarget>();
        void Add(CareLevel care, CalendarKind cal, double p1, double p2, double p3, double p4)
        {
            targets.Add(new(care, FaultPriority.P1, cal, TimeSpan.FromHours(p1)));
            targets.Add(new(care, FaultPriority.P2, cal, TimeSpan.FromHours(p2)));
            targets.Add(new(care, FaultPriority.P3, cal, TimeSpan.FromHours(p3)));
            targets.Add(new(care, FaultPriority.P4, cal, TimeSpan.FromHours(p4)));
        }

        Add(CareLevel.Standard, CalendarKind.BusinessHours, 10, 20, 30, 50);
        Add(CareLevel.Enhanced, CalendarKind.ExtendedHours, 6, 12, 20, 40);
        Add(CareLevel.Premium, CalendarKind.AlwaysOn, 4, 8, 16, 32);

        var leadTimes = new Dictionary<OrderType, int>
        {
            [OrderType.Provide] = 10,
            [OrderType.Cease] = 5,
            [OrderType.Modify] = 3,
            [OrderType.Migrate] = 7,
        };

        return new SlaPolicy(targets, leadTimes);
    }

    public FaultRepairTarget RepairTarget(CareLevel careLevel, FaultPriority priority) => _faultTargets[(careLevel, priority)];

    public int OrderLeadTimeWorkingDays(OrderType type) => _orderLeadTimeWorkingDays[type];

    public static CalendarKind OrderCalendar => CalendarKind.BusinessHours;
}
