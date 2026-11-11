# iConnect Wholesale ordering: apps/iconnect-wholesale/server (part 1 of 7)

- **Application:** iConnect Wholesale ordering
- **Tech stack:** .NET 8 Web API + Angular
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 28

## Files

- `apps/iconnect-wholesale/server/.env.example` (10 lines)
- `apps/iconnect-wholesale/server/Directory.Build.props` (12 lines)
- `apps/iconnect-wholesale/server/IConnect.Wholesale.sln` (55 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/ApiKeysController.cs` (52 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/AvailabilityController.cs` (34 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/BillingController.cs` (79 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/BulkOrdersController.cs` (64 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/CatalogueController.cs` (44 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/FaultsController.cs` (63 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/OrdersController.cs` (114 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/SlaController.cs` (41 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Errors/ProblemDetailsExceptionHandler.cs` (87 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Errors/ProblemMapper.cs` (80 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Hosting/SlaMonitorHostedService.cs` (59 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Http/WireFormat.cs` (73 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/IConnect.Wholesale.Api.csproj` (21 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Observability/CorrelationId.cs` (109 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Program.cs` (133 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Security/ApiKeyAuthenticationHandler.cs` (66 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Security/HttpCurrentCaller.cs` (58 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Security/Policies.cs` (61 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Security/WholesaleRoles.cs` (21 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/appsettings.Development.json` (16 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/appsettings.json` (39 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Abstractions/Repositories.cs` (157 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Abstractions/Services.cs` (40 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/ApiKeys/ApiKeyService.cs` (185 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Appointments/AppointmentService.cs` (127 lines)

## apps/iconnect-wholesale/server/.env.example

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: bash. Path: `apps/iconnect-wholesale/server/.env.example`.

```bash
# Copy to .env (never commit real values). ASP.NET Core maps "__" to ":" in configuration keys.
ASPNETCORE_ENVIRONMENT=Development
ConnectionStrings__Wholesale=Host=localhost;Port=5432;Database=wholesale;Username=wholesale_app;Password=change-me
Auth__Authority=https://login.example.invalid/realms/uniti
Auth__Audience=iconnect-wholesale-api
Cors__AllowedOrigins__0=http://localhost:4200
PartnerWebhooks__GatewayUrl=
PartnerWebhooks__SigningSecret=
SlaMonitor__Enabled=true
```

## apps/iconnect-wholesale/server/Directory.Build.props

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: xml. Path: `apps/iconnect-wholesale/server/Directory.Build.props`.

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <LangVersion>12.0</LangVersion>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <AnalysisLevel>latest-recommended</AnalysisLevel>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
</Project>
```

## apps/iconnect-wholesale/server/IConnect.Wholesale.sln

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: text. Path: `apps/iconnect-wholesale/server/IConnect.Wholesale.sln`.

```text

Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
VisualStudioVersion = 17.8.34330.188
MinimumVisualStudioVersion = 10.0.40219.1
Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "src", "src", "{6A1E0F1B-1C11-4B57-9A55-0D2C3E7A0001}"
EndProject
Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "tests", "tests", "{6A1E0F1B-1C11-4B57-9A55-0D2C3E7A0002}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "IConnect.Wholesale.Domain", "src\IConnect.Wholesale.Domain\IConnect.Wholesale.Domain.csproj", "{B0C1D2E3-0001-4A00-8000-000000000001}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "IConnect.Wholesale.Application", "src\IConnect.Wholesale.Application\IConnect.Wholesale.Application.csproj", "{B0C1D2E3-0001-4A00-8000-000000000002}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "IConnect.Wholesale.Infrastructure", "src\IConnect.Wholesale.Infrastructure\IConnect.Wholesale.Infrastructure.csproj", "{B0C1D2E3-0001-4A00-8000-000000000003}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "IConnect.Wholesale.Api", "src\IConnect.Wholesale.Api\IConnect.Wholesale.Api.csproj", "{B0C1D2E3-0001-4A00-8000-000000000004}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "IConnect.Wholesale.Tests", "tests\IConnect.Wholesale.Tests\IConnect.Wholesale.Tests.csproj", "{B0C1D2E3-0001-4A00-8000-000000000005}"
EndProject
Global
	GlobalSection(SolutionConfigurationPlatforms) = preSolution
		Debug|Any CPU = Debug|Any CPU
		Release|Any CPU = Release|Any CPU
	EndGlobalSection
	GlobalSection(ProjectConfigurationPlatforms) = postSolution
		{B0C1D2E3-0001-4A00-8000-000000000001}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000001}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000001}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000001}.Release|Any CPU.Build.0 = Release|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000002}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000002}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000002}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000002}.Release|Any CPU.Build.0 = Release|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000003}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000003}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000003}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000003}.Release|Any CPU.Build.0 = Release|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000004}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000004}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000004}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000004}.Release|Any CPU.Build.0 = Release|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000005}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000005}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000005}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{B0C1D2E3-0001-4A00-8000-000000000005}.Release|Any CPU.Build.0 = Release|Any CPU
	EndGlobalSection
	GlobalSection(NestedProjects) = preSolution
		{B0C1D2E3-0001-4A00-8000-000000000001} = {6A1E0F1B-1C11-4B57-9A55-0D2C3E7A0001}
		{B0C1D2E3-0001-4A00-8000-000000000002} = {6A1E0F1B-1C11-4B57-9A55-0D2C3E7A0001}
		{B0C1D2E3-0001-4A00-8000-000000000003} = {6A1E0F1B-1C11-4B57-9A55-0D2C3E7A0001}
		{B0C1D2E3-0001-4A00-8000-000000000004} = {6A1E0F1B-1C11-4B57-9A55-0D2C3E7A0001}
		{B0C1D2E3-0001-4A00-8000-000000000005} = {6A1E0F1B-1C11-4B57-9A55-0D2C3E7A0002}
	EndGlobalSection
EndGlobal
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/ApiKeysController.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/ApiKeysController.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/AvailabilityController.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/AvailabilityController.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/BillingController.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/BillingController.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/BulkOrdersController.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/BulkOrdersController.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/CatalogueController.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/CatalogueController.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/FaultsController.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/FaultsController.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/OrdersController.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/OrdersController.cs`.

```csharp
using IConnect.Wholesale.Api.Http;
using IConnect.Wholesale.Api.Security;
using IConnect.Wholesale.Application.Appointments;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Application.Orders;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Controllers;

/// <summary>
/// Order placement, tracking and lifecycle. Partner actions need <c>orders:write</c>; field
/// operations (hold, provisioning, completion, rejection) are restricted to support agents.
/// </summary>
[ApiController]
[Route("api/v1/orders")]
[Produces("application/json")]
public sealed class OrdersController : ControllerBase
{
    private readonly OrderService _orders;
    private readonly AppointmentService _appointments;

    public OrdersController(OrderService orders, AppointmentService appointments)
    {
        _orders = orders;
        _appointments = appointments;
    }

    /// <summary>
    /// Places an order. Idempotent on <c>partnerReference</c>: replaying an identical request returns
    /// the existing order with 200; reusing the reference with different details is a 409.
    /// </summary>
    [HttpPost]
    [Authorize(Policy = ApiScopes.OrdersWrite)]
    [ProducesResponseType(typeof(OrderDetailDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(OrderDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<OrderDetailDto>> Place(PlaceOrderRequest request, CancellationToken ct)
    {
        var result = await _orders.PlaceAsync(request, ct);
        return result.Created
            ? CreatedAtAction(nameof(Get), new { id = result.Order.Id }, result.Order)
            : Ok(result.Order);
    }

    [HttpGet]
    [Authorize(Policy = ApiScopes.OrdersRead)]
    [ProducesResponseType(typeof(PagedResult<OrderSummaryDto>), StatusCodes.Status200OK)]
    public Task<PagedResult<OrderSummaryDto>> List([FromQuery] string? status, [FromQuery] string? type, [FromQuery] string? search,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] PageQuery page, CancellationToken ct)
    {
        QueryParsing.EnsureRange(from, to);
        return _orders.ListAsync(
            QueryParsing.OptionalEnum<OrderStatus>(status, "status"),
            QueryParsing.OptionalEnum<OrderType>(type, "type"),
            search,
            from,
            to,
            page.ToRequest(),
            ct);
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = ApiScopes.OrdersRead)]
    [ProducesResponseType(typeof(OrderDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public Task<OrderDetailDto> Get(Guid id, CancellationToken ct) => _orders.GetAsync(id, ct);

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = ApiScopes.OrdersWrite)]
    public Task<OrderDetailDto> Cancel(Guid id, CancelOrderRequest request, CancellationToken ct) => _orders.CancelAsync(id, request, ct);

    [HttpPost("{id:guid}/amend")]
    [Authorize(Policy = ApiScopes.OrdersWrite)]
    public Task<OrderDetailDto> Amend(Guid id, AmendOrderRequest request, CancellationToken ct) => _orders.AmendAsync(id, request, ct);

    [HttpGet("{id:guid}/appointment-slots")]
    [Authorize(Policy = ApiScopes.OrdersRead)]
    [ProducesResponseType(typeof(IReadOnlyList<AppointmentSlotDto>), StatusCodes.Status200OK)]
    public Task<IReadOnlyList<AppointmentSlotDto>> AppointmentSlots(Guid id, [FromQuery] DateOnly? from, CancellationToken ct) =>
        _appointments.AvailableForOrderAsync(id, from, ct);

    /// <summary>Reserves an engineer slot; the hold must be confirmed by provisioning before it expires.</summary>
    [HttpPut("{id:guid}/appointment")]
    [Authorize(Policy = ApiScopes.OrdersWrite)]
    [ProducesResponseType(typeof(BookingDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public Task<BookingDto> BookAppointment(Guid id, BookAppointmentRequest request, CancellationToken ct) =>
        _appointments.BookAsync(id, request, ct);

    [HttpPost("{id:guid}/hold")]
    [Authorize(Policy = Policies.SupportOnly)]
    public Task<OrderDetailDto> Hold(Guid id, HoldOrderRequest request, CancellationToken ct) => _orders.HoldAsync(id, request, ct);

    [HttpPost("{id:guid}/release-hold")]
    [Authorize(Policy = Policies.SupportOnly)]
    public Task<OrderDetailDto> ReleaseHold(Guid id, CancellationToken ct) => _orders.ReleaseHoldAsync(id, ct);

    [HttpPost("{id:guid}/start-provisioning")]
    [Authorize(Policy = Policies.SupportOnly)]
    public Task<OrderDetailDto> StartProvisioning(Guid id, CancellationToken ct) => _orders.StartProvisioningAsync(id, ct);

    [HttpPost("{id:guid}/complete")]
    [Authorize(Policy = Policies.SupportOnly)]
    public Task<OrderDetailDto> Complete(Guid id, CompleteOrderRequest request, CancellationToken ct) => _orders.CompleteAsync(id, request, ct);

    [HttpPost("{id:guid}/reject")]
    [Authorize(Policy = Policies.SupportOnly)]
    public Task<OrderDetailDto> Reject(Guid id, RejectOrderRequest request, CancellationToken ct) => _orders.RejectAsync(id, request, ct);
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/SlaController.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Controllers/SlaController.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Errors/ProblemDetailsExceptionHandler.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Errors/ProblemDetailsExceptionHandler.cs`.

```csharp
using IConnect.Wholesale.Api.Observability;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Errors;

/// <summary>Writes every unhandled exception as application/problem+json via <see cref="ProblemMapper"/>.</summary>
public sealed class ProblemDetailsExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problems;
    private readonly ILogger<ProblemDetailsExceptionHandler> _logger;

    public ProblemDetailsExceptionHandler(IProblemDetailsService problems, ILogger<ProblemDetailsExceptionHandler> logger)
    {
        _problems = problems;
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var problem = ProblemMapper.Map(exception);
        var status = problem.Status ?? StatusCodes.Status500InternalServerError;

        if (status >= 500)
        {
            _logger.LogError(exception, "Unhandled exception on {Method} {Path}", httpContext.Request.Method, httpContext.Request.Path);
        }
        else if (problem.Extensions["code"] is string code && code != ProblemMapper.ClientClosedRequest)
        {
            _logger.LogInformation("Request rejected with {Status} {Code}: {Detail}", status, code, problem.Detail);
        }

        if (httpContext.RequestAborted.IsCancellationRequested || httpContext.Response.HasStarted)
        {
            return true;
        }

        httpContext.Response.StatusCode = status;
        return await _problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }
}

public static class ProblemDetailsSetup
{
    /// <summary>Adds instance, correlation id and RFC 7807 content type to every problem the app emits (including 401/403/404 from the framework).</summary>
    public static IServiceCollection AddWholesaleProblemDetails(this IServiceCollection services)
    {
        services.AddProblemDetails(options => options.CustomizeProblemDetails = ctx =>
        {
            ctx.ProblemDetails.Instance ??= ctx.HttpContext.Request.Path;
            ctx.ProblemDetails.Extensions["correlationId"] = CorrelationIdMiddleware.Get(ctx.HttpContext) ?? ctx.HttpContext.TraceIdentifier;
            if (!ctx.ProblemDetails.Extensions.ContainsKey("code"))
            {
                ctx.ProblemDetails.Extensions["code"] = ctx.ProblemDetails.Status switch
                {
                    StatusCodes.Status401Unauthorized => "auth.unauthenticated",
                    StatusCodes.Status403Forbidden => "auth.forbidden",
                    StatusCodes.Status404NotFound => "route.not_found",
                    StatusCodes.Status405MethodNotAllowed => "route.method_not_allowed",
                    StatusCodes.Status429TooManyRequests => "rate_limit.exceeded",
                    _ => "http.error",
                };
            }
        });
        services.AddExceptionHandler<ProblemDetailsExceptionHandler>();

        services.Configure<ApiBehaviorOptions>(options => options.InvalidModelStateResponseFactory = context =>
        {
            var errors = context.ModelState
                .Where(kv => kv.Value is { Errors.Count: > 0 })
                .ToDictionary(kv => string.IsNullOrEmpty(kv.Key) ? "body" : kv.Key,
                    kv => kv.Value!.Errors.Select(e => string.IsNullOrEmpty(e.ErrorMessage) ? "The value is invalid." : e.ErrorMessage).ToArray());
            var problem = ProblemMapper.Validation(errors);
            problem.Instance = context.HttpContext.Request.Path;
            problem.Extensions["correlationId"] = CorrelationIdMiddleware.Get(context.HttpContext) ?? context.HttpContext.TraceIdentifier;
            return new ObjectResult(problem) { StatusCode = StatusCodes.Status400BadRequest, ContentTypes = { "application/problem+json" } };
        });

        return services;
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Errors/ProblemMapper.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Errors/ProblemMapper.cs`.

```csharp
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Common;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Errors;

/// <summary>
/// Maps exceptions to RFC 7807 problem details. Every problem carries a stable machine-readable
/// <c>code</c> extension; the <c>type</c> URI is derived from it so clients can switch on either.
/// Unexpected exceptions never leak their message.
/// </summary>
public static class ProblemMapper
{
    public const string TypeBase = "/api/v1/problems/";
    public const string ClientClosedRequest = "client.closed_request";

    public static ProblemDetails Map(Exception exception) => exception switch
    {
        RequestValidationException ex => Validation(ex.Errors),
        NotFoundException ex => Create(StatusCodes.Status404NotFound, "Resource not found", $"{ToCode(ex.Resource)}.not_found", ex.Message),
        ConflictException ex => Create(StatusCodes.Status409Conflict, "Conflict with current state", ex.Code, ex.Message),
        ForbiddenException ex => Create(StatusCodes.Status403Forbidden, "Forbidden", "forbidden", ex.Message),
        InvalidTransitionException ex => Create(StatusCodes.Status409Conflict, "Transition not allowed", ex.Code, ex.Message),
        DomainException ex => Create(StatusCodes.Status422UnprocessableEntity, "Business rule violated", ex.Code, ex.Message),
        BadHttpRequestException ex => Create(ex.StatusCode, "Bad request", ex.StatusCode == StatusCodes.Status413PayloadTooLarge
            ? "request.too_large" : "request.malformed", ex.Message),
        OperationCanceledException => Create(499, "Client closed request", ClientClosedRequest, null),
        _ => Create(StatusCodes.Status500InternalServerError, "Unexpected error", "server.error",
            "An unexpected error occurred. Quote the correlation id when contacting support."),
    };

    public static ValidationProblemDetails Validation(IReadOnlyDictionary<string, string[]> errors)
    {
        var problem = new ValidationProblemDetails(errors.ToDictionary(kv => ToCamelPath(kv.Key), kv => kv.Value))
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "One or more fields are invalid",
            Type = TypeBase + "validation.failed",
        };
        problem.Extensions["code"] = "validation.failed";
        return problem;
    }

    private static ProblemDetails Create(int status, string title, string code, string? detail)
    {
        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
            Type = status >= 500 ? "about:blank" : TypeBase + code,
        };
        problem.Extensions["code"] = code;
        return problem;
    }

    private static string ToCode(string resource)
    {
        var chars = new List<char>(resource.Length + 4);
        for (var i = 0; i < resource.Length; i++)
        {
            if (i > 0 && char.IsUpper(resource[i]))
            {
                chars.Add('_');
            }

            chars.Add(char.ToLowerInvariant(resource[i]));
        }

        return new string(chars.ToArray());
    }

    /// <summary>Model-binding keys arrive as "$.RequestedDate" or "RequestedDate"; clients expect "requestedDate".</summary>
    internal static string ToCamelPath(string key)
    {
        var trimmed = key.StartsWith("$.", StringComparison.Ordinal) ? key[2..] : key;
        return trimmed.Length > 0 && char.IsUpper(trimmed[0]) ? char.ToLowerInvariant(trimmed[0]) + trimmed[1..] : trimmed;
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Hosting/SlaMonitorHostedService.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Hosting/SlaMonitorHostedService.cs`.

```csharp
using IConnect.Wholesale.Application.Sla;
using Microsoft.Extensions.Options;

namespace IConnect.Wholesale.Api.Hosting;

public sealed class SlaMonitorOptions
{
    public const string Section = "SlaMonitor";

    /// <summary>Enable on exactly one worker instance; sweeps are idempotent but not distributed-locked.</summary>
    public bool Enabled { get; set; }

    public int IntervalSeconds { get; set; } = 300;
}

/// <summary>Runs <see cref="SlaBreachMonitor.SweepAsync"/> on a fixed cadence, each sweep in its own DI scope.</summary>
public sealed class SlaMonitorHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly IOptionsMonitor<SlaMonitorOptions> _options;
    private readonly ILogger<SlaMonitorHostedService> _logger;

    public SlaMonitorHostedService(IServiceScopeFactory scopes, IOptionsMonitor<SlaMonitorOptions> options, ILogger<SlaMonitorHostedService> logger)
    {
        _scopes = scopes;
        _options = options;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.CurrentValue.Enabled)
        {
            _logger.LogInformation("SLA monitor disabled on this instance");
            return;
        }

        var interval = TimeSpan.FromSeconds(Math.Clamp(_options.CurrentValue.IntervalSeconds, 30, 3_600));
        using var timer = new PeriodicTimer(interval);
        do
        {
            using var scope = _scopes.CreateScope();
            using var _ = _logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = $"sla-sweep-{Guid.NewGuid():N}" });
            try
            {
                var result = await scope.ServiceProvider.GetRequiredService<SlaBreachMonitor>().SweepAsync(stoppingToken);
                _logger.LogInformation(
                    "SLA sweep: {FaultsChecked} faults ({FaultBreaches} new breaches), {OrdersChecked} orders ({OrderBreaches} new breaches), {AutoClosed} faults auto-closed",
                    result.FaultsChecked, result.FaultBreaches, result.OrdersChecked, result.OrderBreaches, result.FaultsAutoClosed);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "SLA sweep failed; retrying at the next interval");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Http/WireFormat.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Http/WireFormat.cs`.

```csharp
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using IConnect.Wholesale.Application.Common;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Http;

/// <summary>Writes every instant as ISO-8601 UTC ("2024-05-01T09:30:00.000Z") regardless of the stored offset.</summary>
public sealed class UtcDateTimeOffsetConverter : JsonConverter<DateTimeOffset>
{
    public const string Format = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";

    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var text = reader.GetString();
        if (text is null || !DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var value))
        {
            throw new JsonException("Expected an ISO-8601 timestamp.");
        }

        return value.ToUniversalTime();
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.UtcDateTime.ToString(Format, CultureInfo.InvariantCulture));
}

/// <summary>Standard <c>?page=&amp;pageSize=</c> query binding; out-of-range values are clamped by <see cref="PageRequest"/>.</summary>
public sealed class PageQuery
{
    [FromQuery(Name = "page")]
    public int Page { get; init; } = 1;

    [FromQuery(Name = "pageSize")]
    public int PageSize { get; init; } = PageRequest.DefaultPageSize;

    public PageRequest ToRequest() => new(Page, PageSize);
}

public static class QueryParsing
{
    /// <summary>
    /// Parses an optional enum filter from its wire form ("IN_PROGRESS", "in-progress", "InProgress").
    /// Unknown values are a 400 rather than being silently ignored.
    /// </summary>
    public static TEnum? OptionalEnum<TEnum>(string? value, string field)
        where TEnum : struct, Enum
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var compact = value.Replace("_", string.Empty, StringComparison.Ordinal).Replace("-", string.Empty, StringComparison.Ordinal);
        if (Enum.TryParse<TEnum>(compact, ignoreCase: true, out var parsed) && Enum.IsDefined(parsed) && !int.TryParse(compact, out _))
        {
            return parsed;
        }

        var allowed = string.Join(", ", Enum.GetNames<TEnum>().Select(n => n.ToUpperInvariant()));
        throw new RequestValidationException(field, $"'{value}' is not valid. Allowed: {allowed}.");
    }

    public static void EnsureRange(DateOnly? from, DateOnly? to, string fromField = "from")
    {
        if (from is { } f && to is { } t && t < f)
        {
            throw new RequestValidationException(fromField, "The start of the range must not be after its end.");
        }
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/IConnect.Wholesale.Api.csproj

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: xml. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/IConnect.Wholesale.Api.csproj`.

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <RootNamespace>IConnect.Wholesale.Api</RootNamespace>
    <UserSecretsId>iconnect-wholesale-api</UserSecretsId>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <NoWarn>$(NoWarn);CS1591</NoWarn>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="..\IConnect.Wholesale.Application\IConnect.Wholesale.Application.csproj" />
    <ProjectReference Include="..\IConnect.Wholesale.Infrastructure\IConnect.Wholesale.Infrastructure.csproj" />
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="8.0.11" />
    <PackageReference Include="Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore" Version="8.0.11" />
    <PackageReference Include="Swashbuckle.AspNetCore" Version="6.9.0" />
  </ItemGroup>
  <ItemGroup>
    <InternalsVisibleTo Include="IConnect.Wholesale.Tests" />
  </ItemGroup>
</Project>
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Observability/CorrelationId.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Observability/CorrelationId.cs`.

```csharp
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace IConnect.Wholesale.Api.Observability;

/// <summary>
/// Accepts an inbound <c>X-Correlation-Id</c> (or issues one), echoes it on the response, stores
/// it as the request's trace identifier and opens a logging scope so every structured log line
/// written during the request carries it.
/// </summary>
public sealed partial class CorrelationIdMiddleware
{
    public const string HeaderName = "X-Correlation-Id";
    private const string ItemKey = "correlation-id";

    private readonly RequestDelegate _next;
    private readonly ILogger<CorrelationIdMiddleware> _logger;

    public CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = Resolve(context.Request.Headers[HeaderName].ToString());
        context.Items[ItemKey] = correlationId;
        context.TraceIdentifier = correlationId;
        Activity.Current?.SetTag("correlation.id", correlationId);
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[HeaderName] = correlationId;
            return Task.CompletedTask;
        });

        using (_logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = correlationId }))
        {
            await _next(context);
        }
    }

    public static string? Get(HttpContext? context) =>
        context?.Items.TryGetValue(ItemKey, out var value) == true ? value as string : null;

    /// <summary>Keeps a well-formed inbound id; replaces missing or suspicious values (log-injection guard).</summary>
    internal static string Resolve(string? inbound) =>
        !string.IsNullOrEmpty(inbound) && SafeId().IsMatch(inbound) ? inbound : Guid.NewGuid().ToString("N");

    [GeneratedRegex("^[A-Za-z0-9._:-]{8,128}$")]
    private static partial Regex SafeId();
}

/// <summary>Propagates the current request's correlation id on outbound HTTP calls.</summary>
public sealed class CorrelationIdPropagationHandler : DelegatingHandler
{
    private readonly IHttpContextAccessor _http;

    public CorrelationIdPropagationHandler(IHttpContextAccessor http)
    {
        _http = http;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var correlationId = CorrelationIdMiddleware.Get(_http.HttpContext) ?? Activity.Current?.TraceId.ToString();
        if (correlationId is not null && !request.Headers.Contains(CorrelationIdMiddleware.HeaderName))
        {
            request.Headers.Add(CorrelationIdMiddleware.HeaderName, correlationId);
        }

        return base.SendAsync(request, cancellationToken);
    }
}

/// <summary>One structured access-log line per request with status and duration.</summary>
public sealed class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var started = Stopwatch.GetTimestamp();
        try
        {
            await _next(context);
        }
        finally
        {
            var elapsed = Stopwatch.GetElapsedTime(started);
            var level = context.Response.StatusCode >= 500 ? LogLevel.Error : LogLevel.Information;
            _logger.Log(level, "HTTP {Method} {Path} responded {StatusCode} in {ElapsedMs:0.0} ms (partner {PartnerId}, auth {AuthMethod})",
                context.Request.Method,
                context.Request.Path.Value,
                context.Response.StatusCode,
                elapsed.TotalMilliseconds,
                context.User.FindFirst(Security.WholesaleClaims.PartnerId)?.Value ?? "-",
                context.User.Identity?.AuthenticationType ?? "anonymous");
        }
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Program.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Program.cs`.

```csharp
using System.Security.Claims;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using IConnect.Wholesale.Api.Errors;
using IConnect.Wholesale.Api.Hosting;
using IConnect.Wholesale.Api.Http;
using IConnect.Wholesale.Api.Observability;
using IConnect.Wholesale.Api.Security;
using IConnect.Wholesale.Application;
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Infrastructure;
using IConnect.Wholesale.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole(o =>
{
    o.IncludeScopes = true;
    o.UseUtcTimestamp = true;
    o.TimestampFormat = "yyyy-MM-dd'T'HH:mm:ss.fff'Z' ";
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddTransient<CorrelationIdPropagationHandler>();
builder.Services.AddWholesaleApplication();
builder.Services.AddWholesaleInfrastructure(config, client => client.AddHttpMessageHandler<CorrelationIdPropagationHandler>());
builder.Services.AddScoped<ICurrentCaller, HttpCurrentCaller>();

builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.Converters.Add(new UtcDateTimeOffsetConverter());
    o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
});
builder.Services.AddWholesaleProblemDetails();

const string JwtOrApiKey = "JwtOrApiKey";
builder.Services
    .AddAuthentication(JwtOrApiKey)
    .AddPolicyScheme(JwtOrApiKey, "Bearer token or partner API key", o => o.ForwardDefaultSelector = ctx =>
        ctx.Request.Headers.ContainsKey(ApiKeyAuthenticationHandler.HeaderName)
            ? ApiKeyAuthenticationHandler.SchemeName
            : JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.Authority = config["Auth:Authority"] ?? throw new InvalidOperationException("Auth:Authority is not configured.");
        o.Audience = config["Auth:Audience"];
        o.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            NameClaimType = "sub",
            RoleClaimType = WholesaleClaims.Roles,
            ValidateAudience = true,
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    })
    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, ApiKeyAuthenticationHandler>(
        ApiKeyAuthenticationHandler.SchemeName, _ => { });

builder.Services.AddSingleton<IAuthorizationHandler, PartnerAccessHandler>();
builder.Services.AddAuthorization(Policies.Register);

var permitsPerMinute = config.GetValue("RateLimiting:PermitsPerMinute", 600);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
    {
        var key = ctx.User.FindFirstValue(WholesaleClaims.ApiKeyId)
            ?? ctx.User.FindFirstValue("sub")
            ?? ctx.Connection.RemoteIpAddress?.ToString()
            ?? "anonymous";
        return RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = permitsPerMinute,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        });
    });
});

var allowedOrigins = config.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(allowedOrigins)
    .WithHeaders("Authorization", "Content-Type", CorrelationIdMiddleware.HeaderName, HttpCurrentCaller.OnBehalfOfHeader)
    .WithExposedHeaders(CorrelationIdMiddleware.HeaderName, "Location", "Content-Disposition")
    .WithMethods("GET", "POST", "PUT", "DELETE")));

