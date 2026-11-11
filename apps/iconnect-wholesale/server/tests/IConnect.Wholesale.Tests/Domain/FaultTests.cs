using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Sla;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Domain;

public sealed class FaultTests
{
    private static readonly DateTimeOffset Raised = Calendars.Utc(2024, 3, 4);
    private static readonly FaultRepairTarget FourHours = new(CareLevel.Standard, FaultPriority.P2, CalendarKind.AlwaysOn, TimeSpan.FromHours(4));
    private readonly WorkingCalendar _calendar = Calendars.AlwaysOn();
    private readonly ServiceCreditCalculator _credits = ServiceCreditCalculator.Default();

    private static Fault Raise(FaultPriority priority = FaultPriority.P2, FaultCategory category = FaultCategory.IntermittentService) =>
        Fault.Raise("FLT-00000001", Guid.NewGuid(), Guid.NewGuid(), "100012345678", priority, category, CareLevel.Standard,
            "Line drops every evening around 8pm", Money.Gbp(3_000), FourHours, "24x7", Raised);

    [Fact]
    public void Total_loss_of_service_is_at_least_p2() =>
        Assert.Equal(FaultPriority.P2, Raise(FaultPriority.P4, FaultCategory.TotalLossOfService).Priority);

    [Fact]
    public void Short_descriptions_are_rejected()
    {
        var ex = Assert.Throws<DomainException>(() => Fault.Raise("FLT-1", Guid.NewGuid(), Guid.NewGuid(), "1", FaultPriority.P3,
            FaultCategory.Other, CareLevel.Standard, "broken", Money.Gbp(1), FourHours, "24x7", Raised));
        Assert.Equal("fault.description_too_short", ex.Code);
    }

    [Fact]
    public void Late_resolution_assesses_a_credit_and_raises_an_event()
    {
        var fault = Raise();
        fault.StartWork(Raised.AddHours(1), "engineer");
        fault.Resolve(Raised.AddHours(30), "engineer", "ONT_REPLACED", _calendar, _credits);

        // 26h overrun on a 24h nominal day = 2 started breach days x 5% of 30.00 GBP.
        Assert.Equal(300, fault.ServiceCredit!.Value.MinorUnits);
        var assessed = Assert.Single(fault.DomainEvents.OfType<FaultCreditAssessed>());
        Assert.Equal(fault.Reference, assessed.Reference);
    }

    [Fact]
    public void Time_awaiting_the_customer_does_not_count()
    {
        var fault = Raise();
        fault.AwaitCustomer(Raised.AddHours(1), "engineer", "need access");
        fault.CustomerResponded(Raised.AddHours(5), "partner", "access granted");
        fault.Resolve(Raised.AddHours(6), "engineer", "FIXED", _calendar, _credits);

        Assert.Equal(TimeSpan.FromHours(2), fault.RepairClock.Elapsed(_calendar, Raised.AddHours(6)));
        Assert.Null(fault.ServiceCredit);
    }

    [Fact]
    public void Reopen_within_window_clears_resolution()
    {
        var fault = Raise();
        fault.Resolve(Raised.AddHours(2), "engineer", "FIXED", _calendar, _credits);
        fault.Reopen(Raised.AddDays(2), "partner", "still dropping");

        Assert.Equal(FaultStatus.InProgress, fault.Status);
        Assert.Null(fault.ResolvedAt);
        Assert.False(fault.RepairClock.IsStopped);
    }

    [Fact]
    public void Reopen_after_window_is_refused()
    {
        var fault = Raise();
        fault.Resolve(Raised.AddHours(2), "engineer", "FIXED", _calendar, _credits);
        Assert.Equal("fault.reopen_window_closed",
            Assert.Throws<DomainException>(() => fault.Reopen(Raised.AddDays(9), "partner", "again")).Code);
        Assert.True(fault.CanAutoClose(Raised.AddDays(9)));
    }

    [Fact]
    public void Closed_faults_cannot_take_notes()
    {
        var fault = Raise();
        fault.Resolve(Raised.AddHours(2), "engineer", "FIXED", _calendar, _credits);
        fault.Close(Raised.AddHours(3), "partner");
        Assert.Equal("fault.closed", Assert.Throws<DomainException>(() => fault.AddNote(Raised.AddHours(4), "p", "hello", false)).Code);
    }

    [Fact]
    public void Open_fault_cannot_close_directly() =>
        Assert.Throws<InvalidTransitionException>(() => Raise().Close(Raised.AddHours(1), "partner"));
}
