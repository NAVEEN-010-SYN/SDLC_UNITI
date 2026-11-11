using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Domain;

public sealed class OrderTests
{
    [Fact]
    public void Provide_without_product_is_rejected()
    {
        var ex = Assert.Throws<DomainException>(() => Order.CreateDraft("ORD-1", Guid.NewGuid(), "R1", OrderType.Provide, "1", null,
            default, null, null, new DateOnly(2024, 2, 1), Orders.PlacedAt));
        Assert.Equal("order.product_required", ex.Code);
    }

    [Fact]
    public void Unpriced_provide_cannot_be_submitted()
    {
        var order = Orders.Draft();
        Assert.Equal("order.not_priced", Assert.Throws<DomainException>(() => order.Submit(Orders.PlacedAt, "p")).Code);
    }

    [Fact]
    public void Validation_commits_to_lead_time_when_requested_date_is_sooner()
    {
        var order = Orders.Validated(requested: new DateOnly(2024, 1, 10));

        Assert.Equal(OrderStatus.Validated, order.Status);
        Assert.Equal(new DateOnly(2024, 1, 22), order.CommittedDate);
        Assert.Equal(TimeSpan.FromHours(100), order.DeliveryClock!.Target);
    }

    [Fact]
    public void Validation_honours_a_later_requested_date()
    {
        var order = Orders.Validated(requested: new DateOnly(2024, 2, 1));
        Assert.Equal(new DateOnly(2024, 2, 1), order.CommittedDate);
    }

    [Fact]
    public void Status_changes_raise_domain_events_and_history()
    {
        var order = Orders.Validated();

        var events = order.DomainEvents.OfType<OrderStatusChanged>().Select(e => e.To).ToList();
        Assert.Equal(new[] { OrderStatus.Submitted, OrderStatus.Validated }, events);
        Assert.Equal(3, order.History.Count);
    }

    [Fact]
    public void Provide_needs_an_appointment_before_provisioning()
    {
        var order = Orders.Validated();
        Assert.Equal("order.appointment_required",
            Assert.Throws<DomainException>(() => order.StartProvisioning(Orders.PlacedAt, "agent")).Code);
    }

    [Fact]
    public void Cancelling_after_dispatch_incurs_the_one_off_charge()
    {
        var order = Orders.Validated(oneOffMinor: 6_000);
        order.BookAppointment(Guid.NewGuid(), new DateOnly(2024, 1, 15));
        order.StartProvisioning(Orders.PlacedAt.AddDays(1), "agent");

        order.Cancel(Orders.PlacedAt.AddDays(2), "customer changed mind", "partner");

        Assert.Equal(OrderStatus.Cancelled, order.Status);
        Assert.Equal(6_000, order.CancellationCharge!.Value.MinorUnits);
        Assert.True(order.DeliveryClock!.IsStopped);
    }

    [Fact]
    public void Cancelling_before_dispatch_is_free()
    {
        var order = Orders.Validated();
        order.Cancel(Orders.PlacedAt.AddHours(1), "duplicate order", "partner");
        Assert.Null(order.CancellationCharge);
    }

    [Fact]
    public void Appointment_after_committed_date_moves_the_commitment()
    {
        var order = Orders.Validated(requested: new DateOnly(2024, 1, 10));
        order.BookAppointment(Guid.NewGuid(), new DateOnly(2024, 1, 29));
        Assert.Equal(new DateOnly(2024, 1, 29), order.CommittedDate);
    }

    [Fact]
    public void Hold_pauses_delivery_clock_and_blocks_completion()
    {
        var order = Orders.Validated();
        order.BookAppointment(Guid.NewGuid(), new DateOnly(2024, 1, 15));
        order.StartProvisioning(Orders.PlacedAt.AddHours(1), "agent");
        order.PlaceOnHold(Orders.PlacedAt.AddHours(2), "no access to premise", "agent");

        Assert.True(order.DeliveryClock!.IsPaused);
        Assert.Equal("order.on_hold", Assert.Throws<DomainException>(() =>
            order.Complete(Orders.PlacedAt.AddDays(3), new DateOnly(2024, 1, 11), null, "agent")).Code);

        order.ReleaseHold(Orders.PlacedAt.AddHours(5), "agent");
        order.Complete(Orders.PlacedAt.AddDays(3), new DateOnly(2024, 1, 11), Guid.NewGuid(), "agent");
        Assert.Equal(OrderStatus.Active, order.Status);
    }

    [Fact]
    public void Working_days_late_is_measured_from_committed_date()
    {
        var order = Orders.Validated(requested: new DateOnly(2024, 1, 10));
        order.BookAppointment(Guid.NewGuid(), new DateOnly(2024, 1, 22));
        order.StartProvisioning(Orders.PlacedAt.AddDays(1), "agent");
        order.Complete(Orders.PlacedAt.AddDays(16), new DateOnly(2024, 1, 24), Guid.NewGuid(), "agent");

        Assert.Equal(2, order.WorkingDaysLate(Calendars.Business()));
    }

    [Fact]
    public void Completing_a_validated_order_skips_provisioning_and_is_refused()
    {
        var order = Orders.Validated();
        Assert.Throws<InvalidTransitionException>(() => order.Complete(Orders.PlacedAt, new DateOnly(2024, 1, 9), null, "agent"));
    }

    [Theory]
    [InlineData(OrderStatus.Active, true)]
    [InlineData(OrderStatus.Cancelled, true)]
    [InlineData(OrderStatus.Failed, true)]
    [InlineData(OrderStatus.Provisioning, false)]
    public void Terminal_statuses_have_no_exits(OrderStatus status, bool terminal) =>
        Assert.Equal(terminal, OrderStateMachine.IsTerminal(status));

    [Fact]
    public void Provisioning_orders_are_not_amendable()
    {
        Assert.True(OrderStateMachine.IsAmendable(OrderStatus.Validated));
        Assert.False(OrderStateMachine.IsAmendable(OrderStatus.Provisioning));
    }
}