builder.Services.Configure<SlaMonitorOptions>(config.GetSection(SlaMonitorOptions.Section));
builder.Services.AddHostedService<SlaMonitorHostedService>();

builder.Services.AddHealthChecks().AddDbContextCheck<WholesaleDbContext>("database", tags: new[] { "ready" });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(o => o.SwaggerDoc("v1", new() { Title = "iConnect Wholesale API", Version = "v1" }));

var app = builder.Build();

app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseCors();
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") }).AllowAnonymous();

app.Run();

public partial class Program;
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Security/ApiKeyAuthenticationHandler.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Security/ApiKeyAuthenticationHandler.cs`.

```csharp
using System.Security.Claims;
using System.Text.Encodings.Web;
using IConnect.Wholesale.Application.ApiKeys;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace IConnect.Wholesale.Api.Security;

/// <summary>
/// Authenticates partner system-to-system calls presenting <c>X-Api-Key: icw_{prefix}_{secret}</c>.
/// Verification (hash comparison, expiry, revocation, partner status) is delegated to
/// <see cref="ApiKeyService"/>; the principal carries the key's scopes for policy evaluation.
/// </summary>
public sealed class ApiKeyAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "ApiKey";
    public const string HeaderName = "X-Api-Key";

    private readonly ApiKeyService _apiKeys;

    public ApiKeyAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder,
        ApiKeyService apiKeys)
        : base(options, logger, encoder)
    {
        _apiKeys = apiKeys;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(HeaderName, out var values))
        {
            return AuthenticateResult.NoResult();
        }

        if (values.Count != 1 || string.IsNullOrWhiteSpace(values[0]))
        {
            return AuthenticateResult.Fail("Exactly one API key must be supplied.");
        }

        var principal = await _apiKeys.VerifyAsync(values[0], Context.RequestAborted);
        if (principal is null)
        {
            Logger.LogWarning("Rejected API key presented from {RemoteIp}", Context.Connection.RemoteIpAddress);
            return AuthenticateResult.Fail("Invalid, expired or revoked API key.");
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, $"apikey:{principal.KeyId}"),
            new(WholesaleClaims.ApiKeyId, principal.KeyId.ToString()),
            new(WholesaleClaims.PartnerId, principal.PartnerId.ToString()),
            new(WholesaleClaims.AuthMethod, WholesaleClaims.AuthMethodApiKey),
        };
        claims.AddRange(principal.Scopes.Select(s => new Claim(WholesaleClaims.Scope, s)));

        var identity = new ClaimsIdentity(claims, SchemeName, ClaimTypes.NameIdentifier, WholesaleClaims.Roles);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.Headers.WWWAuthenticate = $"{SchemeName} header=\"{HeaderName}\"";
        return base.HandleChallengeAsync(properties);
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Security/HttpCurrentCaller.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Security/HttpCurrentCaller.cs`.

```csharp
using System.Security.Claims;
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;

