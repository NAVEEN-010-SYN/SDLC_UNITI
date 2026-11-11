# Uconnect account & service management: apps/uconnect (part 1 of 8)

- **Application:** Uconnect account & service management
- **Tech stack:** .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 22

## Files

- `apps/uconnect/.env.example` (25 lines)
- `apps/uconnect/Directory.Build.props` (15 lines)
- `apps/uconnect/Uconnect.sln` (62 lines)
- `apps/uconnect/src/Uconnect.Api/Controllers/AccountControllers.cs` (129 lines)
- `apps/uconnect/src/Uconnect.Api/Controllers/BillingControllers.cs` (140 lines)
- `apps/uconnect/src/Uconnect.Api/Controllers/ProvisioningWebhookController.cs` (91 lines)
- `apps/uconnect/src/Uconnect.Api/Controllers/SupportControllers.cs` (148 lines)
- `apps/uconnect/src/Uconnect.Api/Http/CorrelationIdMiddleware.cs` (46 lines)
- `apps/uconnect/src/Uconnect.Api/Http/ProblemDetailsExceptionHandler.cs` (91 lines)
- `apps/uconnect/src/Uconnect.Api/Jobs/ScheduledJobsWorker.cs` (85 lines)
- `apps/uconnect/src/Uconnect.Api/Program.cs` (94 lines)
- `apps/uconnect/src/Uconnect.Api/Security/HttpCurrentUser.cs` (70 lines)
- `apps/uconnect/src/Uconnect.Api/Uconnect.Api.csproj` (24 lines)
- `apps/uconnect/src/Uconnect.Api/appsettings.json` (60 lines)
- `apps/uconnect/src/Uconnect.Application/Abstractions/ExternalClients.cs` (116 lines)
- `apps/uconnect/src/Uconnect.Application/Abstractions/Lookups.cs` (8 lines)
- `apps/uconnect/src/Uconnect.Application/Abstractions/Repositories.cs` (197 lines)
- `apps/uconnect/src/Uconnect.Application/Accounts/AccountUserService.cs` (100 lines)
- `apps/uconnect/src/Uconnect.Application/Accounts/ProfileDtos.cs` (74 lines)
- `apps/uconnect/src/Uconnect.Application/Accounts/ProfileService.cs` (128 lines)
- `apps/uconnect/src/Uconnect.Application/Accounts/ProfileValidators.cs` (63 lines)
- `apps/uconnect/src/Uconnect.Application/Appointments/AppointmentDtos.cs` (122 lines)

## apps/uconnect/.env.example

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: bash. Path: `apps/uconnect/.env.example`.

```bash
# Uconnect secrets and per-environment settings. Copy to .env (never commit it) or set in the host.
# ASP.NET Core maps "__" to ":" in configuration keys.

ASPNETCORE_ENVIRONMENT=Development
ConnectionStrings__Uconnect=Server=localhost,1433;Database=uconnect;User Id=uconnect_app;Password=change-me;TrustServerCertificate=true

Authentication__Jwt__Authority=https://login.uniti.example/realms/selfcare
Authentication__Jwt__Audience=uconnect-api

Uconnect__External__Provisioning__ApiKey=
Uconnect__External__PaymentGateway__ApiKey=
Uconnect__External__BillingSystem__ApiKey=
Uconnect__External__FieldService__ApiKey=
Uconnect__External__Notifications__ApiKey=
Uconnect__Webhooks__ProvisioningSecret=

# Run scheduled jobs on exactly one API instance.
Uconnect__Jobs__Enabled=true

# Uconnect.Web (Razor UI)
Oidc__Authority=https://login.uniti.example/realms/selfcare
Oidc__ClientId=uconnect-web
Oidc__ClientSecret=
UconnectApi__BaseUrl=https://localhost:7101/
```

## apps/uconnect/Directory.Build.props

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: xml. Path: `apps/uconnect/Directory.Build.props`.

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <LangVersion>12.0</LangVersion>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <NoWarn>$(NoWarn);CS1591</NoWarn>
    <InvariantGlobalization>true</InvariantGlobalization>
    <Company>Uniti</Company>
    <Product>Uconnect</Product>
  </PropertyGroup>
</Project>
```

## apps/uconnect/Uconnect.sln

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: text. Path: `apps/uconnect/Uconnect.sln`.

```text

Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
VisualStudioVersion = 17.8.34330.188
MinimumVisualStudioVersion = 10.0.40219.1
Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "src", "src", "{8A1F0D35-6E1B-4C2A-9F0B-1E5C1A3D2B01}"
EndProject
Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "tests", "tests", "{8A1F0D35-6E1B-4C2A-9F0B-1E5C1A3D2B02}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Uconnect.Domain", "src\Uconnect.Domain\Uconnect.Domain.csproj", "{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F01}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Uconnect.Application", "src\Uconnect.Application\Uconnect.Application.csproj", "{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F02}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Uconnect.Infrastructure", "src\Uconnect.Infrastructure\Uconnect.Infrastructure.csproj", "{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F03}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Uconnect.Api", "src\Uconnect.Api\Uconnect.Api.csproj", "{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F04}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Uconnect.Web", "src\Uconnect.Web\Uconnect.Web.csproj", "{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F05}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Uconnect.Tests", "tests\Uconnect.Tests\Uconnect.Tests.csproj", "{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F06}"
EndProject
Global
	GlobalSection(SolutionConfigurationPlatforms) = preSolution
		Debug|Any CPU = Debug|Any CPU
		Release|Any CPU = Release|Any CPU
	EndGlobalSection
	GlobalSection(ProjectConfigurationPlatforms) = postSolution
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F01}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F01}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F01}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F01}.Release|Any CPU.Build.0 = Release|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F02}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F02}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F02}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F02}.Release|Any CPU.Build.0 = Release|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F03}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F03}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F03}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F03}.Release|Any CPU.Build.0 = Release|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F04}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F04}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F04}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F04}.Release|Any CPU.Build.0 = Release|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F05}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F05}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F05}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F05}.Release|Any CPU.Build.0 = Release|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F06}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F06}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F06}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F06}.Release|Any CPU.Build.0 = Release|Any CPU
	EndGlobalSection
	GlobalSection(NestedProjects) = preSolution
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F01} = {8A1F0D35-6E1B-4C2A-9F0B-1E5C1A3D2B01}
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F02} = {8A1F0D35-6E1B-4C2A-9F0B-1E5C1A3D2B01}
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F03} = {8A1F0D35-6E1B-4C2A-9F0B-1E5C1A3D2B01}
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F04} = {8A1F0D35-6E1B-4C2A-9F0B-1E5C1A3D2B01}
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F05} = {8A1F0D35-6E1B-4C2A-9F0B-1E5C1A3D2B01}
		{3C5E7A10-1B2D-4E6F-8A90-0B1C2D3E4F06} = {8A1F0D35-6E1B-4C2A-9F0B-1E5C1A3D2B02}
	EndGlobalSection
EndGlobal
```

## apps/uconnect/src/Uconnect.Api/Controllers/AccountControllers.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Api/Controllers/AccountControllers.cs`.

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Api.Security;
using Uconnect.Application.Accounts;
using Uconnect.Application.Common;
using Uconnect.Application.Dashboard;
using Uconnect.Application.PlanChanges;
using Uconnect.Application.Services;

namespace Uconnect.Api.Controllers;

/// <summary>Base for routes scoped to one account. Per-account rights are enforced in the application layer.</summary>
[ApiController]
[Authorize(Policy = Policies.Customer)]
[Route("api/v1/accounts/{accountNumber}")]
[Produces("application/json")]
public abstract class AccountScopedController : ControllerBase
{
    protected static PageRequest Page(int? page, int? pageSize) => PageRequest.Normalise(page, pageSize);
}

[ApiController]
[Authorize(Policy = Policies.Customer)]
[Route("api/v1/me")]
public sealed class MeController : ControllerBase
{
    private readonly ProfileService _profiles;

    public MeController(ProfileService profiles) => _profiles = profiles;

    /// <summary>Accounts the signed-in user can access.</summary>
    [HttpGet("accounts")]
    public Task<IReadOnlyList<AccountSummaryDto>> MyAccounts(CancellationToken ct) => _profiles.ListMyAccountsAsync(ct);
}

public sealed class AccountsController : AccountScopedController
{
    private readonly ProfileService _profiles;
    private readonly AccountUserService _users;
    private readonly DashboardService _dashboard;

    public AccountsController(ProfileService profiles, AccountUserService users, DashboardService dashboard)
    {
        _profiles = profiles;
        _users = users;
        _dashboard = dashboard;
    }

