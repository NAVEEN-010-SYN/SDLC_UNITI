using IConnect.Wholesale.Api.Http;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Application.Faults;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Controllers;

[ApiController]
[Route("api/v1/faults")]
[Produces("application/json")]
public sealed class FaultsController : ControllerBase
{
    private readonly FaultService _faults;

    public FaultsController(FaultService faults)
    {
        _faults = faults;
    }

    [HttpPost]
    [Authorize(Policy = ApiScopes.FaultsWrite)]
    [ProducesResponseType(typeof(FaultDetailDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<FaultDetailDto>> Raise(RaiseFaultRequest request, CancellationToken ct)
    {
        var fault = await _faults.RaiseAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = fault.Id }, fault);
    }

    [HttpGet]
    [Authorize(Policy = ApiScopes.FaultsRead)]
    [ProducesResponseType(typeof(PagedResult<FaultSummaryDto>), StatusCodes.Status200OK)]
    public Task<PagedResult<FaultSummaryDto>> List([FromQuery] string? status, [FromQuery] string? priority, [FromQuery] PageQuery page,
        CancellationToken ct) =>
        _faults.ListAsync(
            QueryParsing.OptionalEnum<FaultStatus>(status, "status"),
            QueryParsing.OptionalEnum<FaultPriority>(priority, "priority"),
            page.ToRequest(),
            ct);

    [HttpGet("{id:guid}")]
    [Authorize(Policy = ApiScopes.FaultsRead)]
    [ProducesResponseType(typeof(FaultDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public Task<FaultDetailDto> Get(Guid id, CancellationToken ct) => _faults.GetAsync(id, ct);

    [HttpPost("{id:guid}/notes")]
    [Authorize(Policy = ApiScopes.FaultsWrite)]
    public Task<FaultDetailDto> AddNote(Guid id, FaultNoteRequest request, CancellationToken ct) => _faults.AddNoteAsync(id, request, ct);

    /// <summary>Applies a lifecycle action (respond, reopen, close; support: start, await-customer, resolve).</summary>
    [HttpPost("{id:guid}/transitions")]
    [Authorize(Policy = ApiScopes.FaultsWrite)]
    [ProducesResponseType(typeof(FaultDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public Task<FaultDetailDto> Transition(Guid id, FaultTransitionRequest request, CancellationToken ct) =>
        _faults.TransitionAsync(id, request, ct);
}