namespace IConnect.Wholesale.Api.Security;

/// <summary>
/// Resolves the caller from the authenticated principal. Buyers and API keys are bound to the
/// partner in their token; support agents act on behalf of a partner named in the
/// <c>X-On-Behalf-Of-Partner</c> header, which is ignored for every other caller.
/// Values are read lazily because the API-key handler resolves this service before authentication completes.
/// </summary>
public sealed class HttpCurrentCaller : ICurrentCaller
{
    public const string OnBehalfOfHeader = "X-On-Behalf-Of-Partner";

    private readonly IHttpContextAccessor _http;

    public HttpCurrentCaller(IHttpContextAccessor http)
    {
        _http = http;
    }

    private HttpContext Context => _http.HttpContext ?? throw new InvalidOperationException("No active HTTP request.");

    private ClaimsPrincipal User => Context.User;

    public bool IsApiKey => Policies.IsApiKey(User);

    public bool IsSupportAgent => !IsApiKey && User.IsInRole(WholesaleRoles.SupportAgent);

    public string ActorId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")
        ?? throw new ForbiddenException("The access token does not identify the caller.");

    public Guid PartnerId => ResolvePartnerId(User, IsSupportAgent ? Context.Request.Headers[OnBehalfOfHeader].ToString() : null);

    internal static Guid ResolvePartnerId(ClaimsPrincipal user, string? onBehalfOf)
    {
        if (!string.IsNullOrEmpty(onBehalfOf))
        {
            return Guid.TryParse(onBehalfOf, out var delegated) && delegated != Guid.Empty
                ? delegated
                : throw new RequestValidationException(OnBehalfOfHeader, "Must be a partner id (GUID).");
        }

        var claim = user.FindFirstValue(WholesaleClaims.PartnerId);
        if (Guid.TryParse(claim, out var partnerId) && partnerId != Guid.Empty)
        {
            return partnerId;
        }

        throw new ForbiddenException(user.IsInRole(WholesaleRoles.SupportAgent)
            ? $"Support agents must name the partner in the {OnBehalfOfHeader} header."
            : "The access token is not bound to a wholesale partner.");
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Security/Policies.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Security/Policies.cs`.

```csharp
using System.Security.Claims;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.AspNetCore.Authorization;

namespace IConnect.Wholesale.Api.Security;

/// <summary>
/// Authorisation policies. Every partner-data policy is named after an <see cref="ApiScopes"/> value
/// so the same policy serves both callers: portal users need the WHOLESALE_BUYER or SUPPORT_AGENT
/// role, integrations need the scope on their API key.
/// </summary>
public static class Policies
{
    public const string SupportOnly = "support-only";

    /// <summary>Interactive portal users only; API keys are refused (e.g. key management).</summary>
    public const string PortalUser = "portal-user";

    public static void Register(AuthorizationOptions options)
    {
        foreach (var scope in ApiScopes.All)
        {
            options.AddPolicy(scope, p => p.RequireAuthenticatedUser().AddRequirements(new PartnerAccessRequirement(scope)));
        }

        options.AddPolicy(SupportOnly, p => p.RequireAuthenticatedUser()
            .RequireAssertion(ctx => !IsApiKey(ctx.User) && ctx.User.IsInRole(WholesaleRoles.SupportAgent)));

        options.AddPolicy(PortalUser, p => p.RequireAuthenticatedUser()
            .RequireAssertion(ctx => !IsApiKey(ctx.User) && HasPortalRole(ctx.User)));

        options.FallbackPolicy = options.DefaultPolicy;
    }

    public static bool IsApiKey(ClaimsPrincipal user) =>
        user.HasClaim(WholesaleClaims.AuthMethod, WholesaleClaims.AuthMethodApiKey);

    public static bool HasPortalRole(ClaimsPrincipal user) =>
        user.IsInRole(WholesaleRoles.WholesaleBuyer) || user.IsInRole(WholesaleRoles.SupportAgent);
}

public sealed record PartnerAccessRequirement(string Scope) : IAuthorizationRequirement;

public sealed class PartnerAccessHandler : AuthorizationHandler<PartnerAccessRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PartnerAccessRequirement requirement)
    {
        var user = context.User;
        var allowed = Policies.IsApiKey(user)
            ? user.HasClaim(WholesaleClaims.Scope, requirement.Scope)
            : Policies.HasPortalRole(user);

