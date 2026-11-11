# Uconnect account & service management: apps/uconnect/src/Uconnect.Application (part 2 of 8)

- **Application:** Uconnect account & service management
- **Tech stack:** .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 19

## Files

- `apps/uconnect/src/Uconnect.Application/Appointments/AppointmentService.cs` (316 lines)
- `apps/uconnect/src/Uconnect.Application/Billing/AdjustmentService.cs` (95 lines)
- `apps/uconnect/src/Uconnect.Application/Billing/BillingDtos.cs` (127 lines)
- `apps/uconnect/src/Uconnect.Application/Billing/BillingRunService.cs` (283 lines)
- `apps/uconnect/src/Uconnect.Application/Billing/InvoiceService.cs` (130 lines)
- `apps/uconnect/src/Uconnect.Application/Common/Abstractions.cs` (76 lines)
- `apps/uconnect/src/Uconnect.Application/Common/AccountAccessGuard.cs` (81 lines)
- `apps/uconnect/src/Uconnect.Application/Common/AppointmentOptions.cs` (16 lines)
- `apps/uconnect/src/Uconnect.Application/Common/EnumParsing.cs` (43 lines)
- `apps/uconnect/src/Uconnect.Application/Common/Exceptions.cs` (74 lines)
- `apps/uconnect/src/Uconnect.Application/Common/Paging.cs` (46 lines)
- `apps/uconnect/src/Uconnect.Application/Common/SystemActors.cs` (19 lines)
- `apps/uconnect/src/Uconnect.Application/Common/UconnectOptions.cs` (55 lines)
- `apps/uconnect/src/Uconnect.Application/Common/Validation.cs` (89 lines)
- `apps/uconnect/src/Uconnect.Application/Dashboard/DashboardService.cs` (83 lines)
- `apps/uconnect/src/Uconnect.Application/DependencyInjection.cs` (78 lines)
- `apps/uconnect/src/Uconnect.Application/Notifications/CustomerEventHandlers.cs` (152 lines)
- `apps/uconnect/src/Uconnect.Application/Notifications/CustomerNotifier.cs` (78 lines)
- `apps/uconnect/src/Uconnect.Application/Outages/OutageDtos.cs` (90 lines)

## apps/uconnect/src/Uconnect.Application/Appointments/AppointmentService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Appointments/AppointmentService.cs`.

```csharp
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
```

## apps/uconnect/src/Uconnect.Application/Billing/AdjustmentService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Billing/AdjustmentService.cs`.

```csharp
using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Services;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Billing;

/// <summary>
/// One-off credits and charges awaiting the next invoice. Customers can see them; only support
/// agents can raise them, and goodwill above the agent limit needs a team-lead approval reference.
/// </summary>
public sealed class AdjustmentService
{
    private const int HistorySize = 50;

    private readonly AccountAccessGuard _guard;
    private readonly ServiceInventoryService _inventory;
    private readonly IAdjustmentRepository _adjustments;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<RaiseAdjustmentRequest> _validator;
    private readonly ILogger<AdjustmentService> _logger;

    public AdjustmentService(
        AccountAccessGuard guard,
        ServiceInventoryService inventory,
        IAdjustmentRepository adjustments,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<RaiseAdjustmentRequest> validator,
        ILogger<AdjustmentService> logger)
    {
        _guard = guard;
        _inventory = inventory;
        _adjustments = adjustments;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _validator = validator;
        _logger = logger;
    }

    public async Task<IReadOnlyList<AdjustmentDto>> ListAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var adjustments = await _adjustments.ListByAccountAsync(account.Id, HistorySize, ct);
        return adjustments.OrderByDescending(a => a.RaisedAt).Select(a => a.ToDto()).ToList();
    }

    public async Task<AdjustmentDto> RaiseAsync(string accountNumber, RaiseAdjustmentRequest request, CancellationToken ct)
    {
        if (!_currentUser.IsSupportAgent)
        {
            throw new ForbiddenException("Only support agents can raise account adjustments.");
        }

        await _validator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        if (request.ServiceId is { } serviceId)
        {
            await _inventory.LoadOwnedServiceAsync(account.Id, serviceId, ct);
        }

        var amount = request.Amount!.ToMoney();
        if (amount.Currency != account.Currency)
        {
            throw new RequestValidationException("amount.currency", $"Adjustments on this account must be in {account.Currency}.");
        }

        var adjustment = new AccountAdjustment(
            Guid.NewGuid(),
            account.Id,
            request.ServiceId,
            EnumParsing.Parse<AdjustmentReason>(request.Reason, "reason"),
            request.Description,
            amount,
            _currentUser.UserId,
            _clock.UtcNow,
            string.IsNullOrWhiteSpace(request.ApprovalReference) ? null : request.ApprovalReference.Trim());

        _adjustments.Add(adjustment);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Adjustment {AdjustmentId} ({Reason}, {Amount}) raised on {AccountNumber} by agent {UserId}",
            adjustment.Id, adjustment.Reason, adjustment.Amount, account.Number, _currentUser.UserId);
        return adjustment.ToDto();
    }
}
```

## apps/uconnect/src/Uconnect.Application/Billing/BillingDtos.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Billing/BillingDtos.cs`.

```csharp
using FluentValidation;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Billing;

public sealed record InvoiceSummaryDto(
    string InvoiceNumber,
    string Status,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    DateOnly? IssuedOn,
    DateOnly? DueOn,
    MoneyDto Total,
    MoneyDto BalanceDue,
    int DaysOverdue);

public sealed record InvoiceLineDto(
    string Type,
    string Description,
    MoneyDto UnitAmount,
    int Quantity,
    MoneyDto Amount,
    bool Taxable,
    string? ServiceReference,
    DateOnly? ServicePeriodStart,
    DateOnly? ServicePeriodEnd);

public sealed record InvoiceDetailDto(
    InvoiceSummaryDto Summary,
    IReadOnlyList<InvoiceLineDto> Lines,
    MoneyDto Subtotal,
    MoneyDto TaxTotal,
    int TaxRateBasisPoints,
    MoneyDto AmountPaid,
    MoneyDto CreditCarriedForward,
    string? VoidReason,
    IReadOnlyList<PaymentDto> Payments);

/// <summary>What the account owes now: everything payable, the overdue part, and the next due date.</summary>
public sealed record AccountBalanceDto(
    MoneyDto Outstanding,
    MoneyDto Overdue,
    int PayableInvoiceCount,
    DateOnly? NextDueOn,
    string? NextDueInvoiceNumber);

public sealed record AdjustmentDto(
    Guid Id,
    string Reason,
    string Description,
    MoneyDto Amount,
    Guid? ServiceId,
    bool Billed,
    DateTimeOffset RaisedAt,
    string? ApprovalReference);

/// <summary>An agent-raised credit or charge. Credits are negative amounts.</summary>
public sealed record RaiseAdjustmentRequest(Guid? ServiceId, string Reason, string Description, MoneyDto? Amount, string? ApprovalReference);

public sealed record BillingRunSummary(DateOnly RunDate, int AccountsConsidered, int InvoicesIssued, int AlreadyBilled, int Errors);

public sealed record CollectionsRunSummary(int MarkedOverdue, int LateFeesRaised, int AccountsSuspended, int Errors);

public sealed class RaiseAdjustmentRequestValidator : AbstractValidator<RaiseAdjustmentRequest>
{
    /// <summary>Reasons an agent may raise by hand; the others are created only by automated policies.</summary>
    public static readonly IReadOnlySet<AdjustmentReason> AgentReasons = new HashSet<AdjustmentReason>
    {
        AdjustmentReason.Goodwill,
        AdjustmentReason.BillingCorrection,
        AdjustmentReason.EngineerCallOutFee,
    };

    public RaiseAdjustmentRequestValidator()
    {
        RuleFor(r => r.Reason)
            .Must(r => EnumParsing.TryParse<AdjustmentReason>(r, out var reason) && AgentReasons.Contains(reason))
            .WithMessage($"Reason must be one of: {string.Join(", ", AgentReasons)}.");
        RuleFor(r => r.Description).NotEmpty().MaximumLength(200).SafeText(200);
        RuleFor(r => r.Amount).NotNull()
            .Must(m => m is not null && m.AmountMinor != 0).WithMessage("Amount must not be zero.")
            .Must(m => m is not null && m.Currency is "GBP" or "USD" or "EUR").WithMessage("Currency is not supported.");
        RuleFor(r => r.ApprovalReference).MaximumLength(40).SafeText(40);
    }
}

internal static class BillingMapping
{
    public static InvoiceSummaryDto ToSummaryDto(this Invoice invoice, DateOnly today) => new(
        invoice.InvoiceNumber,
        invoice.Status.ToString(),
        invoice.PeriodStart,
        invoice.PeriodEnd,
        invoice.IssuedOn,
        invoice.DueOn,
        invoice.Total.ToDto(),
        invoice.BalanceDue.ToDto(),
        invoice.DaysOverdue(today));

    public static InvoiceLineDto ToDto(this InvoiceLine line, IReadOnlyDictionary<Guid, string> serviceReferences) => new(
        line.Type.ToString(),
        line.Description,
        line.UnitAmount.ToDto(),
        line.Quantity,
        line.Amount.ToDto(),
        line.Taxable,
        line.ServiceId is { } id ? serviceReferences.GetValueOrDefault(id) : null,
        line.ServicePeriodStart,
        line.ServicePeriodEnd);

    public static AdjustmentDto ToDto(this AccountAdjustment adjustment) => new(
        adjustment.Id,
        adjustment.Reason.ToString(),
        adjustment.Description,
        adjustment.Amount.ToDto(),
        adjustment.ServiceId,
        adjustment.IsBilled,
        adjustment.RaisedAt,
        adjustment.ApprovalReference);

    public static Money SumBalance(this IEnumerable<Invoice> invoices, string currency) =>
        invoices.Select(i => i.BalanceDue).Sum(currency);
}
```

