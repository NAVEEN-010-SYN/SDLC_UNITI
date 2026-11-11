using IConnect.Wholesale.Api.Observability;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

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
                ctx.ProblemDetails.Extensions["code"] = DefaultCode(ctx.ProblemDetails.Status);
            }
        });
        services.AddExceptionHandler<ProblemDetailsExceptionHandler>();

        services.Configure<ApiBehaviorOptions>(options => options.InvalidModelStateResponseFactory = context =>
        {
            var errors = ModelStateErrors(context.ModelState);
            var problem = ProblemMapper.Validation(errors);
            problem.Instance = context.HttpContext.Request.Path;
            problem.Extensions["correlationId"] = CorrelationIdMiddleware.Get(context.HttpContext) ?? context.HttpContext.TraceIdentifier;
            return new ObjectResult(problem) { StatusCode = StatusCodes.Status400BadRequest, ContentTypes = { "application/problem+json" } };
        });

        return services;
    }

    /// <summary>Code for problems raised by the framework itself (no code set by ProblemMapper).</summary>
    private static string DefaultCode(int? status)
    {
        switch (status)
        {
            case StatusCodes.Status401Unauthorized:
                return "auth.unauthenticated";
            case StatusCodes.Status403Forbidden:
                return "auth.forbidden";
            case StatusCodes.Status404NotFound:
                return "route.not_found";
            case StatusCodes.Status405MethodNotAllowed:
                return "route.method_not_allowed";
            case StatusCodes.Status429TooManyRequests:
                return "rate_limit.exceeded";
            default:
                return "http.error";
        }
    }

    private static Dictionary<string, string[]> ModelStateErrors(ModelStateDictionary modelState)
    {
        var errors = new Dictionary<string, string[]>();
        foreach (var kv in modelState)
        {
            if (kv.Value is null || kv.Value.Errors.Count == 0)
            {
                continue;
            }

            var messages = new List<string>();
            foreach (var e in kv.Value.Errors)
            {
                messages.Add(string.IsNullOrEmpty(e.ErrorMessage) ? "The value is invalid." : e.ErrorMessage);
            }

            var key = string.IsNullOrEmpty(kv.Key) ? "body" : kv.Key;
            errors.Add(key, messages.ToArray());
        }

        return errors;
    }
}