        if (allowed)
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Security/WholesaleRoles.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/Security/WholesaleRoles.cs`.

```csharp
namespace IConnect.Wholesale.Api.Security;

/// <summary>Platform roles (see CONVENTIONS.md) that are meaningful to the wholesale API.</summary>
public static class WholesaleRoles
{
    public const string WholesaleBuyer = "WHOLESALE_BUYER";
    public const string SupportAgent = "SUPPORT_AGENT";
}

/// <summary>Claim types issued by the identity provider and by the API-key handler.</summary>
public static class WholesaleClaims
{
    public const string PartnerId = "partner_id";
    public const string Roles = "roles";
    public const string Scope = "scope";
    public const string AuthMethod = "auth_method";
    public const string ApiKeyId = "api_key_id";

    public const string AuthMethodApiKey = "api_key";
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/appsettings.Development.json

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: json. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/appsettings.Development.json`.

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Debug",
      "Microsoft.AspNetCore": "Information"
    }
  },
  "Cors": {
    "AllowedOrigins": [ "http://localhost:4200" ]
  },
  "SlaMonitor": {
    "Enabled": true,
    "IntervalSeconds": 60
  }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/appsettings.json

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: json. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Api/appsettings.json`.

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning",
      "Microsoft.EntityFrameworkCore.Database.Command": "Warning"
    }
  },
  "AllowedHosts": "*",
  "ConnectionStrings": {
    "Wholesale": ""
  },
  "Auth": {
    "Authority": "",
    "Audience": "iconnect-wholesale-api"
  },
  "Cors": {
    "AllowedOrigins": []
  },
  "RateLimiting": {
    "PermitsPerMinute": 600
  },
  "Calendars": {
    "TimeZoneId": "Europe/London",
    "BankHolidays": [
      "2025-01-01", "2025-04-18", "2025-04-21", "2025-05-05", "2025-05-26", "2025-08-25", "2025-12-25", "2025-12-26",
      "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28"
    ]
  },
  "PartnerWebhooks": {
    "GatewayUrl": "",
    "TimeoutSeconds": 10
  },
  "SlaMonitor": {
    "Enabled": false,
    "IntervalSeconds": 300
  }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Abstractions/Repositories.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Abstractions/Repositories.cs`.

```csharp
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Appointments;
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Partners;
using IConnect.Wholesale.Domain.Services;

namespace IConnect.Wholesale.Application.Abstractions;

public interface IPremiseRepository
{
    Task<Premise?> GetByUprnAsync(string uprn, CancellationToken ct);

