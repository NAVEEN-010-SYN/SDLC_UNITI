using IConnect.Wholesale.Api.Security;
using IConnect.Wholesale.Application.Catalogue;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Controllers;

[ApiController]
[Route("api/v1/catalogue")]
[Produces("application/json")]
public sealed class CatalogueController : ControllerBase
{
    private readonly CatalogueService _catalogue;

    public CatalogueController(CatalogueService catalogue)
    {
        _catalogue = catalogue;
    }

    [HttpGet("products")]
    [Authorize(Policy = ApiScopes.CatalogueRead)]
    [ProducesResponseType(typeof(IReadOnlyList<ProductDto>), StatusCodes.Status200OK)]
    public Task<IReadOnlyList<ProductDto>> ListProducts([FromQuery] bool includeWithdrawn, CancellationToken ct) =>
        _catalogue.ListProductsAsync(includeWithdrawn, ct);

    /// <summary>The price book effective on a date (default: today, UTC).</summary>
    [HttpGet("price-book")]
    [Authorize(Policy = ApiScopes.CatalogueRead)]
    [ProducesResponseType(typeof(PriceBookDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public Task<PriceBookDto> GetPriceBook([FromQuery] DateOnly? onDate, CancellationToken ct) => _catalogue.GetPriceBookAsync(onDate, ct);

    [HttpPost("price-books")]
    [Authorize(Policy = Policies.SupportOnly)]
    [ProducesResponseType(typeof(PriceBookDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PriceBookDto>> PublishPriceBook(NewPriceBookRequest request, CancellationToken ct)
    {
        var book = await _catalogue.PublishPriceBookAsync(request, ct);
        return CreatedAtAction(nameof(GetPriceBook), new { onDate = book.EffectiveFrom.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) }, book);
    }
}
