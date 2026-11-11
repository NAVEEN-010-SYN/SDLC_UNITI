using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Sla;
using Microsoft.Extensions.Logging;

namespace IConnect.Wholesale.Application.Faults;

public sealed record RaiseFaultRequest(Guid ServiceId, string Priority, string Category, string Description);

public sealed record FaultNoteRequest(string Text);

public sealed record FaultTransitionRequest(string Action, string? Note, string? ResolutionCode);

public sealed record FaultSlaDto(string Status, double ElapsedWorkingHours, double TargetWorkingHours, DateTimeOffset? DueAt, string Calendar);

public sealed record FaultNoteDto(DateTimeOffset At, string Author, string Text);

public sealed record FaultSummaryDto(Guid Id, string Reference, string ServiceUprn, string Priority, string Status, string Category,
    string SlaStatus, DateTimeOffset? DueAt, DateTimeOffset CreatedAt);

public sealed record FaultDetailDto(Guid Id, string Reference, Guid ServiceId, string Uprn, string Priority, string Category, string CareLevel,
    string Status, string Description, FaultSlaDto Sla, DateTimeOffset? ResolvedAt, string? ResolutionCode, long? ServiceCreditMinor,
    string? ServiceCreditBasis, IReadOnlyList<string> AllowedActions, IReadOnlyList<FaultNoteDto> Notes, DateTimeOffset CreatedAt);

/// <summary>Fault raising and handling, including SLA clock control and credit assessment.</summary>
public sealed class FaultService
{
    private readonly IFaultRepository _faults;
    private readonly IServiceRepository _services;
    private readonly IReferenceGenerator _references;
    private readonly ICalendarProvider _calendars;
    private readonly SlaPolicy _policy;
    private readonly ServiceCreditCalculator _credits;
    private readonly ICurrentCaller _caller;
    private readonly IClock _clock;
    private readonly IUnitOfWork _uow;
    private readonly ILogger<FaultService> _logger;

    public FaultService(IFaultRepository faults, IServiceRepository services, IReferenceGenerator references, ICalendarProvider calendars,
        SlaPolicy policy, ServiceCreditCalculator credits, ICurrentCaller caller, IClock clock, IUnitOfWork uow, ILogger<FaultService> logger)
    {
        _faults = faults;
        _services = services;
        _references = references;
        _calendars = calendars;
        _policy = policy;
        _credits = credits;
        _caller = caller;
        _clock = clock;
        _uow = uow;
        _logger = logger;
    }

    public async Task<FaultDetailDto> RaiseAsync(RaiseFaultRequest request, CancellationToken ct)
    {
        var (priority, category) = ValidateRaiseRequest(request);

        var service = await _services.GetAsync(request.ServiceId, ct);
        if (service is null || service.PartnerId != _caller.PartnerId)
        {
            throw new NotFoundException("Service", request.ServiceId);
        }

        if (!service.IsActive)
        {
            throw new ConflictException("fault.service_ceased", "Faults cannot be raised on a ceased service.");
        }

        if (await _faults.HasOpenFaultForServiceAsync(service.Id, ct))
        {
            throw new ConflictException("fault.already_open", "An open fault already exists for this service; add a note to it instead.");
        }

        var target = _policy.RepairTarget(service.CareLevel, priority);
        var calendar = _calendars.Get(target.Calendar);
        var reference = await _references.NextAsync("FLT", ct);
        var fault = Fault.Raise(reference, _caller.PartnerId, service.Id, service.Uprn, priority, category, service.CareLevel,
            request.Description, service.MonthlyRental, target, calendar.Name, _clock.UtcNow);

        await _faults.AddAsync(fault, ct);
        await _uow.SaveChangesAsync(ct);
        _logger.LogInformation("Fault {Reference} raised on service {ServiceId} at {Priority}/{Care}", reference, service.Id, fault.Priority, service.CareLevel);
        return ToDetail(fault);
    }

    private static (FaultPriority Priority, FaultCategory Category) ValidateRaiseRequest(RaiseFaultRequest request)
    {
        var priorityOk = Enum.TryParse<FaultPriority>(request.Priority, true, out var priority) && Enum.IsDefined(priority);

        var categoryText = request.Category?.Replace("_", string.Empty, StringComparison.Ordinal);
        var categoryOk = Enum.TryParse<FaultCategory>(categoryText, true, out var category) && Enum.IsDefined(category);

        var descriptionOk = false;
        if (!string.IsNullOrWhiteSpace(request.Description))
        {
            var length = request.Description.Trim().Length;
            descriptionOk = length >= 10 && length <= 2000;
        }

        var v = new ValidationBuilder();
        v.Require(priorityOk, "priority", "Priority must be P1, P2, P3 or P4.");
        v.Require(categoryOk, "category", "Unknown fault category.");
        v.Require(descriptionOk, "description", "Description must be 10 to 2000 characters.");
        v.ThrowIfInvalid();
        return (priority, category);
    }

    public async Task<PagedResult<FaultSummaryDto>> ListAsync(FaultStatus? status, FaultPriority? priority, PageRequest page, CancellationToken ct)
    {
        var result = await _faults.QueryAsync(new FaultQuery(_caller.PartnerId, status, priority, page), ct);
        var now = _clock.UtcNow;
        return result.Map(f =>
        {
            var calendar = _calendars.GetByName(f.RepairClock.CalendarName);
            return new FaultSummaryDto(f.Id, f.Reference, f.Uprn, f.Priority.ToString(), Upper(f.Status), f.Category.ToString(),
                f.RepairClock.Status(calendar, now).ToString(), f.RepairClock.DueAt(calendar, now), f.CreatedAt);
        });
    }

