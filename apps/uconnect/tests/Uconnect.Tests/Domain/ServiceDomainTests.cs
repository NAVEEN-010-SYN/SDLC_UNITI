using Uconnect.Domain.Appointments;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Payments;
using Uconnect.Domain.Tickets;
using Uconnect.Domain.Usage;
using static Uconnect.Tests.TestData;

namespace Uconnect.Tests.Domain;

public sealed class TicketTests
{
    private static Ticket NewTicket(TicketPriority priority = TicketPriority.P2) =>
        new(Guid.NewGuid(), "TKT-000001", Guid.NewGuid(), null, TicketCategory.Fault, priority, "No internet", "Router lights red", Guid.NewGuid(), Now);

    [Fact]
    public void Sla_clock_pauses_while_waiting_on_the_customer()
    {
        var ticket = NewTicket();
        var dueBefore = ticket.ResolutionDueAt;

        ticket.AwaitCustomer(Now.AddHours(1));
        ticket.AddCustomerComment(Guid.NewGuid(), "Customer", "Here are the details", Now.AddHours(6));

        Assert.Equal(TicketStatus.InProgress, ticket.Status);
        Assert.Equal(dueBefore.AddHours(5), ticket.ResolutionDueAt);
    }

    [Fact]
    public void Internal_notes_do_not_satisfy_first_response()
    {
        var ticket = NewTicket();

        ticket.AddAgentComment(Guid.NewGuid(), "Agent", "Checking line test", isInternal: true, Now.AddMinutes(5));
        Assert.Null(ticket.FirstRespondedAt);

        ticket.AddAgentComment(Guid.NewGuid(), "Agent", "We're looking into it", isInternal: false, Now.AddMinutes(10));
        Assert.Equal(Now.AddMinutes(10), ticket.FirstRespondedAt);
    }

    [Fact]
    public void Resolved_ticket_can_only_be_reopened_inside_the_window()
    {
        var ticket = NewTicket();
        ticket.Resolve("Replaced router", Now);

        var ex = Assert.Throws<DomainException>(() =>
            ticket.Reopen("Still down", Guid.NewGuid(), "Customer", Now.AddDays(Ticket.ReopenWindowDays + 1)));
        Assert.Equal("ticket.reopen_window_passed", ex.Code);
        Assert.True(ticket.IsDueForAutoClose(Now.AddDays(Ticket.ReopenWindowDays + 1)));
    }

    [Theory]
    [InlineData(true, true, false, TicketPriority.P1)]
    [InlineData(true, false, false, TicketPriority.P2)]
    [InlineData(true, true, true, TicketPriority.P3)]
    [InlineData(false, false, false, TicketPriority.P3)]
    public void Fault_triage(bool serviceDown, bool business, bool inOutage, TicketPriority expected) =>
        Assert.Equal(expected, TicketTriage.DeterminePriority(TicketCategory.Fault, serviceDown, business, inOutage));
}

public sealed class OutageCompensationPolicyTests
{
    [Fact]
    public void Business_credit_is_five_percent_per_block_after_the_first_and_capped()
    {
        Assert.Equal(0, OutageCompensationPolicy.CalculateCredit(AccountType.Business, OutageSeverity.Major, Gbp(100_00), TimeSpan.FromHours(4)).AmountMinor);
        Assert.Equal(5_00, OutageCompensationPolicy.CalculateCredit(AccountType.Business, OutageSeverity.Major, Gbp(100_00), TimeSpan.FromHours(4.5)).AmountMinor);
        Assert.Equal(50_00, OutageCompensationPolicy.CalculateCredit(AccountType.Business, OutageSeverity.Critical, Gbp(100_00), TimeSpan.FromDays(10)).AmountMinor);
    }

    [Fact]
    public void Consumer_credit_starts_after_the_grace_period()
    {
        Assert.True(OutageCompensationPolicy.CalculateCredit(AccountType.Consumer, OutageSeverity.Major, Gbp(30_00), TimeSpan.FromHours(47)).IsZero);
        Assert.Equal(1_00, OutageCompensationPolicy.CalculateCredit(AccountType.Consumer, OutageSeverity.Major, Gbp(30_00), TimeSpan.FromHours(49)).AmountMinor);
    }

    [Fact]
    public void Minor_degradation_attracts_no_credit() =>
        Assert.True(OutageCompensationPolicy.CalculateCredit(AccountType.Business, OutageSeverity.Minor, Gbp(100_00), TimeSpan.FromDays(3)).IsZero);
}

