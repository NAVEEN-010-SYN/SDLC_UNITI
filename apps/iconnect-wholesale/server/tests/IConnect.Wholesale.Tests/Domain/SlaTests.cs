using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Sla;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Domain;

public sealed class SlaClockTests
{
    private static readonly DateTimeOffset Start = Calendars.Utc(2024, 1, 8);
    private readonly WorkingCalendar _calendar = Calendars.AlwaysOn();

    private static DateTimeOffset At(double hours) => Start.AddHours(hours);

    [Fact]
    public void Paused_time_is_excluded_from_elapsed()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(10), "24x7");
        clock.Pause(At(2), "awaiting access");
        clock.Resume(At(5));

        Assert.Equal(TimeSpan.FromHours(5), clock.Elapsed(_calendar, At(8)));
        Assert.Equal(TimeSpan.FromHours(5), clock.Remaining(_calendar, At(8)));
        Assert.Equal(SlaStatus.OnTrack, clock.Status(_calendar, At(8)));
    }

    [Fact]
    public void Status_progresses_from_at_risk_to_breached()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(10), "24x7");

        Assert.Equal(SlaStatus.AtRisk, clock.Status(_calendar, At(8)));
        Assert.Equal(SlaStatus.Breached, clock.Status(_calendar, At(11)));
        Assert.Equal(TimeSpan.FromHours(1), clock.Overrun(_calendar, At(11)));
    }

    [Fact]
    public void Stopped_clock_is_met_and_frozen()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(10), "24x7");
        clock.Stop(At(6));

        Assert.Equal(SlaStatus.Met, clock.Status(_calendar, At(30)));
        Assert.Equal(TimeSpan.FromHours(6), clock.Elapsed(_calendar, At(30)));
        Assert.Null(clock.DueAt(_calendar, At(30)));
    }

    [Fact]
    public void Paused_clock_has_no_due_time()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(10), "24x7");
        clock.Pause(At(1), "customer");

        Assert.Equal(SlaStatus.Paused, clock.Status(_calendar, At(2)));
        Assert.Null(clock.DueAt(_calendar, At(2)));
    }

    [Fact]
    public void DueAt_projects_remaining_working_time()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(10), "24x7");
        Assert.Equal(At(10), clock.DueAt(_calendar, At(3)));
    }

    [Fact]
    public void Reopen_excludes_the_stopped_interval()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(10), "24x7");
        clock.Stop(At(6));
        clock.Reopen(At(10));

        Assert.False(clock.IsStopped);
        Assert.Equal(TimeSpan.FromHours(8), clock.Elapsed(_calendar, At(12)));
    }

    [Fact]
    public void Breach_is_recorded_once()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(1), "24x7");
        Assert.True(clock.MarkBreachRecorded(At(2)));
        Assert.False(clock.MarkBreachRecorded(At(3)));
    }

    [Fact]
    public void Pausing_a_stopped_clock_is_rejected()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(1), "24x7");
        clock.Stop(At(1));
        Assert.Equal("sla.stopped", Assert.Throws<DomainException>(() => clock.Pause(At(2), "late")).Code);
    }
}

public sealed class ServiceCreditCalculatorTests
{
    private readonly ServiceCreditCalculator _calculator = ServiceCreditCalculator.Default();

    [Fact]
    public void Fault_credit_counts_started_breach_days()
    {
        var credit = _calculator.ForFaultRepair(CareLevel.Standard, Money.Gbp(2_000), TimeSpan.FromHours(11), TimeSpan.FromHours(10));

        Assert.Equal(2, credit.Units);
        Assert.Equal(200, credit.Amount.MinorUnits);
        Assert.DoesNotContain("capped", credit.Basis, StringComparison.Ordinal);
    }

    [Fact]
    public void Fault_credit_is_capped()
    {
        var credit = _calculator.ForFaultRepair(CareLevel.Standard, Money.Gbp(2_000), TimeSpan.FromHours(200), TimeSpan.FromHours(10));

        Assert.Equal(1_000, credit.Amount.MinorUnits);
        Assert.Contains("capped at 50%", credit.Basis, StringComparison.Ordinal);
    }

    [Fact]
    public void No_overrun_means_no_credit() =>
        Assert.True(_calculator.ForFaultRepair(CareLevel.Premium, Money.Gbp(5_000), TimeSpan.Zero, TimeSpan.FromHours(24)).Amount.IsZero);

    [Fact]
    public void Late_delivery_credit_is_per_working_day_and_capped()
    {
        Assert.Equal(750, _calculator.ForLateDelivery(CareLevel.Standard, 3, "GBP").Amount.MinorUnits);

        var capped = _calculator.ForLateDelivery(CareLevel.Standard, 70, "GBP");
        Assert.Equal(60, capped.Units);
        Assert.Equal(15_000, capped.Amount.MinorUnits);
    }

    [Fact]
    public void Terms_must_cover_every_care_level()
    {
        var partial = new[] { new ServiceCreditTerms(CareLevel.Standard, 1, 1, 1, 1, 1) };
        Assert.Equal("credit.terms_incomplete", Assert.Throws<DomainException>(() => new ServiceCreditCalculator(partial)).Code);
    }

    [Fact]
    public void Default_policy_targets_tighten_with_care_level()
    {
        var policy = SlaPolicy.Default();
        Assert.True(policy.RepairTarget(CareLevel.Premium, FaultPriority.P1).Target < policy.RepairTarget(CareLevel.Standard, FaultPriority.P1).Target);
        Assert.Equal(CalendarKind.AlwaysOn, policy.RepairTarget(CareLevel.Premium, FaultPriority.P3).Calendar);
    }
}