## apps/uconnect/src/Uconnect.Application/Billing/BillingRunService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Billing/BillingRunService.cs`.

```csharp
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.Services;
using Uconnect.Domain.Usage;

namespace Uconnect.Application.Billing;

/// <summary>
/// The daily billing and collections jobs.
/// <list type="bullet">
/// <item><see cref="RunAsync"/> issues an invoice to every account whose cycle starts today. It is safe
/// to re-run: accounts already invoiced for the period are skipped.</item>
/// <item><see cref="ProcessCollectionsAsync"/> marks late invoices overdue, raises the late-payment fee
/// once per invoice and suspends accounts that stay in arrears.</item>
/// </list>
/// Each account is processed in its own transaction so one bad account never blocks the run.
/// </summary>
public sealed class BillingRunService
{
    /// <summary>Suspension reasons written by collections start with this, so a payment can lift them automatically.</summary>
    public const string ArrearsSuspensionPrefix = "Arrears:";

    private readonly IAccountRepository _accounts;
    private readonly IServiceRepository _services;
    private readonly IPlanRepository _plans;
    private readonly IPlanChangeRepository _planChanges;
    private readonly IUsageRepository _usage;
    private readonly IAdjustmentRepository _adjustments;
    private readonly IInvoiceRepository _invoices;
    private readonly IReferenceGenerator _references;
    private readonly IBillingSystemClient _billingSystem;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly BillingOptions _options;
    private readonly ILogger<BillingRunService> _logger;

    public BillingRunService(
        IAccountRepository accounts,
        IServiceRepository services,
        IPlanRepository plans,
        IPlanChangeRepository planChanges,
        IUsageRepository usage,
        IAdjustmentRepository adjustments,
        IInvoiceRepository invoices,
        IReferenceGenerator references,
        IBillingSystemClient billingSystem,
        IUnitOfWork unitOfWork,
        IClock clock,
        IOptions<BillingOptions> options,
        ILogger<BillingRunService> logger)
    {
        _accounts = accounts;
        _services = services;
        _plans = plans;
        _planChanges = planChanges;
        _usage = usage;
        _adjustments = adjustments;
        _invoices = invoices;
        _references = references;
        _billingSystem = billingSystem;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<BillingRunSummary> RunAsync(DateOnly runDate, CancellationToken ct)
    {
        // Billing days are limited to 1..28, so nothing starts a cycle on the 29th-31st.
        if (runDate.Day > Account.MaxBillingDay)
        {
            return new BillingRunSummary(runDate, 0, 0, 0, 0);
        }

        var accounts = await _accounts.ListByBillingDayAsync(runDate.Day, ct);
        int issued = 0, alreadyBilled = 0, errors = 0;

        foreach (var account in accounts)
        {
            try
            {
                var invoice = await BillAccountAsync(account, BillingPeriod.Containing(runDate, account.BillingDay), runDate, ct);
                if (invoice is null)
                {
                    alreadyBilled++;
                    continue;
                }

                issued++;
                await PostToLedgerAsync(invoice, account, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                errors++;
                _logger.LogError(ex, "Billing run failed for account {AccountNumber} on {RunDate}", account.Number, runDate);
            }
        }

        _logger.LogInformation(
            "Billing run {RunDate}: {Accounts} accounts, {Issued} invoices issued, {AlreadyBilled} already billed, {Errors} errors",
            runDate, accounts.Count, issued, alreadyBilled, errors);
        return new BillingRunSummary(runDate, accounts.Count, issued, alreadyBilled, errors);
    }

    /// <summary>
    /// Builds, issues and commits one account's invoice for <paramref name="period"/>. Returns null when
    /// the period has already been invoiced or there is nothing to bill.
    /// </summary>
    internal async Task<Invoice?> BillAccountAsync(Account account, BillingPeriod period, DateOnly issueDate, CancellationToken ct)
    {
        if (await _invoices.ExistsForPeriodAsync(account.Id, period.Start, ct))
        {
            return null;
        }

        var billable = await LoadBillableServicesAsync(account.Id, period, ct);
        var planChanges = await _planChanges.ListUnbilledCompletedAsync(account.Id, ct);
        var adjustments = await _adjustments.ListUnbilledAsync(account.Id, ct);
        var usageCharges = await CalculateUsageChargesAsync(billable, period.Previous(), ct);
        var lastInvoice = await _invoices.GetLatestIssuedAsync(account.Id, ct);
        var creditBroughtForward = lastInvoice?.CreditCarriedForward ?? Money.Zero(account.Currency);

        var inputs = new InvoiceInputs(account, period, billable, planChanges, usageCharges, adjustments, creditBroughtForward);
        var number = await _references.NextInvoiceNumberAsync(period.Start, ct);
        var invoice = InvoiceBuilder.Build(Guid.NewGuid(), number, inputs, _clock.UtcNow);
        if (invoice.Lines.Count == 0)
        {
            return null;
        }

        invoice.Issue(issueDate, _options.PaymentTermsDays, _options.TaxRateBasisPoints, _clock.UtcNow);

        foreach (var change in planChanges.Where(c => c.BilledOnInvoiceId is null))
        {
            change.MarkBilled(invoice.Id);
        }

        foreach (var adjustment in adjustments.Where(a => !a.IsBilled))
        {
            adjustment.MarkBilled(invoice.Id);
        }

        _invoices.Add(invoice);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Invoice {InvoiceNumber} issued to {AccountNumber} for {Period}: total {Total}, due {DueOn}",
            invoice.InvoiceNumber, account.Number, period, invoice.Total, invoice.DueOn);
        return invoice;
    }

    public async Task<CollectionsRunSummary> ProcessCollectionsAsync(CancellationToken ct)
    {
        var today = _clock.Today;
        var late = await _invoices.ListPayableDueByAsync(today.AddDays(-1), ct);
        int markedOverdue = 0, lateFees = 0, suspended = 0, errors = 0;

        foreach (var invoice in late)
        {
            try
            {
                if (invoice.MarkOverdueIfLate(today))
                {
                    markedOverdue++;
                }

                var daysOverdue = invoice.DaysOverdue(today);
                if (await RaiseLateFeeIfDueAsync(invoice, daysOverdue, ct))
                {
                    lateFees++;
                }

                if (daysOverdue >= _options.SuspendAfterDaysOverdue && await SuspendForArrearsAsync(invoice, daysOverdue, ct))
                {
                    suspended++;
                }

                await _unitOfWork.SaveChangesAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                errors++;
                _logger.LogError(ex, "Collections processing failed for invoice {InvoiceNumber}", invoice.InvoiceNumber);
            }
        }

        _logger.LogInformation(
            "Collections: {Overdue} invoices marked overdue, {Fees} late fees raised, {Suspended} accounts suspended, {Errors} errors",
            markedOverdue, lateFees, suspended, errors);
        return new CollectionsRunSummary(markedOverdue, lateFees, suspended, errors);
    }

    private async Task<IReadOnlyList<(Service Service, Plan Plan)>> LoadBillableServicesAsync(Guid accountId, BillingPeriod period, CancellationToken ct)
    {
        var services = (await _services.ListByAccountAsync(accountId, ct))
            .Where(s => s.ActivatedOn is { } activated && activated < period.End)
            .Where(s => s.CancelledOn is not { } cancelled || cancelled > period.Start.AddMonths(-1))
            .ToList();
        if (services.Count == 0)
        {
            return Array.Empty<(Service, Plan)>();
        }

        var plans = (await _plans.GetManyAsync(services.Select(s => s.PlanId).Distinct(), ct)).ToDictionary(p => p.Id);
        return services.Select(s => (Service: s, Plan: plans[s.PlanId])).ToList();
    }

    /// <summary>Overage is billed in arrears: usage in the previous cycle above the plan's allowance.</summary>
    private async Task<IReadOnlyList<UsageCharge>> CalculateUsageChargesAsync(
        IReadOnlyList<(Service Service, Plan Plan)> services, BillingPeriod usagePeriod, CancellationToken ct)
    {
        var charges = new List<UsageCharge>();
        foreach (var (service, plan) in services.Where(s => s.Plan.OveragePerGb is not null))
        {
            var records = await _usage.ListAsync(service.Id, usagePeriod.Start, usagePeriod.End, ct);
            if (FairUsePolicy.Summarise(service.Id, usagePeriod, plan, records).Charge is { } charge)
            {
                charges.Add(charge);
            }
        }

        return charges;
    }

    private async Task<bool> RaiseLateFeeIfDueAsync(Invoice invoice, int daysOverdue, CancellationToken ct)
    {
        if (_options.LatePaymentFeeMinor <= 0 || daysOverdue < _options.LatePaymentFeeAfterDays)
        {
            return false;
        }

        var source = $"late-fee:{invoice.InvoiceNumber}";
        if (await _adjustments.ExistsForSourceAsync(invoice.AccountId, null, source, ct))
        {
            return false;
        }

        _adjustments.Add(new AccountAdjustment(
            Guid.NewGuid(),
            invoice.AccountId,
            null,
            AdjustmentReason.LatePaymentFee,
            $"Late payment fee for invoice {invoice.InvoiceNumber}",
            Money.FromMinor(_options.LatePaymentFeeMinor, invoice.Currency),
            SystemActors.BillingRun,
            _clock.UtcNow,
            sourceReference: source));
        return true;
    }

    private async Task<bool> SuspendForArrearsAsync(Invoice invoice, int daysOverdue, CancellationToken ct)
    {
        var account = await _accounts.GetByIdAsync(invoice.AccountId, ct);
        if (account is null || account.Status != AccountStatus.Active)
        {
            return false;
        }

        account.Suspend($"{ArrearsSuspensionPrefix} invoice {invoice.InvoiceNumber} is {daysOverdue} days overdue", _clock.UtcNow);
        _logger.LogWarning("Account {AccountNumber} suspended for arrears on {InvoiceNumber}", account.Number, invoice.InvoiceNumber);
        return true;
    }

    private async Task PostToLedgerAsync(Invoice invoice, Account account, CancellationToken ct)
    {
        try
        {
            await _billingSystem.PostInvoiceAsync(invoice, account.Number.Value, ct);
        }
        catch (ExternalServiceException ex)
        {
            // The invoice stands; finance reconciles unposted invoices from the ledger exception report.
            _logger.LogError(ex, "Invoice {InvoiceNumber} issued but not posted to the ledger", invoice.InvoiceNumber);
        }
    }
}
```