    public async Task<FaultDetailDto> GetAsync(Guid id, CancellationToken ct) => ToDetail(await LoadOwnedAsync(id, ct));

    public async Task<FaultDetailDto> AddNoteAsync(Guid id, FaultNoteRequest request, CancellationToken ct)
    {
        var fault = await LoadOwnedAsync(id, ct);
        fault.AddNote(_clock.UtcNow, _caller.ActorId, request.Text, internalOnly: false);
        await _uow.SaveChangesAsync(ct);
        return ToDetail(fault);
    }

    /// <summary>
    /// Applies a lifecycle action. Partners may respond to a customer query, reopen a resolved
    /// fault or confirm closure; field actions (start, await-customer, resolve) are support only.
    /// </summary>
    public async Task<FaultDetailDto> TransitionAsync(Guid id, FaultTransitionRequest request, CancellationToken ct)
    {
        var fault = await LoadOwnedAsync(id, ct);
        var now = _clock.UtcNow;
        var actor = _caller.ActorId;
        var note = request.Note?.Trim() ?? string.Empty;

        switch (request.Action?.ToLowerInvariant())
        {
            case "respond":
                RequireNote(note);
                fault.CustomerResponded(now, actor, note);
                break;
            case "reopen":
                RequireNote(note);
                fault.Reopen(now, actor, note);
                break;
            case "close":
                fault.Close(now, actor);
                break;
            case "start":
                RequireSupport();
                fault.StartWork(now, actor);
                break;
            case "await-customer":
                RequireSupport();
                RequireNote(note);
                fault.AwaitCustomer(now, actor, note);
                break;
            case "resolve":
                RequireSupport();
                var calendar = _calendars.GetByName(fault.RepairClock.CalendarName);
                fault.Resolve(now, actor, request.ResolutionCode ?? string.Empty, calendar, _credits);
                break;
            default:
                throw new RequestValidationException("action", "Action must be one of respond, reopen, close, start, await-customer, resolve.");
        }

        await _uow.SaveChangesAsync(ct);
        return ToDetail(fault);
    }

    private async Task<Fault> LoadOwnedAsync(Guid id, CancellationToken ct)
    {
        var fault = await _faults.GetAsync(id, ct);
        if (fault is null || (!_caller.IsSupportAgent && fault.PartnerId != _caller.PartnerId))
        {
            throw new NotFoundException("Fault", id);
        }

        return fault;
    }

    private FaultDetailDto ToDetail(Fault f)
    {
        var now = _clock.UtcNow;
        var calendar = _calendars.GetByName(f.RepairClock.CalendarName);
        var clock = f.RepairClock;
        var sla = new FaultSlaDto(clock.Status(calendar, now).ToString(), Math.Round(clock.Elapsed(calendar, now).TotalHours, 2),
            clock.Target.TotalHours, clock.DueAt(calendar, now), calendar.Name);

        return new FaultDetailDto(f.Id, f.Reference, f.ServiceId, f.Uprn, f.Priority.ToString(), f.Category.ToString(), f.CareLevel.ToString(),
            Upper(f.Status), f.Description, sla, f.ResolvedAt, f.ResolutionCode, f.ServiceCredit?.MinorUnits, f.ServiceCreditBasis,
            AllowedActions(f), VisibleNotes(f), f.CreatedAt);
    }

    /// <summary>Internal notes are only shown to support agents.</summary>
    private List<FaultNoteDto> VisibleNotes(Fault f)
    {
        var notes = new List<FaultNoteDto>();
        foreach (var n in f.Notes)
        {
            if (n.InternalOnly && !_caller.IsSupportAgent)
            {
                continue;
            }

            notes.Add(new FaultNoteDto(n.At, n.Author, n.Text));
        }

        return notes;
    }

    private IReadOnlyList<string> AllowedActions(Fault f)
    {
        var actions = new List<string>();
        switch (f.Status)
        {
            case FaultStatus.PendingCustomer:
                actions.Add("respond");
                break;
            case FaultStatus.Resolved:
                actions.Add("close");
                if (f.ResolvedAt is { } at && _clock.UtcNow - at <= Fault.ReopenWindow)
                {
                    actions.Add("reopen");
                }

                break;
        }

        if (_caller.IsSupportAgent)
        {
            if (Fault.CanTransition(f.Status, FaultStatus.InProgress) && f.Status != FaultStatus.Resolved)
            {
                actions.Add("start");
            }

            if (Fault.CanTransition(f.Status, FaultStatus.PendingCustomer))
            {
                actions.Add("await-customer");
            }

            if (Fault.CanTransition(f.Status, FaultStatus.Resolved))
            {
                actions.Add("resolve");
            }
        }

        return actions;
    }

    private void RequireSupport()
    {
        if (!_caller.IsSupportAgent)
        {
            throw new ForbiddenException("Only support agents can perform this action.");
        }
    }

    private static void RequireNote(string note)
    {
        if (note.Length < 5)
        {
            throw new RequestValidationException("note", "A note of at least 5 characters is required for this action.");
        }
    }

    private static string Upper(FaultStatus status) => status switch
    {
        FaultStatus.InProgress => "IN_PROGRESS",
        FaultStatus.PendingCustomer => "PENDING_CUSTOMER",
        _ => status.ToString().ToUpperInvariant(),
    };
}
