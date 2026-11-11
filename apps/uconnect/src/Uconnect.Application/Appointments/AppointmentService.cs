using FluentValidation;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Services;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Services;
using Uconnect.Domain.Tickets;

namespace Uconnect.Application.Appointments;

/// <summary>
/// Engineer visits: slot search against field capacity, booking, rescheduling, cancellation and (for
/// agents) recording the outcome. The field-service work order is always created or changed before our
/// record is committed, and a failed commit cancels the new work order, so the two systems never disagree
/// about whether an engineer is coming.
/// </summary>
public sealed class AppointmentService
{
    private readonly AccountAccessGuard _guard;
    private readonly ServiceInventoryService _inventory;
    private readonly IAppointmentRepository _appointments;
    private readonly ITicketRepository _tickets;
    private readonly IAdjustmentRepository _adjustments;
    private readonly IFieldServiceClient _fieldService;
    private readonly IHolidayCalendar _holidays;
    private readonly IReferenceGenerator _references;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly AppointmentOptions _options;
    private readonly IValidator<BookAppointmentRequest> _bookValidator;
    private readonly IValidator<RescheduleAppointmentRequest> _rescheduleValidator;
    private readonly IValidator<CancelAppointmentRequest> _cancelValidator;
    private readonly IValidator<RecordVisitOutcomeRequest> _outcomeValidator;
    private readonly ILogger<AppointmentService> _logger;

    public AppointmentService(
        AccountAccessGuard guard,
        ServiceInventoryService inventory,
        IAppointmentRepository appointments,
        ITicketRepository tickets,
        IAdjustmentRepository adjustments,
        IFieldServiceClient fieldService,
        IHolidayCalendar holidays,
        IReferenceGenerator references,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IOptions<AppointmentOptions> options,
        IValidator<BookAppointmentRequest> bookValidator,
        IValidator<RescheduleAppointmentRequest> rescheduleValidator,
        IValidator<CancelAppointmentRequest> cancelValidator,
        IValidator<RecordVisitOutcomeRequest> outcomeValidator,
        ILogger<AppointmentService> logger)
    {
        _guard = guard;
        _inventory = inventory;
        _appointments = appointments;
        _tickets = tickets;
        _adjustments = adjustments;
        _fieldService = fieldService;
        _holidays = holidays;
        _references = references;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _options = options.Value;
        _bookValidator = bookValidator;
        _rescheduleValidator = rescheduleValidator;
        _cancelValidator = cancelValidator;
        _outcomeValidator = outcomeValidator;
        _logger = logger;
    }

    public async Task<IReadOnlyList<AppointmentDto>> ListAsync(string accountNumber, bool upcomingOnly, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var appointments = await _appointments.ListByAccountAsync(account.Id, upcomingOnly, _clock.Today, ct);
        var now = _clock.UtcNow;
        return appointments.OrderBy(a => a.Date).ThenBy(a => a.Window).Select(a => a.ToDto(now)).ToList();
    }

    public async Task<IReadOnlyList<AvailableSlotDto>> GetAvailableSlotsAsync(string accountNumber, string type, Guid? serviceId, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Support, ct);
        var visitType = EnumParsing.Parse<AppointmentType>(type, "type");
        var service = serviceId is { } id ? await _inventory.LoadOwnedServiceAsync(account.Id, id, ct) : null;
        var address = service?.ServiceAddress ?? account.BillingAddress;

        var holidays = await LoadHolidaysAsync(ct);
        var candidates = AppointmentSchedulingPolicy.CandidateSlots(visitType, _clock.Today, holidays);
        var capacity = await _fieldService.GetCapacityAsync(address.OutwardCode, candidates, ct);

