using IConnect.Wholesale.Api.Security;
using IConnect.Wholesale.Application.Sla;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Controllers;

[ApiController]
[Route("api/v1/sla")]
[Produces("application/json")]
public sealed class SlaController : ControllerBase
{
    private readonly SlaDashboardService _dashboard;
    private readonly SlaBreachMonitor _monitor;

    public SlaController(SlaDashboardService dashboard, SlaBreachMonitor monitor)
    {
        _dashboard = dashboard;
        _monitor = monitor;
    }

    /// <summary>Contractual repair targets, order lead times and service-credit terms.</summary>
    [HttpGet("policy")]
    [Authorize(Policy = ApiScopes.CatalogueRead)]
    [ProducesResponseType(typeof(SlaPolicyDto), StatusCodes.Status200OK)]
    public SlaPolicyDto Policy() => _dashboard.GetPolicy();

    /// <summary>Live SLA position for the caller's partner: at-risk and breached work, and credits accrued this month.</summary>
    [HttpGet("summary")]
    [Authorize(Policy = ApiScopes.OrdersRead)]
    [ProducesResponseType(typeof(SlaSummaryDto), StatusCodes.Status200OK)]
    public Task<SlaSummaryDto> Summary(CancellationToken ct) => _dashboard.GetSummaryAsync(ct);

    /// <summary>Runs one breach-monitor sweep immediately (normally scheduled).</summary>
    [HttpPost("sweep")]
    [Authorize(Policy = Policies.SupportOnly)]
    [ProducesResponseType(typeof(SlaSweepResult), StatusCodes.Status200OK)]
    public Task<SlaSweepResult> Sweep(CancellationToken ct) => _monitor.SweepAsync(ct);
}