## apps/uconnect/src/Uconnect.Application/Billing/InvoiceService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Billing/InvoiceService.cs`.

```csharp
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Billing;

/// <summary>
/// Customer view of invoices: history, detail with lines and payments, PDF download and the
/// current balance. Draft invoices are internal to the billing run and only visible to agents.
/// </summary>
public sealed class InvoiceService
{
    private readonly AccountAccessGuard _guard;
    private readonly IInvoiceRepository _invoices;
    private readonly IPaymentRepository _payments;
    private readonly IServiceRepository _services;
    private readonly IBillingSystemClient _billingSystem;
    private readonly ICurrentUser _currentUser;
    private readonly IClock _clock;

    public InvoiceService(
        AccountAccessGuard guard,
        IInvoiceRepository invoices,
        IPaymentRepository payments,
        IServiceRepository services,
        IBillingSystemClient billingSystem,
        ICurrentUser currentUser,
        IClock clock)
    {
        _guard = guard;
        _invoices = invoices;
        _payments = payments;
        _services = services;
        _billingSystem = billingSystem;
        _currentUser = currentUser;
        _clock = clock;
    }

    public async Task<PagedResult<InvoiceSummaryDto>> ListAsync(string accountNumber, string? status, PageRequest page, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        InvoiceStatus? filter = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = EnumParsing.Parse<InvoiceStatus>(status, "status");
            if (parsed == InvoiceStatus.Draft && !_currentUser.IsSupportAgent)
            {
                throw new RequestValidationException("status", "Draft invoices are not available.");
            }

            filter = parsed;
        }

        var result = await _invoices.ListByAccountAsync(account.Id, filter, page, ct);
        var today = _clock.Today;
        return result.Map(i => i.ToSummaryDto(today));
    }

    public async Task<InvoiceDetailDto> GetAsync(string accountNumber, string invoiceNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var invoice = await LoadVisibleAsync(account.Id, invoiceNumber, ct);

        var serviceReferences = (await _services.ListByAccountAsync(account.Id, ct))
            .ToDictionary(s => s.Id, s => s.ServiceReference);
        var payments = await _payments.ListByInvoiceAsync(invoice.Id, ct);

        return new InvoiceDetailDto(
            invoice.ToSummaryDto(_clock.Today),
            invoice.Lines.Select(l => l.ToDto(serviceReferences)).ToList(),
            invoice.Subtotal.ToDto(),
            invoice.TaxTotal.ToDto(),
            invoice.TaxRateBasisPoints,
            invoice.AmountPaid.ToDto(),
            invoice.CreditCarriedForward.ToDto(),
            invoice.VoidReason,
            payments.OrderByDescending(p => p.CreatedAt).Select(p => p.ToDto(invoice.InvoiceNumber)).ToList());
    }

    /// <summary>The rendered PDF held by the finance system. Only issued invoices have one.</summary>
    public async Task<InvoiceDocument> GetPdfAsync(string accountNumber, string invoiceNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var invoice = await LoadVisibleAsync(account.Id, invoiceNumber, ct);
        if (invoice.Status == InvoiceStatus.Draft)
        {
            throw new ConflictException("invoice.not_issued", "A PDF is only available once the invoice has been issued.");
        }

        return await _billingSystem.GetInvoicePdfAsync(invoice.InvoiceNumber, ct)
            ?? throw new NotFoundException("InvoiceDocument", invoice.InvoiceNumber);
    }

    public async Task<AccountBalanceDto> GetBalanceAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var payable = await _invoices.ListPayableAsync(account.Id, ct);
        return BuildBalance(payable, account.Currency);
    }

    internal static AccountBalanceDto BuildBalance(IReadOnlyCollection<Invoice> payable, string currency)
    {
        var overdue = payable.Where(i => i.Status == InvoiceStatus.Overdue).SumBalance(currency);
        var next = payable
            .Where(i => i.Status != InvoiceStatus.Overdue && i.DueOn is not null && i.BalanceDue.IsPositive)
            .OrderBy(i => i.DueOn)
            .FirstOrDefault();

        return new AccountBalanceDto(
            payable.SumBalance(currency).ToDto(),
            overdue.ToDto(),
            payable.Count,
            next?.DueOn,
            next?.InvoiceNumber);
    }

    private async Task<Invoice> LoadVisibleAsync(Guid accountId, string invoiceNumber, CancellationToken ct)
    {
        var invoice = await _invoices.GetByNumberAsync(accountId, invoiceNumber.Trim().ToUpperInvariant(), ct);
        if (invoice is null || (invoice.Status == InvoiceStatus.Draft && !_currentUser.IsSupportAgent))
        {
            throw new NotFoundException("Invoice", invoiceNumber);
        }

        return invoice;
    }
}
```

