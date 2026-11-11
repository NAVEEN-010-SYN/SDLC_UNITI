using IConnect.Wholesale.Api.Security;
using IConnect.Wholesale.Application.ApiKeys;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Controllers;

/// <summary>Partner integration keys. Managed by portal users only; a key can never mint another key.</summary>
[ApiController]
[Route("api/v1/api-keys")]
[Produces("application/json")]
[Authorize(Policy = Policies.PortalUser)]
public sealed class ApiKeysController : ControllerBase
{
    private readonly ApiKeyService _keys;

    public ApiKeysController(ApiKeyService keys)
    {
        _keys = keys;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<ApiKeyDto>), StatusCodes.Status200OK)]
    public Task<IReadOnlyList<ApiKeyDto>> List(CancellationToken ct) => _keys.ListAsync(ct);

    [HttpGet("scopes")]
    [ProducesResponseType(typeof(IEnumerable<string>), StatusCodes.Status200OK)]
    public IEnumerable<string> Scopes() => ApiScopes.All.Order(StringComparer.Ordinal);

    /// <summary>Creates a key. The secret is in the response once and is never retrievable again.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(CreatedApiKeyDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CreatedApiKeyDto>> Create(CreateApiKeyRequest request, CancellationToken ct)
    {
        var created = await _keys.CreateAsync(request, ct);
        Response.Headers.CacheControl = "no-store";
        return StatusCode(StatusCodes.Status201Created, created);
    }

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Revoke(Guid id, CancellationToken ct)
    {
        await _keys.RevokeAsync(id, ct);
        return NoContent();
    }
}