        return candidates
            .Select(slot => new AvailableSlot(slot, capacity.GetValueOrDefault(slot)))
            .Where(s => s.RemainingCapacity > 0)
            .Select(s => s.ToDto())
            .ToList();
    }

    public async Task<AppointmentDto> BookAsync(string accountNumber, BookAppointmentRequest request, CancellationToken ct)
    {
        await _bookValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Support, ct);
        var type = EnumParsing.Parse<AppointmentType>(request.Type, "type");
        var slot = new AppointmentSlot(request.Date, EnumParsing.Parse<AppointmentWindow>(request.Window, "window"));

        var service = request.ServiceId is { } serviceId ? await _inventory.LoadOwnedServiceAsync(account.Id, serviceId, ct) : null;
        EnsureServiceStateFor(type, service);
        var ticket = type == AppointmentType.Repair ? await LoadOpenFaultTicketAsync(account.Id, request.TicketReference!, ct) : null;
        if (service is not null && await _appointments.HasActiveForServiceAsync(service.Id, type, ct))
        {
            throw new ConflictException("appointment.already_booked", $"A {type.ToString().ToLowerInvariant()} visit is already booked for this service.");
        }

        await EnsureSlotBookableAsync(type, slot, service?.ServiceAddress ?? account.BillingAddress, ct);

        var appointment = new Appointment(
            Guid.NewGuid(),
            await _references.NextAsync(ReferenceKind.Appointment, ct),
            account.Id,
            service?.Id,
            ticket?.Id,
            type,
            slot,
            service?.ServiceAddress ?? account.BillingAddress,
            request.ContactName,
            PhoneNumber.Create(request.ContactPhone),
            request.AccessNotes,
            _clock.UtcNow);

        var workOrder = await _fieldService.CreateWorkOrderAsync(ToWorkOrder(appointment), ct);
        appointment.Confirm(workOrder.WorkOrderRef, workOrder.EngineerName);
        _appointments.Add(appointment);

        try
        {
            await _unitOfWork.SaveChangesAsync(ct);
        }
        catch
        {
            await _fieldService.CancelWorkOrderAsync(workOrder.WorkOrderRef, "Booking could not be recorded", CancellationToken.None);
            throw;
        }

        _logger.LogInformation(
            "Appointment {Reference} ({Type}) booked for {AccountNumber} on {Slot}, work order {WorkOrderRef}",
            appointment.Reference, type, account.Number, slot, workOrder.WorkOrderRef);
        return appointment.ToDto(_clock.UtcNow);
    }

    public async Task<AppointmentDto> RescheduleAsync(string accountNumber, string reference, RescheduleAppointmentRequest request, CancellationToken ct)
    {
        await _rescheduleValidator.EnsureValidAsync(request, ct);
        var (_, appointment) = await LoadAsync(accountNumber, reference, AccountPermission.Support, ct);
        var slot = new AppointmentSlot(request.Date, EnumParsing.Parse<AppointmentWindow>(request.Window, "window"));
        await EnsureSlotBookableAsync(appointment.Type, slot, appointment.VisitAddress, ct);

        var previousWorkOrder = appointment.FieldWorkOrderRef;
        appointment.Reschedule(slot, _clock.UtcNow);
        var confirmation = previousWorkOrder is null
            ? await _fieldService.CreateWorkOrderAsync(ToWorkOrder(appointment), ct)
            : await _fieldService.RescheduleWorkOrderAsync(previousWorkOrder, slot, ct);
        appointment.Confirm(confirmation.WorkOrderRef, confirmation.EngineerName);

        await _unitOfWork.SaveChangesAsync(ct);
        return appointment.ToDto(_clock.UtcNow);
    }

    /// <summary>Cancels a visit. Cancelling inside the cut-off is allowed but may attract a call-out fee.</summary>
    public async Task<AppointmentDto> CancelAsync(string accountNumber, string reference, CancelAppointmentRequest request, CancellationToken ct)
    {
        await _cancelValidator.EnsureValidAsync(request, ct);
        var (account, appointment) = await LoadAsync(accountNumber, reference, AccountPermission.Support, ct);
        var now = _clock.UtcNow;

        appointment.Cancel(request.Reason, now);
        if (appointment.FieldWorkOrderRef is { } workOrder)
        {
            await _fieldService.CancelWorkOrderAsync(workOrder, request.Reason, ct);
        }

        if (appointment.LateCancellation && _options.ChargeLateCancellation && _options.LateCancellationFeeMinor > 0 && !_currentUser.IsSupportAgent)
        {
            _adjustments.Add(new AccountAdjustment(
                Guid.NewGuid(),
                account.Id,
                appointment.ServiceId,
                AdjustmentReason.EngineerCallOutFee,
                $"Late cancellation of engineer visit {appointment.Reference}",
                Money.FromMinor(_options.LateCancellationFeeMinor, account.Currency),
                SystemActors.AppointmentPolicy,
                now,
                sourceReference: $"late-cancel:{appointment.Reference}"));
        }

        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation("Appointment {Reference} cancelled (late: {Late})", appointment.Reference, appointment.LateCancellation);
        return appointment.ToDto(now);
    }

    public async Task<AppointmentDto> UpdateAccessNotesAsync(string accountNumber, string reference, UpdateAccessNotesRequest request, CancellationToken ct)
    {
        if (request.AccessNotes?.Length > 500)
        {
            throw new RequestValidationException("accessNotes", "Access notes must be at most 500 characters.");
        }

        var (_, appointment) = await LoadAsync(accountNumber, reference, AccountPermission.Support, ct);
        appointment.UpdateAccessNotes(request.AccessNotes, _clock.UtcNow);
        await _unitOfWork.SaveChangesAsync(ct);
        return appointment.ToDto(_clock.UtcNow);
    }

    /// <summary>Agents record the visit outcome; a provider-missed visit triggers automatic compensation.</summary>
    public async Task<AppointmentDto> RecordOutcomeAsync(string accountNumber, string reference, RecordVisitOutcomeRequest request, CancellationToken ct)
    {
        if (!_currentUser.IsSupportAgent)
        {
            throw new ForbiddenException("Only support agents can record visit outcomes.");
        }

        await _outcomeValidator.EnsureValidAsync(request, ct);
        var (_, appointment) = await LoadAsync(accountNumber, reference, AccountPermission.Support, ct);
        var now = _clock.UtcNow;
        if (request.Outcome == "Completed")
        {
            appointment.Complete(request.Notes, now);
        }
        else
        {
            appointment.MarkMissed(request.MissedByProvider, request.Notes, now);
        }

        await _unitOfWork.SaveChangesAsync(ct);
        return appointment.ToDto(now);
    }

    private static void EnsureServiceStateFor(AppointmentType type, Service? service)
    {
        var allowed = type switch
        {
            AppointmentType.Installation => service is { Status: ServiceStatus.PendingActivation },
            AppointmentType.Repair => service is { IsLive: true },
            AppointmentType.Upgrade => service is { Status: ServiceStatus.Active },
            _ => service is null || service.Status != ServiceStatus.Cancelled,
        };

        if (!allowed)
        {
            throw new ConflictException("appointment.service_state", $"A {type.ToString().ToLowerInvariant()} visit cannot be booked for this service in its current state.");
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
