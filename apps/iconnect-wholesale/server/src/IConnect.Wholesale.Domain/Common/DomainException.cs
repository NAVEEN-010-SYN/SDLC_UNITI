namespace IConnect.Wholesale.Domain.Common;

/// <summary>
/// Raised when a business invariant is violated. <see cref="Code"/> is a stable,
/// machine-readable identifier surfaced to API callers in the problem details "code" field.
/// </summary>
public class DomainException : Exception
{
    public DomainException(string code, string message)
        : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}

/// <summary>Raised when an aggregate is asked to make a state transition it does not allow.</summary>
public sealed class InvalidTransitionException : DomainException
{
    public InvalidTransitionException(string aggregate, string from, string to)
        : base($"{aggregate}.invalid_transition", $"{aggregate} cannot move from {from} to {to}.")
    {
        From = from;
        To = to;
    }

    public string From { get; }

    public string To { get; }
}
