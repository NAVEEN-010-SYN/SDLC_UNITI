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

    /// <summary>Checks are ordered: more specific exception types come before their base types.</summary>
    public static ProblemDetails Map(Exception exception)
    {
        if (exception is RequestValidationException validation)
        {
            return Validation(validation.Errors);
        }

        if (exception is NotFoundException notFound)
        {
            return Create(StatusCodes.Status404NotFound, "Resource not found", $"{ToCode(notFound.Resource)}.not_found", notFound.Message);
        }

        if (exception is ConflictException conflict)
        {
            return Create(StatusCodes.Status409Conflict, "Conflict with current state", conflict.Code, conflict.Message);
        }

        if (exception is ForbiddenException forbidden)
        {
            return Create(StatusCodes.Status403Forbidden, "Forbidden", "forbidden", forbidden.Message);
        }

        if (exception is InvalidTransitionException transition)
        {
            return Create(StatusCodes.Status409Conflict, "Transition not allowed", transition.Code, transition.Message);
        }

        if (exception is DomainException domain)
        {
            return Create(StatusCodes.Status422UnprocessableEntity, "Business rule violated", domain.Code, domain.Message);
        }

        if (exception is BadHttpRequestException badRequest)
        {
            var code = badRequest.StatusCode == StatusCodes.Status413PayloadTooLarge ? "request.too_large" : "request.malformed";
            return Create(badRequest.StatusCode, "Bad request", code, badRequest.Message);
        }

        if (exception is OperationCanceledException)
        {
            return Create(499, "Client closed request", ClientClosedRequest, null);
        }

        return Create(StatusCodes.Status500InternalServerError, "Unexpected error", "server.error",
            "An unexpected error occurred. Quote the correlation id when contacting support.");
    }

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
