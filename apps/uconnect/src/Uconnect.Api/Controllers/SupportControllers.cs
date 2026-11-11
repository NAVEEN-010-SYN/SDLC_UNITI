using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Api.Security;
using Uconnect.Application.Appointments;
using Uconnect.Application.Common;
using Uconnect.Application.Outages;
using Uconnect.Application.Tickets;

namespace Uconnect.Api.Controllers;

public sealed class TicketsController : AccountScopedController
{
    private readonly TicketService _tickets;

    public TicketsController(TicketService tickets) => _tickets = tickets;

    [HttpGet("tickets")]
    public Task<PagedResult<TicketSummaryDto>> List(string accountNumber, [FromQuery] bool openOnly, [FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken ct) =>
        _tickets.ListAsync(accountNumber, openOnly, Page(page, pageSize), ct);

    [HttpGet("tickets/{reference}")]
    public Task<TicketDetailDto> Get(string accountNumber, string reference, CancellationToken ct) => _tickets.GetAsync(accountNumber, reference, ct);

    [HttpPost("tickets")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<ActionResult<TicketDetailDto>> Create(string accountNumber, CreateTicketRequest request, CancellationToken ct)
    {
        var ticket = await _tickets.CreateAsync(accountNumber, request, ct);
        return Created($"/api/v1/accounts/{accountNumber}/tickets/{ticket.Summary.Reference}", ticket);
    }

    [HttpPost("tickets/{reference}/comments")]
    public Task<TicketDetailDto> Comment(string accountNumber, string reference, AddTicketCommentRequest request, CancellationToken ct) =>
        _tickets.AddCommentAsync(accountNumber, reference, request, ct);

    [HttpPost("tickets/{reference}/reopen")]
    public Task<TicketDetailDto> Reopen(string accountNumber, string reference, ReopenTicketRequest request, CancellationToken ct) =>
        _tickets.ReopenAsync(accountNumber, reference, request, ct);

    [HttpPost("tickets/{reference}/close")]
    public Task<TicketDetailDto> Close(string accountNumber, string reference, CancellationToken ct) => _tickets.CloseAsync(accountNumber, reference, ct);

    [HttpPost("tickets/{reference}/assign")]
    [Authorize(Policy = Policies.SupportAgent)]
    public Task<TicketDetailDto> Assign(string accountNumber, string reference, CancellationToken ct) => _tickets.AssignToMeAsync(accountNumber, reference, ct);

    [HttpPost("tickets/{reference}/request-info")]
    [Authorize(Policy = Policies.SupportAgent)]
    public Task<TicketDetailDto> RequestInfo(string accountNumber, string reference, AddTicketCommentRequest request, CancellationToken ct) =>
        _tickets.RequestCustomerInfoAsync(accountNumber, reference, request, ct);

    [HttpPost("tickets/{reference}/resolve")]
    [Authorize(Policy = Policies.SupportAgent)]
    public Task<TicketDetailDto> Resolve(string accountNumber, string reference, ResolveTicketRequest request, CancellationToken ct) =>
        _tickets.ResolveAsync(accountNumber, reference, request, ct);

    [HttpPost("tickets/{reference}/escalate")]
    [Authorize(Policy = Policies.SupportAgent)]
    public Task<TicketDetailDto> Escalate(string accountNumber, string reference, EscalateTicketRequest request, CancellationToken ct) =>
        _tickets.EscalateAsync(accountNumber, reference, request, ct);
}

public sealed class AppointmentsController : AccountScopedController
{
    private readonly AppointmentService _appointments;

    public AppointmentsController(AppointmentService appointments) => _appointments = appointments;

    [HttpGet("appointments")]
    public Task<IReadOnlyList<AppointmentDto>> List(string accountNumber, [FromQuery] bool upcomingOnly, CancellationToken ct) =>
        _appointments.ListAsync(accountNumber, upcomingOnly, ct);

    [HttpGet("appointment-slots")]
    public Task<IReadOnlyList<AvailableSlotDto>> Slots(string accountNumber, [FromQuery] string type, [FromQuery] Guid? serviceId, CancellationToken ct) =>
        _appointments.GetAvailableSlotsAsync(accountNumber, type, serviceId, ct);

    [HttpPost("appointments")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<ActionResult<AppointmentDto>> Book(string accountNumber, BookAppointmentRequest request, CancellationToken ct)
    {
        var appointment = await _appointments.BookAsync(accountNumber, request, ct);
        return Created($"/api/v1/accounts/{accountNumber}/appointments/{appointment.Reference}", appointment);
    }

    [HttpPut("appointments/{reference}/slot")]
    public Task<AppointmentDto> Reschedule(string accountNumber, string reference, RescheduleAppointmentRequest request, CancellationToken ct) =>
        _appointments.RescheduleAsync(accountNumber, reference, request, ct);

    [HttpPut("appointments/{reference}/access-notes")]
    public Task<AppointmentDto> AccessNotes(string accountNumber, string reference, UpdateAccessNotesRequest request, CancellationToken ct) =>
        _appointments.UpdateAccessNotesAsync(accountNumber, reference, request, ct);

    [HttpPost("appointments/{reference}/cancel")]
    public Task<AppointmentDto> Cancel(string accountNumber, string reference, CancelAppointmentRequest request, CancellationToken ct) =>
        _appointments.CancelAsync(accountNumber, reference, request, ct);

    [HttpPost("appointments/{reference}/outcome")]
    [Authorize(Policy = Policies.SupportAgent)]
    public Task<AppointmentDto> Outcome(string accountNumber, string reference, RecordVisitOutcomeRequest request, CancellationToken ct) =>
        _appointments.RecordOutcomeAsync(accountNumber, reference, request, ct);
}

public sealed class AccountOutagesController : AccountScopedController
{
    private readonly OutageService _outages;

    public AccountOutagesController(OutageService outages) => _outages = outages;

    [HttpGet("outages")]
    public Task<IReadOnlyList<AccountOutageDto>> List(string accountNumber, CancellationToken ct) => _outages.ListForAccountAsync(accountNumber, ct);
}

[ApiController]
[Route("api/v1/outages")]
[Authorize(Policy = Policies.Customer)]
public sealed class OutagesController : ControllerBase
{
    private readonly OutageService _outages;

    public OutagesController(OutageService outages) => _outages = outages;

    [HttpGet]
    public Task<PagedResult<OutageDto>> List([FromQuery] bool includeResolved, [FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken ct) =>
        _outages.ListAsync(includeResolved, PageRequest.Normalise(page, pageSize), ct);

    [HttpGet("{reference}")]
    public Task<OutageDto> Get(string reference, CancellationToken ct) => _outages.GetAsync(reference, ct);

    [HttpPost]
    [Authorize(Policy = Policies.SupportAgent)]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<ActionResult<OutageDto>> Declare(DeclareOutageRequest request, CancellationToken ct)
    {
        var outage = await _outages.DeclareAsync(request, ct);
        return Created($"/api/v1/outages/{outage.Reference}", outage);
    }

    [HttpPost("{reference}/updates")]
    [Authorize(Policy = Policies.SupportAgent)]
    public Task<OutageDto> PostUpdate(string reference, PostOutageUpdateRequest request, CancellationToken ct) =>
        _outages.PostUpdateAsync(reference, request, ct);

    [HttpPost("{reference}/areas")]
    [Authorize(Policy = Policies.SupportAgent)]
    public Task<OutageDto> AddAreas(string reference, AddOutageAreasRequest request, CancellationToken ct) =>
        _outages.AddAreasAsync(reference, request, ct);
}
