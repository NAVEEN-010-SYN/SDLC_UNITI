using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Catalogue;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Availability;

public sealed record AddressMatchDto(string Uprn, string Address, string Postcode, string BuildStatus);

public sealed record AvailableProductDto(ProductDto Product, bool Orderable, string? Reason);

public sealed record AvailabilityResultDto(
    string Uprn,
    string Address,
    string ExchangeCode,
    string BuildStatus,
    int MaxDownstreamMbps,
    DateOnly? ReadyForServiceDate,
    bool HasActiveService,
    bool HasOpenOrder,
    string RecommendedOrderType,
    DateOnly EarliestCompletionDate,
    IReadOnlyList<AvailableProductDto> Products);

/// <summary>
/// Answers "what can I sell at this address, and when?". The earliest completion date applies the
/// order lead time from today or from the ready-for-service date for planned build, and adds a
/// survey allowance for premises needing civil works.
/// </summary>
public sealed class AvailabilityService
{
    public const int SurveyAllowanceWorkingDays = 15;

    private readonly IPremiseRepository _premises;
    private readonly ICatalogueRepository _catalogue;
    private readonly IOrderRepository _orders;
    private readonly ICalendarProvider _calendars;
    private readonly SlaPolicy _policy;
    private readonly IClock _clock;

    public AvailabilityService(IPremiseRepository premises, ICatalogueRepository catalogue, IOrderRepository orders,
        ICalendarProvider calendars, SlaPolicy policy, IClock clock)
    {
        _premises = premises;
        _catalogue = catalogue;
        _orders = orders;
        _calendars = calendars;
        _policy = policy;
        _clock = clock;
    }

    public async Task<IReadOnlyList<AddressMatchDto>> SearchAsync(string postcode, CancellationToken ct)
    {
        if (!Postcodes.IsValid(postcode))
        {
            throw new RequestValidationException("postcode", "Enter a valid UK postcode.");
        }

        var premises = await _premises.SearchByPostcodeAsync(Postcodes.Normalise(postcode), ct);
        return premises
            .OrderBy(p => p.AddressLine1, NaturalStringComparer.Instance)
            .Select(p => new AddressMatchDto(p.Uprn, p.SingleLineAddress, p.Postcode, p.BuildStatus.ToString()))
            .ToList();
    }

    public async Task<AvailabilityResultDto> CheckAsync(string uprn, CancellationToken ct)
    {
        if (!Uprns.IsValid(uprn))
        {
            throw new RequestValidationException("uprn", "UPRN must be 1 to 12 digits.");
        }

        var premise = await _premises.GetByUprnAsync(Uprns.Normalise(uprn), ct)
            ?? throw new NotFoundException("Premise", uprn);

        var calendar = _calendars.Get(CalendarKind.BusinessHours);
        var today = calendar.LocalDate(_clock.UtcNow);
        var hasOpenOrder = await _orders.HasOpenOrderForUprnAsync(premise.Uprn, ct);

        var orderType = premise.HasActiveService ? OrderType.Migrate : OrderType.Provide;
        var earliest = EarliestCompletion(premise, orderType, today, calendar);

        var products = await _catalogue.ListProductsAsync(includeWithdrawn: false, ct);
        var results = products
            .OrderBy(p => p.DownstreamMbps)
            .Select(p =>
            {
                string? reason = null;
                if (premise.BuildStatus == PremiseBuildStatus.NotServiceable)
                {
                    reason = "Premise is not serviceable.";
                }
                else if (p.DownstreamMbps > premise.MaxDownstreamMbps)
                {
                    reason = $"Exceeds premise capability of {premise.MaxDownstreamMbps} Mbps.";
                }
                else if (hasOpenOrder)
                {
                    reason = "An order is already in flight for this premise.";
                }

                return new AvailableProductDto(CatalogueService.ToDto(p), reason is null, reason);
            })
            .ToList();

        return new AvailabilityResultDto(
            premise.Uprn,
            premise.SingleLineAddress,
            premise.ExchangeCode,
            premise.BuildStatus.ToString(),
            premise.MaxDownstreamMbps,
            premise.ReadyForServiceDate,
            premise.HasActiveService,
            hasOpenOrder,
            orderType.ToString(),
            earliest,
            results);
    }

    internal DateOnly EarliestCompletion(Premise premise, OrderType type, DateOnly today, WorkingCalendar calendar)
    {
        var start = premise.BuildStatus == PremiseBuildStatus.PlannedBuild && premise.ReadyForServiceDate is { } rfs && rfs > today
            ? rfs
            : today;

        var leadTime = _policy.OrderLeadTimeWorkingDays(type);
        if (premise.BuildStatus == PremiseBuildStatus.SurveyRequired)
        {
            leadTime += SurveyAllowanceWorkingDays;
        }

        return calendar.AddWorkingDays(start, leadTime);
    }
}

/// <summary>Orders "2 High St" before "10 High St".</summary>
internal sealed class NaturalStringComparer : IComparer<string>
{
    public static readonly NaturalStringComparer Instance = new();

    public int Compare(string? x, string? y)
    {
        if (x is null || y is null)
        {
            return string.CompareOrdinal(x, y);
        }

        var nx = LeadingNumber(x);
        var ny = LeadingNumber(y);
        if (nx.HasValue && ny.HasValue && nx != ny)
        {
            return nx.Value.CompareTo(ny.Value);
        }

        return string.Compare(x, y, StringComparison.OrdinalIgnoreCase);
    }

    private static long? LeadingNumber(string s)
    {
        var digits = new string(s.TakeWhile(char.IsAsciiDigit).ToArray());
        return digits.Length is > 0 and < 18 ? long.Parse(digits, System.Globalization.CultureInfo.InvariantCulture) : null;
    }
}