## apps/uconnect/src/Uconnect.Application/Common/Abstractions.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Common/Abstractions.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Application.Common;

/// <summary>Source of the current time; injected so business rules are testable.</summary>
public interface IClock
{
    DateTimeOffset UtcNow { get; }

    /// <summary>Today's date in the business time zone (UK).</summary>
    DateOnly Today { get; }
}

/// <summary>The authenticated caller, resolved from the bearer token.</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }

    /// <summary>Stable internal id derived from the identity provider subject.</summary>
    Guid UserId { get; }

    /// <summary>OIDC <c>sub</c> claim.</summary>
    string SubjectId { get; }

    string DisplayName { get; }

    string? Email { get; }

    IReadOnlyCollection<string> Roles { get; }

    bool IsInRole(string role);

    bool IsSupportAgent => IsInRole(UserRoles.SupportAgent);
}

/// <summary>Commits a business transaction and dispatches the domain events it raised.</summary>
public interface IUnitOfWork
{
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}

public enum ReferenceKind
{
    Ticket,
    Appointment,
    Outage,
    Service,
}

/// <summary>Generates human-friendly, unique references (TKT-000123, APT-000045, INV-202611-000001...).</summary>
public interface IReferenceGenerator
{
    Task<string> NextAsync(ReferenceKind kind, CancellationToken cancellationToken = default);

    Task<string> NextInvoiceNumberAsync(DateOnly periodStart, CancellationToken cancellationToken = default);
}

/// <summary>Public holidays used for engineer scheduling and working-day calculations.</summary>
public interface IHolidayCalendar
{
    Task<IReadOnlySet<DateOnly>> GetHolidaysAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
}

/// <summary>Handles a domain event after the transaction that raised it has committed.</summary>
public interface IDomainEventHandler<in TEvent>
    where TEvent : IDomainEvent
{
    Task HandleAsync(TEvent domainEvent, CancellationToken cancellationToken);
}

/// <summary>Routes domain events to their registered handlers.</summary>
public interface IDomainEventDispatcher
{
    Task DispatchAsync(IEnumerable<IDomainEvent> events, CancellationToken cancellationToken);
}
```

## apps/uconnect/src/Uconnect.Application/Common/AccountAccessGuard.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Common/AccountAccessGuard.cs`.

```csharp
using Uconnect.Application.Abstractions;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Common;

/// <summary>What the caller wants to do with an account.</summary>
public enum AccountPermission
{
    /// <summary>Read profile, services, invoices, usage, outages.</summary>
    View,

    /// <summary>Raise and comment on tickets, book visits.</summary>
    Support,

    /// <summary>Pay, manage payment methods and autopay, change plans, edit the profile.</summary>
    Manage,

    /// <summary>Manage other users on a business account.</summary>
    Administer,
}

/// <summary>
/// Resolves an account by number and verifies the caller may act on it. Customers must hold an
/// active <see cref="AccountUser"/> membership; support agents may access any account. A missing
/// membership is reported as "not found" so account numbers cannot be enumerated.
/// </summary>
public sealed class AccountAccessGuard
{
    private readonly IAccountRepository _accounts;
    private readonly IAccountUserRepository _accountUsers;
    private readonly ICurrentUser _currentUser;

    public AccountAccessGuard(IAccountRepository accounts, IAccountUserRepository accountUsers, ICurrentUser currentUser)
    {
        _accounts = accounts;
        _accountUsers = accountUsers;
        _currentUser = currentUser;
    }

    public async Task<Account> AuthorizeAsync(string accountNumber, AccountPermission permission, CancellationToken ct)
    {
        if (!_currentUser.IsAuthenticated)
        {
            throw new ForbiddenException("Authentication is required.");
        }

        if (!AccountNumber.TryParse(accountNumber, out var number))
        {
            throw new RequestValidationException("accountNumber", "Account number must look like ACC-12345678.");
        }

        var account = await _accounts.GetByNumberAsync(number!, ct).ConfigureAwait(false)
            ?? throw new NotFoundException("Account", number!.Value);

        if (_currentUser.IsSupportAgent)
        {
            return account;
        }

        var membership = await _accountUsers.FindActiveAsync(account.Id, _currentUser.SubjectId, ct).ConfigureAwait(false)
            ?? throw new NotFoundException("Account", number!.Value);

        if (!RoleAllows(membership.Role, permission))
        {
            throw new ForbiddenException($"Your role on account {number} does not allow this action.");
        }

        return account;
    }

    /// <summary>Role → permission matrix for customer roles.</summary>
    public static bool RoleAllows(string role, AccountPermission permission) => role switch
    {
        UserRoles.Consumer => permission != AccountPermission.Administer,
        UserRoles.BusinessAdmin => true,
        UserRoles.BusinessUser => permission is AccountPermission.View or AccountPermission.Support,
        _ => false,
    };
}
```

## apps/uconnect/src/Uconnect.Application/Common/AppointmentOptions.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Common/AppointmentOptions.cs`.

```csharp
using System.ComponentModel.DataAnnotations;

namespace Uconnect.Application.Common;

/// <summary>Engineer visit charges (section <c>Uconnect:Appointments</c>).</summary>
public sealed class AppointmentOptions
{
    public const string SectionName = "Uconnect:Appointments";

    /// <summary>Call-out fee charged when a customer cancels inside the change cut-off, in minor units.</summary>
    [Range(0, 100_000)]
    public long LateCancellationFeeMinor { get; set; } = 25_00;

    public bool ChargeLateCancellation { get; set; } = true;
}
```

## apps/uconnect/src/Uconnect.Application/Common/EnumParsing.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Common/EnumParsing.cs`.

