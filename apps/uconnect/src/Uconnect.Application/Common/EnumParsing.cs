namespace Uconnect.Application.Common;

/// <summary>
/// Parses enum names received on the wire. Accepts the PascalCase names emitted by the API
/// (<c>InProgress</c>) and the SCREAMING_SNAKE vocabulary of CONVENTIONS.md (<c>IN_PROGRESS</c>), but
/// never numeric values, so clients cannot depend on enum ordinals.
/// </summary>
public static class EnumParsing
{
    public static bool TryParse<TEnum>(string? value, out TEnum result)
        where TEnum : struct, Enum
    {
        result = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var candidate = value.Trim().Replace("_", string.Empty, StringComparison.Ordinal);
        if (candidate.Length == 0 || !char.IsLetter(candidate[0]))
        {
            return false;
        }

        return Enum.TryParse(candidate, ignoreCase: true, out result) && Enum.IsDefined(result);
    }

    /// <summary>Parses <paramref name="value"/> or throws a field-level validation error naming the allowed values.</summary>
    public static TEnum Parse<TEnum>(string? value, string field)
        where TEnum : struct, Enum
    {
        if (TryParse<TEnum>(value, out var result))
        {
            return result;
        }

        throw new RequestValidationException(field, $"'{value}' is not valid. Allowed values: {string.Join(", ", Enum.GetNames<TEnum>())}.");
    }

    public static bool IsValid<TEnum>(string? value)
        where TEnum : struct, Enum => TryParse<TEnum>(value, out _);
}
