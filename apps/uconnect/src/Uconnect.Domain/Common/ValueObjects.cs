using System.Text.RegularExpressions;

namespace Uconnect.Domain.Common;

/// <summary>Customer-facing account identifier in the form <c>ACC-########</c>.</summary>
public sealed partial record AccountNumber
{
    private AccountNumber(string value) => Value = value;

    public string Value { get; }

    public static AccountNumber Parse(string? value)
    {
        if (!TryParse(value, out var result))
        {
            throw new DomainException("account_number.invalid", "Account number must match ACC-########.");
        }

        return result!;
    }

    public static bool TryParse(string? value, out AccountNumber? result)
    {
        result = null;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var candidate = value.Trim().ToUpperInvariant();
        if (!Pattern().IsMatch(candidate))
        {
            return false;
        }

        result = new AccountNumber(candidate);
        return true;
    }

    public override string ToString() => Value;

    [GeneratedRegex(@"^ACC-\d{8}$", RegexOptions.CultureInvariant)]
    private static partial Regex Pattern();
}

/// <summary>A syntactically valid, lower-cased e-mail address.</summary>
public sealed partial record EmailAddress
{
    private EmailAddress(string value) => Value = value;

    public string Value { get; }

    public static EmailAddress Create(string? value)
    {
        var trimmed = value?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(trimmed) || trimmed.Length > 254 || !Pattern().IsMatch(trimmed))
        {
            throw new DomainException("email.invalid", "E-mail address is not valid.");
        }

        return new EmailAddress(trimmed);
    }

    public override string ToString() => Value;

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$", RegexOptions.CultureInvariant)]
    private static partial Regex Pattern();
}

/// <summary>A UK telephone number normalised to E.164 (+44...).</summary>
public sealed partial record PhoneNumber
{
    private PhoneNumber(string value) => Value = value;

    public string Value { get; }

    public static PhoneNumber Create(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new DomainException("phone.required", "Phone number is required.");
        }

        var digits = NonDigit().Replace(value, string.Empty);
        if (value.TrimStart().StartsWith('+'))
        {
            digits = "+" + digits;
        }
        else if (digits.StartsWith('0'))
        {
            digits = "+44" + digits[1..];
        }

        if (!E164().IsMatch(digits))
        {
            throw new DomainException("phone.invalid", "Phone number is not valid.");
        }

        return new PhoneNumber(digits);
    }

    public override string ToString() => Value;

    [GeneratedRegex(@"[^\d]")]
    private static partial Regex NonDigit();

    [GeneratedRegex(@"^\+[1-9]\d{8,14}$")]
    private static partial Regex E164();
}

/// <summary>A postal address. For services this is the premises where the fibre terminates.</summary>
public sealed partial record PostalAddress
{
    public PostalAddress(string line1, string? line2, string town, string postcode, string countryCode = "GB")
    {
        Line1 = Guard.NotBlank(line1, "address.line1", 120);
        Line2 = string.IsNullOrWhiteSpace(line2) ? null : line2.Trim();
        Town = Guard.NotBlank(town, "address.town", 80);
        CountryCode = Guard.NotBlank(countryCode, "address.country", 2).ToUpperInvariant();

        var normalisedPostcode = NormalisePostcode(postcode);
        if (CountryCode == "GB" && !UkPostcode().IsMatch(normalisedPostcode))
        {
            throw new DomainException("address.postcode_invalid", "Postcode is not a valid UK postcode.");
        }

        Postcode = normalisedPostcode;
    }

    public string Line1 { get; }

    public string? Line2 { get; }

    public string Town { get; }

    public string Postcode { get; }

    public string CountryCode { get; }

    /// <summary>The outward code, e.g. "LS1" for "LS1 4AP" — used to match outages to premises.</summary>
    public string OutwardCode => Postcode.Split(' ')[0];

    public static string NormalisePostcode(string? postcode)
    {
        var compact = Whitespace().Replace(postcode ?? string.Empty, string.Empty).ToUpperInvariant();
        return compact.Length > 3 ? $"{compact[..^3]} {compact[^3..]}" : compact;
    }

    public override string ToString() =>
        string.Join(", ", new[] { Line1, Line2, Town, Postcode }.Where(p => !string.IsNullOrEmpty(p)));

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    [GeneratedRegex(@"^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$")]
    private static partial Regex UkPostcode();
}