```csharp
namespace Uconnect.Application.Common;

/// <summary>
/// Parses enum names received on the wire. Accepts the PascalCase names emitted by the API
/// (<c>InProgress</c>) and the SCREAMING_SNAKE vocabulary of CONVENTIONS.md (<c>IN_PROGRESS</c>), but
/// never numeric values, so clients cannot depend on enum ordinals.
/// </summary>
public static class EnumParsing
{
    public static bool TryParse<TEnum>(string? value, out TEnum result)
        where TEnum : struct, Enum
    {
        result = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var candidate = value.Trim().Replace("_", string.Empty, StringComparison.Ordinal);
        if (candidate.Length == 0 || !char.IsLetter(candidate[0]))
        {
            return false;
        }

        return Enum.TryParse(candidate, ignoreCase: true, out result) && Enum.IsDefined(result);
    }

    /// <summary>Parses <paramref name="value"/> or throws a field-level validation error naming the allowed values.</summary>
    public static TEnum Parse<TEnum>(string? value, string field)
        where TEnum : struct, Enum
    {
        if (TryParse<TEnum>(value, out var result))
        {
            return result;
        }

        throw new RequestValidationException(field, $"'{value}' is not valid. Allowed values: {string.Join(", ", Enum.GetNames<TEnum>())}.");
    }

    public static bool IsValid<TEnum>(string? value)
        where TEnum : struct, Enum => TryParse<TEnum>(value, out _);
}
```

## apps/uconnect/src/Uconnect.Application/Common/Exceptions.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Common/Exceptions.cs`.

```csharp
namespace Uconnect.Application.Common;

/// <summary>Base type for application-level failures mapped to RFC 7807 problem responses.</summary>
public abstract class ApplicationExceptionBase : Exception
{
    protected ApplicationExceptionBase(string code, string message, Exception? inner = null) : base(message, inner)
    {
        Code = code;
    }

    /// <summary>Stable machine-readable error code.</summary>
    public string Code { get; }
}

/// <summary>The requested resource does not exist (or is not visible to the caller). Maps to 404.</summary>
public sealed class NotFoundException : ApplicationExceptionBase
{
    public NotFoundException(string resource, object key)
        : base($"{resource.ToLowerInvariant()}.not_found", $"{resource} '{key}' was not found.")
    {
        Resource = resource;
    }

    public string Resource { get; }
}

/// <summary>The caller is authenticated but not allowed to perform the action. Maps to 403.</summary>
public sealed class ForbiddenException : ApplicationExceptionBase
{
    public ForbiddenException(string message) : base("forbidden", message)
    {
    }
}

/// <summary>The request conflicts with current state (duplicate, concurrent edit). Maps to 409.</summary>
public sealed class ConflictException : ApplicationExceptionBase
{
    public ConflictException(string code, string message) : base(code, message)
    {
    }
}

/// <summary>Input failed validation. Maps to 400 with a field → messages dictionary.</summary>
public sealed class RequestValidationException : ApplicationExceptionBase
{
    public RequestValidationException(IReadOnlyDictionary<string, string[]> errors)
        : base("validation_failed", "One or more fields are invalid.")
    {
        Errors = errors;
    }

    public RequestValidationException(string field, string message)
        : this(new Dictionary<string, string[]> { [field] = new[] { message } })
    {
    }

    public IReadOnlyDictionary<string, string[]> Errors { get; }
}

/// <summary>A downstream system (provisioning, payment gateway, billing) failed or is unavailable. Maps to 502/503.</summary>
public sealed class ExternalServiceException : ApplicationExceptionBase
{
    public ExternalServiceException(string service, string message, bool isTransient, Exception? inner = null)
        : base($"{service}.unavailable", message, inner)
    {
        Service = service;
        IsTransient = isTransient;
    }

    public string Service { get; }

    public bool IsTransient { get; }
}
```

## apps/uconnect/src/Uconnect.Application/Common/Paging.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Common/Paging.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Application.Common;

/// <summary>Page request from <c>?page=&amp;pageSize=</c>. Pages are 1-based; page size is clamped to 1..100.</summary>
public sealed record PageRequest(int Page = 1, int PageSize = PageRequest.DefaultPageSize)
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;

    public int Skip => (Page - 1) * PageSize;

    public static PageRequest Normalise(int? page, int? pageSize) => new(
        Math.Max(1, page ?? 1),
        Math.Clamp(pageSize ?? DefaultPageSize, 1, MaxPageSize));
}

/// <summary>Standard paginated response shape: <c>{ items, page, pageSize, total }</c>.</summary>
public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total)
{
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(Total / (double)PageSize);

    public bool HasNext => Page < TotalPages;

    public PagedResult<TOut> Map<TOut>(Func<T, TOut> selector) =>
        new(Items.Select(selector).ToList(), Page, PageSize, Total);

    public static PagedResult<T> Empty(PageRequest request) => new(Array.Empty<T>(), request.Page, request.PageSize, 0);
}

/// <summary>Wire representation of money: integer minor units plus ISO currency.</summary>
public sealed record MoneyDto(long AmountMinor, string Currency)
{
    /// <summary>Convenience display string, e.g. "GBP 34.99". Clients should format from minor units.</summary>
    public string Formatted => Money.FromMinor(AmountMinor, Currency).ToString();
}

public static class MoneyMapping
{
    public static MoneyDto ToDto(this Money money) => new(money.AmountMinor, money.Currency);

    public static MoneyDto? ToDtoOrNull(this Money? money) => money is null ? null : new MoneyDto(money.AmountMinor, money.Currency);

    public static Money ToMoney(this MoneyDto dto) => Money.FromMinor(dto.AmountMinor, dto.Currency);
}
```

## apps/uconnect/src/Uconnect.Application/Common/SystemActors.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Common/SystemActors.cs`.

```csharp
namespace Uconnect.Application.Common;

/// <summary>
/// Fixed user ids recorded as the author of changes made by automated processes rather than a
/// person, so audit trails always say who (or what) raised a charge or credit.
/// </summary>
public static class SystemActors
{
    public static readonly Guid BillingRun = new("5b1c0000-0000-4000-8000-000000000001");

    public static readonly Guid OutageCompensation = new("5b1c0000-0000-4000-8000-000000000002");

    public static readonly Guid AppointmentPolicy = new("5b1c0000-0000-4000-8000-000000000003");

    public static readonly Guid NetworkOperations = new("5b1c0000-0000-4000-8000-000000000004");

    public const string NetworkOperationsName = "Network operations";
}
```

## apps/uconnect/src/Uconnect.Application/Common/UconnectOptions.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Common/UconnectOptions.cs`.

```csharp
using System.ComponentModel.DataAnnotations;
using Uconnect.Domain.Billing;

namespace Uconnect.Application.Common;

/// <summary>Billing configuration (section <c>Uconnect:Billing</c>).</summary>
public sealed class BillingOptions
{
    public const string SectionName = "Uconnect:Billing";

    /// <summary>Days between invoice issue and due date.</summary>
    [Range(0, 60)]
    public int PaymentTermsDays { get; set; } = 14;

    /// <summary>Tax rate in basis points (2000 = 20% VAT).</summary>
    [Range(0, 10_000)]
    public int TaxRateBasisPoints { get; set; } = TaxCalculator.UkStandardVatBasisPoints;

    /// <summary>Late payment fee in minor units applied once an invoice is this many days overdue.</summary>
    [Range(0, 10_000)]
    public long LatePaymentFeeMinor { get; set; } = 500;

    [Range(1, 90)]
    public int LatePaymentFeeAfterDays { get; set; } = 14;

    /// <summary>Accounts are suspended when an invoice is this many days overdue.</summary>
    [Range(7, 120)]
    public int SuspendAfterDaysOverdue { get; set; } = 45;
}

/// <summary>Compensation amounts (section <c>Uconnect:Compensation</c>).</summary>
public sealed class CompensationOptions
{
    public const string SectionName = "Uconnect:Compensation";

    /// <summary>Automatic credit when an engineer misses a confirmed visit, in minor units.</summary>
    [Range(0, 100_000)]
    public long MissedAppointmentCreditMinor { get; set; } = 30_00;

    public bool AutomaticOutageCredits { get; set; } = true;
}

/// <summary>Customer-facing links used in notifications (section <c>Uconnect:Portal</c>).</summary>
public sealed class PortalOptions
{
    public const string SectionName = "Uconnect:Portal";

    [Required]
    [Url]
    public string BaseUrl { get; set; } = "https://my.uniti.example";

    [Required]
    public string SupportPhone { get; set; } = "0800 000 0000";
}
```

