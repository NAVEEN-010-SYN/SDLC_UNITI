using IConnect.Wholesale.Domain.Appointments;
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Partners;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Domain;

public sealed class DisputeTests
{
    private static readonly DateTimeOffset IssuedAt = Calendars.Utc(2024, 5, 3, 9);

    private static (BillingStatement Statement, StatementLine Charge) IssuedStatement()
    {
        var statement = new BillingStatement("STM-00000001", Guid.NewGuid(), new DateOnly(2024, 4, 1), new DateOnly(2024, 4, 30), "GBP");
        var charge = statement.AddLine(ChargeType.Connection, "Provide 1 completed", Money.Gbp(6_000), "ORD-1");
        statement.AddLine(ChargeType.LateDeliveryCredit, "Late delivery", Money.Gbp(500), "ORD-1");
        statement.Issue(IssuedAt);
        return (statement, charge);
    }

    [Fact]
    public void Credits_are_stored_as_negative_lines()
    {
        var (statement, _) = IssuedStatement();
        Assert.Equal(6_000, statement.Charges.MinorUnits);
        Assert.Equal(-500, statement.Credits.MinorUnits);
        Assert.Equal(5_500, statement.Total.MinorUnits);
        Assert.Equal(new DateOnly(2024, 6, 2), statement.DueDate);
    }

    [Fact]
    public void Raising_a_dispute_marks_the_statement_disputed()
    {
        var (statement, charge) = IssuedStatement();
        var dispute = Dispute.Raise("DSP-1", statement, new[] { charge.Id }, "Connection was never completed at this premise.",
            Money.Gbp(6_000), IssuedAt.AddDays(5));

        Assert.True(dispute.IsOpen);
        Assert.Equal(StatementStatus.Disputed, statement.Status);
        Assert.Throws<DomainException>(() => statement.MarkSettled(IssuedAt.AddDays(6)));
    }

    [Fact]
    public void Claim_cannot_exceed_the_disputed_lines()
    {
        var (statement, charge) = IssuedStatement();
        var ex = Assert.Throws<DomainException>(() => Dispute.Raise("DSP-1", statement, new[] { charge.Id },
            "Connection was never completed at this premise.", Money.Gbp(6_001), IssuedAt.AddDays(5)));
        Assert.Equal("dispute.invalid_claim", ex.Code);
    }

    [Fact]
    public void Disputes_must_be_raised_within_the_window()
    {
        var (statement, charge) = IssuedStatement();
        var ex = Assert.Throws<DomainException>(() => Dispute.Raise("DSP-1", statement, new[] { charge.Id },
            "Connection was never completed at this premise.", Money.Gbp(100), IssuedAt.AddDays(Dispute.DisputeWindowDays + 1)));
        Assert.Equal("dispute.window_closed", ex.Code);
    }

    [Theory]
    [InlineData(0, DisputeStatus.Rejected)]
    [InlineData(2_000, DisputeStatus.PartiallyUpheld)]
    [InlineData(6_000, DisputeStatus.Upheld)]
    public void Decision_status_follows_the_award(long awarded, DisputeStatus expected)
    {
        var (statement, charge) = IssuedStatement();
        var dispute = Dispute.Raise("DSP-1", statement, new[] { charge.Id }, "Connection was never completed at this premise.",
            Money.Gbp(6_000), IssuedAt.AddDays(1));
        dispute.Decide(Money.Gbp(awarded), "Reviewed engineer job notes.", IssuedAt.AddDays(10));
        Assert.Equal(expected, dispute.Status);
    }
}

public sealed class AppointmentSlotTests
{
    private static readonly DateTimeOffset Now = Calendars.Utc(2024, 1, 8, 10);

    [Fact]
    public void Reserve_is_idempotent_per_order()
    {
        var slot = new AppointmentSlot("LDN01", new DateOnly(2024, 1, 15), SlotBand.Am, 1);
        var order = Guid.NewGuid();

        var first = slot.Reserve(order, Now);
        var second = slot.Reserve(order, Now.AddMinutes(1));

        Assert.Same(first, second);
        Assert.Equal(0, slot.Remaining(Now));
    }

    [Fact]
    public void Full_slot_refuses_further_reservations()
    {
        var slot = new AppointmentSlot("LDN01", new DateOnly(2024, 1, 15), SlotBand.Pm, 1);
        slot.Reserve(Guid.NewGuid(), Now);
        Assert.Equal("slot.full", Assert.Throws<DomainException>(() => slot.Reserve(Guid.NewGuid(), Now)).Code);
    }

    [Fact]
    public void Lapsed_holds_release_capacity_but_confirmed_ones_do_not()
    {
        var slot = new AppointmentSlot("LDN01", new DateOnly(2024, 1, 15), SlotBand.AllDay, 2);
        var confirmed = Guid.NewGuid();
        slot.Reserve(confirmed, Now);
        slot.Confirm(confirmed, Now.AddMinutes(5));
        slot.Reserve(Guid.NewGuid(), Now);

        var later = Now + AppointmentSlot.ReservationHold + TimeSpan.FromMinutes(1);
        Assert.Equal(1, slot.Remaining(later));
    }

    [Fact]
    public void Confirming_an_expired_hold_fails()
    {
        var slot = new AppointmentSlot("LDN01", new DateOnly(2024, 1, 15), SlotBand.Am, 1);
        var order = Guid.NewGuid();
        slot.Reserve(order, Now);
        var ex = Assert.Throws<DomainException>(() => slot.Confirm(order, Now + AppointmentSlot.ReservationHold));
        Assert.Equal("slot.reservation_expired", ex.Code);
    }
}

public sealed class IdentifierTests
{
    [Theory]
    [InlineData("sw1a1aa", "SW1A 1AA")]
    [InlineData(" m1 1ae ", "M1 1AE")]
    [InlineData("EC1A 1BB", "EC1A 1BB")]
    public void Postcodes_are_normalised(string input, string expected) => Assert.Equal(expected, Postcodes.Normalise(input));

    [Theory]
    [InlineData("12345")]
    [InlineData("SW1")]
    [InlineData("")]
    public void Invalid_postcodes_are_rejected(string input) => Assert.False(Postcodes.IsValid(input));

    [Fact]
    public void Uprn_leading_zeros_are_insignificant() => Assert.Equal("12345", Uprns.Normalise("0012345"));

    [Theory]
    [InlineData("0000")]
    [InlineData("1234567890123")]
    [InlineData("12a")]
    public void Invalid_uprns_are_rejected(string input) => Assert.False(Uprns.IsValid(input));

    [Fact]
    public void Partner_account_numbers_follow_the_platform_format()
    {
        Assert.Equal("partner.invalid_account", Assert.Throws<DomainException>(() => new Partner("Acme", "ACC-123", "GBP", 10)).Code);
        Assert.True(new Partner("Acme", "ACC-12345678", "GBP", 10).CanTrade);
    }
}
