using System.Text.RegularExpressions;
using Uconnect.Infrastructure.External;

namespace Uconnect.Api.Http;

/// <summary>
/// Accepts the caller's <c>X-Correlation-Id</c> (or creates one), echoes it on the response, opens a
/// logging scope so every structured log line carries it, and exposes it to outbound HTTP clients.
/// </summary>
public sealed class CorrelationIdMiddleware
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
    internal static bool IsAcceptable(string? value) => !string.IsNullOrEmpty(value) && value.Length <= 64 && SafeIdRegex.IsMatch(value);

    private static readonly Regex SafeIdRegex = new("^[A-Za-z0-9._-]+$");
}