    Task<IReadOnlyList<Premise>> SearchByPostcodeAsync(string postcode, CancellationToken ct);
}

public interface ICatalogueRepository
{
    Task<IReadOnlyList<WholesaleProduct>> ListProductsAsync(bool includeWithdrawn, CancellationToken ct);

    Task<WholesaleProduct?> GetProductAsync(string code, CancellationToken ct);

    Task<PriceBook?> GetEffectivePriceBookAsync(DateOnly onDate, CancellationToken ct);

    Task<IReadOnlyList<PriceBook>> ListPriceBooksAsync(CancellationToken ct);

    Task AddPriceBookAsync(PriceBook priceBook, CancellationToken ct);
}

public sealed record OrderQuery(
    Guid PartnerId,
    OrderStatus? Status,
    OrderType? Type,
    string? Search,
    DateOnly? CreatedFrom,
    DateOnly? CreatedTo,
    PageRequest Page);

public interface IOrderRepository
{
    Task<Order?> GetAsync(Guid id, CancellationToken ct);

    Task<Order?> GetByPartnerReferenceAsync(Guid partnerId, string partnerReference, CancellationToken ct);

    Task<PagedResult<Order>> QueryAsync(OrderQuery query, CancellationToken ct);

    Task<int> CountOpenAsync(Guid partnerId, CancellationToken ct);

