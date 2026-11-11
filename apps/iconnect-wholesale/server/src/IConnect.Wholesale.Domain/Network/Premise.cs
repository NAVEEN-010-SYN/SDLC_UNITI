using System.Text.RegularExpressions;
using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Network;

public enum PremiseBuildStatus
{
    /// <summary>Fibre is live and ready for service.</summary>
    ReadyForService,

    /// <summary>In the build plan; orders accepted with a forward requested date after RFS.</summary>
    PlannedBuild,

    /// <summary>Passed but requires a survey/civil works (e.g. long lead-in) before connection.</summary>
    SurveyRequired,

    NotServiceable,
}

/// <summary>A premise passed (or planned) by the fibre network, keyed by its Unique Property Reference Number.</summary>
public sealed class Premise
{
    private Premise()
    {
    }

    public Premise(string uprn, string addressLine1, string? addressLine2, string town, string postcode,
        string exchangeCode, PremiseBuildStatus buildStatus, int maxDownstreamMbps, DateOnly? readyForServiceDate)
    {
        Uprn = Uprns.Normalise(uprn);
        AddressLine1 = addressLine1;
        AddressLine2 = addressLine2;
        Town = town;
        Postcode = Postcodes.Normalise(postcode);
        ExchangeCode = exchangeCode;
        BuildStatus = buildStatus;
        MaxDownstreamMbps = maxDownstreamMbps;
        ReadyForServiceDate = readyForServiceDate;
    }

    public string Uprn { get; private set; } = string.Empty;

    public string AddressLine1 { get; private set; } = string.Empty;

    public string? AddressLine2 { get; private set; }

    public string Town { get; private set; } = string.Empty;

    public string Postcode { get; private set; } = string.Empty;

    public string ExchangeCode { get; private set; } = string.Empty;

    public PremiseBuildStatus BuildStatus { get; private set; }

    public int MaxDownstreamMbps { get; private set; }

    public DateOnly? ReadyForServiceDate { get; private set; }

    /// <summary>Set when a service (from any partner) is already live on the ONT port.</summary>
    public bool HasActiveService { get; private set; }

    public string SingleLineAddress =>
        string.Join(", ", new[] { AddressLine1, AddressLine2, Town, Postcode }.Where(s => !string.IsNullOrWhiteSpace(s)));

    public bool IsOrderable(DateOnly onDate)
    {
        switch (BuildStatus)
        {
            case PremiseBuildStatus.ReadyForService:
            case PremiseBuildStatus.SurveyRequired:
                return true;
            case PremiseBuildStatus.PlannedBuild:
                return ReadyForServiceDate.HasValue && onDate >= ReadyForServiceDate.Value;
            default:
                return false;
        }
    }

    public void MarkServiceActive(bool active) => HasActiveService = active;
}

public static partial class Uprns
{
    /// <summary>UPRNs are 1-12 digit integers; leading zeros are not significant.</summary>
    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value) && UprnPattern().IsMatch(value.Trim()) && value.Trim().TrimStart('0').Length > 0;

    public static string Normalise(string value)
    {
        if (!IsValid(value))
        {
            throw new DomainException("uprn.invalid", $"'{value}' is not a valid UPRN.");
        }

        return value.Trim().TrimStart('0');
    }

    [GeneratedRegex("^[0-9]{1,12}$")]
    private static partial Regex UprnPattern();
}

public static partial class Postcodes
{
    public static bool IsValid(string? value) => !string.IsNullOrWhiteSpace(value) && PostcodePattern().IsMatch(Compact(value));

    /// <summary>Upper-cases and inserts the single space before the inward code ("sw1a1aa" -> "SW1A 1AA").</summary>
    public static string Normalise(string value)
    {
        if (!IsValid(value))
        {
            throw new DomainException("postcode.invalid", $"'{value}' is not a valid UK postcode.");
        }

        var compact = Compact(value);
        var outwardLength = compact.Length - 3;
        return compact.Substring(0, outwardLength) + " " + compact.Substring(outwardLength);
    }

    private static string Compact(string value) => value.Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant();

    [GeneratedRegex("^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$")]
    private static partial Regex PostcodePattern();
}
