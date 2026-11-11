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
        var problem = MapStatus(exception);
        problem.Extensions["code"] = MapCode(exception, problem);

        if (exception is PaymentDeclinedException declined)
        {
            problem.Extensions["paymentId"] = declined.PaymentId;
            problem.Extensions["failureCode"] = declined.FailureCode;
        }

        return problem;
    }

    private static ProblemDetails MapStatus(Exception exception)
    {
        if (exception is RequestValidationException validation)
        {
            var errors = validation.Errors.ToDictionary(k => k.Key, v => v.Value);
            return new ValidationProblemDetails(errors) { Status = StatusCodes.Status400BadRequest, Title = validation.Message };
        }

        if (exception is NotFoundException)
        {
            return Problem(StatusCodes.Status404NotFound, "Not found", exception.Message);
        }

        if (exception is ForbiddenException)
        {
            return Problem(StatusCodes.Status403Forbidden, "Forbidden", exception.Message);
        }

        if (exception is ConflictException)
        {
            return Problem(StatusCodes.Status409Conflict, "Conflict", exception.Message);
        }

        if (exception is PaymentDeclinedException)
        {
            return Problem(StatusCodes.Status402PaymentRequired, "Payment declined", exception.Message);
        }

        if (exception is ExternalServiceException external)
        {
            var status = external.IsTransient ? StatusCodes.Status503ServiceUnavailable : StatusCodes.Status502BadGateway;
            return Problem(status, "Dependency unavailable", "A system we depend on is not responding. Please try again shortly.");
        }

        if (exception is InvalidStateTransitionException)
        {
            return Problem(StatusCodes.Status409Conflict, "Invalid state", exception.Message);
        }

        if (exception is DomainException)
        {
            return Problem(StatusCodes.Status422UnprocessableEntity, "Business rule violated", exception.Message);
        }

        if (exception is BadHttpRequestException badRequest)
        {
            return Problem(badRequest.StatusCode, "Bad request", "The request could not be read.");
        }

        return Problem(StatusCodes.Status500InternalServerError, "Unexpected error", "Something went wrong. Quote the correlation id if you contact support.");
    }

    private static string MapCode(Exception exception, ProblemDetails problem)
    {
        if (exception is ApplicationExceptionBase applicationError)
        {
            return applicationError.Code;
        }

        if (exception is DomainException domainError)
        {
            return domainError.Code;
        }

        return problem.Status >= 500 ? "internal_error" : "bad_request";
    }

    private static ProblemDetails Problem(int status, string title, string detail) => new() { Status = status, Title = title, Detail = detail };
}
