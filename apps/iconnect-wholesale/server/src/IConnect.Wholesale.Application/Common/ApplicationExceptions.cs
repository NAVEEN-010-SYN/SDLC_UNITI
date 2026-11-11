namespace IConnect.Wholesale.Application.Common;

public sealed class NotFoundException : Exception
{
    public NotFoundException(string resource, object key)
        : base($"{resource} '{key}' was not found.")
    {
        Resource = resource;
    }

    public string Resource { get; }
}

/// <summary>The request conflicts with current state (duplicate reference, capacity exhausted, ...).</summary>
public sealed class ConflictException : Exception
{
    public ConflictException(string code, string message)
        : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}

public sealed class ForbiddenException : Exception
{
    public ForbiddenException(string message)
        : base(message)
    {
    }
}

/// <summary>Boundary validation failure; carries per-field messages for problem+json "errors".</summary>
public sealed class RequestValidationException : Exception
{
    public RequestValidationException(IReadOnlyDictionary<string, string[]> errors)
        : base("One or more validation errors occurred.")
    {
        Errors = errors;
    }

    public RequestValidationException(string field, string message)
        : this(new Dictionary<string, string[]> { [field] = new[] { message } })
    {
    }

    public IReadOnlyDictionary<string, string[]> Errors { get; }
}

/// <summary>Accumulates field errors and throws once, so callers get every problem in one response.</summary>
public sealed class ValidationBuilder
{
    private readonly Dictionary<string, List<string>> _errors = new(StringComparer.Ordinal);

    public bool HasErrors => _errors.Count > 0;

    public ValidationBuilder Require(bool condition, string field, string message)
    {
        if (!condition)
        {
            Add(field, message);
        }

        return this;
    }

    public void Add(string field, string message)
    {
        if (!_errors.TryGetValue(field, out var list))
        {
            list = new List<string>();
            _errors[field] = list;
        }

        list.Add(message);
    }

    public void ThrowIfInvalid()
    {
        if (HasErrors)
        {
            throw new RequestValidationException(_errors.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray()));
        }
    }
}
