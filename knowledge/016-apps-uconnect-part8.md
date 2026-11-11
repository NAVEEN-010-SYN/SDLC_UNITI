# Uconnect account & service management: apps/uconnect (part 8 of 8)

- **Application:** Uconnect account & service management
- **Tech stack:** .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 14

## Files

- `apps/uconnect/src/Uconnect.Web/Pages/Tickets/Tickets.cshtml.cs` (146 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/_ViewImports.cshtml` (5 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/_ViewStart.cshtml` (4 lines)
- `apps/uconnect/src/Uconnect.Web/Program.cs` (70 lines)
- `apps/uconnect/src/Uconnect.Web/Uconnect.Web.csproj` (19 lines)
- `apps/uconnect/src/Uconnect.Web/appsettings.json` (17 lines)
- `apps/uconnect/src/Uconnect.Web/wwwroot/css/site.css` (48 lines)
- `apps/uconnect/tests/Uconnect.Tests/Api/HttpBoundaryTests.cs` (112 lines)
- `apps/uconnect/tests/Uconnect.Tests/Application/BillingRunServiceTests.cs` (115 lines)
- `apps/uconnect/tests/Uconnect.Tests/Application/PaymentServiceTests.cs` (144 lines)
- `apps/uconnect/tests/Uconnect.Tests/Domain/BillingDomainTests.cs` (152 lines)
- `apps/uconnect/tests/Uconnect.Tests/Domain/ServiceDomainTests.cs` (169 lines)
- `apps/uconnect/tests/Uconnect.Tests/TestData.cs` (54 lines)
- `apps/uconnect/tests/Uconnect.Tests/Uconnect.Tests.csproj` (28 lines)

## apps/uconnect/src/Uconnect.Web/Pages/Tickets/Tickets.cshtml.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Web/Pages/Tickets/Tickets.cshtml.cs`.

```csharp
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Uconnect.Application.Common;
using Uconnect.Application.Services;
using Uconnect.Application.Tickets;
using Uconnect.Domain.Common;
using Uconnect.Web.Api;

namespace Uconnect.Web.Pages.Tickets;

public sealed class IndexModel : AccountPageModel
{
    public IndexModel(UconnectApiClient api) : base(api)
    {
    }

    [BindProperty(SupportsGet = true)]
    public bool OpenOnly { get; set; } = true;

    public PagedResult<TicketSummaryDto>? Tickets { get; private set; }

    public async Task OnGetAsync(int? page, CancellationToken ct)
    {
        var paging = PageOf(page);
        Tickets = await Api.GetAsync<PagedResult<TicketSummaryDto>>(
            AccountPath($"tickets?openOnly={OpenOnly}&page={paging.Page}&pageSize={paging.PageSize}"), ct);
    }
}

public sealed class NewModel : AccountPageModel
{
    public NewModel(UconnectApiClient api) : base(api)
    {
    }

    [BindProperty]
    public TicketInput Input { get; set; } = new();

    public IReadOnlyList<SelectListItem> ServiceOptions { get; private set; } = Array.Empty<SelectListItem>();

    public static IEnumerable<SelectListItem> Categories => Enum.GetNames<TicketCategory>().Select(c => new SelectListItem(c, c));

    public Task OnGetAsync(Guid? serviceId, CancellationToken ct)
    {
        Input.ServiceId = serviceId;
        return LoadServicesAsync(ct);
    }

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            await LoadServicesAsync(ct);
            return Page();
        }

        try
        {
            var ticket = await Api.SendAsync<TicketDetailDto>(
                HttpMethod.Post,
                AccountPath("tickets"),
                new CreateTicketRequest(Input.ServiceId, Input.Category, Input.Subject, Input.Description, Input.ServiceDown),
                ct);
            TempData["Notice"] = $"Ticket {ticket.Summary.Reference} raised. We'll respond by {Display.When(ticket.FirstResponseDueAt)}.";
            return RedirectToPage("Details", new { reference = ticket.Summary.Reference });
        }
        catch (ApiProblemException)
        {
            await LoadServicesAsync(ct);
            throw;
        }
    }

    private async Task LoadServicesAsync(CancellationToken ct)
    {
        var services = await Api.GetAsync<IReadOnlyList<ServiceSummaryDto>>(AccountPath("services"), ct);
        ServiceOptions = services.Select(s => new SelectListItem($"{s.ServiceReference} – {s.Plan.Name}, {s.ServiceAddress.Postcode}", s.Id.ToString())).ToList();
    }

    public sealed class TicketInput
    {
        public Guid? ServiceId { get; set; }

        [Required]
        public string Category { get; set; } = nameof(TicketCategory.Fault);

        [Required]
        [StringLength(150)]
        public string Subject { get; set; } = string.Empty;

        [Required]
        [StringLength(4000)]
        public string Description { get; set; } = string.Empty;

        public bool ServiceDown { get; set; }
    }
}

public sealed class DetailsModel : AccountPageModel
{
    public DetailsModel(UconnectApiClient api) : base(api)
    {
    }

    [BindProperty(SupportsGet = true)]
    public string Reference { get; set; } = string.Empty;

    [BindProperty]
    [StringLength(4000)]
    public string? Message { get; set; }

    public TicketDetailDto? Ticket { get; private set; }

    public async Task OnGetAsync(CancellationToken ct) => Ticket = await LoadAsync(ct);

    public Task<IActionResult> OnPostCommentAsync(CancellationToken ct) =>
        ActAsync("comments", new AddTicketCommentRequest(Message ?? string.Empty, false), "Your message has been added.", ct);

    public Task<IActionResult> OnPostReopenAsync(CancellationToken ct) =>
        ActAsync("reopen", new ReopenTicketRequest(Message ?? string.Empty), "The ticket has been reopened.", ct);

    public Task<IActionResult> OnPostCloseAsync(CancellationToken ct) =>
        ActAsync("close", null, "The ticket has been closed.", ct);

    private async Task<IActionResult> ActAsync(string action, object? body, string notice, CancellationToken ct)
    {
        try
        {
            await Api.SendAsync<TicketDetailDto>(HttpMethod.Post, AccountPath($"tickets/{Uri.EscapeDataString(Reference)}/{action}"), body, ct);
        }
        catch (ApiProblemException problem)
        {
            AddProblem(problem, prefix: string.Empty);
            Ticket = await LoadAsync(ct);
            return Page();
        }

        TempData["Notice"] = notice;
        return RedirectToPage(new { reference = Reference });
    }

    private Task<TicketDetailDto> LoadAsync(CancellationToken ct) =>
        Api.GetAsync<TicketDetailDto>(AccountPath($"tickets/{Uri.EscapeDataString(Reference)}"), ct);
}
```

## apps/uconnect/src/Uconnect.Web/Pages/_ViewImports.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/_ViewImports.cshtml`.

```cshtml
@using Uconnect.Web.Pages
@using Uconnect.Application.Common
@namespace Uconnect.Web.Pages
@addTagHelper *, Microsoft.AspNetCore.Mvc.TagHelpers
```

## apps/uconnect/src/Uconnect.Web/Pages/_ViewStart.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/_ViewStart.cshtml`.

```cshtml
@{
    Layout = "_Layout";
}
```

## apps/uconnect/src/Uconnect.Web/Program.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Web/Program.cs`.

```csharp
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Uconnect.Web.Api;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole(options =>
{
    options.IncludeScopes = true;
    options.UseUtcTimestamp = true;
});

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
    })
    .AddCookie(options =>
    {
        options.Cookie.Name = "uconnect.session";
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromMinutes(30);
    })
    .AddOpenIdConnect(options =>
    {
        builder.Configuration.Bind("Oidc", options);
        options.ResponseType = "code";
        options.UsePkce = true;
        options.SaveTokens = true;
        options.MapInboundClaims = false;
        options.GetClaimsFromUserInfoEndpoint = true;
        options.TokenValidationParameters.NameClaimType = "name";
        options.TokenValidationParameters.RoleClaimType = "roles";
        options.Scope.Add("uconnect.api");
    });

builder.Services.AddAuthorization(options => options.FallbackPolicy = options.DefaultPolicy);
builder.Services.AddRazorPages();
builder.Services.AddHttpContextAccessor();
builder.Services.AddTransient<ApiAuthenticationHandler>();
builder.Services
    .AddHttpClient<UconnectApiClient>(client =>
    {
        var baseUrl = builder.Configuration["UconnectApi:BaseUrl"]
            ?? throw new InvalidOperationException("UconnectApi:BaseUrl is not configured.");
        client.BaseAddress = new Uri(new Uri(baseUrl), "api/v1/");
    })
    .AddHttpMessageHandler<ApiAuthenticationHandler>()
    .AddStandardResilienceHandler();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapRazorPages();
app.Run();
```

## apps/uconnect/src/Uconnect.Web/Uconnect.Web.csproj

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: xml. Path: `apps/uconnect/src/Uconnect.Web/Uconnect.Web.csproj`.

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <RootNamespace>Uconnect.Web</RootNamespace>
    <Description>Uconnect customer portal (Razor Pages). Talks to Uconnect.Api only; shares its DTO contracts.</Description>
  </PropertyGroup>

  <ItemGroup>
    <!-- Referenced for the DTO contracts only; the portal never touches repositories or the database. -->
    <ProjectReference Include="..\Uconnect.Application\Uconnect.Application.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.Authentication.OpenIdConnect" Version="8.0.8" />
    <PackageReference Include="Microsoft.Extensions.Http.Resilience" Version="8.8.0" />
  </ItemGroup>

</Project>
```

## apps/uconnect/src/Uconnect.Web/appsettings.json

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: json. Path: `apps/uconnect/src/Uconnect.Web/appsettings.json`.

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "Oidc": {
    "Authority": "https://login.uniti.example/realms/selfcare",
    "ClientId": "uconnect-web"
  },
  "UconnectApi": {
    "BaseUrl": "https://api.uniti.example/uconnect/"
  }
}
```

## apps/uconnect/src/Uconnect.Web/wwwroot/css/site.css

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: css. Path: `apps/uconnect/src/Uconnect.Web/wwwroot/css/site.css`.

```css
:root { --ok: #1b7f3b; --bad: #b42318; --info: #175cd3; --ink: #1d2939; --muted: #667085; --line: #eaecf0; --brand: #5b2c83; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: var(--ink); display: grid; grid-template: "top top" auto "nav main" 1fr / 220px 1fr; min-height: 100vh; }
.topbar { grid-area: top; display: flex; gap: 1rem; align-items: center; padding: .75rem 1.5rem; background: var(--brand); color: #fff; }
.topbar a, .topbar .user { color: #fff; }
.brand { font-weight: 700; text-decoration: none; margin-right: auto; }
.sidenav { grid-area: nav; display: flex; flex-direction: column; padding: 1rem; border-right: 1px solid var(--line); }
.sidenav a { padding: .5rem .75rem; border-radius: 6px; color: var(--ink); text-decoration: none; }
.sidenav a.active { background: #f4ebff; font-weight: 600; }
.content { grid-area: main; padding: 1.5rem 2rem; max-width: 1100px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
.tile, .card { border: 1px solid var(--line); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
.tile h2, .card h2 { font-size: 1rem; margin: 0 0 .5rem; }
.figure { font-size: 1.75rem; font-weight: 700; margin: 0; }
.grid { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
.grid th, .grid td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--line); }
.num { text-align: right !important; }
.badge { display: inline-block; padding: 0 .5rem; border-radius: 999px; font-size: .8rem; font-weight: 600; }
.badge--ok { background: #ecfdf3; color: var(--ok); }
.badge--bad { background: #fef3f2; color: var(--bad); }
.badge--info { background: #eff8ff; color: var(--info); }
.alert { padding: .75rem 1rem; border-radius: 8px; margin-bottom: 1rem; }
.alert--ok { background: #ecfdf3; }
.alert--bad { background: #fef3f2; }
.validation-summary-valid { display: none; }
.bad { color: var(--bad); }
.hint { color: var(--muted); font-size: .9rem; }
.form { display: grid; gap: .5rem; max-width: 560px; }
.form.inline, form.inline { display: flex; flex-wrap: wrap; gap: .5rem; max-width: none; }
input, select, textarea { font: inherit; padding: .45rem .6rem; border: 1px solid #d0d5dd; border-radius: 6px; }
.button { display: inline-block; background: var(--brand); color: #fff; border: 0; border-radius: 6px; padding: .5rem 1rem; text-decoration: none; cursor: pointer; }
.link { background: none; border: 0; color: var(--info); text-decoration: underline; cursor: pointer; padding: 0; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: .25rem 1.5rem; }
.facts dt { color: var(--muted); }
.timeline { list-style: none; padding: 0; }
.timeline li { border-left: 3px solid var(--line); padding: .25rem .75rem; margin-bottom: .75rem; }
.timeline li.agent { border-color: var(--brand); }
.timeline header { color: var(--muted); font-size: .85rem; }
.slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: .25rem; border: 1px solid var(--line); border-radius: 8px; }
.pager { display: flex; gap: 1rem; align-items: center; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

@media (max-width: 760px) {
    body { grid-template: "top" auto "nav" auto "main" 1fr / 1fr; }
    .sidenav { flex-direction: row; overflow-x: auto; border-right: 0; }
    .content { padding: 1rem; }
}
```

## apps/uconnect/tests/Uconnect.Tests/Api/HttpBoundaryTests.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/tests/Uconnect.Tests/Api/HttpBoundaryTests.cs`.

```csharp
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Api.Controllers;
using Uconnect.Api.Http;
using Uconnect.Api.Security;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Domain.Common;
using Uconnect.Domain.Tickets;

namespace Uconnect.Tests.Api;

public sealed class ProblemDetailsMappingTests
{
    public static TheoryData<Exception, int, string> Cases => new()
    {
        { new NotFoundException("Invoice", "INV-1"), 404, "invoice.not_found" },
        { new ForbiddenException("no"), 403, "forbidden" },
        { new ConflictException("payment.idempotency_key_reused", "reused"), 409, "payment.idempotency_key_reused" },
        { new PaymentDeclinedException(Guid.NewGuid(), "card_declined", null), 402, "payment.declined" },
        { new ExternalServiceException("payments", "down", isTransient: true), 503, "payments.unavailable" },
        { new ExternalServiceException("payments", "bad", isTransient: false), 502, "payments.unavailable" },
        { new InvalidStateTransitionException("Ticket", "Closed", "Open"), 409, "ticket.invalid_transition" },
        { new DomainException("invoice.overpayment", "too much"), 422, "invoice.overpayment" },
        { new InvalidOperationException("secret detail"), 500, "internal_error" },
    };

    [Theory]
    [MemberData(nameof(Cases))]
    public void Maps_exceptions_to_status_and_stable_code(Exception exception, int status, string code)
    {
        var problem = ProblemDetailsExceptionHandler.Map(exception);

        Assert.Equal(status, problem.Status);
        Assert.Equal(code, problem.Extensions["code"]);
    }

    [Fact]
    public void Validation_errors_are_returned_per_field()
    {
        var problem = Assert.IsType<ValidationProblemDetails>(ProblemDetailsExceptionHandler.Map(new RequestValidationException("amount", "Too high.")));

        Assert.Equal(new[] { "Too high." }, problem.Errors["amount"]);
    }

    [Fact]
    public void Unexpected_errors_do_not_leak_details() =>
        Assert.DoesNotContain("secret", ProblemDetailsExceptionHandler.Map(new InvalidOperationException("secret detail")).Detail);
}

public sealed class ProvisioningWebhookSignatureTests
{
    private static readonly WebhookOptions Options = new() { ProvisioningSecret = "s3cret", MaxAgeSeconds = 300 };
    private static readonly DateTimeOffset Now = new(2026, 11, 11, 10, 0, 0, TimeSpan.Zero);

    private static string Sign(long timestamp, string body) =>
        Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(Options.ProvisioningSecret), Encoding.UTF8.GetBytes($"{timestamp}.{body}")));

    [Fact]
    public void Accepts_a_fresh_correctly_signed_callback()
    {
        var ts = Now.ToUnixTimeSeconds();
        Assert.True(ProvisioningWebhookController.IsAuthentic("{}", Sign(ts, "{}"), ts, Options, Now));
    }

    [Fact]
    public void Rejects_tampered_bodies_stale_timestamps_and_garbage()
    {
        var ts = Now.ToUnixTimeSeconds();
        Assert.False(ProvisioningWebhookController.IsAuthentic("{\"state\":\"Completed\"}", Sign(ts, "{}"), ts, Options, Now));
        Assert.False(ProvisioningWebhookController.IsAuthentic("{}", Sign(ts - 600, "{}"), ts - 600, Options, Now));
        Assert.False(ProvisioningWebhookController.IsAuthentic("{}", "not-hex", ts, Options, Now));
        Assert.False(ProvisioningWebhookController.IsAuthentic("{}", Sign(ts, "{}"), ts, new WebhookOptions(), Now));
    }
}

public sealed class BoundaryHelperTests
{
    [Theory]
    [InlineData("4f1c2a", true)]
    [InlineData("job-plan-changes.1", true)]
    [InlineData("bad id with spaces", false)]
    [InlineData("line\nbreak", false)]
    [InlineData("", false)]
    public void Only_safe_correlation_ids_are_propagated(string value, bool accepted) =>
        Assert.Equal(accepted, CorrelationIdMiddleware.IsAcceptable(value));

    [Fact]
    public void Same_subject_always_maps_to_the_same_user_id()
    {
        Assert.Equal(HttpCurrentUser.SubjectToUserId("auth0|abc"), HttpCurrentUser.SubjectToUserId("auth0|abc"));
        Assert.NotEqual(HttpCurrentUser.SubjectToUserId("auth0|abc"), HttpCurrentUser.SubjectToUserId("auth0|abd"));
        Assert.Equal(Guid.Empty, HttpCurrentUser.SubjectToUserId(string.Empty));
    }

    [Theory]
    [InlineData("IN_PROGRESS", TicketStatus.InProgress)]
    [InlineData("inprogress", TicketStatus.InProgress)]
    [InlineData("PendingCustomer", TicketStatus.PendingCustomer)]
    public void Enum_names_accept_api_and_convention_spellings(string value, TicketStatus expected) =>
        Assert.Equal(expected, EnumParsing.Parse<TicketStatus>(value, "status"));

    [Theory]
    [InlineData("2")]
    [InlineData("-1")]
    [InlineData("Unknown")]
    [InlineData(null)]
    public void Enum_ordinals_and_unknown_names_are_rejected(string? value) =>
        Assert.False(EnumParsing.TryParse<TicketStatus>(value, out _));
}
```

## apps/uconnect/tests/Uconnect.Tests/Application/BillingRunServiceTests.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/tests/Uconnect.Tests/Application/BillingRunServiceTests.cs`.

```csharp
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Services;
using static Uconnect.Tests.TestData;

namespace Uconnect.Tests.Application;

public sealed class BillingRunServiceTests
{
    private readonly IAccountRepository _accounts = Substitute.For<IAccountRepository>();
    private readonly IServiceRepository _services = Substitute.For<IServiceRepository>();
    private readonly IPlanRepository _plans = Substitute.For<IPlanRepository>();
    private readonly IPlanChangeRepository _planChanges = Substitute.For<IPlanChangeRepository>();
    private readonly IUsageRepository _usage = Substitute.For<IUsageRepository>();
    private readonly IAdjustmentRepository _adjustments = Substitute.For<IAdjustmentRepository>();
    private readonly IInvoiceRepository _invoices = Substitute.For<IInvoiceRepository>();
    private readonly IReferenceGenerator _references = Substitute.For<IReferenceGenerator>();
    private readonly IClock _clock = Substitute.For<IClock>();
    private readonly BillingRunService _service;

    public BillingRunServiceTests()
    {
        _clock.UtcNow.Returns(Now);
        _clock.Today.Returns(Today);
        _references.NextInvoiceNumberAsync(Arg.Any<DateOnly>(), Arg.Any<CancellationToken>()).Returns("INV-202612-000001");
        _service = new BillingRunService(
            _accounts, _services, _plans, _planChanges, _usage, _adjustments, _invoices, _references,
            Substitute.For<IBillingSystemClient>(), Substitute.For<IUnitOfWork>(), _clock,
            Options.Create(new BillingOptions()), NullLogger<BillingRunService>.Instance);
    }

    [Fact]
    public async Task Long_overdue_invoice_gets_one_late_fee_and_suspends_the_account()
    {
        var account = Account();
        var invoice = IssuedInvoice(account.Id, 50_00, new DateOnly(2026, 9, 1));
        _invoices.ListPayableDueByAsync(Arg.Any<DateOnly>(), Arg.Any<CancellationToken>()).Returns(new[] { invoice });
        _accounts.GetByIdAsync(account.Id, Arg.Any<CancellationToken>()).Returns(account);

        var summary = await _service.ProcessCollectionsAsync(CancellationToken.None);

        Assert.Equal(new CollectionsRunSummary(1, 1, 1, 0), summary);
        Assert.Equal(InvoiceStatus.Overdue, invoice.Status);
        Assert.Equal(AccountStatus.Suspended, account.Status);
        Assert.StartsWith(BillingRunService.ArrearsSuspensionPrefix, account.SuspensionReason);
        _adjustments.Received(1).Add(Arg.Is<AccountAdjustment>(a =>
            a.Reason == AdjustmentReason.LatePaymentFee && a.Amount.AmountMinor == 500 && a.SourceReference == $"late-fee:{invoice.InvoiceNumber}"));
    }

    [Fact]
    public async Task Late_fee_is_not_raised_twice()
    {
        var account = Account();
        var invoice = IssuedInvoice(account.Id, 50_00, new DateOnly(2026, 10, 1));
        _invoices.ListPayableDueByAsync(Arg.Any<DateOnly>(), Arg.Any<CancellationToken>()).Returns(new[] { invoice });
        _adjustments.ExistsForSourceAsync(account.Id, null, $"late-fee:{invoice.InvoiceNumber}", Arg.Any<CancellationToken>()).Returns(true);

        var summary = await _service.ProcessCollectionsAsync(CancellationToken.None);

        Assert.Equal(0, summary.LateFeesRaised);
        Assert.Equal(0, summary.AccountsSuspended);
        _adjustments.DidNotReceiveWithAnyArgs().Add(default!);
    }

    [Fact]
    public async Task Invoice_bills_the_new_cycle_in_advance_with_unbilled_credits_and_brought_forward_credit()
    {
        var account = Account(billingDay: 1);
        var plan = Plan(priceMinor: 30_00);
        var service = ActiveService(account, plan, new DateOnly(2025, 1, 1));
        var credit = new AccountAdjustment(Guid.NewGuid(), account.Id, service.Id, AdjustmentReason.Goodwill, "Goodwill", Gbp(-5_00), Guid.NewGuid(), Now);
        _services.ListByAccountAsync(account.Id, Arg.Any<CancellationToken>()).Returns(new[] { service });
        _plans.GetManyAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>()).Returns(new[] { plan });
        _adjustments.ListUnbilledAsync(account.Id, Arg.Any<CancellationToken>()).Returns(new[] { credit });
        _planChanges.ListUnbilledCompletedAsync(account.Id, Arg.Any<CancellationToken>()).Returns(Array.Empty<Uconnect.Domain.PlanChanges.PlanChange>());
        _usage.ListAsync(default, default, default, default).ReturnsForAnyArgs(Array.Empty<Uconnect.Domain.Usage.UsageRecord>());

        var invoice = await _service.BillAccountAsync(account, new BillingPeriod(new DateOnly(2026, 12, 1), new DateOnly(2027, 1, 1)), new DateOnly(2026, 12, 1), CancellationToken.None);

        Assert.NotNull(invoice);
        Assert.Equal(2, invoice.Lines.Count);
        Assert.Equal((30_00 - 5_00) * 12 / 10, invoice.Total.AmountMinor);
        Assert.Equal(new DateOnly(2026, 12, 15), invoice.DueOn);
        Assert.True(credit.IsBilled);
        _invoices.Received(1).Add(invoice);
    }

    [Fact]
    public async Task Already_billed_period_is_skipped()
    {
        var account = Account();
        _invoices.ExistsForPeriodAsync(account.Id, new DateOnly(2026, 12, 1), Arg.Any<CancellationToken>()).Returns(true);

        var invoice = await _service.BillAccountAsync(account, new BillingPeriod(new DateOnly(2026, 12, 1), new DateOnly(2027, 1, 1)), new DateOnly(2026, 12, 1), CancellationToken.None);

        Assert.Null(invoice);
        _invoices.DidNotReceiveWithAnyArgs().Add(default!);
    }

    [Fact]
    public async Task No_billing_runs_on_days_after_the_28th()
    {
        var summary = await _service.RunAsync(new DateOnly(2026, 12, 30), CancellationToken.None);

        Assert.Equal(0, summary.AccountsConsidered);
        await _accounts.DidNotReceiveWithAnyArgs().ListByBillingDayAsync(default, default);
    }
}
```

## apps/uconnect/tests/Uconnect.Tests/Application/PaymentServiceTests.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/tests/Uconnect.Tests/Application/PaymentServiceTests.cs`.

```csharp
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;
using static Uconnect.Tests.TestData;

namespace Uconnect.Tests.Application;

public sealed class PaymentServiceTests
{
    private readonly IAccountRepository _accounts = Substitute.For<IAccountRepository>();
    private readonly IAccountUserRepository _accountUsers = Substitute.For<IAccountUserRepository>();
    private readonly IInvoiceRepository _invoices = Substitute.For<IInvoiceRepository>();
    private readonly IPaymentRepository _payments = Substitute.For<IPaymentRepository>();
    private readonly IPaymentMethodRepository _methods = Substitute.For<IPaymentMethodRepository>();
    private readonly IInvoiceNumberLookup _lookup = Substitute.For<IInvoiceNumberLookup>();
    private readonly IPaymentGateway _gateway = Substitute.For<IPaymentGateway>();
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IClock _clock = Substitute.For<IClock>();
    private readonly ICurrentUser _user = Substitute.For<ICurrentUser>();

    private readonly Account _account = Account();
    private readonly Invoice _invoice;
    private readonly PaymentMethod _card;
    private readonly PaymentService _service;

    public PaymentServiceTests()
    {
        _invoice = IssuedInvoice(_account.Id, 50_00, new DateOnly(2026, 11, 1));
        _card = Card(_account.Id);

        _clock.UtcNow.Returns(Now);
        _clock.Today.Returns(Today);
        _user.IsAuthenticated.Returns(true);
        _user.SubjectId.Returns("sub-123");
        _accounts.GetByNumberAsync(_account.Number, Arg.Any<CancellationToken>()).Returns(_account);
        _accountUsers.FindActiveAsync(_account.Id, "sub-123", Arg.Any<CancellationToken>())
            .Returns(new AccountUser(Guid.NewGuid(), _account.Id, "sub-123", EmailAddress.Create("me@example.com"), "Me", UserRoles.Consumer, Now));
        _invoices.GetByNumberAsync(_account.Id, _invoice.InvoiceNumber, Arg.Any<CancellationToken>()).Returns(_invoice);
        _methods.GetByIdAsync(_card.Id, Arg.Any<CancellationToken>()).Returns(_card);

        var guard = new AccountAccessGuard(_accounts, _accountUsers, _user);
        var executor = new PaymentExecutor(_payments, _invoices, _gateway, _unitOfWork, _clock, NullLogger<PaymentExecutor>.Instance);
        _service = new PaymentService(
            guard, _invoices, _payments, _methods, _lookup, _gateway, executor, _user, _unitOfWork, _clock,
            new PayInvoiceRequestValidator(), new RefundPaymentRequestValidator(), NullLogger<PaymentService>.Instance);
    }

    private PayInvoiceRequest FullBalance => new(_card.Id, new MoneyDto(_invoice.BalanceDue.AmountMinor, "GBP"));

    [Fact]
    public async Task Successful_payment_settles_the_invoice()
    {
        _gateway.ChargeAsync(Arg.Any<GatewayChargeRequest>(), Arg.Any<CancellationToken>()).Returns(GatewayChargeResult.Success("ch_1"));

        var result = await _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, "key-1", CancellationToken.None);

        Assert.Equal(nameof(PaymentStatus.Succeeded), result.Status);
        Assert.Equal(InvoiceStatus.Paid, _invoice.Status);
        _payments.Received(1).Add(Arg.Is<Payment>(p => p.IdempotencyKey == "key-1" && p.Channel == PaymentChannel.Portal));
        await _gateway.Received(1).ChargeAsync(Arg.Is<GatewayChargeRequest>(r => r.IdempotencyKey.StartsWith("pay-") && r.PaymentToken == _card.GatewayToken), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Declined_payment_is_recorded_and_reported()
    {
        _gateway.ChargeAsync(Arg.Any<GatewayChargeRequest>(), Arg.Any<CancellationToken>()).Returns(GatewayChargeResult.Declined("insufficient_funds", "Insufficient funds"));

        var ex = await Assert.ThrowsAsync<PaymentDeclinedException>(() =>
            _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, "key-2", CancellationToken.None));

        Assert.Equal("insufficient_funds", ex.FailureCode);
        Assert.Equal(InvoiceStatus.Issued, _invoice.Status);
    }

    [Fact]
    public async Task Retry_with_the_same_key_returns_the_original_outcome_without_charging_again()
    {
        var earlier = new Payment(Guid.NewGuid(), _account.Id, _invoice.Id, _card.Id, _invoice.BalanceDue, PaymentChannel.Portal, "key-3", Now);
        earlier.MarkSucceeded("ch_9", Now);
        _payments.FindByIdempotencyKeyAsync(_account.Id, "key-3", Arg.Any<CancellationToken>()).Returns(earlier);

        var result = await _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, "key-3", CancellationToken.None);

        Assert.Equal(earlier.Id, result.Id);
        await _gateway.DidNotReceiveWithAnyArgs().ChargeAsync(default!, default);
    }

    [Fact]
    public async Task Interrupted_pending_payment_is_resumed_on_retry()
    {
        var pending = new Payment(Guid.NewGuid(), _account.Id, _invoice.Id, _card.Id, _invoice.BalanceDue, PaymentChannel.Portal, "key-4", Now);
        _payments.FindByIdempotencyKeyAsync(_account.Id, "key-4", Arg.Any<CancellationToken>()).Returns(pending);
        _gateway.ChargeAsync(Arg.Any<GatewayChargeRequest>(), Arg.Any<CancellationToken>()).Returns(GatewayChargeResult.Success("ch_2"));

        await _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, "key-4", CancellationToken.None);

        Assert.Equal(PaymentStatus.Succeeded, pending.Status);
        await _gateway.Received(1).ChargeAsync(Arg.Is<GatewayChargeRequest>(r => r.IdempotencyKey == $"pay-{pending.Id:N}"), Arg.Any<CancellationToken>());
        _payments.DidNotReceiveWithAnyArgs().Add(default!);
    }

    [Fact]
    public async Task Reusing_a_key_for_a_different_amount_is_a_conflict()
    {
        var earlier = new Payment(Guid.NewGuid(), _account.Id, _invoice.Id, _card.Id, Gbp(10_00), PaymentChannel.Portal, "key-5", Now);
        _payments.FindByIdempotencyKeyAsync(_account.Id, "key-5", Arg.Any<CancellationToken>()).Returns(earlier);

        var ex = await Assert.ThrowsAsync<ConflictException>(() =>
            _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, "key-5", CancellationToken.None));
        Assert.Equal("payment.idempotency_key_reused", ex.Code);
    }

    [Fact]
    public async Task Amount_above_the_balance_is_rejected_before_charging()
    {
        var request = new PayInvoiceRequest(_card.Id, new MoneyDto(_invoice.BalanceDue.AmountMinor + 1, "GBP"));

        await Assert.ThrowsAsync<RequestValidationException>(() =>
            _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, request, "key-6", CancellationToken.None));
        await _gateway.DidNotReceiveWithAnyArgs().ChargeAsync(default!, default);
    }

    [Fact]
    public async Task Missing_idempotency_key_is_a_validation_error() =>
        await Assert.ThrowsAsync<RequestValidationException>(() =>
            _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, null, CancellationToken.None));

    [Fact]
    public async Task Business_user_cannot_pay()
    {
        _accountUsers.FindActiveAsync(_account.Id, "sub-123", Arg.Any<CancellationToken>())
            .Returns(new AccountUser(Guid.NewGuid(), _account.Id, "sub-123", EmailAddress.Create("me@example.com"), "Me", UserRoles.BusinessUser, Now));

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, "key-7", CancellationToken.None));
    }
}
```

## apps/uconnect/tests/Uconnect.Tests/Domain/BillingDomainTests.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/tests/Uconnect.Tests/Domain/BillingDomainTests.cs`.

```csharp
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.PlanChanges;
using static Uconnect.Tests.TestData;

namespace Uconnect.Tests.Domain;

public sealed class MoneyTests
{
    [Theory]
    [InlineData(1000, 1, 3, 333)]
    [InlineData(1000, 2, 3, 667)]
    [InlineData(-1000, 2, 3, -667)]
    [InlineData(5, 1, 2, 3)]
    public void MultiplyRatio_rounds_half_away_from_zero(long amount, long numerator, long denominator, long expected) =>
        Assert.Equal(expected, Gbp(amount).MultiplyRatio(numerator, denominator).AmountMinor);

    [Fact]
    public void Allocate_never_loses_a_minor_unit()
    {
        var parts = Gbp(100).Allocate(new[] { 1, 1, 1 });

        Assert.Equal(new long[] { 34, 33, 33 }, parts.Select(p => p.AmountMinor));
    }

    [Fact]
    public void Adding_different_currencies_is_rejected()
    {
        var ex = Assert.Throws<DomainException>(() => Gbp(100) + Money.FromMinor(100, "EUR"));
        Assert.Equal("money.currency_mismatch", ex.Code);
    }

    [Fact]
    public void FromMajor_rejects_sub_penny_amounts() =>
        Assert.Throws<DomainException>(() => Money.FromMajor(1.005m, "GBP"));
}

public sealed class InvoiceTests
{
    [Fact]
    public void Issue_applies_tax_once_on_the_taxable_base_and_sets_due_date()
    {
        var invoice = new Invoice(Guid.NewGuid(), "INV-1", Guid.NewGuid(), new BillingPeriod(new DateOnly(2026, 11, 1), new DateOnly(2026, 12, 1)), "GBP", Now);
        invoice.AddLine(InvoiceLineType.Recurring, "Plan", Gbp(33_33));
        invoice.AddLine(InvoiceLineType.Recurring, "Voice", Gbp(33_33));
        invoice.AddLine(InvoiceLineType.OneOff, "Late fee", Gbp(5_00), taxable: false);

        invoice.Issue(new DateOnly(2026, 11, 1), 14, 2000, Now);

        Assert.Equal(13_33, invoice.TaxTotal.AmountMinor);
        Assert.Equal(66_66 + 5_00 + 13_33, invoice.Total.AmountMinor);
        Assert.Equal(new DateOnly(2026, 11, 15), invoice.DueOn);
        Assert.Equal(InvoiceStatus.Issued, invoice.Status);
    }

    [Fact]
    public void Net_credit_invoice_is_settled_and_carries_the_credit_forward()
    {
        var invoice = new Invoice(Guid.NewGuid(), "INV-2", Guid.NewGuid(), new BillingPeriod(new DateOnly(2026, 11, 1), new DateOnly(2026, 12, 1)), "GBP", Now);
        invoice.AddLine(InvoiceLineType.Recurring, "Plan", Gbp(10_00));
        invoice.AddLine(InvoiceLineType.Credit, "Outage credit", Gbp(-25_00));

        invoice.Issue(new DateOnly(2026, 11, 1), 14, 2000, Now);

        Assert.Equal(InvoiceStatus.Paid, invoice.Status);
        Assert.Equal(18_00, invoice.CreditCarriedForward.AmountMinor);
        Assert.True(invoice.BalanceDue.IsZero);
    }

    [Fact]
    public void Partial_payment_then_overdue_then_full_payment()
    {
        var invoice = IssuedInvoice(Guid.NewGuid(), 50_00, new DateOnly(2026, 11, 1));

        invoice.ApplyPayment(Gbp(20_00), Now);
        Assert.Equal(InvoiceStatus.PartiallyPaid, invoice.Status);

        Assert.True(invoice.MarkOverdueIfLate(new DateOnly(2026, 11, 20)));
        Assert.Equal(5, invoice.DaysOverdue(new DateOnly(2026, 11, 20)));

        invoice.ApplyPayment(invoice.BalanceDue, Now);
        Assert.Equal(InvoiceStatus.Paid, invoice.Status);
    }

    [Fact]
    public void Overpayment_is_rejected()
    {
        var invoice = IssuedInvoice(Guid.NewGuid(), 10_00, new DateOnly(2026, 11, 1));

        var ex = Assert.Throws<DomainException>(() => invoice.ApplyPayment(Gbp(12_01), Now));
        Assert.Equal("invoice.overpayment", ex.Code);
    }

    [Fact]
    public void Issued_invoice_lines_are_frozen()
    {
        var invoice = IssuedInvoice(Guid.NewGuid(), 10_00, new DateOnly(2026, 11, 1));

        Assert.Throws<DomainException>(() => invoice.AddLine(InvoiceLineType.OneOff, "Extra", Gbp(1_00)));
    }
}

public sealed class PlanChangePolicyTests
{
    [Fact]
    public void Mid_cycle_upgrade_is_prorated_for_the_remaining_days()
    {
        var account = Account(billingDay: 1);
        var current = Plan("FIBRE-100", tier: 1, priceMinor: 30_00);
        var target = Plan("FIBRE-900", tier: 3, priceMinor: 60_00);
        var service = ActiveService(account, current, new DateOnly(2025, 1, 1));

        var quote = PlanChangePolicy.Quote(account, service, current, target, new DateOnly(2026, 11, 16));

        Assert.Equal(PlanChangeType.Upgrade, quote.ChangeType);
        Assert.NotNull(quote.Proration);
        Assert.Equal(15, quote.Proration.DaysRemaining);
        Assert.Equal(15_00, quote.Proration.Credit.AmountMinor);
        Assert.Equal(30_00, quote.Proration.Charge.AmountMinor);
        Assert.Equal(15_00, quote.OneOffTotal.AmountMinor);
        Assert.True(quote.ResetsContract);
    }

    [Fact]
    public void Downgrade_inside_contract_takes_effect_next_cycle_with_capped_fee()
    {
        var account = Account(billingDay: 1);
        var current = Plan("FIBRE-900", tier: 3, priceMinor: 60_00, minimumTermMonths: 24);
        var target = Plan("FIBRE-100", tier: 1, priceMinor: 30_00);
        var service = ActiveService(account, current, new DateOnly(2026, 10, 1));

        var quote = PlanChangePolicy.Quote(account, service, current, target, new DateOnly(2026, 11, 16));

        Assert.Equal(new DateOnly(2026, 12, 1), quote.EffectiveOn);
        Assert.Null(quote.Proration);
        Assert.Equal(30_00 * PlanChangePolicy.EarlyTerminationFeeCapMonths, quote.EarlyTerminationFee.AmountMinor);
    }

    [Fact]
    public void Downgrade_cannot_be_dated_mid_cycle()
    {
        var account = Account();
        var current = Plan("FIBRE-900", tier: 3, priceMinor: 60_00);
        var target = Plan("FIBRE-100", tier: 1, priceMinor: 30_00);
        var service = ActiveService(account, current, new DateOnly(2025, 1, 1));

        var ex = Assert.Throws<DomainException>(() =>
            PlanChangePolicy.Quote(account, service, current, target, new DateOnly(2026, 11, 16), new DateOnly(2026, 11, 20)));
        Assert.Equal("plan_change.downgrade_date", ex.Code);
    }
}
```

## apps/uconnect/tests/Uconnect.Tests/Domain/ServiceDomainTests.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/tests/Uconnect.Tests/Domain/ServiceDomainTests.cs`.

```csharp
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Payments;
using Uconnect.Domain.Tickets;
using Uconnect.Domain.Usage;
using static Uconnect.Tests.TestData;

namespace Uconnect.Tests.Domain;

public sealed class TicketTests
{
    private static Ticket NewTicket(TicketPriority priority = TicketPriority.P2) =>
        new(Guid.NewGuid(), "TKT-000001", Guid.NewGuid(), null, TicketCategory.Fault, priority, "No internet", "Router lights red", Guid.NewGuid(), Now);

    [Fact]
    public void Sla_clock_pauses_while_waiting_on_the_customer()
    {
        var ticket = NewTicket();
        var dueBefore = ticket.ResolutionDueAt;

        ticket.AwaitCustomer(Now.AddHours(1));
        ticket.AddCustomerComment(Guid.NewGuid(), "Customer", "Here are the details", Now.AddHours(6));

        Assert.Equal(TicketStatus.InProgress, ticket.Status);
        Assert.Equal(dueBefore.AddHours(5), ticket.ResolutionDueAt);
    }

    [Fact]
    public void Internal_notes_do_not_satisfy_first_response()
    {
        var ticket = NewTicket();

        ticket.AddAgentComment(Guid.NewGuid(), "Agent", "Checking line test", isInternal: true, Now.AddMinutes(5));
        Assert.Null(ticket.FirstRespondedAt);

        ticket.AddAgentComment(Guid.NewGuid(), "Agent", "We're looking into it", isInternal: false, Now.AddMinutes(10));
        Assert.Equal(Now.AddMinutes(10), ticket.FirstRespondedAt);
    }

    [Fact]
    public void Resolved_ticket_can_only_be_reopened_inside_the_window()
    {
        var ticket = NewTicket();
        ticket.Resolve("Replaced router", Now);

        var ex = Assert.Throws<DomainException>(() =>
            ticket.Reopen("Still down", Guid.NewGuid(), "Customer", Now.AddDays(Ticket.ReopenWindowDays + 1)));
        Assert.Equal("ticket.reopen_window_passed", ex.Code);
        Assert.True(ticket.IsDueForAutoClose(Now.AddDays(Ticket.ReopenWindowDays + 1)));
    }

    [Theory]
    [InlineData(true, true, false, TicketPriority.P1)]
    [InlineData(true, false, false, TicketPriority.P2)]
    [InlineData(true, true, true, TicketPriority.P3)]
    [InlineData(false, false, false, TicketPriority.P3)]
    public void Fault_triage(bool serviceDown, bool business, bool inOutage, TicketPriority expected) =>
        Assert.Equal(expected, TicketTriage.DeterminePriority(TicketCategory.Fault, serviceDown, business, inOutage));
}

public sealed class OutageCompensationPolicyTests
{
    [Fact]
    public void Business_credit_is_five_percent_per_block_after_the_first_and_capped()
    {
        Assert.Equal(0, OutageCompensationPolicy.CalculateCredit(AccountType.Business, OutageSeverity.Major, Gbp(100_00), TimeSpan.FromHours(4)).AmountMinor);
        Assert.Equal(5_00, OutageCompensationPolicy.CalculateCredit(AccountType.Business, OutageSeverity.Major, Gbp(100_00), TimeSpan.FromHours(4.5)).AmountMinor);
        Assert.Equal(50_00, OutageCompensationPolicy.CalculateCredit(AccountType.Business, OutageSeverity.Critical, Gbp(100_00), TimeSpan.FromDays(10)).AmountMinor);
    }

    [Fact]
    public void Consumer_credit_starts_after_the_grace_period()
    {
        Assert.True(OutageCompensationPolicy.CalculateCredit(AccountType.Consumer, OutageSeverity.Major, Gbp(30_00), TimeSpan.FromHours(47)).IsZero);
        Assert.Equal(1_00, OutageCompensationPolicy.CalculateCredit(AccountType.Consumer, OutageSeverity.Major, Gbp(30_00), TimeSpan.FromHours(49)).AmountMinor);
    }

    [Fact]
    public void Minor_degradation_attracts_no_credit() =>
        Assert.True(OutageCompensationPolicy.CalculateCredit(AccountType.Business, OutageSeverity.Minor, Gbp(100_00), TimeSpan.FromDays(3)).IsZero);
}

public sealed class AutopaySettingsTests
{
    [Fact]
    public void Charges_balance_from_the_collection_date_and_respects_the_ceiling()
    {
        var account = Account();
        var card = Card(account.Id);
        var settings = new AutopaySettings(Guid.NewGuid(), account.Id);
        settings.Enable(card, daysBeforeDue: 3, maxAmount: Gbp(100_00), Today, Now);
        var invoice = IssuedInvoice(account.Id, 50_00, new DateOnly(2026, 11, 1));

        Assert.Equal("not_yet_due", settings.Evaluate(invoice, new DateOnly(2026, 11, 11)).SkipReason);
        var decision = settings.Evaluate(invoice, new DateOnly(2026, 11, 12));
        Assert.True(decision.ShouldCharge);
        Assert.Equal(60_00, decision.Amount!.AmountMinor);

        var large = IssuedInvoice(account.Id, 100_00, new DateOnly(2026, 11, 1), "INV-202611-000002");
        Assert.Equal("above_max_amount", settings.Evaluate(large, new DateOnly(2026, 11, 12)).SkipReason);
    }

    [Fact]
    public void Suspends_after_repeated_failures()
    {
        var account = Account();
        var settings = new AutopaySettings(Guid.NewGuid(), account.Id);
        settings.Enable(Card(account.Id), 0, null, Today, Now);

        Assert.False(settings.RecordFailure(Now));
        Assert.False(settings.RecordFailure(Now));
        Assert.True(settings.RecordFailure(Now));
        Assert.False(settings.Enabled);
    }
}

public sealed class AppointmentSchedulingPolicyTests
{
    private static readonly IReadOnlySet<DateOnly> NoHolidays = new HashSet<DateOnly>();

    [Fact]
    public void Installation_lead_time_counts_working_days_only()
    {
        // Wednesday 11 Nov 2026 + 5 working days = Wednesday 18 Nov.
        Assert.Equal(new DateOnly(2026, 11, 18), AppointmentSchedulingPolicy.EarliestBookableDate(AppointmentType.Installation, new DateOnly(2026, 11, 11), NoHolidays));
    }

    [Fact]
    public void Saturdays_offer_mornings_only_and_holidays_nothing()
    {
        var saturday = new DateOnly(2026, 11, 21);
        Assert.Equal(new[] { AppointmentWindow.Morning }, AppointmentSchedulingPolicy.WindowsOffered(AppointmentType.Repair, saturday, NoHolidays));
        Assert.Empty(AppointmentSchedulingPolicy.WindowsOffered(AppointmentType.Repair, new DateOnly(2026, 12, 25), new HashSet<DateOnly> { new(2026, 12, 25) }));
    }

    [Fact]
    public void All_day_window_is_only_for_installations()
    {
        var monday = new DateOnly(2026, 11, 23);
        Assert.Contains(AppointmentWindow.AllDay, AppointmentSchedulingPolicy.WindowsOffered(AppointmentType.Installation, monday, NoHolidays));
        Assert.DoesNotContain(AppointmentWindow.AllDay, AppointmentSchedulingPolicy.WindowsOffered(AppointmentType.Repair, monday, NoHolidays));
    }
}

public sealed class FairUsePolicyTests
{
    [Fact]
    public void Overage_is_charged_per_started_gigabyte()
    {
        var plan = Plan("BIZ-500");
        plan.ConfigureFairUse(100, Gbp(50));
        var serviceId = Guid.NewGuid();
        var period = new BillingPeriod(new DateOnly(2026, 10, 1), new DateOnly(2026, 11, 1));
        var records = new[]
        {
            new UsageRecord(Guid.NewGuid(), serviceId, new DateOnly(2026, 10, 5), 80 * UsageRecord.BytesPerGigabyte, 0, Now),
            new UsageRecord(Guid.NewGuid(), serviceId, new DateOnly(2026, 10, 6), 20 * UsageRecord.BytesPerGigabyte, 1, Now),
            new UsageRecord(Guid.NewGuid(), serviceId, new DateOnly(2026, 11, 1), 500 * UsageRecord.BytesPerGigabyte, 0, Now),
        };

        var summary = FairUsePolicy.Summarise(serviceId, period, plan, records);

        Assert.Equal(FairUseState.Exceeded, summary.State);
        Assert.Equal(1, summary.Charge!.ExcessGb);
        Assert.Equal(50, summary.Charge.Amount.AmountMinor);
    }
}
```

## apps/uconnect/tests/Uconnect.Tests/TestData.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/tests/Uconnect.Tests/TestData.cs`.

```csharp
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;
using Uconnect.Domain.Services;

namespace Uconnect.Tests;

/// <summary>Builders for valid domain objects; tests override only what they assert on.</summary>
internal static class TestData
{
    public static readonly DateTimeOffset Now = new(2026, 11, 11, 10, 0, 0, TimeSpan.Zero);

    public static DateOnly Today => DateOnly.FromDateTime(Now.UtcDateTime);

    public static Money Gbp(long minor) => Money.FromMinor(minor, "GBP");

    public static Account Account(AccountType type = AccountType.Consumer, int billingDay = 1) => new(
        Guid.NewGuid(),
        AccountNumber.Parse("ACC-00000001"),
        "Test Household",
        type,
        EmailAddress.Create("bills@example.com"),
        PhoneNumber.Create("07700 900123"),
        new PostalAddress("1 Fibre Street", null, "Leeds", "LS1 4AP"),
        "GBP",
        billingDay,
        Now.AddYears(-1));

    public static Plan Plan(string code = "FIBRE-500", int tier = 2, long priceMinor = 40_00, int minimumTermMonths = 18) => new(
        Guid.NewGuid(), code, code, ProductType.Broadband, tier, Gbp(priceMinor), 500, 75, minimumTermMonths, Gbp(0), true, true);

    public static Service ActiveService(Account account, Plan plan, DateOnly activatedOn)
    {
        var service = new Service(Guid.NewGuid(), account.Id, "SVC-00000001", plan, new PostalAddress("1 Fibre Street", null, "Leeds", "LS1 4AP"), Now.AddYears(-1));
        service.Activate(activatedOn, Now);
        return service;
    }

    /// <summary>An issued invoice for <paramref name="netMinor"/> + 20% VAT, due 14 days after <paramref name="issuedOn"/>.</summary>
    public static Invoice IssuedInvoice(Guid accountId, long netMinor, DateOnly issuedOn, string number = "INV-202611-000001")
    {
        var period = BillingPeriod.Containing(issuedOn, issuedOn.Day > 28 ? 28 : issuedOn.Day);
        var invoice = new Invoice(Guid.NewGuid(), number, accountId, period, "GBP", Now);
        invoice.AddLine(InvoiceLineType.Recurring, "Fibre 500 monthly charge", Gbp(netMinor));
        invoice.Issue(issuedOn, 14, TaxCalculator.UkStandardVatBasisPoints, Now);
        return invoice;
    }

    public static PaymentMethod Card(Guid accountId) =>
        PaymentMethod.CreateCard(Guid.NewGuid(), accountId, "tok_visa_4242", "Visa", "4242", 12, 2030, Today, Now);
}
```

## apps/uconnect/tests/Uconnect.Tests/Uconnect.Tests.csproj

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: xml. Path: `apps/uconnect/tests/Uconnect.Tests/Uconnect.Tests.csproj`.

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <RootNamespace>Uconnect.Tests</RootNamespace>
    <IsPackable>false</IsPackable>
    <IsTestProject>true</IsTestProject>
    <GenerateDocumentationFile>false</GenerateDocumentationFile>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\src\Uconnect.Domain\Uconnect.Domain.csproj" />
    <ProjectReference Include="..\..\src\Uconnect.Application\Uconnect.Application.csproj" />
    <ProjectReference Include="..\..\src\Uconnect.Api\Uconnect.Api.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageReference Include="xunit" Version="2.9.0" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
    <PackageReference Include="NSubstitute" Version="5.1.0" />
  </ItemGroup>

  <ItemGroup>
    <Using Include="Xunit" />
  </ItemGroup>

</Project>
```
