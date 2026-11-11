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