public sealed class AutopaySettingsTests
{
    [Fact]
    public void Charges_balance_from_the_collection_date_and_respects_the_ceiling()
    {
        var account = Account();
        var card = Card(account.Id);
        var settings = new AutopaySettings(Guid.NewGuid(), account.Id);
        settings.Enable(card, daysBeforeDue: 3, maxAmount: Gbp(100_00), Today, Now);
        var invoice = IssuedInvoice(account.Id, 50_00, new DateOnly(2026, 11, 1));

        Assert.Equal("not_yet_due", settings.Evaluate(invoice, new DateOnly(2026, 11, 11)).SkipReason);
        var decision = settings.Evaluate(invoice, new DateOnly(2026, 11, 12));
        Assert.True(decision.ShouldCharge);
        Assert.Equal(60_00, decision.Amount!.AmountMinor);

        var large = IssuedInvoice(account.Id, 100_00, new DateOnly(2026, 11, 1), "INV-202611-000002");
        Assert.Equal("above_max_amount", settings.Evaluate(large, new DateOnly(2026, 11, 12)).SkipReason);
    }

    [Fact]
    public void Suspends_after_repeated_failures()
    {
        var account = Account();
        var settings = new AutopaySettings(Guid.NewGuid(), account.Id);
        settings.Enable(Card(account.Id), 0, null, Today, Now);

        Assert.False(settings.RecordFailure(Now));
        Assert.False(settings.RecordFailure(Now));
        Assert.True(settings.RecordFailure(Now));
        Assert.False(settings.Enabled);
    }
}

public sealed class AppointmentSchedulingPolicyTests
{
    private static readonly IReadOnlySet<DateOnly> NoHolidays = new HashSet<DateOnly>();

    [Fact]
    public void Installation_lead_time_counts_working_days_only()
    {
        // Wednesday 11 Nov 2026 + 5 working days = Wednesday 18 Nov.
        Assert.Equal(new DateOnly(2026, 11, 18), AppointmentSchedulingPolicy.EarliestBookableDate(AppointmentType.Installation, new DateOnly(2026, 11, 11), NoHolidays));
    }

    [Fact]
    public void Saturdays_offer_mornings_only_and_holidays_nothing()
    {
        var saturday = new DateOnly(2026, 11, 21);
        Assert.Equal(new[] { AppointmentWindow.Morning }, AppointmentSchedulingPolicy.WindowsOffered(AppointmentType.Repair, saturday, NoHolidays));
        Assert.Empty(AppointmentSchedulingPolicy.WindowsOffered(AppointmentType.Repair, new DateOnly(2026, 12, 25), new HashSet<DateOnly> { new(2026, 12, 25) }));
    }

    [Fact]
    public void All_day_window_is_only_for_installations()
    {
        var monday = new DateOnly(2026, 11, 23);
        Assert.Contains(AppointmentWindow.AllDay, AppointmentSchedulingPolicy.WindowsOffered(AppointmentType.Installation, monday, NoHolidays));
        Assert.DoesNotContain(AppointmentWindow.AllDay, AppointmentSchedulingPolicy.WindowsOffered(AppointmentType.Repair, monday, NoHolidays));
    }
}

public sealed class FairUsePolicyTests
{
    [Fact]
    public void Overage_is_charged_per_started_gigabyte()
    {
        var plan = Plan("BIZ-500");
        plan.ConfigureFairUse(100, Gbp(50));
        var serviceId = Guid.NewGuid();
        var period = new BillingPeriod(new DateOnly(2026, 10, 1), new DateOnly(2026, 11, 1));
        var records = new[]
        {
            new UsageRecord(Guid.NewGuid(), serviceId, new DateOnly(2026, 10, 5), 80 * UsageRecord.BytesPerGigabyte, 0, Now),
            new UsageRecord(Guid.NewGuid(), serviceId, new DateOnly(2026, 10, 6), 20 * UsageRecord.BytesPerGigabyte, 1, Now),
            new UsageRecord(Guid.NewGuid(), serviceId, new DateOnly(2026, 11, 1), 500 * UsageRecord.BytesPerGigabyte, 0, Now),
        };

        var summary = FairUsePolicy.Summarise(serviceId, period, plan, records);

        Assert.Equal(FairUseState.Exceeded, summary.State);
        Assert.Equal(1, summary.Charge!.ExcessGb);
        Assert.Equal(50, summary.Charge.Amount.AmountMinor);
    }
}