    [HttpGet("dashboard")]
    public Task<DashboardDto> Dashboard(string accountNumber, CancellationToken ct) => _dashboard.GetAsync(accountNumber, ct);

    [HttpGet("profile")]
    public Task<AccountProfileDto> GetProfile(string accountNumber, CancellationToken ct) => _profiles.GetAsync(accountNumber, ct);

    [HttpPut("profile")]
    public Task<AccountProfileDto> UpdateProfile(string accountNumber, UpdateProfileRequest request, CancellationToken ct) =>
        _profiles.UpdateAsync(accountNumber, request, ct);

    [HttpPut("preferences")]
    public Task<AccountProfileDto> UpdatePreferences(string accountNumber, UpdatePreferencesRequest request, CancellationToken ct) =>
        _profiles.UpdatePreferencesAsync(accountNumber, request, ct);

    [HttpPut("billing-day")]
    public Task<AccountProfileDto> ChangeBillingDay(string accountNumber, ChangeBillingDayRequest request, CancellationToken ct) =>
        _profiles.ChangeBillingDayAsync(accountNumber, request, ct);

    [HttpGet("users")]
    public Task<IReadOnlyList<AccountUserDto>> ListUsers(string accountNumber, CancellationToken ct) => _users.ListAsync(accountNumber, ct);

    [HttpPost("users")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<ActionResult<AccountUserDto>> InviteUser(string accountNumber, InviteUserRequest request, CancellationToken ct)
    {
        var user = await _users.InviteAsync(accountNumber, request, ct);
        return Created($"/api/v1/accounts/{accountNumber}/users/{user.Id}", user);
    }

    [HttpPut("users/{userId:guid}/role")]
    public Task<AccountUserDto> ChangeRole(string accountNumber, Guid userId, ChangeUserRoleRequest request, CancellationToken ct) =>
        _users.ChangeRoleAsync(accountNumber, userId, request, ct);

    [HttpDelete("users/{userId:guid}")]
    public async Task<IActionResult> RemoveUser(string accountNumber, Guid userId, CancellationToken ct)
    {
        await _users.RemoveAsync(accountNumber, userId, ct);
        return NoContent();
    }
}

public sealed class ServicesController : AccountScopedController
{
    private readonly ServiceInventoryService _inventory;
    private readonly PlanChangeService _planChanges;

    public ServicesController(ServiceInventoryService inventory, PlanChangeService planChanges)
    {
        _inventory = inventory;
        _planChanges = planChanges;
    }

    [HttpGet("services")]
    public Task<IReadOnlyList<ServiceSummaryDto>> List(string accountNumber, [FromQuery] bool includeCancelled, CancellationToken ct) =>
        _inventory.ListAsync(accountNumber, includeCancelled, ct);

    [HttpGet("services/{serviceId:guid}")]
    public Task<ServiceDetailDto> Get(string accountNumber, Guid serviceId, CancellationToken ct) =>
        _inventory.GetAsync(accountNumber, serviceId, ct);

    [HttpPost("plan-changes/quote")]
    public Task<PlanChangeQuoteDto> Quote(string accountNumber, PlanChangeQuoteRequest request, CancellationToken ct) =>
        _planChanges.QuoteAsync(accountNumber, request, ct);

    [HttpGet("plan-changes")]
    public Task<IReadOnlyList<PlanChangeDto>> ListPlanChanges(string accountNumber, CancellationToken ct) =>
        _planChanges.ListAsync(accountNumber, ct);

    [HttpPost("plan-changes")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<ActionResult<PlanChangeDto>> RequestPlanChange(string accountNumber, RequestPlanChangeRequest request, CancellationToken ct)
    {
        var change = await _planChanges.RequestAsync(accountNumber, request, ct);
        return Created($"/api/v1/accounts/{accountNumber}/plan-changes/{change.Id}", change);
    }

    [HttpPost("plan-changes/{planChangeId:guid}/cancel")]
    public Task<PlanChangeDto> CancelPlanChange(string accountNumber, Guid planChangeId, CancellationToken ct) =>
        _planChanges.CancelAsync(accountNumber, planChangeId, ct);
}
```

## apps/uconnect/src/Uconnect.Api/Controllers/BillingControllers.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Api/Controllers/BillingControllers.cs`.

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Api.Security;
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Application.Usage;

namespace Uconnect.Api.Controllers;

public sealed class InvoicesController : AccountScopedController
{
    private readonly InvoiceService _invoices;
    private readonly AdjustmentService _adjustments;

    public InvoicesController(InvoiceService invoices, AdjustmentService adjustments)
    {
        _invoices = invoices;
        _adjustments = adjustments;
    }

    [HttpGet("invoices")]
    public Task<PagedResult<InvoiceSummaryDto>> List(string accountNumber, [FromQuery] string? status, [FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken ct) =>
        _invoices.ListAsync(accountNumber, status, Page(page, pageSize), ct);

    [HttpGet("invoices/{invoiceNumber}")]
    public Task<InvoiceDetailDto> Get(string accountNumber, string invoiceNumber, CancellationToken ct) =>
        _invoices.GetAsync(accountNumber, invoiceNumber, ct);

    [HttpGet("invoices/{invoiceNumber}/pdf")]
    [Produces("application/pdf")]
    public async Task<IActionResult> Pdf(string accountNumber, string invoiceNumber, CancellationToken ct)
    {
        var document = await _invoices.GetPdfAsync(accountNumber, invoiceNumber, ct);
        return File(document.Content, document.ContentType, document.FileName);
    }

    [HttpGet("balance")]
    public Task<AccountBalanceDto> Balance(string accountNumber, CancellationToken ct) => _invoices.GetBalanceAsync(accountNumber, ct);

    [HttpGet("adjustments")]
    public Task<IReadOnlyList<AdjustmentDto>> ListAdjustments(string accountNumber, CancellationToken ct) => _adjustments.ListAsync(accountNumber, ct);

    [HttpPost("adjustments")]
    [Authorize(Policy = Policies.SupportAgent)]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<ActionResult<AdjustmentDto>> RaiseAdjustment(string accountNumber, RaiseAdjustmentRequest request, CancellationToken ct)
    {
        var adjustment = await _adjustments.RaiseAsync(accountNumber, request, ct);
        return Created($"/api/v1/accounts/{accountNumber}/adjustments", adjustment);
    }
}

public sealed class PaymentsController : AccountScopedController
{
    private readonly PaymentService _payments;
    private readonly PaymentMethodService _methods;

    public PaymentsController(PaymentService payments, PaymentMethodService methods)
    {
        _payments = payments;
        _methods = methods;
    }