    Task<bool> HasOpenOrderForUprnAsync(string uprn, CancellationToken ct);

    Task<IReadOnlyList<Order>> ListWithRunningClocksAsync(CancellationToken ct);

    Task<IReadOnlyList<Order>> ListCompletedBetweenAsync(Guid partnerId, DateOnly from, DateOnly to, CancellationToken ct);

    Task<IReadOnlyList<Order>> ListCancelledWithChargeBetweenAsync(Guid partnerId, DateOnly from, DateOnly to, CancellationToken ct);

    Task AddAsync(Order order, CancellationToken ct);

    Task AddRangeAsync(IEnumerable<Order> orders, CancellationToken ct);
}

public interface IServiceRepository
{
    Task<WholesaleService?> GetAsync(Guid id, CancellationToken ct);

    Task<WholesaleService?> GetActiveByUprnAsync(string uprn, CancellationToken ct);

    Task<int> CountActiveAsync(Guid partnerId, CancellationToken ct);

    Task<IReadOnlyList<WholesaleService>> ListBillableAsync(Guid partnerId, DateOnly from, DateOnly to, CancellationToken ct);

    Task AddAsync(WholesaleService service, CancellationToken ct);
}

public sealed record FaultQuery(Guid PartnerId, FaultStatus? Status, FaultPriority? Priority, PageRequest Page);

public interface IFaultRepository
{
    Task<Fault?> GetAsync(Guid id, CancellationToken ct);

    Task<PagedResult<Fault>> QueryAsync(FaultQuery query, CancellationToken ct);

    Task<bool> HasOpenFaultForServiceAsync(Guid serviceId, CancellationToken ct);

    Task<IReadOnlyList<Fault>> ListWithRunningClocksAsync(CancellationToken ct);

    Task<IReadOnlyList<Fault>> ListResolvedWithCreditBetweenAsync(Guid partnerId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct);

    Task<IReadOnlyList<Fault>> ListAutoCloseCandidatesAsync(DateTimeOffset resolvedBefore, CancellationToken ct);

    Task AddAsync(Fault fault, CancellationToken ct);
}

public interface IAppointmentSlotRepository
{
    Task<AppointmentSlot?> GetAsync(Guid id, CancellationToken ct);

    Task<IReadOnlyList<AppointmentSlot>> ListAsync(string exchangeCode, DateOnly from, DateOnly to, CancellationToken ct);
}

public interface IPartnerRepository
{
    Task<Partner?> GetAsync(Guid id, CancellationToken ct);

    Task<IReadOnlyList<Partner>> ListActiveAsync(CancellationToken ct);
}

public interface IApiKeyRepository
{
    Task<ApiKey?> GetAsync(Guid id, CancellationToken ct);

    Task<ApiKey?> GetByPrefixAsync(string prefix, CancellationToken ct);

    Task<IReadOnlyList<ApiKey>> ListForPartnerAsync(Guid partnerId, CancellationToken ct);

