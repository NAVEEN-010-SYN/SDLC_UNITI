using System.Text;
using IConnect.Wholesale.Api.Http;
using IConnect.Wholesale.Api.Security;
using IConnect.Wholesale.Application.Billing;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Controllers;

public sealed record GenerateStatementRequest(Guid PartnerId, int Year, int Month);

/// <summary>Monthly wholesale statements (invoices) and billing disputes.</summary>
[ApiController]
[Route("api/v1/billing")]
[Produces("application/json")]
public sealed class BillingController : ControllerBase
{
    private readonly BillingService _billing;

    public BillingController(BillingService billing)
    {
        _billing = billing;
    }

    [HttpGet("statements")]
    [Authorize(Policy = ApiScopes.BillingRead)]
    [ProducesResponseType(typeof(PagedResult<StatementSummaryDto>), StatusCodes.Status200OK)]
    public Task<PagedResult<StatementSummaryDto>> ListStatements([FromQuery] PageQuery page, CancellationToken ct) =>
        _billing.ListAsync(page.ToRequest(), ct);

    [HttpGet("statements/{id:guid}")]
    [Authorize(Policy = ApiScopes.BillingRead)]
    [ProducesResponseType(typeof(StatementDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public Task<StatementDetailDto> GetStatement(Guid id, CancellationToken ct) => _billing.GetAsync(id, ct);

    [HttpGet("statements/{id:guid}/export")]
    [Authorize(Policy = ApiScopes.BillingRead)]
    [Produces("text/csv")]
    public async Task<FileContentResult> ExportStatement(Guid id, CancellationToken ct)
    {
        var (fileName, content) = await _billing.ExportCsvAsync(id, ct);
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(content)).ToArray();
        return File(bytes, "text/csv; charset=utf-8", fileName);
    }

    /// <summary>Generates and issues a closed month's statement for a partner (idempotent per partner-month).</summary>
    [HttpPost("statements/generate")]
    [Authorize(Policy = Policies.SupportOnly)]
    [ProducesResponseType(typeof(StatementDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public Task<StatementDetailDto> Generate(GenerateStatementRequest request, CancellationToken ct) =>
        _billing.GenerateAsync(request.PartnerId, request.Year, request.Month, ct);

    [HttpPost("statements/{id:guid}/disputes")]
    [Authorize(Policy = Policies.PortalUser)]
    [ProducesResponseType(typeof(DisputeDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<DisputeDto>> RaiseDispute(Guid id, RaiseDisputeRequest request, CancellationToken ct)
    {
        var dispute = await _billing.RaiseDisputeAsync(id, request, ct);
        return CreatedAtAction(nameof(GetStatement), new { id }, dispute);
    }

    [HttpGet("disputes")]
    [Authorize(Policy = ApiScopes.BillingRead)]
    [ProducesResponseType(typeof(IReadOnlyList<DisputeDto>), StatusCodes.Status200OK)]
    public Task<IReadOnlyList<DisputeDto>> ListDisputes(CancellationToken ct) => _billing.ListDisputesAsync(ct);

    [HttpPost("disputes/{id:guid}/decision")]
    [Authorize(Policy = Policies.SupportOnly)]
    [ProducesResponseType(typeof(DisputeDto), StatusCodes.Status200OK)]
    public Task<DisputeDto> DecideDispute(Guid id, DecideDisputeRequest request, CancellationToken ct) =>
        _billing.DecideDisputeAsync(id, request, ct);
}