## apps/uconnect/src/Uconnect.Application/Common/Validation.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Common/Validation.cs`.

```csharp
using FluentValidation;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Common;

public static class ValidationExtensions
{
    /// <summary>Validates <paramref name="request"/> and throws <see cref="RequestValidationException"/> on failure.</summary>
    public static async Task EnsureValidAsync<T>(this IValidator<T> validator, T request, CancellationToken cancellationToken)
    {
        var result = await validator.ValidateAsync(request, cancellationToken).ConfigureAwait(false);
        if (result.IsValid)
        {
            return;
        }

        var errors = result.Errors
            .GroupBy(e => ToCamelCase(e.PropertyName))
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).Distinct().ToArray());
        throw new RequestValidationException(errors);
    }

    private static string ToCamelCase(string propertyName)
    {
        if (string.IsNullOrEmpty(propertyName))
        {
            return "request";
        }

        return string.Join('.', propertyName.Split('.').Select(p => p.Length == 0 ? p : char.ToLowerInvariant(p[0]) + p[1..]));
    }
}

/// <summary>Reusable rule builders so every validator enforces the same formats as the domain.</summary>
public static class CommonRules
{
    public static IRuleBuilderOptions<T, string?> ValidEmail<T>(this IRuleBuilder<T, string?> rule) =>
        rule.NotEmpty().MaximumLength(254).EmailAddress().WithMessage("Enter a valid e-mail address.");

    public static IRuleBuilderOptions<T, string?> ValidUkPhone<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(BeValidPhone).WithMessage("Enter a valid UK phone number.");

    public static IRuleBuilderOptions<T, string?> ValidPostcode<T>(this IRuleBuilder<T, string?> rule) =>
        rule.NotEmpty().Must(BeValidPostcode).WithMessage("Enter a valid UK postcode.");

    public static IRuleBuilderOptions<T, string?> ValidAccountNumber<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(v => AccountNumber.TryParse(v, out _)).WithMessage("Account number must look like ACC-12345678.");

    public static IRuleBuilderOptions<T, MoneyDto?> PositiveMoney<T>(this IRuleBuilder<T, MoneyDto?> rule) =>
        rule.NotNull()
            .Must(m => m is not null && m.AmountMinor > 0).WithMessage("Amount must be greater than zero.")
            .Must(m => m is not null && m.Currency is "GBP" or "USD" or "EUR").WithMessage("Currency is not supported.");

    public static IRuleBuilderOptions<T, string?> SafeText<T>(this IRuleBuilder<T, string?> rule, int maxLength) =>
        rule.MaximumLength(maxLength).Must(v => v is null || !v.Any(c => char.IsControl(c) && c is not ('\n' or '\r' or '\t')))
            .WithMessage("Text contains unsupported characters.");

    private static bool BeValidPhone(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        try
        {
            PhoneNumber.Create(value);
            return true;
        }
        catch (DomainException)
        {
            return false;
        }
    }

    private static bool BeValidPostcode(string? value)
    {
        try
        {
            _ = new PostalAddress("x", null, "x", value ?? string.Empty);
            return true;
        }
        catch (DomainException)
        {
            return false;
        }
    }
}
```

## apps/uconnect/src/Uconnect.Application/Dashboard/DashboardService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Dashboard/DashboardService.cs`.

```csharp
using Uconnect.Application.Abstractions;
using Uconnect.Application.Appointments;
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Application.Outages;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Dashboard;

public sealed record DashboardDto(
    string AccountNumber,
    string AccountName,
    string AccountStatus,
    AccountBalanceDto Balance,
    InvoiceSummaryDto? LatestInvoice,
    int LiveServices,
    int ServicesWithPendingPlanChange,
    int OpenTickets,
    AppointmentDto? NextAppointment,
    IReadOnlyList<AccountOutageDto> Outages,
    bool AutopayEnabled);

/// <summary>The landing-page snapshot: what is owed, what is happening, and what needs attention.</summary>
public sealed class DashboardService
{
    private readonly AccountAccessGuard _guard;
    private readonly IInvoiceRepository _invoices;
    private readonly IServiceRepository _services;
    private readonly ITicketRepository _tickets;
    private readonly IAppointmentRepository _appointments;
    private readonly IAutopayRepository _autopay;
    private readonly OutageService _outages;
    private readonly IClock _clock;

    public DashboardService(
        AccountAccessGuard guard,
        IInvoiceRepository invoices,
        IServiceRepository services,
        ITicketRepository tickets,
        IAppointmentRepository appointments,
        IAutopayRepository autopay,
        OutageService outages,
        IClock clock)
    {
        _guard = guard;
        _invoices = invoices;
        _services = services;
        _tickets = tickets;
        _appointments = appointments;
        _autopay = autopay;
        _outages = outages;
        _clock = clock;
    }

    public async Task<DashboardDto> GetAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var today = _clock.Today;
        var now = _clock.UtcNow;

        var payable = await _invoices.ListPayableAsync(account.Id, ct);
        var latest = await _invoices.GetLatestIssuedAsync(account.Id, ct);
        var services = await _services.ListByAccountAsync(account.Id, ct);
        var openTickets = await _tickets.ListByAccountAsync(account.Id, openOnly: true, new PageRequest(1, 1), ct);
        var upcoming = await _appointments.ListByAccountAsync(account.Id, upcomingOnly: true, today, ct);
        var autopay = await _autopay.GetByAccountAsync(account.Id, ct);
        var outages = await _outages.ListForAccountAsync(accountNumber, ct);

        return new DashboardDto(
            account.Number.Value,
            account.Name,
            account.Status.ToString(),
            InvoiceService.BuildBalance(payable, account.Currency),
            latest?.ToSummaryDto(today),
            services.Count(s => s.IsLive),
            services.Count(s => s.PendingPlanChangeId is not null),
            openTickets.Total,
            upcoming.Where(a => a.IsActive).OrderBy(a => a.Slot.StartsAtUtc).FirstOrDefault()?.ToDto(now),
            outages,
            autopay?.Enabled == true);
    }
}
```

## apps/uconnect/src/Uconnect.Application/DependencyInjection.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/DependencyInjection.cs`.

