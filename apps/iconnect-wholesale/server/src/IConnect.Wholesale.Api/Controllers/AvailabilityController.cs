using IConnect.Wholesale.Application.Availability;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Controllers;

[ApiController]
[Route("api/v1/availability")]
[Produces("application/json")]
[Authorize(Policy = ApiScopes.AvailabilityRead)]
public sealed class AvailabilityController : ControllerBase
{
    private readonly AvailabilityService _availability;

    public AvailabilityController(AvailabilityService availability)
    {
        _availability = availability;
    }

    /// <summary>Lists network premises at a postcode so the buyer can pick the right UPRN.</summary>
    [HttpGet("addresses")]
    [ProducesResponseType(typeof(IReadOnlyList<AddressMatchDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public Task<IReadOnlyList<AddressMatchDto>> SearchAddresses([FromQuery] string? postcode, CancellationToken ct) =>
        _availability.SearchAsync(postcode ?? string.Empty, ct);

    /// <summary>What can be sold at a premise, and the earliest completion date.</summary>
    [HttpGet("{uprn}")]
    [ProducesResponseType(typeof(AvailabilityResultDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public Task<AvailabilityResultDto> Check(string uprn, CancellationToken ct) => _availability.CheckAsync(uprn, ct);
}
