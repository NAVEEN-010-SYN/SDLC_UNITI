using FluentValidation;
using Uconnect.Application.Accounts;
using Uconnect.Application.Common;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Appointments;

public sealed record AppointmentDto(
    string Reference,
    string Type,
    string Status,
    DateOnly Date,
    string Window,
    DateTimeOffset WindowStartsAt,
    DateTimeOffset WindowEndsAt,
    Guid? ServiceId,
    AddressDto VisitAddress,
    string ContactName,
    string ContactPhone,
    string? AccessNotes,
    string? EngineerName,
    int RescheduleCount,
    bool CanChange,
    bool LateCancellation,
    string? CancellationReason);

public sealed record AvailableSlotDto(DateOnly Date, string Window, DateTimeOffset StartsAt, DateTimeOffset EndsAt, int RemainingCapacity);

/// <summary>
/// Books an engineer visit. Repairs must reference an open fault ticket; visits for a service are made
/// at its service address, otherwise at the account's billing address.
/// </summary>
public sealed record BookAppointmentRequest(
    string Type,
    Guid? ServiceId,
    string? TicketReference,
    DateOnly Date,
    string Window,
    string ContactName,
    string ContactPhone,
    string? AccessNotes);

public sealed record RescheduleAppointmentRequest(DateOnly Date, string Window);

public sealed record CancelAppointmentRequest(string Reason);

public sealed record UpdateAccessNotesRequest(string? AccessNotes);

/// <summary>Agent records how a confirmed visit ended: <c>Completed</c> or <c>Missed</c>.</summary>
public sealed record RecordVisitOutcomeRequest(string Outcome, bool MissedByProvider, string Notes);

public sealed class BookAppointmentRequestValidator : AbstractValidator<BookAppointmentRequest>
{
    public BookAppointmentRequestValidator()
    {
        RuleFor(r => r.Type).Must(EnumParsing.IsValid<AppointmentType>)
            .WithMessage($"Type must be one of: {string.Join(", ", Enum.GetNames<AppointmentType>())}.");
        RuleFor(r => r.Window).Must(EnumParsing.IsValid<AppointmentWindow>)
            .WithMessage($"Window must be one of: {string.Join(", ", Enum.GetNames<AppointmentWindow>())}.");
        RuleFor(r => r.TicketReference).NotEmpty()
            .When(r => EnumParsing.TryParse<AppointmentType>(r.Type, out var t) && t == AppointmentType.Repair)
            .WithMessage("Repair visits must reference the fault ticket.");
        RuleFor(r => r.ServiceId).NotEmpty()
            .When(r => EnumParsing.TryParse<AppointmentType>(r.Type, out var t) && t is AppointmentType.Repair or AppointmentType.Upgrade or AppointmentType.Installation)
            .WithMessage("Choose the service the visit is for.");
        RuleFor(r => r.ContactName).NotEmpty().MaximumLength(120).SafeText(120);
        RuleFor(r => r.ContactPhone).ValidUkPhone();
        RuleFor(r => r.AccessNotes).SafeText(500);
    }
}

public sealed class RescheduleAppointmentRequestValidator : AbstractValidator<RescheduleAppointmentRequest>
{
    public RescheduleAppointmentRequestValidator()
    {
        RuleFor(r => r.Window).Must(EnumParsing.IsValid<AppointmentWindow>).WithMessage("Window must be Morning, Afternoon or AllDay.");
    }
}

public sealed class CancelAppointmentRequestValidator : AbstractValidator<CancelAppointmentRequest>
{
    public CancelAppointmentRequestValidator()
    {
        RuleFor(r => r.Reason).NotEmpty().MaximumLength(500).SafeText(500);
    }
}

public sealed class RecordVisitOutcomeRequestValidator : AbstractValidator<RecordVisitOutcomeRequest>
{
    public RecordVisitOutcomeRequestValidator()
    {
        RuleFor(r => r.Outcome).Must(o => o is "Completed" or "Missed").WithMessage("Outcome must be Completed or Missed.");
        RuleFor(r => r.Notes).NotEmpty().MaximumLength(2000).SafeText(2000);
    }
}

internal static class AppointmentMapping
{
    public static AppointmentDto ToDto(this Appointment appointment, DateTimeOffset now) => new(
        appointment.Reference,
        appointment.Type.ToString(),
        appointment.Status.ToString(),
        appointment.Date,
        appointment.Window.ToString(),
        appointment.Slot.StartsAtUtc,
        appointment.Slot.EndsAtUtc,
        appointment.ServiceId,
        appointment.VisitAddress.ToDto(),
        appointment.ContactName,
        appointment.ContactPhone.Value,
        appointment.AccessNotes,
        appointment.EngineerName,
        appointment.RescheduleCount,
        appointment.IsChangeable(now) && appointment.RescheduleCount < Appointment.MaxReschedules,
        appointment.LateCancellation,
        appointment.CancellationReason);

    public static AvailableSlotDto ToDto(this AvailableSlot slot) =>
        new(slot.Slot.Date, slot.Slot.Window.ToString(), slot.Slot.StartsAtUtc, slot.Slot.EndsAtUtc, slot.RemainingCapacity);
}
