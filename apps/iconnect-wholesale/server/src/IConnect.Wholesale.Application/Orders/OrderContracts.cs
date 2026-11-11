using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Orders;

public sealed record PlaceOrderRequest(
    string PartnerReference,
    string OrderType,
    string Uprn,
    string? ProductCode,
    string? CareLevel,
    Guid? ExistingServiceId,
    string? MigrationAuthCode,
    DateOnly RequestedDate);

public sealed record OrderSummaryDto(
    Guid Id,
    string Reference,
    string PartnerReference,
    string Type,
    string Status,
    string Uprn,
    string? ProductCode,
    DateOnly RequestedDate,
    DateOnly? CommittedDate,
    bool OnHold,
    string? SlaStatus,
    DateTimeOffset CreatedAt);

public sealed record OrderHistoryDto(string? From, string To, DateTimeOffset At, string Note, string? Actor);

public sealed record OrderSlaDto(string Status, double ElapsedWorkingHours, double TargetWorkingHours, DateTimeOffset? DueAt, int WorkingDaysLate);

public sealed record OrderDetailDto(
    Guid Id,
    string Reference,
    string PartnerReference,
    string Type,
    string Status,
    string Uprn,
    string? ProductCode,
    string CareLevel,
    Guid? ExistingServiceId,
    Guid? ResultingServiceId,
    DateOnly RequestedDate,
    DateOnly? CommittedDate,
    DateOnly? CompletedDate,
    Guid? AppointmentSlotId,
    long? MonthlyRentalMinor,
    long? OneOffChargeMinor,
    long? CancellationChargeMinor,
    string Currency,
    string? FailureReason,
    string? HoldReason,
    OrderSlaDto? Sla,
    IReadOnlyList<string> AllowedActions,
    IReadOnlyList<OrderHistoryDto> History);

public sealed record CancelOrderRequest(string Reason);

public sealed record HoldOrderRequest(string Reason);

public sealed record AmendOrderRequest(DateOnly RequestedDate);

public sealed record CompleteOrderRequest(DateOnly CompletedDate);

public sealed record RejectOrderRequest(string Reason);

/// <summary>Placement outcome; <see cref="Created"/> is false when an idempotent replay returned an existing order.</summary>
public sealed record PlaceOrderResult(OrderDetailDto Order, bool Created);

internal static class OrderMapping
{
    public static OrderSummaryDto ToSummary(Order o, WorkingCalendar calendar, DateTimeOffset now) => new(
        o.Id,
        o.Reference,
        o.PartnerReference,
        o.Type.ToString().ToUpperInvariant(),
        o.Status.ToString().ToUpperInvariant(),
        o.Uprn,
        o.ProductCode,
        o.RequestedDate,
        o.CommittedDate,
        o.IsOnHold,
        o.DeliveryClock?.Status(calendar, now).ToString(),
        o.CreatedAt);

    public static OrderDetailDto ToDetail(Order o, WorkingCalendar calendar, DateTimeOffset now, bool isSupport)
    {
        OrderSlaDto? sla = null;
        if (o.DeliveryClock is { } clock)
        {
            sla = new OrderSlaDto(
                clock.Status(calendar, now).ToString(),
                Math.Round(clock.Elapsed(calendar, now).TotalHours, 2),
                Math.Round(clock.Target.TotalHours, 2),
                clock.DueAt(calendar, now),
                o.WorkingDaysLate(calendar));
        }

        return new OrderDetailDto(
            o.Id,
            o.Reference,
            o.PartnerReference,
            o.Type.ToString().ToUpperInvariant(),
            o.Status.ToString().ToUpperInvariant(),
            o.Uprn,
            o.ProductCode,
            o.CareLevel.ToString(),
            o.ExistingServiceId,
            o.ResultingServiceId,
            o.RequestedDate,
            o.CommittedDate,
            o.CompletedDate,
            o.AppointmentSlotId,
            o.MonthlyRental?.MinorUnits,
            o.OneOffCharge?.MinorUnits,
            o.CancellationCharge?.MinorUnits,
            o.MonthlyRental?.Currency ?? "GBP",
            o.FailureReason,
            o.HoldReason,
            sla,
            AllowedActions(o, isSupport),
            o.History.Select(h => new OrderHistoryDto(h.From?.ToString().ToUpperInvariant(), h.To.ToString().ToUpperInvariant(), h.At, h.Note, h.Actor)).ToList());
    }

    /// <summary>Actions the UI may offer for this order and caller; the server re-checks on execution.</summary>
    public static IReadOnlyList<string> AllowedActions(Order o, bool isSupport)
    {
        var actions = new List<string>();
        if (OrderStateMachine.CanTransition(o.Status, OrderStatus.Cancelled))
        {
            actions.Add("cancel");
        }

        if (OrderStateMachine.IsAmendable(o.Status) && o.Status != OrderStatus.Draft)
        {
            actions.Add("amend");
            actions.Add("book-appointment");
        }

        if (!isSupport)
        {
            return actions;
        }

        if (o.Status is OrderStatus.Validated or OrderStatus.Provisioning)
        {
            actions.Add(o.IsOnHold ? "release-hold" : "hold");
        }

        if (o.Status == OrderStatus.Validated)
        {
            actions.Add("start-provisioning");
        }

        if (o.Status == OrderStatus.Provisioning && !o.IsOnHold)
        {
            actions.Add("complete");
        }

        if (OrderStateMachine.CanTransition(o.Status, OrderStatus.Failed))
        {
            actions.Add("reject");
        }

        return actions;
    }
}
