namespace Uconnect.Domain.Common;

/// <summary>
/// Raised when a domain rule or invariant is violated. The <see cref="Code"/> is a stable,
/// machine-readable identifier surfaced to API consumers in problem details.
/// </summary>
public class DomainException : Exception
{
    public DomainException(string code, string message) : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}

/// <summary>Raised when a requested state transition is not permitted from the current state.</summary>
public sealed class InvalidStateTransitionException : DomainException
{
    public InvalidStateTransitionException(string entity, string from, string to)
        : base($"{entity.ToLowerInvariant()}.invalid_transition", $"{entity} cannot move from {from} to {to}.")
    {
        Entity = entity;
        From = from;
        To = to;
    }

    public string Entity { get; }

    public string From { get; }

    public string To { get; }
}

/// <summary>Guard helpers that throw <see cref="DomainException"/> with consistent codes.</summary>
public static class Guard
{
    public static string NotBlank(string? value, string field, int maxLength = 500)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new DomainException($"{field}.required", $"{field} is required.");
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
        {
            throw new DomainException($"{field}.too_long", $"{field} must be at most {maxLength} characters.");
        }

        return trimmed;
    }

    public static void Positive(Money amount, string field)
    {
        if (amount.AmountMinor <= 0)
        {
            throw new DomainException($"{field}.must_be_positive", $"{field} must be greater than zero.");
        }
    }

    public static void NotNegative(Money amount, string field)
    {
        if (amount.AmountMinor < 0)
        {
            throw new DomainException($"{field}.negative", $"{field} must not be negative.");
        }
    }

    public static void InRange(int value, int min, int max, string field)
    {
        if (value < min || value > max)
        {
            throw new DomainException($"{field}.out_of_range", $"{field} must be between {min} and {max}.");
        }
    }
}