    Task AddAsync(ApiKey key, CancellationToken ct);
}

public interface IStatementRepository
{
    Task<BillingStatement?> GetAsync(Guid id, CancellationToken ct);

    Task<BillingStatement?> GetForPeriodAsync(Guid partnerId, DateOnly periodStart, CancellationToken ct);

    Task<PagedResult<BillingStatement>> ListForPartnerAsync(Guid partnerId, PageRequest page, CancellationToken ct);

    Task AddAsync(BillingStatement statement, CancellationToken ct);
}

public interface IDisputeRepository
{
    Task<Dispute?> GetAsync(Guid id, CancellationToken ct);

    Task<IReadOnlyList<Dispute>> ListForStatementAsync(Guid statementId, CancellationToken ct);

    Task<IReadOnlyList<Dispute>> ListForPartnerAsync(Guid partnerId, CancellationToken ct);

    Task AddAsync(Dispute dispute, CancellationToken ct);
}

public interface IBulkUploadRepository
{
    Task<BulkUpload?> GetAsync(Guid id, CancellationToken ct);

    Task<BulkUpload?> GetByHashAsync(Guid partnerId, string contentSha256, CancellationToken ct);

    Task AddAsync(BulkUpload upload, CancellationToken ct);
}

public interface IUnitOfWork
{
    Task SaveChangesAsync(CancellationToken ct);
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Abstractions/Services.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Abstractions/Services.cs`.

```csharp
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Abstractions;

public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

/// <summary>The authenticated caller: a portal user (JWT) or a partner integration (API key).</summary>
public interface ICurrentCaller
{
    Guid PartnerId { get; }

    string ActorId { get; }

    bool IsSupportAgent { get; }

    bool IsApiKey { get; }
}

public interface ICalendarProvider
{
    WorkingCalendar Get(CalendarKind kind);

    WorkingCalendar GetByName(string name);
}

/// <summary>Generates human-friendly sequential references such as ORD-00001234.</summary>
public interface IReferenceGenerator
{
    Task<string> NextAsync(string prefix, CancellationToken ct);
}

/// <summary>Outbound notification to the partner (webhook/email); implemented in infrastructure.</summary>
public interface IPartnerNotifier
{
    Task NotifyAsync(Guid partnerId, string eventType, object payload, CancellationToken ct);
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/ApiKeys/ApiKeyService.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/ApiKeys/ApiKeyService.cs`.

```csharp
using System.Security.Cryptography;
using System.Text;
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Partners;

namespace IConnect.Wholesale.Application.ApiKeys;

public sealed record CreateApiKeyRequest(string Name, IReadOnlyList<string> Scopes, int? ValidForDays);

public sealed record ApiKeyDto(Guid Id, string Name, string Prefix, IReadOnlyList<string> Scopes, DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt, DateTimeOffset? RevokedAt, DateTimeOffset? LastUsedAt, string Status);

/// <summary>Returned once at creation; <see cref="Secret"/> is never retrievable again.</summary>
public sealed record CreatedApiKeyDto(ApiKeyDto Key, string Secret);

public sealed record ApiKeyPrincipal(Guid KeyId, Guid PartnerId, IReadOnlyList<string> Scopes);

/// <summary>
/// Partner API key management and verification. Key format: <c>icw_{prefix}_{secret}</c> where the
/// 12-char prefix is stored in clear for lookup and the full token is hashed with SHA-256.
/// Verification uses a constant-time comparison.
/// </summary>
public sealed class ApiKeyService
{
    public const string TokenPrefix = "icw_";
    public const int DefaultValidityDays = 180;
    private const int PrefixLength = 12;
    private const int SecretBytes = 32;
    private const string Alphabet = "abcdefghijkmnopqrstuvwxyz23456789";

    private readonly IApiKeyRepository _keys;
    private readonly IPartnerRepository _partners;
    private readonly ICurrentCaller _caller;
    private readonly IClock _clock;
    private readonly IUnitOfWork _uow;

    public ApiKeyService(IApiKeyRepository keys, IPartnerRepository partners, ICurrentCaller caller, IClock clock, IUnitOfWork uow)
    {
        _keys = keys;
        _partners = partners;
        _caller = caller;
        _clock = clock;
        _uow = uow;
    }

    public async Task<IReadOnlyList<ApiKeyDto>> ListAsync(CancellationToken ct)
    {
        var keys = await _keys.ListForPartnerAsync(_caller.PartnerId, ct);
        var now = _clock.UtcNow;
        return keys.OrderByDescending(k => k.CreatedAt).Select(k => ToDto(k, now)).ToList();
    }

    public async Task<CreatedApiKeyDto> CreateAsync(CreateApiKeyRequest request, CancellationToken ct)
    {
        if (_caller.IsApiKey)
        {
            throw new ForbiddenException("API keys cannot be used to create other API keys.");
        }

        var days = request.ValidForDays ?? DefaultValidityDays;
        new ValidationBuilder()
            .Require(days is >= 1 and <= 365, "validForDays", "Validity must be between 1 and 365 days.")
            .Require(request.Scopes is { Count: > 0 }, "scopes", "Select at least one scope.")
            .ThrowIfInvalid();

        var now = _clock.UtcNow;
        var existing = await _keys.ListForPartnerAsync(_caller.PartnerId, ct);
        if (existing.Count(k => k.IsUsable(now)) >= ApiKey.MaxActiveKeysPerPartner)
        {
            throw new ConflictException("apikey.limit", $"A partner can hold at most {ApiKey.MaxActiveKeysPerPartner} active keys; revoke one first.");
        }

        if (existing.Any(k => k.IsUsable(now) && string.Equals(k.Name, request.Name?.Trim(), StringComparison.OrdinalIgnoreCase)))
        {
            throw new ConflictException("apikey.duplicate_name", "An active key with this name already exists.");
        }

        var partner = await _partners.GetAsync(_caller.PartnerId, ct) ?? throw new NotFoundException("Partner", _caller.PartnerId);
        if (!partner.CanTrade)
        {
            throw new ForbiddenException("Suspended partners cannot create API keys.");
        }

        var prefix = RandomString(PrefixLength);
        var secret = RandomString(SecretBytes);
        var token = $"{TokenPrefix}{prefix}_{secret}";
        var key = new ApiKey(_caller.PartnerId, request.Name ?? string.Empty, prefix, Hash(token), request.Scopes,
            now, now.AddDays(days), _caller.ActorId);

        await _keys.AddAsync(key, ct);
        await _uow.SaveChangesAsync(ct);
        return new CreatedApiKeyDto(ToDto(key, now), token);
    }

    public async Task RevokeAsync(Guid id, CancellationToken ct)
    {
        var key = await _keys.GetAsync(id, ct);
        if (key is null || key.PartnerId != _caller.PartnerId)
        {
            throw new NotFoundException("ApiKey", id);
        }

        key.Revoke(_clock.UtcNow);
        await _uow.SaveChangesAsync(ct);
    }

