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