```csharp
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Accounts;
using Uconnect.Application.Appointments;
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Application.Dashboard;
using Uconnect.Application.Notifications;
using Uconnect.Application.Outages;
using Uconnect.Application.Payments;
using Uconnect.Application.PlanChanges;
using Uconnect.Application.Services;
using Uconnect.Application.Tickets;
using Uconnect.Application.Usage;

namespace Uconnect.Application;

public static class DependencyInjection
{
    /// <summary>
    /// Registers use-case services, validators and domain event handlers. Everything is scoped so it
    /// shares the request's unit of work. Options and I/O adapters are registered by the infrastructure layer.
    /// </summary>
    public static IServiceCollection AddUconnectApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssemblyContaining<UpdateProfileRequestValidator>(ServiceLifetime.Singleton, includeInternalTypes: true);

        services.AddScoped<AccountAccessGuard>();
        services.AddScoped<CustomerNotifier>();
        services.AddScoped<ProfileService>();
        services.AddScoped<AccountUserService>();
        services.AddScoped<ServiceInventoryService>();
        services.AddScoped<PlanChangeService>();
        services.AddScoped<PlanChangeProcessor>();
        services.AddScoped<InvoiceService>();
        services.AddScoped<BillingRunService>();
        services.AddScoped<AdjustmentService>();
        services.AddScoped<PaymentExecutor>();
        services.AddScoped<PaymentService>();
        services.AddScoped<PaymentMethodService>();
        services.AddScoped<AutopayProcessor>();
        services.AddScoped<TicketService>();
        services.AddScoped<TicketHousekeeping>();
        services.AddScoped<AppointmentService>();
        services.AddScoped<OutageService>();
        services.AddScoped<UsageService>();
        services.AddScoped<DashboardService>();

        RegisterEventHandlers(services);
        return services;
    }

    /// <summary>Registers every <see cref="IDomainEventHandler{TEvent}"/> implementation once per handled event type.</summary>
    private static void RegisterEventHandlers(IServiceCollection services)
    {
        var handlerTypes = typeof(DependencyInjection).Assembly.GetTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false });

        foreach (var type in handlerTypes)
        {
            var handled = type.GetInterfaces()
                .Where(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IDomainEventHandler<>))
                .ToList();
            if (handled.Count == 0)
            {
                continue;
            }

            services.AddScoped(type);
            foreach (var contract in handled)
            {
                services.AddScoped(contract, sp => sp.GetRequiredService(type));
            }
        }
    }
}
```

## apps/uconnect/src/Uconnect.Application/Notifications/CustomerEventHandlers.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Notifications/CustomerEventHandlers.cs`.

```csharp
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;
using Uconnect.Domain.Tickets;

namespace Uconnect.Application.Notifications;

/// <summary>
/// Reacts to committed domain events that the customer must hear about, and applies the automatic
/// missed-visit credit. Each handler reloads what it needs, so it is safe to run after the original
/// transaction has completed.
/// </summary>
public sealed class CustomerEventHandlers :
    IDomainEventHandler<InvoiceIssued>,
    IDomainEventHandler<PaymentFailed>,
    IDomainEventHandler<AutopaySuspended>,
    IDomainEventHandler<TicketResolved>,
    IDomainEventHandler<AppointmentRescheduled>,
    IDomainEventHandler<AppointmentMissed>,
    IDomainEventHandler<AccountSuspended>
{
    private readonly IAccountRepository _accounts;
    private readonly IAdjustmentRepository _adjustments;
    private readonly CustomerNotifier _notifier;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly CompensationOptions _compensation;
    private readonly ILogger<CustomerEventHandlers> _logger;

    public CustomerEventHandlers(
        IAccountRepository accounts,
        IAdjustmentRepository adjustments,
        CustomerNotifier notifier,
        IUnitOfWork unitOfWork,
        IClock clock,
        IOptions<CompensationOptions> compensation,
        ILogger<CustomerEventHandlers> logger)
    {
        _accounts = accounts;
        _adjustments = adjustments;
        _notifier = notifier;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _compensation = compensation.Value;
        _logger = logger;
    }

    public Task HandleAsync(InvoiceIssued domainEvent, CancellationToken cancellationToken) =>
        EmailAsync(domainEvent.AccountId, account => new CustomerMessage(
            $"Your invoice {domainEvent.InvoiceNumber} is ready",
            domainEvent.Total.IsPositive
                ? new[] { $"Your invoice for {domainEvent.Total} is now available and is due on {domainEvent.DueOn:dd MMMM yyyy}." }
                : new[] { $"Your latest invoice shows a credit of {domainEvent.Total.Negate()}, which will be carried forward to your next bill." },
            $"invoices/{domainEvent.InvoiceNumber}"), cancellationToken);

    public Task HandleAsync(PaymentFailed domainEvent, CancellationToken cancellationToken) =>
        EmailAsync(domainEvent.AccountId, account => new CustomerMessage(
            "We couldn't take your payment",
            new[]
            {
                domainEvent.Channel == PaymentChannel.Autopay
                    ? $"Your automatic payment of {domainEvent.Amount} was declined."
                    : $"Your payment of {domainEvent.Amount} was declined.",
                "Please check your payment details or pay with another method to avoid late payment charges.",
            },
            "payments"), cancellationToken);

    public Task HandleAsync(AutopaySuspended domainEvent, CancellationToken cancellationToken) =>
        EmailAsync(domainEvent.AccountId, account => new CustomerMessage(
            "Automatic payments have been switched off",
            new[]
            {
                $"We tried to collect your bill {domainEvent.Failures} times without success, so automatic payments are now off.",
                "Please update your payment method and switch autopay back on, or pay your outstanding invoices manually.",
            },
            "payments/autopay"), cancellationToken);

    public Task HandleAsync(TicketResolved domainEvent, CancellationToken cancellationToken) =>
        EmailAsync(domainEvent.AccountId, account => new CustomerMessage(
            $"Your support ticket {domainEvent.Reference} has been resolved",
            new[] { $"If the problem is not fixed you can reopen the ticket within {Ticket.ReopenWindowDays} days." },
            $"tickets/{domainEvent.Reference}"), cancellationToken);

    public Task HandleAsync(AppointmentRescheduled domainEvent, CancellationToken cancellationToken) =>
        EmailAsync(domainEvent.AccountId, account => new CustomerMessage(
            $"Your engineer visit {domainEvent.Reference} has moved",
            new[] { $"Your visit is now on {domainEvent.To.Date:dddd d MMMM yyyy} ({domainEvent.To.Window.ToString().ToLowerInvariant()})." },
            "appointments"), cancellationToken);

    public Task HandleAsync(AccountSuspended domainEvent, CancellationToken cancellationToken) =>
        EmailAsync(domainEvent.AccountId, account => new CustomerMessage(
            "Your account has been suspended",
            new[] { "Your account has been suspended. Please pay your overdue balance or contact us to restore full service." },
            "invoices"), cancellationToken);

    /// <summary>Credits the customer automatically when our engineer failed to attend a confirmed visit.</summary>
    public async Task HandleAsync(AppointmentMissed domainEvent, CancellationToken cancellationToken)
    {
        if (!domainEvent.MissedByProvider || _compensation.MissedAppointmentCreditMinor <= 0)
        {
            return;
        }

        var account = await _accounts.GetByIdAsync(domainEvent.AccountId, cancellationToken);
        var source = $"missed-visit:{domainEvent.Reference}";
        if (account is null || await _adjustments.ExistsForSourceAsync(account.Id, domainEvent.ServiceId, source, cancellationToken))
        {
            return;
        }

        var credit = Money.FromMinor(_compensation.MissedAppointmentCreditMinor, account.Currency);
        _adjustments.Add(new AccountAdjustment(
            Guid.NewGuid(),
            account.Id,
            domainEvent.ServiceId,
            AdjustmentReason.MissedAppointmentCompensation,
            $"Compensation for missed engineer visit {domainEvent.Reference}",
            credit.Negate(),
            SystemActors.AppointmentPolicy,
            _clock.UtcNow,
            sourceReference: source));
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Missed-visit credit of {Credit} raised for {AccountNumber} ({Reference})", credit, account.Number, domainEvent.Reference);

        await _notifier.EmailAsync(account, new CustomerMessage(
            "We're sorry we missed your appointment",
            new[]
            {
                $"Our engineer did not attend visit {domainEvent.Reference}. A credit of {credit} will appear on your next invoice.",
                "Please book a new visit at a time that suits you.",
            },
            "appointments"), cancellationToken);
    }

    private async Task EmailAsync(Guid accountId, Func<Account, CustomerMessage> compose, CancellationToken ct)
    {
        var account = await _accounts.GetByIdAsync(accountId, ct);
        if (account is null || account.Status == AccountStatus.Closed)
        {
            return;
        }

        await _notifier.EmailAsync(account, compose(account), ct);
    }
}
```

