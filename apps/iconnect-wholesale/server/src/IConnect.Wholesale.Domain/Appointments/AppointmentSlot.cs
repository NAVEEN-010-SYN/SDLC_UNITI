using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Appointments;

public enum SlotBand
{
    Am,
    Pm,
    AllDay,
}

/// <summary>
/// Engineer capacity for an exchange patch on a given day and band. Reservations are held for a
/// short time while the partner completes an order, then confirmed or allowed to lapse.
/// </summary>
public sealed class AppointmentSlot : Entity
{
    public static readonly TimeSpan ReservationHold = TimeSpan.FromMinutes(20);

    private readonly List<SlotReservation> _reservations = new();

    private AppointmentSlot()
    {
    }

    public AppointmentSlot(string exchangeCode, DateOnly date, SlotBand band, int capacity)
    {
        if (capacity <= 0)
        {
            throw new DomainException("slot.invalid_capacity", "Slot capacity must be positive.");
        }

        ExchangeCode = exchangeCode;
        Date = date;
        Band = band;
        Capacity = capacity;
    }

    public string ExchangeCode { get; private set; } = string.Empty;

    public DateOnly Date { get; private set; }

    public SlotBand Band { get; private set; }

    public int Capacity { get; private set; }

    public IReadOnlyList<SlotReservation> Reservations => _reservations;

    public int Used(DateTimeOffset now) => _reservations.Count(r => r.IsLive(now));

    public int Remaining(DateTimeOffset now) => Capacity - Used(now);

    /// <summary>Places a temporary hold for an order. Idempotent for the same order.</summary>
    public SlotReservation Reserve(Guid orderId, DateTimeOffset now)
    {
        var existing = _reservations.FirstOrDefault(r => r.OrderId == orderId && r.IsLive(now));
        if (existing is not null)
        {
            return existing;
        }

        if (Remaining(now) <= 0)
        {
            throw new DomainException("slot.full", $"No capacity left on {Date:yyyy-MM-dd} {Band} at {ExchangeCode}.");
        }

        _reservations.RemoveAll(r => !r.IsLive(now));
        var reservation = new SlotReservation(orderId, now, now + ReservationHold, null);
        _reservations.Add(reservation);
        return reservation;
    }

    public void Confirm(Guid orderId, DateTimeOffset now)
    {
        var index = _reservations.FindIndex(r => r.OrderId == orderId && r.IsLive(now));
        if (index < 0)
        {
            throw new DomainException("slot.reservation_expired", "The reservation has expired; reserve the slot again.");
        }

        _reservations[index] = _reservations[index] with { ConfirmedAt = now };
    }

    public bool Release(Guid orderId) => _reservations.RemoveAll(r => r.OrderId == orderId) > 0;

    /// <summary>Appointments cannot be booked for today or in the past, nor within the minimum notice.</summary>
    public bool IsBookable(DateOnly today, int minimumNoticeDays) => Date > today.AddDays(Math.Max(0, minimumNoticeDays - 1));
}

public sealed record SlotReservation(Guid OrderId, DateTimeOffset ReservedAt, DateTimeOffset HoldExpiresAt, DateTimeOffset? ConfirmedAt)
{
    public bool IsConfirmed => ConfirmedAt.HasValue;

    public bool IsLive(DateTimeOffset now) => IsConfirmed || now < HoldExpiresAt;
}