    /// <summary>Verifies a presented token. Returns null for any failure without revealing which check failed.</summary>
    public async Task<ApiKeyPrincipal?> VerifyAsync(string? token, CancellationToken ct)
    {
        if (!TryParse(token, out var prefix))
        {
            return null;
        }

        var key = await _keys.GetByPrefixAsync(prefix, ct);
        if (key is null)
        {
            return null;
        }

        var presented = Convert.FromHexString(Hash(token!));
        var stored = Convert.FromHexString(key.SecretHash);
        if (!CryptographicOperations.FixedTimeEquals(presented, stored))
        {
            return null;
        }

        var now = _clock.UtcNow;
        if (!key.IsUsable(now))
        {
            return null;
        }

        var partner = await _partners.GetAsync(key.PartnerId, ct);
        if (partner is null || !partner.CanTrade)
        {
            return null;
        }

        if (key.RecordUse(now))
        {
            await _uow.SaveChangesAsync(ct);
        }

        return new ApiKeyPrincipal(key.Id, key.PartnerId, key.Scopes);
    }

    internal static bool TryParse(string? token, out string prefix)
    {
        prefix = string.Empty;
        if (string.IsNullOrEmpty(token) || !token.StartsWith(TokenPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var body = token.AsSpan(TokenPrefix.Length);
        var separator = body.IndexOf('_');
        if (separator != PrefixLength || body.Length != PrefixLength + 1 + SecretBytes)
        {
            return false;
        }

        prefix = body[..PrefixLength].ToString();
        return true;
    }

    internal static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static string RandomString(int length)
    {
        var chars = new char[length];
        for (var i = 0; i < length; i++)
        {
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }

        return new string(chars);
    }

    private static ApiKeyDto ToDto(ApiKey k, DateTimeOffset now) => new(
        k.Id, k.Name, TokenPrefix + k.Prefix, k.Scopes, k.CreatedAt, k.ExpiresAt, k.RevokedAt, k.LastUsedAt,
        k.RevokedAt is not null ? "REVOKED" : k.ExpiresAt <= now ? "EXPIRED" : k.ExpiresAt - now < TimeSpan.FromDays(14) ? "EXPIRING" : "ACTIVE");
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Appointments/AppointmentService.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Appointments/AppointmentService.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Application.Orders;
using IConnect.Wholesale.Domain.Appointments;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Appointments;

public sealed record AppointmentSlotDto(Guid Id, DateOnly Date, string Band, int Remaining, bool MeetsCommittedDate);

public sealed record BookAppointmentRequest(Guid SlotId);

public sealed record BookingDto(Guid OrderId, Guid SlotId, DateOnly Date, string Band, DateTimeOffset HoldExpiresAt, DateOnly? CommittedDate);

/// <summary>
/// Engineer appointment search and booking for orders that need a site visit (provide, migrate).
/// Slots are offered from the minimum notice date for the premise's exchange patch.
/// </summary>
public sealed class AppointmentService
{
    public const int MinimumNoticeWorkingDays = 2;
    public const int SearchWindowDays = 42;

    private readonly IAppointmentSlotRepository _slots;
    private readonly IPremiseRepository _premises;
    private readonly OrderService _orders;
    private readonly ICalendarProvider _calendars;
    private readonly IClock _clock;
    private readonly IUnitOfWork _uow;

    public AppointmentService(IAppointmentSlotRepository slots, IPremiseRepository premises, OrderService orders,
        ICalendarProvider calendars, IClock clock, IUnitOfWork uow)
    {
        _slots = slots;
        _premises = premises;
        _orders = orders;
        _calendars = calendars;
        _clock = clock;
        _uow = uow;
    }

    public async Task<IReadOnlyList<AppointmentSlotDto>> AvailableForOrderAsync(Guid orderId, DateOnly? from, CancellationToken ct)
    {
        var order = await _orders.LoadOwnedAsync(orderId, ct);
        EnsureNeedsAppointment(order);

        var premise = await _premises.GetByUprnAsync(order.Uprn, ct) ?? throw new NotFoundException("Premise", order.Uprn);
        var calendar = _calendars.Get(CalendarKind.BusinessHours);
        var now = _clock.UtcNow;
        var earliest = calendar.AddWorkingDays(calendar.LocalDate(now), MinimumNoticeWorkingDays);
        var start = from is { } f && f > earliest ? f : earliest;

        var slots = await _slots.ListAsync(premise.ExchangeCode, start, start.AddDays(SearchWindowDays), ct);
        return slots
            .Where(s => s.Remaining(now) > 0 && calendar.IsWorkingDay(s.Date))
            .OrderBy(s => s.Date).ThenBy(s => s.Band)
            .Select(s => new AppointmentSlotDto(s.Id, s.Date, s.Band.ToString().ToUpperInvariant(), s.Remaining(now),
                order.CommittedDate is not { } committed || s.Date <= committed))
            .ToList();
    }

    /// <summary>
    /// Reserves a slot for the order, releasing any previously booked slot. If the chosen date is
    /// after the committed date, the committed date moves to the appointment (partner's choice,
    /// so it does not count as late delivery).
    /// </summary>
    public async Task<BookingDto> BookAsync(Guid orderId, BookAppointmentRequest request, CancellationToken ct)
    {
        var order = await _orders.LoadOwnedAsync(orderId, ct);
        EnsureNeedsAppointment(order);

        var slot = await _slots.GetAsync(request.SlotId, ct) ?? throw new NotFoundException("AppointmentSlot", request.SlotId);
        var premise = await _premises.GetByUprnAsync(order.Uprn, ct) ?? throw new NotFoundException("Premise", order.Uprn);
        if (!string.Equals(slot.ExchangeCode, premise.ExchangeCode, StringComparison.OrdinalIgnoreCase))
        {
            throw new RequestValidationException("slotId", "The slot is not in the premise's exchange area.");
        }

        var calendar = _calendars.Get(CalendarKind.BusinessHours);
        var now = _clock.UtcNow;
        var earliest = calendar.AddWorkingDays(calendar.LocalDate(now), MinimumNoticeWorkingDays);
        if (slot.Date < earliest)
        {
            throw new RequestValidationException("slotId", $"Appointments need {MinimumNoticeWorkingDays} working days' notice.");
        }

        SlotReservation reservation;
        try
        {
            reservation = slot.Reserve(order.Id, now);
        }
        catch (DomainException ex) when (ex.Code == "slot.full")
        {
            throw new ConflictException(ex.Code, ex.Message);
        }

        if (order.AppointmentSlotId is { } previousId && previousId != slot.Id && await _slots.GetAsync(previousId, ct) is { } previous)
        {
            previous.Release(order.Id);
        }

        order.BookAppointment(slot.Id, slot.Date);
        if (order.Status == OrderStatus.Provisioning)
        {
            slot.Confirm(order.Id, now);
        }

        await _uow.SaveChangesAsync(ct);
        return new BookingDto(order.Id, slot.Id, slot.Date, slot.Band.ToString().ToUpperInvariant(), reservation.HoldExpiresAt, order.CommittedDate);
    }

    private static void EnsureNeedsAppointment(Order order)
    {
        if (order.Type is not (OrderType.Provide or OrderType.Migrate))
        {
            throw new ConflictException("appointment.not_required", $"{order.Type} orders do not need an engineer appointment.");
        }

        if (OrderStateMachine.IsTerminal(order.Status))
        {
            throw new ConflictException("appointment.order_closed", "The order is closed.");
        }
    }
}
```
