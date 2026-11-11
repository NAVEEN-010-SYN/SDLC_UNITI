using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Common;
using Uconnect.Domain.Services;
using Uconnect.Domain.Tickets;

namespace Uconnect.Application.Appointments;

/// <summary>Private lookup and policy helpers for <see cref="AppointmentService"/>.</summary>
public sealed partial class AppointmentService
{
    private static void EnsureServiceStateFor(AppointmentType type, Service? service)
    {
        bool allowed;
        if (type == AppointmentType.Installation)
        {
            allowed = service != null && service.Status == ServiceStatus.PendingActivation;
        }
        else if (type == AppointmentType.Repair)
        {
            allowed = service != null && service.IsLive;
        }
        else if (type == AppointmentType.Upgrade)
        {
            allowed = service != null && service.Status == ServiceStatus.Active;
        }
        else
        {
            allowed = service == null || service.Status != ServiceStatus.Cancelled;
        }

        if (!allowed)
        {
            throw new ConflictException("appointment.service_state", $"A {type.ToString().ToLowerInvariant()} visit cannot be booked for this service in its current state.");
        }
    }

    /// <summary>Commits the booking; if the commit fails the new work order is cancelled.</summary>
    private async Task SaveOrCancelWorkOrderAsync(string workOrderRef, CancellationToken ct)
    {
        try
        {
            await _unitOfWork.SaveChangesAsync(ct);
        }
        catch
        {
            await _fieldService.CancelWorkOrderAsync(workOrderRef, "Booking could not be recorded", CancellationToken.None);
            throw;
        }
    }

    private async Task<Ticket> LoadOpenFaultTicketAsync(Guid accountId, string reference, CancellationToken ct)
    {
        var ticket = await _tickets.GetByReferenceAsync(reference.Trim().ToUpperInvariant(), ct);
        if (ticket is null || ticket.AccountId != accountId)
        {
            throw new NotFoundException("Ticket", reference);
        }

        if (ticket.Category != TicketCategory.Fault || !ticket.IsOpen)
        {
            throw new ConflictException("appointment.ticket_not_open_fault", $"Ticket {ticket.Reference} is not an open fault.");
        }

        return ticket;
    }

    private async Task EnsureSlotBookableAsync(AppointmentType type, AppointmentSlot slot, PostalAddress address, CancellationToken ct)
    {
        var holidays = await LoadHolidaysAsync(ct);
        AppointmentSchedulingPolicy.EnsureBookable(type, slot, _clock.Today, holidays);
        var capacity = await _fieldService.GetCapacityAsync(address.OutwardCode, new[] { slot }, ct);
        if (capacity.GetValueOrDefault(slot) <= 0)
        {
            throw new ConflictException("appointment.slot_full", "That visit window is no longer available; please choose another.");
        }
    }

    private Task<IReadOnlySet<DateOnly>> LoadHolidaysAsync(CancellationToken ct)
    {
        var today = _clock.Today;
        return _holidays.GetHolidaysAsync(today, today.AddDays(AppointmentSchedulingPolicy.BookingHorizonDays + 14), ct);
    }

    private static WorkOrderRequest ToWorkOrder(Appointment appointment) => new(
        appointment.Id,
        appointment.Reference,
        appointment.Type,
        appointment.Slot,
        appointment.VisitAddress,
        appointment.ContactName,
        appointment.ContactPhone.Value,
        appointment.AccessNotes);

    private async Task<(Account Account, Appointment Appointment)> LoadAsync(
        string accountNumber, string reference, AccountPermission permission, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, permission, ct);
        var appointment = await _appointments.GetByReferenceAsync(reference.Trim().ToUpperInvariant(), ct);
        if (appointment is null || appointment.AccountId != account.Id)
        {
            throw new NotFoundException("Appointment", reference);
        }

        return (account, appointment);
    }
}
