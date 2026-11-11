using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Application.Orders;
using IConnect.Wholesale.Domain.Appointments;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Appointments;

public sealed record AppointmentSlotDto(Guid Id, DateOnly Date, string Band, int Remaining, bool MeetsCommittedDate);

public sealed record BookAppointmentRequest(Guid SlotId);

public sealed record BookingDto(Guid OrderId, Guid SlotId, DateOnly Date, string Band, DateTimeOffset HoldExpiresAt, DateOnly? CommittedDate);

/// <summary>
/// Engineer appointment search and booking for orders that need a site visit (provide, migrate).
/// Slots are offered from the minimum notice date for the premise's exchange patch.
/// </summary>
public sealed class AppointmentService
{
    public const int MinimumNoticeWorkingDays = 2;
    public const int SearchWindowDays = 42;

    private readonly IAppointmentSlotRepository _slots;
    private readonly IPremiseRepository _premises;
    private readonly OrderService _orders;
    private readonly ICalendarProvider _calendars;
    private readonly IClock _clock;
    private readonly IUnitOfWork _uow;

    public AppointmentService(IAppointmentSlotRepository slots, IPremiseRepository premises, OrderService orders,
        ICalendarProvider calendars, IClock clock, IUnitOfWork uow)
    {
        _slots = slots;
        _premises = premises;
        _orders = orders;
        _calendars = calendars;
        _clock = clock;
        _uow = uow;
    }

    public async Task<IReadOnlyList<AppointmentSlotDto>> AvailableForOrderAsync(Guid orderId, DateOnly? from, CancellationToken ct)
    {
        var order = await _orders.LoadOwnedAsync(orderId, ct);
        EnsureNeedsAppointment(order);

        var premise = await _premises.GetByUprnAsync(order.Uprn, ct) ?? throw new NotFoundException("Premise", order.Uprn);
        var calendar = _calendars.Get(CalendarKind.BusinessHours);
        var now = _clock.UtcNow;
        var earliest = calendar.AddWorkingDays(calendar.LocalDate(now), MinimumNoticeWorkingDays);
        var start = from is { } f && f > earliest ? f : earliest;

        var slots = await _slots.ListAsync(premise.ExchangeCode, start, start.AddDays(SearchWindowDays), ct);
        return slots
            .Where(s => s.Remaining(now) > 0 && calendar.IsWorkingDay(s.Date))
            .OrderBy(s => s.Date).ThenBy(s => s.Band)
            .Select(s => new AppointmentSlotDto(s.Id, s.Date, s.Band.ToString().ToUpperInvariant(), s.Remaining(now),
                order.CommittedDate is not { } committed || s.Date <= committed))
            .ToList();
    }

    /// <summary>
    /// Reserves a slot for the order, releasing any previously booked slot. If the chosen date is
    /// after the committed date, the committed date moves to the appointment (partner's choice,
    /// so it does not count as late delivery).
    /// </summary>
    public async Task<BookingDto> BookAsync(Guid orderId, BookAppointmentRequest request, CancellationToken ct)
    {
        var order = await _orders.LoadOwnedAsync(orderId, ct);
        EnsureNeedsAppointment(order);

        var slot = await _slots.GetAsync(request.SlotId, ct) ?? throw new NotFoundException("AppointmentSlot", request.SlotId);
        var premise = await _premises.GetByUprnAsync(order.Uprn, ct) ?? throw new NotFoundException("Premise", order.Uprn);
        if (!string.Equals(slot.ExchangeCode, premise.ExchangeCode, StringComparison.OrdinalIgnoreCase))
        {
            throw new RequestValidationException("slotId", "The slot is not in the premise's exchange area.");
        }

        var calendar = _calendars.Get(CalendarKind.BusinessHours);
        var now = _clock.UtcNow;
        var earliest = calendar.AddWorkingDays(calendar.LocalDate(now), MinimumNoticeWorkingDays);
        if (slot.Date < earliest)
        {
            throw new RequestValidationException("slotId", $"Appointments need {MinimumNoticeWorkingDays} working days' notice.");
        }

        SlotReservation reservation;
        try
        {
            reservation = slot.Reserve(order.Id, now);
        }
        catch (DomainException ex) when (ex.Code == "slot.full")
        {
            throw new ConflictException(ex.Code, ex.Message);
        }

        if (order.AppointmentSlotId is { } previousId && previousId != slot.Id && await _slots.GetAsync(previousId, ct) is { } previous)
        {
            previous.Release(order.Id);
        }

        order.BookAppointment(slot.Id, slot.Date);
        if (order.Status == OrderStatus.Provisioning)
        {
            slot.Confirm(order.Id, now);
        }

        await _uow.SaveChangesAsync(ct);
        return new BookingDto(order.Id, slot.Id, slot.Date, slot.Band.ToString().ToUpperInvariant(), reservation.HoldExpiresAt, order.CommittedDate);
    }

    private static void EnsureNeedsAppointment(Order order)
    {
        if (order.Type is not (OrderType.Provide or OrderType.Migrate))
        {
            throw new ConflictException("appointment.not_required", $"{order.Type} orders do not need an engineer appointment.");
        }

        if (OrderStateMachine.IsTerminal(order.Status))
        {
            throw new ConflictException("appointment.order_closed", "The order is closed.");
        }
    }
}
