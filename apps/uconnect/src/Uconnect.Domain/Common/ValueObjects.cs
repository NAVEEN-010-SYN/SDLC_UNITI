using System.Text.RegularExpressions;

namespace Uconnect.Domain.Common;

/// <summary>Customer-facing account identifier in the form <c>ACC-########</c>.</summary>
public sealed record AccountNumber
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
        if (!PatternRegex.IsMatch(candidate))
        {
            return false;
        }

        result = new AccountNumber(candidate);
        return true;
    }

    public override string ToString() => Value;

    private static readonly Regex PatternRegex = new(@"^ACC-\d{8}$", RegexOptions.CultureInvariant);
}

/// <summary>A syntactically valid, lower-cased e-mail address.</summary>
public sealed record EmailAddress
{
    private EmailAddress(string value) => Value = value;

    public string Value { get; }

    public static EmailAddress Create(string? value)
    {
        var trimmed = value?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(trimmed) || trimmed.Length > 254 || !PatternRegex.IsMatch(trimmed))
        {
            throw new DomainException("email.invalid", "E-mail address is not valid.");
        }

        return new EmailAddress(trimmed);
    }

    public override string ToString() => Value;

    private static readonly Regex PatternRegex = new(@"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$", RegexOptions.CultureInvariant);
}

/// <summary>A UK telephone number normalised to E.164 (+44...).</summary>
public sealed record PhoneNumber
{
    private PhoneNumber(string value) => Value = value;

    public string Value { get; }

    public static PhoneNumber Create(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new DomainException("phone.required", "Phone number is required.");
        }

        var digits = NonDigitRegex.Replace(value, string.Empty);
        if (value.TrimStart().StartsWith('+'))
        {
            digits = "+" + digits;
        }
        else if (digits.StartsWith('0'))
        {
            digits = "+44" + digits.Substring(1);
        }

        if (!E164Regex.IsMatch(digits))
        {
            throw new DomainException("phone.invalid", "Phone number is not valid.");
        }

        return new PhoneNumber(digits);
    }

    public override string ToString() => Value;

    private static readonly Regex NonDigitRegex = new(@"[^\d]");

    private static readonly Regex E164Regex = new(@"^\+[1-9]\d{8,14}$");
}

/// <summary>A postal address. For services this is the premises where the fibre terminates.</summary>
public sealed record PostalAddress
{
    public PostalAddress(string line1, string? line2, string town, string postcode, string countryCode = "GB")
    {
        Line1 = Guard.NotBlank(line1, "address.line1", 120);
        Line2 = string.IsNullOrWhiteSpace(line2) ? null : line2.Trim();
        Town = Guard.NotBlank(town, "address.town", 80);
        CountryCode = Guard.NotBlank(countryCode, "address.country", 2).ToUpperInvariant();

        var normalisedPostcode = NormalisePostcode(postcode);
        if (CountryCode == "GB" && !UkPostcodeRegex.IsMatch(normalisedPostcode))
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

    /// <summary>The outward code, e.g. "LS1" for "LS1 4AP" - used to match outages to premises.</summary>
    public string OutwardCode => Postcode.Split(' ')[0];

    public static string NormalisePostcode(string? postcode)
    {
        var compact = WhitespaceRegex.Replace(postcode ?? string.Empty, string.Empty).ToUpperInvariant();
        if (compact.Length <= 3)
        {
            return compact;
        }

        // Inward code is always the last three characters.
        return compact.Substring(0, compact.Length - 3) + " " + compact.Substring(compact.Length - 3);
    }

    public override string ToString() =>
        string.Join(", ", new[] { Line1, Line2, Town, Postcode }.Where(p => !string.IsNullOrEmpty(p)));

    private static readonly Regex WhitespaceRegex = new(@"\s+");

    private static readonly Regex UkPostcodeRegex = new(@"^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$");
}