    /// <summary>Pays an invoice. Send a unique <c>Idempotency-Key</c> per payment attempt and reuse it on retry.</summary>
    [HttpPost("invoices/{invoiceNumber}/payments")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status402PaymentRequired)]
    public async Task<ActionResult<PaymentDto>> Pay(
        string accountNumber, string invoiceNumber, PayInvoiceRequest request, [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey, CancellationToken ct)
    {
        var payment = await _payments.PayInvoiceAsync(accountNumber, invoiceNumber, request, idempotencyKey, ct);
        return Created($"/api/v1/accounts/{accountNumber}/payments/{payment.Id}", payment);
    }

    [HttpGet("payments")]
    public Task<PagedResult<PaymentDto>> List(string accountNumber, [FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken ct) =>
        _payments.ListAsync(accountNumber, Page(page, pageSize), ct);

    [HttpPost("payments/{paymentId:guid}/refunds")]
    [Authorize(Policy = Policies.SupportAgent)]
    public Task<PaymentDto> Refund(string accountNumber, Guid paymentId, RefundPaymentRequest request, CancellationToken ct) =>
        _payments.RefundAsync(accountNumber, paymentId, request, ct);

    [HttpGet("payment-methods")]
    public Task<IReadOnlyList<PaymentMethodDto>> ListMethods(string accountNumber, CancellationToken ct) => _methods.ListAsync(accountNumber, ct);

    [HttpPost("payment-methods")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<ActionResult<PaymentMethodDto>> AddMethod(string accountNumber, AddPaymentMethodRequest request, CancellationToken ct)
    {
        var method = await _methods.AddAsync(accountNumber, request, ct);
        return Created($"/api/v1/accounts/{accountNumber}/payment-methods/{method.Id}", method);
    }

    [HttpPost("payment-methods/{methodId:guid}/default")]
    public Task<IReadOnlyList<PaymentMethodDto>> MakeDefault(string accountNumber, Guid methodId, CancellationToken ct) =>
        _methods.SetDefaultAsync(accountNumber, methodId, ct);

    [HttpDelete("payment-methods/{methodId:guid}")]
    public async Task<IActionResult> RemoveMethod(string accountNumber, Guid methodId, CancellationToken ct)
    {
        await _methods.RemoveAsync(accountNumber, methodId, ct);
        return NoContent();
    }

    [HttpGet("autopay")]
    public Task<AutopayDto> GetAutopay(string accountNumber, CancellationToken ct) => _methods.GetAutopayAsync(accountNumber, ct);

    [HttpPut("autopay")]
    public Task<AutopayDto> UpdateAutopay(string accountNumber, UpdateAutopayRequest request, CancellationToken ct) =>
        _methods.UpdateAutopayAsync(accountNumber, request, ct);
}

public sealed class UsageController : AccountScopedController
{
    private readonly UsageService _usage;

    public UsageController(UsageService usage) => _usage = usage;

    /// <summary>Usage for the billing cycle containing <paramref name="period"/> (ISO date; defaults to today).</summary>
    [HttpGet("services/{serviceId:guid}/usage")]
    public Task<UsageSummaryDto> Summary(string accountNumber, Guid serviceId, [FromQuery] DateOnly? period, CancellationToken ct) =>
        _usage.GetSummaryAsync(accountNumber, serviceId, period, ct);
}

[ApiController]
[Route("api/v1/usage/records")]
[Authorize(Policy = Policies.UsageIngest)]
public sealed class UsageIngestController : ControllerBase
{
    private readonly UsageService _usage;

    public UsageIngestController(UsageService usage) => _usage = usage;

    [HttpPost]
    [RequestSizeLimit(4 * 1024 * 1024)]
    public Task<UsageIngestResult> Ingest(IngestUsageRequest request, CancellationToken ct) => _usage.IngestAsync(request, ct);
}
```

## apps/uconnect/src/Uconnect.Api/Controllers/ProvisioningWebhookController.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Api/Controllers/ProvisioningWebhookController.cs`.

```csharp
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.PlanChanges;
using Uconnect.Infrastructure.External;

namespace Uconnect.Api.Controllers;

/// <summary>Shared secret for provisioning callbacks (section <c>Uconnect:Webhooks</c>, value from the environment).</summary>
public sealed class WebhookOptions
{
    public const string SectionName = "Uconnect:Webhooks";

    public string ProvisioningSecret { get; set; } = string.Empty;

    /// <summary>Callbacks whose timestamp is older than this are rejected to stop replays.</summary>
    public int MaxAgeSeconds { get; set; } = 300;
}

/// <summary>
/// Provisioning order status callbacks. The OSS signs <c>{timestamp}.{body}</c> with HMAC-SHA256 and sends
/// it in <c>X-Signature</c> with the timestamp in <c>X-Timestamp</c> (Unix seconds).
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/v1/webhooks/provisioning")]
public sealed class ProvisioningWebhookController : ControllerBase
{
    private readonly PlanChangeProcessor _processor;
    private readonly WebhookOptions _options;
    private readonly TimeProvider _time;

    public ProvisioningWebhookController(PlanChangeProcessor processor, IOptions<WebhookOptions> options, TimeProvider time)
    {
        _processor = processor;
        _options = options.Value;
        _time = time;
    }

    [HttpPost]
    public async Task<IActionResult> Receive([FromHeader(Name = "X-Signature")] string? signature, [FromHeader(Name = "X-Timestamp")] long? timestamp, CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var body = await reader.ReadToEndAsync(ct);

        if (!IsAuthentic(body, signature, timestamp, _options, _time.GetUtcNow()))
        {
            return Unauthorized();
        }

        var status = JsonSerializer.Deserialize<ProvisioningOrderStatus>(body, ExternalHttp.SerializerOptions);
        if (status is null || string.IsNullOrWhiteSpace(status.OrderRef))
        {
            return BadRequest();
        }

        await _processor.HandleCallbackAsync(status, ct);
        return NoContent();
    }

    internal static bool IsAuthentic(string body, string? signature, long? timestamp, WebhookOptions options, DateTimeOffset now)
    {
        if (string.IsNullOrEmpty(options.ProvisioningSecret) || string.IsNullOrEmpty(signature) || timestamp is null)
        {
            return false;
        }

        if (Math.Abs(now.ToUnixTimeSeconds() - timestamp.Value) > options.MaxAgeSeconds)
        {
            return false;
        }

        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(options.ProvisioningSecret), Encoding.UTF8.GetBytes($"{timestamp}.{body}"));
        byte[] provided;
        try
        {
            provided = Convert.FromHexString(signature);
        }
        catch (FormatException)
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(expected, provided);
    }
}
```

## apps/uconnect/src/Uconnect.Api/Controllers/SupportControllers.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Api/Controllers/SupportControllers.cs`.

```csharp
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
```

## apps/uconnect/src/Uconnect.Api/Http/CorrelationIdMiddleware.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Api/Http/CorrelationIdMiddleware.cs`.

```csharp
using System.Text.RegularExpressions;
using Uconnect.Infrastructure.External;

namespace Uconnect.Api.Http;

/// <summary>
/// Accepts the caller's <c>X-Correlation-Id</c> (or creates one), echoes it on the response, opens a
/// logging scope so every structured log line carries it, and exposes it to outbound HTTP clients.
/// </summary>
public sealed partial class CorrelationIdMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<CorrelationIdMiddleware> _logger;

    public CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var incoming = context.Request.Headers[CorrelationContext.HeaderName].ToString();
        var correlationId = IsAcceptable(incoming) ? incoming : Guid.NewGuid().ToString("N");

        context.TraceIdentifier = correlationId;
        CorrelationContext.CorrelationId = correlationId;
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[CorrelationContext.HeaderName] = correlationId;
            return Task.CompletedTask;
        });

        using (_logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = correlationId }))
        {
            await _next(context);
        }
    }

    /// <summary>Only short, printable ids are propagated, so a caller cannot inject content into logs or headers.</summary>
    internal static bool IsAcceptable(string? value) => !string.IsNullOrEmpty(value) && value.Length <= 64 && SafeId().IsMatch(value);

    [GeneratedRegex("^[A-Za-z0-9._-]+$")]
    private static partial Regex SafeId();
}
```

## apps/uconnect/src/Uconnect.Api/Http/ProblemDetailsExceptionHandler.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Api/Http/ProblemDetailsExceptionHandler.cs`.

```csharp
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Domain.Common;

namespace Uconnect.Api.Http;

/// <summary>
/// Maps exceptions to RFC 7807 <c>application/problem+json</c> responses. Every problem carries a
/// stable <c>code</c> and the request's <c>correlationId</c>; unexpected errors never leak details.
/// </summary>
public sealed class ProblemDetailsExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetails;
    private readonly ILogger<ProblemDetailsExceptionHandler> _logger;

    public ProblemDetailsExceptionHandler(IProblemDetailsService problemDetails, ILogger<ProblemDetailsExceptionHandler> logger)
    {
        _problemDetails = problemDetails;
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var problem = Map(exception);
        if (problem.Status >= StatusCodes.Status500InternalServerError)
        {
            _logger.LogError(exception, "Request failed with {Status}", problem.Status);
        }
        else
        {
            _logger.LogInformation("Request rejected with {Status} {Code}", problem.Status, problem.Extensions["code"]);
        }

        if (exception is ExternalServiceException { IsTransient: true })
        {
            httpContext.Response.Headers.RetryAfter = "30";
        }

        httpContext.Response.StatusCode = problem.Status!.Value;
        return await _problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    internal static ProblemDetails Map(Exception exception)
    {
        var problem = exception switch
        {
            RequestValidationException e => new ValidationProblemDetails(e.Errors.ToDictionary(k => k.Key, v => v.Value))
            {
                Status = StatusCodes.Status400BadRequest,
                Title = e.Message,
            },
            NotFoundException e => Problem(StatusCodes.Status404NotFound, "Not found", e.Message),
            ForbiddenException e => Problem(StatusCodes.Status403Forbidden, "Forbidden", e.Message),
            ConflictException e => Problem(StatusCodes.Status409Conflict, "Conflict", e.Message),
            PaymentDeclinedException e => Problem(StatusCodes.Status402PaymentRequired, "Payment declined", e.Message),
            ExternalServiceException e => Problem(
                e.IsTransient ? StatusCodes.Status503ServiceUnavailable : StatusCodes.Status502BadGateway,
                "Dependency unavailable",
                "A system we depend on is not responding. Please try again shortly."),
            InvalidStateTransitionException e => Problem(StatusCodes.Status409Conflict, "Invalid state", e.Message),
            DomainException e => Problem(StatusCodes.Status422UnprocessableEntity, "Business rule violated", e.Message),
            BadHttpRequestException e => Problem(e.StatusCode, "Bad request", "The request could not be read."),
            _ => Problem(StatusCodes.Status500InternalServerError, "Unexpected error", "Something went wrong. Quote the correlation id if you contact support."),
        };

        problem.Extensions["code"] = exception switch
        {
            ApplicationExceptionBase e => e.Code,
            DomainException e => e.Code,
            _ => problem.Status >= 500 ? "internal_error" : "bad_request",
        };

        if (exception is PaymentDeclinedException declined)
        {
            problem.Extensions["paymentId"] = declined.PaymentId;
            problem.Extensions["failureCode"] = declined.FailureCode;
        }

        return problem;
    }

    private static ProblemDetails Problem(int status, string title, string detail) => new() { Status = status, Title = title, Detail = detail };
}
```

## apps/uconnect/src/Uconnect.Api/Jobs/ScheduledJobsWorker.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Api/Jobs/ScheduledJobsWorker.cs`.

```csharp
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Application.PlanChanges;
using Uconnect.Application.Tickets;
using Uconnect.Infrastructure.External;

namespace Uconnect.Api.Jobs;

/// <summary>Scheduler settings (section <c>Uconnect:Jobs</c>). Disable on all but one instance.</summary>
public sealed class JobOptions
{
    public const string SectionName = "Uconnect:Jobs";

    public bool Enabled { get; set; } = true;

    public int PlanChangeIntervalMinutes { get; set; } = 5;

    public int DailyJobsIntervalMinutes { get; set; } = 60;
}

/// <summary>
/// Runs the recurring business jobs. Plan-change provisioning polls frequently; billing, collections,
/// autopay and ticket housekeeping run hourly and are idempotent, so running them repeatedly within a
/// day only does new work. Each run gets its own DI scope (and therefore its own unit of work).
/// </summary>
public sealed class ScheduledJobsWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly JobOptions _options;
    private readonly ILogger<ScheduledJobsWorker> _logger;

    public ScheduledJobsWorker(IServiceScopeFactory scopes, Microsoft.Extensions.Options.IOptions<JobOptions> options, ILogger<ScheduledJobsWorker> logger)
    {
        _scopes = scopes;
        _options = options.Value;
        _logger = logger;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            _logger.LogInformation("Scheduled jobs are disabled on this instance");
            return Task.CompletedTask;
        }

        return Task.WhenAll(
            LoopAsync("plan-changes", TimeSpan.FromMinutes(_options.PlanChangeIntervalMinutes), RunPlanChangesAsync, stoppingToken),
            LoopAsync("daily-billing", TimeSpan.FromMinutes(_options.DailyJobsIntervalMinutes), RunDailyAsync, stoppingToken));
    }

    private static async Task RunPlanChangesAsync(IServiceProvider services, CancellationToken ct) =>
        await services.GetRequiredService<PlanChangeProcessor>().RunAsync(ct);

    private static async Task RunDailyAsync(IServiceProvider services, CancellationToken ct)
    {
        var today = services.GetRequiredService<IClock>().Today;
        await services.GetRequiredService<BillingRunService>().RunAsync(today, ct);
        await services.GetRequiredService<BillingRunService>().ProcessCollectionsAsync(ct);
        await services.GetRequiredService<AutopayProcessor>().RunAsync(ct);
        await services.GetRequiredService<TicketHousekeeping>().AutoCloseAsync(ct);
    }

    private async Task LoopAsync(string name, TimeSpan interval, Func<IServiceProvider, CancellationToken, Task> job, CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(interval);
        do
        {
            CorrelationContext.CorrelationId = $"job-{name}-{Guid.NewGuid():N}";
            using var scope = _scopes.CreateScope();
            using var logScope = _logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = CorrelationContext.CorrelationId, ["Job"] = name });
            try
            {
                await job(scope.ServiceProvider, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Scheduled job {Job} failed", name);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
```

## apps/uconnect/src/Uconnect.Api/Program.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Api/Program.cs`.

```csharp
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Api.Controllers;
using Uconnect.Api.Http;
using Uconnect.Api.Jobs;
using Uconnect.Api.Security;
using Uconnect.Application;
using Uconnect.Application.Common;
using Uconnect.Infrastructure;
using Uconnect.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole(options =>
{
    options.IncludeScopes = true;
    options.UseUtcTimestamp = true;
    options.TimestampFormat = "yyyy-MM-ddTHH:mm:ss.fffZ ";
});

builder.Services.AddUconnectApplication();
builder.Services.AddUconnectInfrastructure(builder.Configuration);
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.Configure<WebhookOptions>(builder.Configuration.GetSection(WebhookOptions.SectionName));
builder.Services.Configure<JobOptions>(builder.Configuration.GetSection(JobOptions.SectionName));
builder.Services.AddHostedService<ScheduledJobsWorker>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        builder.Configuration.Bind("Authentication:Jwt", options);
        options.MapInboundClaims = false;
        options.TokenValidationParameters.RoleClaimType = Policies.RoleClaimType;
        options.TokenValidationParameters.NameClaimType = "name";
        options.TokenValidationParameters.ValidateAudience = true;
        options.TokenValidationParameters.ClockSkew = TimeSpan.FromMinutes(1);
    });
builder.Services.AddAuthorization(Policies.Configure);

builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
{
    context.ProblemDetails.Instance ??= context.HttpContext.Request.Path;
    context.ProblemDetails.Extensions["correlationId"] = context.HttpContext.TraceIdentifier;
});
builder.Services.AddExceptionHandler<ProblemDetailsExceptionHandler>();

builder.Services
    .AddControllers(options => options.Filters.Add(new ProducesAttribute("application/json")))
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    })
    .ConfigureApiBehaviorOptions(options => options.InvalidModelStateResponseFactory = context =>
    {
        var problem = new ValidationProblemDetails(context.ModelState)
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "One or more fields are invalid.",
            Instance = context.HttpContext.Request.Path,
        };
        problem.Extensions["code"] = "validation_failed";
        problem.Extensions["correlationId"] = context.HttpContext.TraceIdentifier;
        return new BadRequestObjectResult(problem) { ContentTypes = { "application/problem+json" } };
    });

builder.Services.AddHealthChecks().AddDbContextCheck<UconnectDbContext>("database");

var app = builder.Build();

app.UseMiddleware<CorrelationIdMiddleware>();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseHsts();
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health/live", new() { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready").AllowAnonymous();

app.Run();

/// <summary>Entry point marker for integration tests.</summary>
public partial class Program
{
}
```

## apps/uconnect/src/Uconnect.Api/Security/HttpCurrentUser.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Api/Security/HttpCurrentUser.cs`.

```csharp
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;

namespace Uconnect.Api.Security;

/// <summary>The caller as described by the validated bearer token.</summary>
internal sealed class HttpCurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _accessor;

    public HttpCurrentUser(IHttpContextAccessor accessor) => _accessor = accessor;

    private ClaimsPrincipal Principal => _accessor.HttpContext?.User ?? new ClaimsPrincipal();

    public bool IsAuthenticated => Principal.Identity?.IsAuthenticated == true;

    /// <summary>Deterministic id derived from the subject, so audit columns are stable without a user table.</summary>
    public Guid UserId => SubjectToUserId(SubjectId);

    public string SubjectId => Principal.FindFirstValue("sub") ?? Principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;

    public string DisplayName => Principal.FindFirstValue("name") ?? Email ?? "Customer";

    public string? Email => Principal.FindFirstValue("email");

    public IReadOnlyCollection<string> Roles => Principal.FindAll(Policies.RoleClaimType).Select(c => c.Value).ToList();

    public bool IsInRole(string role) => Principal.IsInRole(role);

    internal static Guid SubjectToUserId(string subjectId)
    {
        if (string.IsNullOrEmpty(subjectId))
        {
            return Guid.Empty;
        }

        Span<byte> hash = stackalloc byte[32];
        SHA256.HashData(Encoding.UTF8.GetBytes(subjectId), hash);
        return new Guid(hash[..16]);
    }
}

/// <summary>Authorization policies. Roles come from the identity provider's <c>roles</c> claim.</summary>
public static class Policies
{
    public const string RoleClaimType = "roles";

    /// <summary>Any customer role or a support agent; per-account rights are then checked by <c>AccountAccessGuard</c>.</summary>
    public const string Customer = "customer";

    public const string SupportAgent = "support-agent";

    /// <summary>Machine-to-machine: the network mediation feed (client-credentials token with scope <c>uconnect.usage.write</c>).</summary>
    public const string UsageIngest = "usage-ingest";

    public static void Configure(AuthorizationOptions options)
    {
        options.AddPolicy(Customer, p => p.RequireAuthenticatedUser().RequireRole(
            UserRoles.Consumer, UserRoles.BusinessAdmin, UserRoles.BusinessUser, UserRoles.SupportAgent));
        options.AddPolicy(SupportAgent, p => p.RequireAuthenticatedUser().RequireRole(UserRoles.SupportAgent));
        options.AddPolicy(UsageIngest, p => p.RequireAuthenticatedUser().RequireAssertion(ctx =>
            ctx.User.FindAll("scope").SelectMany(c => c.Value.Split(' ')).Contains("uconnect.usage.write")));
        options.FallbackPolicy = options.GetPolicy(Customer);
    }
}
```

## apps/uconnect/src/Uconnect.Api/Uconnect.Api.csproj

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: xml. Path: `apps/uconnect/src/Uconnect.Api/Uconnect.Api.csproj`.

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <RootNamespace>Uconnect.Api</RootNamespace>
    <Description>Uconnect REST API (/api/v1): accounts, services, plan changes, billing, payments, tickets, appointments, outages and usage.</Description>
    <UserSecretsId>uconnect-api</UserSecretsId>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\Uconnect.Application\Uconnect.Application.csproj" />
    <ProjectReference Include="..\Uconnect.Infrastructure\Uconnect.Infrastructure.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="8.0.8" />
    <PackageReference Include="Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore" Version="8.0.8" />
  </ItemGroup>

  <ItemGroup>
    <InternalsVisibleTo Include="Uconnect.Tests" />
  </ItemGroup>

</Project>
```

## apps/uconnect/src/Uconnect.Api/appsettings.json

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: json. Path: `apps/uconnect/src/Uconnect.Api/appsettings.json`.

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
    "Uconnect": ""
  },
  "Authentication": {
    "Jwt": {
      "Authority": "https://login.uniti.example/realms/selfcare",
      "Audience": "uconnect-api",
      "RequireHttpsMetadata": true
    }
  },
  "Uconnect": {
    "Billing": {
      "PaymentTermsDays": 14,
      "TaxRateBasisPoints": 2000,
      "LatePaymentFeeMinor": 500,
      "LatePaymentFeeAfterDays": 14,
      "SuspendAfterDaysOverdue": 45
    },
    "Compensation": {
      "MissedAppointmentCreditMinor": 3000,
      "AutomaticOutageCredits": true
    },
    "Appointments": {
      "LateCancellationFeeMinor": 2500,
      "ChargeLateCancellation": true
    },
    "Portal": {
      "BaseUrl": "https://my.uniti.example",
      "SupportPhone": "0800 000 0000"
    },
    "Holidays": {
      "Dates": [ "2026-12-25", "2026-12-28", "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28" ]
    },
    "Jobs": {
      "Enabled": true,
      "PlanChangeIntervalMinutes": 5,
      "DailyJobsIntervalMinutes": 60
    },
    "Webhooks": {
      "MaxAgeSeconds": 300
    },
    "External": {
      "Provisioning": { "BaseUrl": "https://oss.internal.uniti.example/api/", "TimeoutSeconds": 15 },
      "PaymentGateway": { "BaseUrl": "https://payments.uniti.example/", "TimeoutSeconds": 20 },
      "BillingSystem": { "BaseUrl": "https://ledger.internal.uniti.example/api/", "TimeoutSeconds": 30 },
      "FieldService": { "BaseUrl": "https://fieldservice.internal.uniti.example/api/", "TimeoutSeconds": 15 },
      "Notifications": { "BaseUrl": "https://messaging.internal.uniti.example/api/", "TimeoutSeconds": 10 }
    }
  }
}
```

## apps/uconnect/src/Uconnect.Application/Abstractions/ExternalClients.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Abstractions/ExternalClients.cs`.

```csharp
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Abstractions;

// ---------------------------------------------------------------- Provisioning

/// <summary>Order sent to the network provisioning platform to re-profile a service.</summary>
public sealed record ProvisioningOrderRequest(
    Guid PlanChangeId,
    string ServiceReference,
    string FromPlanCode,
    string ToPlanCode,
    int DownloadMbps,
    int UploadMbps,
    DateOnly EffectiveOn);

public sealed record ProvisioningOrderAccepted(string OrderRef);

public enum ProvisioningOrderState
{
    Pending,
    Completed,
    Failed,
}

public sealed record ProvisioningOrderStatus(string OrderRef, ProvisioningOrderState State, string? FailureReason, DateTimeOffset? CompletedAt);

/// <summary>Client for the network provisioning platform (OSS).</summary>
public interface IProvisioningClient
{
    /// <summary>Submits a re-profile order. Idempotent on <see cref="ProvisioningOrderRequest.PlanChangeId"/>.</summary>
    Task<ProvisioningOrderAccepted> SubmitPlanChangeAsync(ProvisioningOrderRequest request, CancellationToken ct);

    Task<ProvisioningOrderStatus> GetOrderStatusAsync(string orderRef, CancellationToken ct);
}

// ---------------------------------------------------------------- Payment gateway

public sealed record GatewayChargeRequest(string PaymentToken, Money Amount, string IdempotencyKey, string Description, string AccountNumber);

public sealed record GatewayChargeResult(bool Succeeded, string? Reference, string? FailureCode, string? FailureMessage)
{
    public static GatewayChargeResult Success(string reference) => new(true, reference, null, null);

    public static GatewayChargeResult Declined(string code, string? message) => new(false, null, code, message);
}

public sealed record GatewayRefundResult(bool Succeeded, string? Reference, string? FailureCode);

/// <summary>Details of a tokenised instrument, read from the gateway (never trusted from the browser).</summary>
public sealed record GatewayInstrument(PaymentMethodType Type, string Label, string Last4, int? ExpiryMonth, int? ExpiryYear);

/// <summary>Card/direct-debit payment gateway. All amounts in minor units.</summary>
public interface IPaymentGateway
{
    Task<GatewayInstrument> DescribeTokenAsync(string paymentToken, CancellationToken ct);

    Task<GatewayChargeResult> ChargeAsync(GatewayChargeRequest request, CancellationToken ct);

    Task<GatewayRefundResult> RefundAsync(string chargeReference, Money amount, string idempotencyKey, CancellationToken ct);
}

// ---------------------------------------------------------------- Billing system (ERP / ledger)

public sealed record InvoiceDocument(string FileName, string ContentType, byte[] Content);

/// <summary>Downstream finance system: receives issued invoices for the ledger and renders invoice PDFs.</summary>
public interface IBillingSystemClient
{
    Task PostInvoiceAsync(Domain.Billing.Invoice invoice, string accountNumber, CancellationToken ct);

    Task<InvoiceDocument?> GetInvoicePdfAsync(string invoiceNumber, CancellationToken ct);
}

// ---------------------------------------------------------------- Field service (engineer scheduling)

public sealed record WorkOrderRequest(
    Guid AppointmentId,
    string AppointmentReference,
    AppointmentType Type,
    AppointmentSlot Slot,
    PostalAddress Address,
    string ContactName,
    string ContactPhone,
    string? AccessNotes);

public sealed record WorkOrderConfirmation(string WorkOrderRef, string? EngineerName);

/// <summary>Engineer workforce management system.</summary>
public interface IFieldServiceClient
{
    /// <summary>Remaining capacity per slot for the outward code.</summary>
    Task<IReadOnlyDictionary<AppointmentSlot, int>> GetCapacityAsync(string outwardCode, IReadOnlyCollection<AppointmentSlot> slots, CancellationToken ct);

    Task<WorkOrderConfirmation> CreateWorkOrderAsync(WorkOrderRequest request, CancellationToken ct);

    Task<WorkOrderConfirmation> RescheduleWorkOrderAsync(string workOrderRef, AppointmentSlot newSlot, CancellationToken ct);

    Task CancelWorkOrderAsync(string workOrderRef, string reason, CancellationToken ct);
}

// ---------------------------------------------------------------- Messaging

public sealed record EmailMessage(string To, string Subject, string HtmlBody, string TextBody, string? CorrelationId = null);

public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken ct);
}

public interface ISmsSender
{
    Task SendAsync(PhoneNumber to, string text, CancellationToken ct);
}
```

## apps/uconnect/src/Uconnect.Application/Abstractions/Lookups.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Abstractions/Lookups.cs`.

```csharp
namespace Uconnect.Application.Abstractions;

/// <summary>Resolves invoice numbers for display without loading whole invoice aggregates.</summary>
public interface IInvoiceNumberLookup
{
    Task<IReadOnlyDictionary<Guid, string>> GetNumbersAsync(IReadOnlyCollection<Guid> invoiceIds, CancellationToken ct);
}
```

## apps/uconnect/src/Uconnect.Application/Abstractions/Repositories.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Abstractions/Repositories.cs`.

```csharp
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Payments;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;
using Uconnect.Domain.Tickets;
using Uconnect.Domain.Usage;

namespace Uconnect.Application.Abstractions;

public interface IAccountRepository
{
    Task<Account?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<Account?> GetByNumberAsync(AccountNumber number, CancellationToken ct);

    /// <summary>All active accounts whose billing day falls on <paramref name="billingDay"/>.</summary>
    Task<IReadOnlyList<Account>> ListByBillingDayAsync(int billingDay, CancellationToken ct);

    void Add(Account account);
}

public interface IAccountUserRepository
{
    Task<AccountUser?> FindActiveAsync(Guid accountId, string subjectId, CancellationToken ct);

    Task<IReadOnlyList<AccountUser>> ListByAccountAsync(Guid accountId, CancellationToken ct);

    /// <summary>Accounts the subject has active access to, with their role on each.</summary>
    Task<IReadOnlyList<(Account Account, string Role)>> ListAccountsForSubjectAsync(string subjectId, CancellationToken ct);

    void Add(AccountUser user);
}

public interface IPlanRepository
{
    Task<Plan?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<Plan?> GetByCodeAsync(string code, CancellationToken ct);

    Task<IReadOnlyList<Plan>> GetManyAsync(IEnumerable<Guid> ids, CancellationToken ct);

    Task<IReadOnlyList<Plan>> ListActiveAsync(ProductType productType, CancellationToken ct);
}

public interface IServiceRepository
{
    Task<Service?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<IReadOnlyList<Service>> ListByAccountAsync(Guid accountId, CancellationToken ct);

    /// <summary>Live services whose service address lies in any of the given postcode outward codes.</summary>
    Task<IReadOnlyList<Service>> ListLiveInOutwardCodesAsync(IReadOnlyCollection<string> outwardCodes, CancellationToken ct);

    Task<int> CountLiveAsync(Guid accountId, CancellationToken ct);
}

public interface IPlanChangeRepository
{
    Task<PlanChange?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<PlanChange?> GetByProvisioningRefAsync(string orderRef, CancellationToken ct);

    Task<IReadOnlyList<PlanChange>> ListByAccountAsync(Guid accountId, CancellationToken ct);

    /// <summary>Requested or scheduled changes whose effective date is on or before <paramref name="today"/>.</summary>
    Task<IReadOnlyList<PlanChange>> ListDueAsync(DateOnly today, CancellationToken ct);

    /// <summary>Changes currently with the provisioning platform, for status polling.</summary>
    Task<IReadOnlyList<PlanChange>> ListProvisioningAsync(CancellationToken ct);

    Task<IReadOnlyList<PlanChange>> ListUnbilledCompletedAsync(Guid accountId, CancellationToken ct);

    void Add(PlanChange planChange);
}

public interface IInvoiceRepository
{
    Task<Invoice?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<Invoice?> GetByNumberAsync(Guid accountId, string invoiceNumber, CancellationToken ct);

    Task<PagedResult<Invoice>> ListByAccountAsync(Guid accountId, InvoiceStatus? status, PageRequest page, CancellationToken ct);

    /// <summary>Issued, part-paid and overdue invoices, oldest due first.</summary>
    Task<IReadOnlyList<Invoice>> ListPayableAsync(Guid accountId, CancellationToken ct);

    /// <summary>Payable invoices across all accounts with a due date on or before <paramref name="dueOnOrBefore"/>.</summary>
    Task<IReadOnlyList<Invoice>> ListPayableDueByAsync(DateOnly dueOnOrBefore, CancellationToken ct);

    Task<Invoice?> GetLatestIssuedAsync(Guid accountId, CancellationToken ct);

    Task<bool> ExistsForPeriodAsync(Guid accountId, DateOnly periodStart, CancellationToken ct);

    void Add(Invoice invoice);
}

public interface IAdjustmentRepository
{
    Task<IReadOnlyList<AccountAdjustment>> ListUnbilledAsync(Guid accountId, CancellationToken ct);

    Task<IReadOnlyList<AccountAdjustment>> ListByAccountAsync(Guid accountId, int take, CancellationToken ct);

    /// <summary>True when a compensation adjustment already exists for the given source (outage / appointment) and service.</summary>
    Task<bool> ExistsForSourceAsync(Guid accountId, Guid? serviceId, string sourceReference, CancellationToken ct);

    void Add(AccountAdjustment adjustment);
}

public interface IPaymentRepository
{
    Task<Payment?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<Payment?> FindByIdempotencyKeyAsync(Guid accountId, string idempotencyKey, CancellationToken ct);

    Task<PagedResult<Payment>> ListByAccountAsync(Guid accountId, PageRequest page, CancellationToken ct);

    Task<IReadOnlyList<Payment>> ListByInvoiceAsync(Guid invoiceId, CancellationToken ct);

    void Add(Payment payment);
}

public interface IPaymentMethodRepository
{
    Task<IReadOnlyList<PaymentMethod>> ListByAccountAsync(Guid accountId, CancellationToken ct);

    Task<PaymentMethod?> GetByIdAsync(Guid id, CancellationToken ct);

    void Add(PaymentMethod method);
}

public interface IAutopayRepository
{
    Task<AutopaySettings?> GetByAccountAsync(Guid accountId, CancellationToken ct);

    Task<IReadOnlyList<AutopaySettings>> ListEnabledAsync(CancellationToken ct);

    void Add(AutopaySettings settings);
}

public interface IUsageRepository
{
    Task<IReadOnlyList<UsageRecord>> ListAsync(Guid serviceId, DateOnly fromInclusive, DateOnly toExclusive, CancellationToken ct);

    Task<UsageRecord?> FindAsync(Guid serviceId, DateOnly date, CancellationToken ct);

    void Add(UsageRecord record);
}

public interface IOutageRepository
{
    Task<Outage?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<Outage?> GetByReferenceAsync(string reference, CancellationToken ct);

    /// <summary>Unresolved outages plus those resolved since <paramref name="resolvedSince"/>.</summary>
    Task<IReadOnlyList<Outage>> ListCurrentAsync(DateTimeOffset resolvedSince, CancellationToken ct);

    Task<PagedResult<Outage>> ListAsync(bool includeResolved, PageRequest page, CancellationToken ct);

    Task<bool> HasNotificationAsync(Guid outageId, Guid accountId, OutageNotificationKind kind, NotificationChannel channel, CancellationToken ct);

    void Add(Outage outage);

    void AddNotification(OutageNotification notification);
}

public interface ITicketRepository
{
    Task<Ticket?> GetByReferenceAsync(string reference, CancellationToken ct);

    Task<PagedResult<Ticket>> ListByAccountAsync(Guid accountId, bool openOnly, PageRequest page, CancellationToken ct);

    Task<IReadOnlyList<Ticket>> ListOpenByServiceAsync(Guid serviceId, CancellationToken ct);

    /// <summary>Resolved or pending-customer tickets with no activity since <paramref name="inactiveSince"/>.</summary>
    Task<IReadOnlyList<Ticket>> ListAutoCloseCandidatesAsync(DateTimeOffset inactiveSince, CancellationToken ct);

    void Add(Ticket ticket);
}

public interface IAppointmentRepository
{
    Task<Appointment?> GetByReferenceAsync(string reference, CancellationToken ct);

    Task<IReadOnlyList<Appointment>> ListByAccountAsync(Guid accountId, bool upcomingOnly, DateOnly today, CancellationToken ct);

    Task<bool> HasActiveForServiceAsync(Guid serviceId, AppointmentType type, CancellationToken ct);

    void Add(Appointment appointment);
}
```

## apps/uconnect/src/Uconnect.Application/Accounts/AccountUserService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Accounts/AccountUserService.cs`.

```csharp
using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Accounts;

/// <summary>Business account administrators manage who else can access the account.</summary>
public sealed class AccountUserService
{
    private readonly AccountAccessGuard _guard;
    private readonly IAccountUserRepository _accountUsers;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<InviteUserRequest> _inviteValidator;
    private readonly IValidator<ChangeUserRoleRequest> _roleValidator;
    private readonly ILogger<AccountUserService> _logger;

    public AccountUserService(
        AccountAccessGuard guard,
        IAccountUserRepository accountUsers,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<InviteUserRequest> inviteValidator,
        IValidator<ChangeUserRoleRequest> roleValidator,
        ILogger<AccountUserService> logger)
    {
        _guard = guard;
        _accountUsers = accountUsers;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _inviteValidator = inviteValidator;
        _roleValidator = roleValidator;
        _logger = logger;
    }

    public async Task<IReadOnlyList<AccountUserDto>> ListAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Administer, ct);
        var users = await _accountUsers.ListByAccountAsync(account.Id, ct);
        return users
            .OrderByDescending(u => u.IsActive)
            .ThenBy(u => u.DisplayName, StringComparer.OrdinalIgnoreCase)
            .Select(u => u.ToDto())
            .ToList();
    }

    public async Task<AccountUserDto> InviteAsync(string accountNumber, InviteUserRequest request, CancellationToken ct)
    {
        await _inviteValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Administer, ct);
        var existing = await _accountUsers.ListByAccountAsync(account.Id, ct);

        var user = AccountUserDirectory.Invite(
            account, existing, request.SubjectId, EmailAddress.Create(request.Email), request.DisplayName, request.Role, _clock.UtcNow);
        _accountUsers.Add(user);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation("User {InvitedUserId} granted {Role} on {AccountNumber} by {UserId}", user.Id, user.Role, account.Number, _currentUser.UserId);
        return user.ToDto();
    }

    public async Task<AccountUserDto> ChangeRoleAsync(string accountNumber, Guid userId, ChangeUserRoleRequest request, CancellationToken ct)
    {
        await _roleValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Administer, ct);
        var users = await _accountUsers.ListByAccountAsync(account.Id, ct);

        EnsureNotSelf(users, userId, "change your own role");
        AccountUserDirectory.ChangeRole(users, userId, request.Role);
        await _unitOfWork.SaveChangesAsync(ct);
        return users.First(u => u.Id == userId).ToDto();
    }

    public async Task RemoveAsync(string accountNumber, Guid userId, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Administer, ct);
        var users = await _accountUsers.ListByAccountAsync(account.Id, ct);

        EnsureNotSelf(users, userId, "remove yourself");
        AccountUserDirectory.Remove(users, userId, _clock.UtcNow);
        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation("User {RemovedUserId} removed from {AccountNumber} by {UserId}", userId, account.Number, _currentUser.UserId);
    }

    private void EnsureNotSelf(IReadOnlyList<AccountUser> users, Guid targetUserId, string action)
    {
        var target = users.FirstOrDefault(u => u.Id == targetUserId);
        if (target is not null && string.Equals(target.SubjectId, _currentUser.SubjectId, StringComparison.Ordinal))
        {
            throw new ConflictException("account_user.self_change", $"You cannot {action}; ask another administrator.");
        }
    }
}
```

## apps/uconnect/src/Uconnect.Application/Accounts/ProfileDtos.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Accounts/ProfileDtos.cs`.

```csharp
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Accounts;

public sealed record AddressDto(string Line1, string? Line2, string Town, string Postcode, string CountryCode = "GB");

public sealed record AccountSummaryDto(string AccountNumber, string Name, string AccountType, string Status, string Role);

public sealed record AccountProfileDto(
    string AccountNumber,
    string Name,
    string AccountType,
    string Status,
    string BillingEmail,
    string? Phone,
    AddressDto BillingAddress,
    string Currency,
    int BillingDay,
    DateOnly CurrentPeriodStart,
    DateOnly CurrentPeriodEnd,
    bool PaperlessBilling,
    bool MarketingOptIn,
    bool OutageSmsAlerts,
    MoneyDto OutstandingBalance,
    DateTimeOffset CreatedAt);

public sealed record UpdateProfileRequest(string Name, string BillingEmail, string? Phone, AddressDto BillingAddress);

public sealed record UpdatePreferencesRequest(bool PaperlessBilling, bool MarketingOptIn, bool OutageSmsAlerts);

public sealed record ChangeBillingDayRequest(int BillingDay);

public sealed record AccountUserDto(Guid Id, string DisplayName, string Email, string Role, bool IsActive, DateTimeOffset InvitedAt);

public sealed record InviteUserRequest(string SubjectId, string Email, string DisplayName, string Role);

public sealed record ChangeUserRoleRequest(string Role);

internal static class AccountMapping
{
    public static AddressDto ToDto(this PostalAddress address) =>
        new(address.Line1, address.Line2, address.Town, address.Postcode, address.CountryCode);

    public static PostalAddress ToDomain(this AddressDto dto) =>
        new(dto.Line1, dto.Line2, dto.Town, dto.Postcode, string.IsNullOrWhiteSpace(dto.CountryCode) ? "GB" : dto.CountryCode);

    public static AccountProfileDto ToProfileDto(this Account account, Money outstanding, DateOnly today)
    {
        var period = account.CurrentBillingPeriod(today);
        return new AccountProfileDto(
            account.Number.Value,
            account.Name,
            account.Type.ToString(),
            account.Status.ToString(),
            account.BillingEmail.Value,
            account.Phone?.Value,
            account.BillingAddress.ToDto(),
            account.Currency,
            account.BillingDay,
            period.Start,
            period.End,
            account.PaperlessBilling,
            account.MarketingOptIn,
            account.OutageSmsAlerts,
            outstanding.ToDto(),
            account.CreatedAt);
    }

    public static AccountUserDto ToDto(this AccountUser user) =>
        new(user.Id, user.DisplayName, user.Email.Value, user.Role, user.IsActive, user.InvitedAt);
}
```

## apps/uconnect/src/Uconnect.Application/Accounts/ProfileService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Accounts/ProfileService.cs`.

```csharp
using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Accounts;

/// <summary>Account profile, contact details, billing day and communication preferences.</summary>
public sealed class ProfileService
{
    private readonly AccountAccessGuard _guard;
    private readonly IAccountUserRepository _accountUsers;
    private readonly IInvoiceRepository _invoices;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<UpdateProfileRequest> _profileValidator;
    private readonly IValidator<ChangeBillingDayRequest> _billingDayValidator;
    private readonly ILogger<ProfileService> _logger;

    public ProfileService(
        AccountAccessGuard guard,
        IAccountUserRepository accountUsers,
        IInvoiceRepository invoices,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<UpdateProfileRequest> profileValidator,
        IValidator<ChangeBillingDayRequest> billingDayValidator,
        ILogger<ProfileService> logger)
    {
        _guard = guard;
        _accountUsers = accountUsers;
        _invoices = invoices;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _profileValidator = profileValidator;
        _billingDayValidator = billingDayValidator;
        _logger = logger;
    }

    /// <summary>Accounts the signed-in user can access, for the account switcher.</summary>
    public async Task<IReadOnlyList<AccountSummaryDto>> ListMyAccountsAsync(CancellationToken ct)
    {
        var memberships = await _accountUsers.ListAccountsForSubjectAsync(_currentUser.SubjectId, ct);
        return memberships
            .Where(m => m.Account.Status != AccountStatus.Closed)
            .OrderBy(m => m.Account.Name, StringComparer.OrdinalIgnoreCase)
            .Select(m => new AccountSummaryDto(m.Account.Number.Value, m.Account.Name, m.Account.Type.ToString(), m.Account.Status.ToString(), m.Role))
            .ToList();
    }

    public async Task<AccountProfileDto> GetAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var outstanding = await OutstandingBalanceAsync(account.Id, account.Currency, ct);
        return account.ToProfileDto(outstanding, _clock.Today);
    }

    public async Task<AccountProfileDto> UpdateAsync(string accountNumber, UpdateProfileRequest request, CancellationToken ct)
    {
        await _profileValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);

        var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : PhoneNumber.Create(request.Phone);
        if (phone is null && account.OutageSmsAlerts)
        {
            throw new RequestValidationException("phone", "A phone number is required while SMS outage alerts are switched on.");
        }

        account.UpdateContactDetails(
            request.Name,
            EmailAddress.Create(request.BillingEmail),
            phone,
            request.BillingAddress.ToDomain(),
            _clock.UtcNow);

        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation("Profile updated for account {AccountNumber} by {UserId}", account.Number, _currentUser.UserId);

        var outstanding = await OutstandingBalanceAsync(account.Id, account.Currency, ct);
        return account.ToProfileDto(outstanding, _clock.Today);
    }

    public async Task<AccountProfileDto> UpdatePreferencesAsync(string accountNumber, UpdatePreferencesRequest request, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        account.UpdatePreferences(request.PaperlessBilling, request.MarketingOptIn, request.OutageSmsAlerts);
        await _unitOfWork.SaveChangesAsync(ct);

        var outstanding = await OutstandingBalanceAsync(account.Id, account.Currency, ct);
        return account.ToProfileDto(outstanding, _clock.Today);
    }

    /// <summary>
    /// Moves the billing day. Refused while invoices are outstanding so the change cannot be used to
    /// push a due date back.
    /// </summary>
    public async Task<AccountProfileDto> ChangeBillingDayAsync(string accountNumber, ChangeBillingDayRequest request, CancellationToken ct)
    {
        await _billingDayValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);

        var outstanding = await OutstandingBalanceAsync(account.Id, account.Currency, ct);
        if (outstanding.IsPositive)
        {
            throw new ConflictException("account.balance_outstanding", "Please settle your outstanding balance before changing your billing day.");
        }

        var previousDay = account.BillingDay;
        account.ChangeBillingDay(request.BillingDay, _clock.UtcNow);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Billing day for {AccountNumber} changed from {PreviousDay} to {NewDay}",
            account.Number, previousDay, request.BillingDay);
        return account.ToProfileDto(outstanding, _clock.Today);
    }

    private async Task<Money> OutstandingBalanceAsync(Guid accountId, string currency, CancellationToken ct)
    {
        var payable = await _invoices.ListPayableAsync(accountId, ct);
        return payable.Select(i => i.BalanceDue).Sum(currency);
    }
}
```

## apps/uconnect/src/Uconnect.Application/Accounts/ProfileValidators.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Accounts/ProfileValidators.cs`.

```csharp
using FluentValidation;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Accounts;

public sealed class AddressValidator : AbstractValidator<AddressDto>
{
    public AddressValidator()
    {
        RuleFor(a => a.Line1).NotEmpty().MaximumLength(120);
        RuleFor(a => a.Line2).MaximumLength(120);
        RuleFor(a => a.Town).NotEmpty().MaximumLength(80);
        RuleFor(a => a.CountryCode).Length(2).When(a => !string.IsNullOrEmpty(a.CountryCode));
        RuleFor(a => a.Postcode).ValidPostcode().When(a => string.IsNullOrEmpty(a.CountryCode) || a.CountryCode == "GB");
    }
}

public sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(r => r.Name).NotEmpty().MaximumLength(160).SafeText(160);
        RuleFor(r => r.BillingEmail).ValidEmail();
        RuleFor(r => r.Phone).ValidUkPhone().When(r => !string.IsNullOrWhiteSpace(r.Phone));
        RuleFor(r => r.BillingAddress).NotNull().SetValidator(new AddressValidator());
    }
}

public sealed class ChangeBillingDayRequestValidator : AbstractValidator<ChangeBillingDayRequest>
{
    public ChangeBillingDayRequestValidator()
    {
        RuleFor(r => r.BillingDay)
            .InclusiveBetween(Account.MinBillingDay, Account.MaxBillingDay)
            .WithMessage($"Billing day must be between {Account.MinBillingDay} and {Account.MaxBillingDay}.");
    }
}

public sealed class InviteUserRequestValidator : AbstractValidator<InviteUserRequest>
{
    public InviteUserRequestValidator()
    {
        RuleFor(r => r.SubjectId).NotEmpty().MaximumLength(128);
        RuleFor(r => r.Email).ValidEmail();
        RuleFor(r => r.DisplayName).NotEmpty().MaximumLength(120).SafeText(120);
        RuleFor(r => r.Role)
            .Must(r => r is UserRoles.BusinessAdmin or UserRoles.BusinessUser)
            .WithMessage($"Role must be {UserRoles.BusinessAdmin} or {UserRoles.BusinessUser}.");
    }
}

public sealed class ChangeUserRoleRequestValidator : AbstractValidator<ChangeUserRoleRequest>
{
    public ChangeUserRoleRequestValidator()
    {
        RuleFor(r => r.Role)
            .Must(r => r is UserRoles.BusinessAdmin or UserRoles.BusinessUser)
            .WithMessage($"Role must be {UserRoles.BusinessAdmin} or {UserRoles.BusinessUser}.");
    }
}
```

## apps/uconnect/src/Uconnect.Application/Appointments/AppointmentDtos.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Appointments/AppointmentDtos.cs`.

```csharp
using FluentValidation;
using Uconnect.Application.Accounts;
using Uconnect.Application.Common;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Appointments;

public sealed record AppointmentDto(
    string Reference,
    string Type,
    string Status,
    DateOnly Date,
    string Window,
    DateTimeOffset WindowStartsAt,
    DateTimeOffset WindowEndsAt,
    Guid? ServiceId,
    AddressDto VisitAddress,
    string ContactName,
    string ContactPhone,
    string? AccessNotes,
    string? EngineerName,
    int RescheduleCount,
    bool CanChange,
    bool LateCancellation,
    string? CancellationReason);

public sealed record AvailableSlotDto(DateOnly Date, string Window, DateTimeOffset StartsAt, DateTimeOffset EndsAt, int RemainingCapacity);

/// <summary>
/// Books an engineer visit. Repairs must reference an open fault ticket; visits for a service are made
/// at its service address, otherwise at the account's billing address.
/// </summary>
public sealed record BookAppointmentRequest(
    string Type,
    Guid? ServiceId,
    string? TicketReference,
    DateOnly Date,
    string Window,
    string ContactName,
    string ContactPhone,
    string? AccessNotes);

public sealed record RescheduleAppointmentRequest(DateOnly Date, string Window);

public sealed record CancelAppointmentRequest(string Reason);

public sealed record UpdateAccessNotesRequest(string? AccessNotes);

/// <summary>Agent records how a confirmed visit ended: <c>Completed</c> or <c>Missed</c>.</summary>
public sealed record RecordVisitOutcomeRequest(string Outcome, bool MissedByProvider, string Notes);

public sealed class BookAppointmentRequestValidator : AbstractValidator<BookAppointmentRequest>
{
    public BookAppointmentRequestValidator()
    {
        RuleFor(r => r.Type).Must(EnumParsing.IsValid<AppointmentType>)
            .WithMessage($"Type must be one of: {string.Join(", ", Enum.GetNames<AppointmentType>())}.");
        RuleFor(r => r.Window).Must(EnumParsing.IsValid<AppointmentWindow>)
            .WithMessage($"Window must be one of: {string.Join(", ", Enum.GetNames<AppointmentWindow>())}.");
        RuleFor(r => r.TicketReference).NotEmpty()
            .When(r => EnumParsing.TryParse<AppointmentType>(r.Type, out var t) && t == AppointmentType.Repair)
            .WithMessage("Repair visits must reference the fault ticket.");
        RuleFor(r => r.ServiceId).NotEmpty()
            .When(r => EnumParsing.TryParse<AppointmentType>(r.Type, out var t) && t is AppointmentType.Repair or AppointmentType.Upgrade or AppointmentType.Installation)
            .WithMessage("Choose the service the visit is for.");
        RuleFor(r => r.ContactName).NotEmpty().MaximumLength(120).SafeText(120);
        RuleFor(r => r.ContactPhone).ValidUkPhone();
        RuleFor(r => r.AccessNotes).SafeText(500);
    }
}

public sealed class RescheduleAppointmentRequestValidator : AbstractValidator<RescheduleAppointmentRequest>
{
    public RescheduleAppointmentRequestValidator()
    {
        RuleFor(r => r.Window).Must(EnumParsing.IsValid<AppointmentWindow>).WithMessage("Window must be Morning, Afternoon or AllDay.");
    }
}

public sealed class CancelAppointmentRequestValidator : AbstractValidator<CancelAppointmentRequest>
{
    public CancelAppointmentRequestValidator()
    {
        RuleFor(r => r.Reason).NotEmpty().MaximumLength(500).SafeText(500);
    }
}

public sealed class RecordVisitOutcomeRequestValidator : AbstractValidator<RecordVisitOutcomeRequest>
{
    public RecordVisitOutcomeRequestValidator()
    {
        RuleFor(r => r.Outcome).Must(o => o is "Completed" or "Missed").WithMessage("Outcome must be Completed or Missed.");
        RuleFor(r => r.Notes).NotEmpty().MaximumLength(2000).SafeText(2000);
    }
}

internal static class AppointmentMapping
{
    public static AppointmentDto ToDto(this Appointment appointment, DateTimeOffset now) => new(
        appointment.Reference,
        appointment.Type.ToString(),
        appointment.Status.ToString(),
        appointment.Date,
        appointment.Window.ToString(),
        appointment.Slot.StartsAtUtc,
        appointment.Slot.EndsAtUtc,
        appointment.ServiceId,
        appointment.VisitAddress.ToDto(),
        appointment.ContactName,
        appointment.ContactPhone.Value,
        appointment.AccessNotes,
        appointment.EngineerName,
        appointment.RescheduleCount,
        appointment.IsChangeable(now) && appointment.RescheduleCount < Appointment.MaxReschedules,
        appointment.LateCancellation,
        appointment.CancellationReason);

    public static AvailableSlotDto ToDto(this AvailableSlot slot) =>
        new(slot.Slot.Date, slot.Slot.Window.ToString(), slot.Slot.StartsAtUtc, slot.Slot.EndsAtUtc, slot.RemainingCapacity);
}
```
