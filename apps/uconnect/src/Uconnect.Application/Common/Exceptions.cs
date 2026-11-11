namespace Uconnect.Application.Common;

/// <summary>Base type for application-level failures mapped to RFC 7807 problem responses.</summary>
public abstract class ApplicationExceptionBase : Exception
{
    protected ApplicationExceptionBase(string code, string message, Exception? inner = null) : base(message, inner)
    {
        Code = code;
    }

    /// <summary>Stable machine-readable error code.</summary>
    public string Code { get; }
}

/// <summary>The requested resource does not exist (or is not visible to the caller). Maps to 404.</summary>
public sealed class NotFoundException : ApplicationExceptionBase
{
    public NotFoundException(string resource, object key)
        : base($"{resource.ToLowerInvariant()}.not_found", $"{resource} '{key}' was not found.")
    {
        Resource = resource;
    }

    public string Resource { get; }
}

/// <summary>The caller is authenticated but not allowed to perform the action. Maps to 403.</summary>
public sealed class ForbiddenException : ApplicationExceptionBase
{
    public ForbiddenException(string message) : base("forbidden", message)
    {
    }
}

/// <summary>The request conflicts with current state (duplicate, concurrent edit). Maps to 409.</summary>
public sealed class ConflictException : ApplicationExceptionBase
{
    public ConflictException(string code, string message) : base(code, message)
    {
    }
}

/// <summary>Input failed validation. Maps to 400 with a field -> messages dictionary.</summary>
public sealed class RequestValidationException : ApplicationExceptionBase
{
    public RequestValidationException(IReadOnlyDictionary<string, string[]> errors)
        : base("validation_failed", "One or more fields are invalid.")
    {
        Errors = errors;
    }

    public RequestValidationException(string field, string message)
        : this(new Dictionary<string, string[]> { [field] = new[] { message } })
    {
    }

    public IReadOnlyDictionary<string, string[]> Errors { get; }
}

/// <summary>A downstream system (provisioning, payment gateway, billing) failed or is unavailable. Maps to 502/503.</summary>
public sealed class ExternalServiceException : ApplicationExceptionBase
{
    public ExternalServiceException(string service, string message, bool isTransient, Exception? inner = null)
        : base($"{service}.unavailable", message, inner)
    {
        Service = service;
        IsTransient = isTransient;
    }

    public string Service { get; }

    public bool IsTransient { get; }
}