## apps/uconnect/src/Uconnect.Application/Notifications/CustomerNotifier.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Notifications/CustomerNotifier.cs`.

```csharp
using System.Net;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;

namespace Uconnect.Application.Notifications;

/// <summary>A customer-facing message rendered once and delivered as HTML and plain-text e-mail, and optionally SMS.</summary>
public sealed record CustomerMessage(string Subject, IReadOnlyList<string> Paragraphs, string? PortalPath = null, string? SmsText = null);

/// <summary>
/// Sends notifications to an account's billing contact. Delivery is best effort: a failing mail or
/// SMS provider is logged and never rolls back the business change that triggered the message.
/// </summary>
public sealed class CustomerNotifier
{
    private readonly IEmailSender _email;
    private readonly ISmsSender _sms;
    private readonly PortalOptions _portal;
    private readonly ILogger<CustomerNotifier> _logger;

    public CustomerNotifier(IEmailSender email, ISmsSender sms, IOptions<PortalOptions> portal, ILogger<CustomerNotifier> logger)
    {
        _email = email;
        _sms = sms;
        _portal = portal.Value;
        _logger = logger;
    }

    /// <summary>E-mails the billing contact. Returns true when the provider accepted the message.</summary>
    public async Task<bool> EmailAsync(Account account, CustomerMessage message, CancellationToken ct)
    {
        var link = message.PortalPath is null ? null : $"{_portal.BaseUrl.TrimEnd('/')}/{message.PortalPath.TrimStart('/')}";
        var greeting = $"Hello {account.Name},";
        var footer = $"If you have any questions call us on {_portal.SupportPhone}. Account {account.Number}.";

        var text = string.Join("\n\n", new[] { greeting }.Concat(message.Paragraphs).Append(link ?? string.Empty).Append(footer).Where(p => p.Length > 0));
        var html = string.Concat(
            $"<p>{WebUtility.HtmlEncode(greeting)}</p>",
            string.Concat(message.Paragraphs.Select(p => $"<p>{WebUtility.HtmlEncode(p)}</p>")),
            link is null ? string.Empty : $"<p><a href=\"{WebUtility.HtmlEncode(link)}\">View in Uconnect</a></p>",
            $"<p><small>{WebUtility.HtmlEncode(footer)}</small></p>");

        try
        {
            await _email.SendAsync(new EmailMessage(account.BillingEmail.Value, message.Subject, html, text), ct);
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "E-mail '{Subject}' to account {AccountNumber} could not be sent", message.Subject, account.Number);
            return false;
        }
    }

    /// <summary>Sends the SMS variant when the account has opted into SMS alerts and has a phone number.</summary>
    public async Task<bool> SmsAsync(Account account, CustomerMessage message, CancellationToken ct)
    {
        if (!account.OutageSmsAlerts || account.Phone is null || string.IsNullOrWhiteSpace(message.SmsText))
        {
            return false;
        }

        try
        {
            await _sms.SendAsync(account.Phone, message.SmsText, ct);
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "SMS to account {AccountNumber} could not be sent", account.Number);
            return false;
        }
    }
}
```

## apps/uconnect/src/Uconnect.Application/Outages/OutageDtos.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Outages/OutageDtos.cs`.

```csharp
using FluentValidation;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;

namespace Uconnect.Application.Outages;

public sealed record OutageUpdateDto(string Status, string Message, DateTimeOffset PostedAt);

public sealed record OutageDto(
    string Reference,
    string Title,
    string Description,
    string Severity,
    string Status,
    IReadOnlyList<string> AffectedAreas,
    DateTimeOffset StartedAt,
    DateTimeOffset? EstimatedResolutionAt,
    DateTimeOffset? ResolvedAt,
    IReadOnlyList<OutageUpdateDto> Updates);

/// <summary>An outage together with the account's services it affects.</summary>
public sealed record AccountOutageDto(OutageDto Outage, IReadOnlyList<string> AffectedServiceReferences);

public sealed record DeclareOutageRequest(
    string Title,
    string Description,
    string Severity,
    IReadOnlyList<string> AffectedAreas,
    DateTimeOffset StartedAt,
    DateTimeOffset? EstimatedResolutionAt);

public sealed record PostOutageUpdateRequest(string Status, string Message, DateTimeOffset? EstimatedResolutionAt);

public sealed record AddOutageAreasRequest(IReadOnlyList<string> AffectedAreas);

internal static class OutageRules
{
    public static IRuleBuilderOptions<T, IReadOnlyList<string>> OutwardCodes<T>(this IRuleBuilder<T, IReadOnlyList<string>> rule) =>
        rule.NotEmpty().WithMessage("At least one postcode district is required.")
            .Must(codes => codes is null || codes.Count <= 200).WithMessage("At most 200 postcode districts per request.")
            .Must(codes => codes is null || codes.All(c => !string.IsNullOrWhiteSpace(c) && c.Trim().Length <= 4 && char.IsLetter(c.Trim()[0]) && c.Trim().All(char.IsLetterOrDigit)))
            .WithMessage("Postcode districts must be outward codes such as 'LS1'.");
}

public sealed class DeclareOutageRequestValidator : AbstractValidator<DeclareOutageRequest>
{
    public DeclareOutageRequestValidator()
    {
        RuleFor(r => r.Title).NotEmpty().MaximumLength(150).SafeText(150);
        RuleFor(r => r.Description).NotEmpty().MaximumLength(2000).SafeText(2000);
        RuleFor(r => r.Severity).Must(EnumParsing.IsValid<OutageSeverity>).WithMessage("Severity must be Minor, Major or Critical.");
        RuleFor(r => r.AffectedAreas).OutwardCodes();
        RuleFor(r => r.EstimatedResolutionAt).GreaterThan(r => r.StartedAt).When(r => r.EstimatedResolutionAt is not null);
    }
}

public sealed class PostOutageUpdateRequestValidator : AbstractValidator<PostOutageUpdateRequest>
{
    public PostOutageUpdateRequestValidator()
    {
        RuleFor(r => r.Status).Must(EnumParsing.IsValid<OutageStatus>)
            .WithMessage($"Status must be one of: {string.Join(", ", Enum.GetNames<OutageStatus>())}.");
        RuleFor(r => r.Message).NotEmpty().MaximumLength(2000).SafeText(2000);
    }
}

public sealed class AddOutageAreasRequestValidator : AbstractValidator<AddOutageAreasRequest>
{
    public AddOutageAreasRequestValidator()
    {
        RuleFor(r => r.AffectedAreas).OutwardCodes();
    }
}

internal static class OutageMapping
{
    public static OutageDto ToDto(this Outage outage) => new(
        outage.Reference,
        outage.Title,
        outage.Description,
        outage.Severity.ToString(),
        outage.Status.ToString(),
        outage.AffectedOutwardCodes.ToList(),
        outage.StartedAt,
        outage.EstimatedResolutionAt,
        outage.ResolvedAt,
        outage.Updates.OrderByDescending(u => u.PostedAt).Select(u => new OutageUpdateDto(u.Status.ToString(), u.Message, u.PostedAt)).ToList());
}
```
