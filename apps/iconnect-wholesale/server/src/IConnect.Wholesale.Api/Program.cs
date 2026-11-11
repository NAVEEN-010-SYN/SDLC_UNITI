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
