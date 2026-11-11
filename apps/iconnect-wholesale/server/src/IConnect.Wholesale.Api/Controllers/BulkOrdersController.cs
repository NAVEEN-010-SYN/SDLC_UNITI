using System.Text;
using IConnect.Wholesale.Application.BulkOrders;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Controllers;

[ApiController]
[Route("api/v1/bulk-orders")]
[Authorize(Policy = ApiScopes.OrdersWrite)]
public sealed class BulkOrdersController : ControllerBase
{
    /// <summary>Multipart framing overhead allowed on top of the CSV size limit.</summary>
    private const int MultipartOverheadBytes = 16 * 1024;

    private readonly BulkOrderService _bulk;

    public BulkOrdersController(BulkOrderService bulk)
    {
        _bulk = bulk;
    }

    [HttpGet("template")]
    [Produces("text/csv")]
    public FileContentResult Template() =>
        File(Encoding.UTF8.GetBytes(BulkOrderCsvParser.Template()), "text/csv", "bulk-order-template.csv");

    /// <summary>
    /// Uploads a CSV of orders. With <c>dryRun=true</c> the file is validated only and row errors are
    /// returned; otherwise a fully valid file is placed and per-row outcomes are returned.
    /// A rejected file is still answered 200 with status REJECTED and its row errors.
    /// </summary>
    [HttpPost]
    [Consumes("multipart/form-data")]
    [Produces("application/json")]
    [RequestSizeLimit(BulkOrderService.MaxFileBytes + MultipartOverheadBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = BulkOrderService.MaxFileBytes + MultipartOverheadBytes)]
    [ProducesResponseType(typeof(BulkUploadResultDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<BulkUploadResultDto> Upload(IFormFile? file, [FromQuery] bool dryRun, CancellationToken ct)
    {
        if (file is null)
        {
            throw new RequestValidationException("file", "Attach the CSV file in the 'file' form field.");
        }

        if (file.Length > BulkOrderService.MaxFileBytes)
        {
            throw new RequestValidationException("file", $"The file exceeds the {BulkOrderService.MaxFileBytes / 1024} KB limit.");
        }

        var content = new byte[file.Length];
        await using (var stream = file.OpenReadStream())
        {
            await stream.ReadExactlyAsync(content, ct);
        }

        return await _bulk.UploadAsync(Path.GetFileName(file.FileName), content, dryRun, ct);
    }
}
