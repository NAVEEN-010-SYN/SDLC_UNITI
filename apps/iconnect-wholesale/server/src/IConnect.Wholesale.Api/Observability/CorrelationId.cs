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
