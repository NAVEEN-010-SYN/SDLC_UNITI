# iConnect Wholesale ordering: apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application (part 2 of 7)

- **Application:** iConnect Wholesale ordering
- **Tech stack:** .NET 8 Web API + Angular
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 15

## Files

- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Availability/AvailabilityService.cs` (166 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Billing/BillingService.cs` (241 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Billing/StatementGenerator.cs` (98 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/BulkOrders/BulkOrderCsvParser.cs` (211 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/BulkOrders/BulkOrderService.cs` (147 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/BulkOrders/CsvReader.cs` (132 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Catalogue/CatalogueService.cs` (130 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Catalogue/PricingService.cs` (87 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Common/ApplicationExceptions.cs` (87 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Common/Paging.cs` (32 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/DependencyInjection.cs` (37 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Faults/FaultService.cs` (250 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/IConnect.Wholesale.Application.csproj` (17 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Orders/OrderContracts.cs` (170 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Orders/OrderRequestValidator.cs` (136 lines)

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Availability/AvailabilityService.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Availability/AvailabilityService.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Billing/BillingService.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Billing/BillingService.cs`.

```csharp
using System.Globalization;
using System.Text;
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Sla;
using Microsoft.Extensions.Logging;

namespace IConnect.Wholesale.Application.Billing;

public sealed record StatementLineDto(Guid Id, int LineNumber, string Type, string Description, int Quantity, long AmountMinor, string? SourceReference);

public sealed record StatementSummaryDto(Guid Id, string Reference, DateOnly PeriodStart, DateOnly PeriodEnd, string Status,
    long TotalMinor, string Currency, DateOnly? DueDate);

public sealed record StatementDetailDto(Guid Id, string Reference, DateOnly PeriodStart, DateOnly PeriodEnd, string Status, string Currency,
    long ChargesMinor, long CreditsMinor, long TotalMinor, DateTimeOffset? IssuedAt, DateOnly? DueDate,
    IReadOnlyList<StatementLineDto> Lines, IReadOnlyList<DisputeDto> Disputes);

public sealed record RaiseDisputeRequest(IReadOnlyList<Guid> LineIds, string Reason, long ClaimedMinor);

public sealed record DecideDisputeRequest(long AwardedMinor, string Outcome);

public sealed record DisputeDto(Guid Id, string Reference, Guid StatementId, IReadOnlyList<Guid> LineIds, string Reason, long ClaimedMinor,
    string Status, long? AwardedMinor, string? Outcome, DateTimeOffset CreatedAt, DateTimeOffset? DecidedAt);

/// <summary>Monthly statement generation, retrieval, CSV export and dispute handling.</summary>
public sealed class BillingService
{
    private readonly IStatementRepository _statements;
    private readonly IDisputeRepository _disputes;
    private readonly IServiceRepository _services;
    private readonly IOrderRepository _orders;
    private readonly IFaultRepository _faults;
    private readonly IPartnerRepository _partners;
    private readonly StatementGenerator _generator;
    private readonly IReferenceGenerator _references;
    private readonly ICalendarProvider _calendars;
    private readonly ICurrentCaller _caller;
    private readonly IClock _clock;
    private readonly IUnitOfWork _uow;
    private readonly ILogger<BillingService> _logger;

    public BillingService(IStatementRepository statements, IDisputeRepository disputes, IServiceRepository services, IOrderRepository orders,
        IFaultRepository faults, IPartnerRepository partners, StatementGenerator generator, IReferenceGenerator references,
        ICalendarProvider calendars, ICurrentCaller caller, IClock clock, IUnitOfWork uow, ILogger<BillingService> logger)
    {
        _statements = statements;
        _disputes = disputes;
        _services = services;
        _orders = orders;
        _faults = faults;
        _partners = partners;
        _generator = generator;
        _references = references;
        _calendars = calendars;
        _caller = caller;
        _clock = clock;
        _uow = uow;
        _logger = logger;
    }

    /// <summary>
    /// Generates and issues the statement for a closed calendar month. Idempotent: returns the
    /// existing statement if the month has already been billed for the partner.
    /// </summary>
    public async Task<StatementDetailDto> GenerateAsync(Guid partnerId, int year, int month, CancellationToken ct)
    {
        if (month is < 1 or > 12 || year < 2000)
        {
            throw new RequestValidationException("period", "Year and month are not valid.");
        }

        var periodStart = new DateOnly(year, month, 1);
        var periodEnd = periodStart.AddMonths(1).AddDays(-1);
        var now = _clock.UtcNow;
        if (DateOnly.FromDateTime(now.UtcDateTime) <= periodEnd)
        {
            throw new ConflictException("statement.period_open", "Statements can only be generated after the month has ended.");
        }

        var existing = await _statements.GetForPeriodAsync(partnerId, periodStart, ct);
        if (existing is not null)
        {
            return await ToDetailAsync(existing, ct);
        }

        var partner = await _partners.GetAsync(partnerId, ct) ?? throw new NotFoundException("Partner", partnerId);
        var fromInstant = new DateTimeOffset(periodStart.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toInstant = new DateTimeOffset(periodEnd.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

        var inputs = new StatementInputs(
            await _services.ListBillableAsync(partnerId, periodStart, periodEnd, ct),
            await _orders.ListCompletedBetweenAsync(partnerId, periodStart, periodEnd, ct),
            await _orders.ListCancelledWithChargeBetweenAsync(partnerId, periodStart, periodEnd, ct),
            await _faults.ListResolvedWithCreditBetweenAsync(partnerId, fromInstant, toInstant, ct));

        var statement = new BillingStatement(await _references.NextAsync("STM", ct), partnerId, periodStart, periodEnd, partner.Currency);
        _generator.Populate(statement, inputs, _calendars.Get(SlaPolicy.OrderCalendar));
        statement.Issue(now);

        await _statements.AddAsync(statement, ct);
        await _uow.SaveChangesAsync(ct);
        _logger.LogInformation("Issued statement {Reference} for {Partner} {Period:yyyy-MM}: {Lines} lines, total {Total}",
            statement.Reference, partner.AccountNumber, periodStart, statement.Lines.Count, statement.Total);
        return await ToDetailAsync(statement, ct);
    }

    public async Task<PagedResult<StatementSummaryDto>> ListAsync(PageRequest page, CancellationToken ct)
    {
        var result = await _statements.ListForPartnerAsync(_caller.PartnerId, page, ct);
        return result.Map(s => new StatementSummaryDto(s.Id, s.Reference, s.PeriodStart, s.PeriodEnd, Upper(s.Status),
            s.Total.MinorUnits, s.Currency, s.DueDate));
    }

    public async Task<StatementDetailDto> GetAsync(Guid id, CancellationToken ct) => await ToDetailAsync(await LoadOwnedAsync(id, ct), ct);

    /// <summary>CSV export of a statement for partner reconciliation; amounts in major units with two decimals.</summary>
    public async Task<(string FileName, string Content)> ExportCsvAsync(Guid id, CancellationToken ct)
    {
        var statement = await LoadOwnedAsync(id, ct);
        var sb = new StringBuilder();
        sb.Append("line,type,description,quantity,amount,currency,source_reference\n");
        foreach (var line in statement.Lines)
        {
            sb.Append(line.LineNumber.ToString(CultureInfo.InvariantCulture)).Append(',')
                .Append(line.Type).Append(',')
                .Append(Escape(line.Description)).Append(',')
                .Append(line.Quantity.ToString(CultureInfo.InvariantCulture)).Append(',')
                .Append((line.Amount.MinorUnits / 100m).ToString("0.00", CultureInfo.InvariantCulture)).Append(',')
                .Append(line.Amount.Currency).Append(',')
                .Append(Escape(line.SourceReference ?? string.Empty)).Append('\n');
        }

        sb.Append(",TOTAL,,,").Append((statement.Total.MinorUnits / 100m).ToString("0.00", CultureInfo.InvariantCulture))
            .Append(',').Append(statement.Currency).Append(",\n");
        return ($"{statement.Reference}.csv", sb.ToString());
    }

    public async Task<DisputeDto> RaiseDisputeAsync(Guid statementId, RaiseDisputeRequest request, CancellationToken ct)
    {
        var statement = await LoadOwnedAsync(statementId, ct);
        var openDisputes = await _disputes.ListForStatementAsync(statementId, ct);
        var alreadyDisputed = openDisputes.Where(d => d.IsOpen).SelectMany(d => d.LineIds).ToHashSet();
        var overlap = request.LineIds.Where(alreadyDisputed.Contains).ToList();
        if (overlap.Count > 0)
        {
            throw new ConflictException("dispute.line_already_disputed", $"{overlap.Count} selected line(s) are already under dispute.");
        }

        var dispute = Dispute.Raise(await _references.NextAsync("DSP", ct), statement, request.LineIds, request.Reason,
            new Money(request.ClaimedMinor, statement.Currency), _clock.UtcNow);
        await _disputes.AddAsync(dispute, ct);
        await _uow.SaveChangesAsync(ct);
        return ToDto(dispute);
    }

    public async Task<IReadOnlyList<DisputeDto>> ListDisputesAsync(CancellationToken ct) =>
        (await _disputes.ListForPartnerAsync(_caller.PartnerId, ct)).OrderByDescending(d => d.CreatedAt).Select(ToDto).ToList();

    /// <summary>
    /// Support decision on a dispute. An award is posted to the statement as a negative adjustment
    /// line; once no disputes remain open the statement returns to ISSUED.
    /// </summary>
    public async Task<DisputeDto> DecideDisputeAsync(Guid disputeId, DecideDisputeRequest request, CancellationToken ct)
    {
        if (!_caller.IsSupportAgent)
        {
            throw new ForbiddenException("Only support agents can decide disputes.");
        }

        var dispute = await _disputes.GetAsync(disputeId, ct) ?? throw new NotFoundException("Dispute", disputeId);
        var statement = await _statements.GetAsync(dispute.StatementId, ct) ?? throw new NotFoundException("Statement", dispute.StatementId);
        var now = _clock.UtcNow;

        if (dispute.Status == DisputeStatus.Open)
        {
            dispute.StartReview(now);
        }

        dispute.Decide(new Money(request.AwardedMinor, statement.Currency), request.Outcome, now);
        if (dispute.AwardedAmount is { IsZero: false } award)
        {
            statement.AddLine(ChargeType.DisputeAdjustment, $"Dispute {dispute.Reference} adjustment",
                new Money(-award.MinorUnits, award.Currency), dispute.Reference);
        }

        var others = await _disputes.ListForStatementAsync(statement.Id, ct);
        if (others.Where(d => d.Id != dispute.Id).All(d => !d.IsOpen))
        {
            statement.ReturnToIssued();
        }

        await _uow.SaveChangesAsync(ct);
        return ToDto(dispute);
    }

    private async Task<BillingStatement> LoadOwnedAsync(Guid id, CancellationToken ct)
    {
        var statement = await _statements.GetAsync(id, ct);
        if (statement is null || (!_caller.IsSupportAgent && statement.PartnerId != _caller.PartnerId))
        {
            throw new NotFoundException("Statement", id);
        }

        return statement;
    }

    private async Task<StatementDetailDto> ToDetailAsync(BillingStatement s, CancellationToken ct)
    {
        var disputes = await _disputes.ListForStatementAsync(s.Id, ct);
        return new StatementDetailDto(s.Id, s.Reference, s.PeriodStart, s.PeriodEnd, Upper(s.Status), s.Currency,
            s.Charges.MinorUnits, s.Credits.MinorUnits, s.Total.MinorUnits, s.IssuedAt, s.DueDate,
            s.Lines.Select(l => new StatementLineDto(l.Id, l.LineNumber, l.Type.ToString(), l.Description, l.Quantity, l.Amount.MinorUnits, l.SourceReference)).ToList(),
            disputes.Select(ToDto).ToList());
    }

    private static DisputeDto ToDto(Dispute d) => new(d.Id, d.Reference, d.StatementId, d.LineIds, d.Reason, d.ClaimedAmount.MinorUnits,
        d.Status switch
        {
            DisputeStatus.UnderReview => "UNDER_REVIEW",
            DisputeStatus.PartiallyUpheld => "PARTIALLY_UPHELD",
            _ => d.Status.ToString().ToUpperInvariant(),
        },
        d.AwardedAmount?.MinorUnits, d.Outcome, d.CreatedAt, d.DecidedAt);

    private static string Upper(StatementStatus status) => status.ToString().ToUpperInvariant();

    /// <summary>Quotes a CSV field and neutralises spreadsheet formula injection.</summary>
    internal static string Escape(string value)
    {
        if (value.Length > 0 && "=+-@".Contains(value[0], StringComparison.Ordinal))
        {
            value = "'" + value;
        }

        return value.IndexOfAny(new[] { ',', '"', '\n', '\r' }) >= 0 ? "\"" + value.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"" : value;
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Billing/StatementGenerator.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Billing/StatementGenerator.cs`.

```csharp
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Services;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Billing;

/// <summary>Inputs for one partner-month, gathered by the caller from the repositories.</summary>
public sealed record StatementInputs(
    IReadOnlyList<WholesaleService> Services,
    IReadOnlyList<Order> CompletedOrders,
    IReadOnlyList<Order> CancelledWithCharge,
    IReadOnlyList<Fault> CreditedFaults);

/// <summary>
/// Pure statement calculation: no I/O, so it can be tested exhaustively.
/// <list type="bullet">
/// <item>Rental is billed for the statement month, pro-rated by day for every rental period
/// (activation, product change, cease) that overlaps it.</item>
/// <item>One-off charges are billed in the month the order completed.</item>
/// <item>Late delivery credits are assessed against the committed date on completion.</item>
/// <item>Fault credits are taken as assessed at resolution.</item>
/// </list>
/// </summary>
public sealed class StatementGenerator
{
    private readonly ServiceCreditCalculator _credits;

    public StatementGenerator(ServiceCreditCalculator credits)
    {
        _credits = credits;
    }

    public void Populate(BillingStatement statement, StatementInputs inputs, WorkingCalendar orderCalendar)
    {
        var start = statement.PeriodStart;
        var end = statement.PeriodEnd;
        var days = statement.DaysInPeriod;

        foreach (var service in inputs.Services.OrderBy(s => s.Reference, StringComparer.Ordinal))
        {
            foreach (var period in service.RentalPeriods)
            {
                var billedDays = period.DaysWithin(start, end);
                if (billedDays == 0)
                {
                    continue;
                }

                var monthly = new Money(period.MonthlyRentalMinor, period.Currency);
                var amount = billedDays == days ? monthly : monthly.ProRate(billedDays, days);
                var description = billedDays == days
                    ? $"{period.ProductCode} rental {service.Uprn}"
                    : $"{period.ProductCode} rental {service.Uprn} ({billedDays}/{days} days)";
                statement.AddLine(ChargeType.Rental, description, amount, service.Reference, billedDays);
            }
        }

        foreach (var order in inputs.CompletedOrders.OrderBy(o => o.CompletedDate).ThenBy(o => o.Reference, StringComparer.Ordinal))
        {
            if (order.OneOffCharge is { IsZero: false } charge)
            {
                var type = order.Type switch
                {
                    OrderType.Provide => ChargeType.Connection,
                    OrderType.Migrate => ChargeType.Migration,
                    OrderType.Modify => ChargeType.Modify,
                    _ => (ChargeType?)null,
                };

                if (type is { } chargeType)
                {
                    statement.AddLine(chargeType, $"{order.Type} {order.Uprn} completed {order.CompletedDate:yyyy-MM-dd}", charge, order.Reference);
                }
            }

            var late = order.WorkingDaysLate(orderCalendar);
            if (late > 0)
            {
                var credit = _credits.ForLateDelivery(order.CareLevel, late, statement.Currency);
                statement.AddLine(ChargeType.LateDeliveryCredit, $"Late delivery credit: {credit.Basis}", credit.Amount, order.Reference, credit.Units);
            }
        }

        foreach (var order in inputs.CancelledWithCharge.OrderBy(o => o.Reference, StringComparer.Ordinal))
        {
            statement.AddLine(ChargeType.CancellationCharge, $"Cancellation after dispatch {order.Uprn}", order.CancellationCharge!.Value, order.Reference);
        }

        foreach (var fault in inputs.CreditedFaults.OrderBy(f => f.ResolvedAt))
        {
            statement.AddLine(ChargeType.FaultCredit, $"Fault repair credit: {fault.ServiceCreditBasis}", fault.ServiceCredit!.Value, fault.Reference);
        }
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/BulkOrders/BulkOrderCsvParser.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/BulkOrders/BulkOrderCsvParser.cs`.

```csharp
using System.Globalization;
using IConnect.Wholesale.Application.Orders;
using IConnect.Wholesale.Domain.Orders;

namespace IConnect.Wholesale.Application.BulkOrders;

public sealed record ParsedBulkRow(int Line, ValidatedOrderRequest Request);

public sealed record BulkParseResult(IReadOnlyList<ParsedBulkRow> Rows, IReadOnlyList<BulkRowError> Errors, int DataRowCount)
{
    public bool IsValid => Errors.Count == 0 && Rows.Count > 0;
}

/// <summary>
/// Turns a partner's bulk order CSV into validated order requests. The header must contain the
/// required columns (any order, case-insensitive); unknown columns are rejected so typos such as
/// "requsted_date" are caught rather than silently ignored. Rows are validated with the same rules
/// as the REST API, plus cross-row checks for duplicate partner references and UPRNs.
/// </summary>
public static class BulkOrderCsvParser
{
    public static readonly IReadOnlyList<string> RequiredColumns = new[] { "partner_reference", "order_type", "uprn", "requested_date" };

    public static readonly IReadOnlyList<string> OptionalColumns = new[] { "product_code", "care_level", "existing_service_id", "migration_auth_code" };

    public static BulkParseResult Parse(string content, DateOnly today)
    {
        var errors = new List<BulkRowError>();
        IReadOnlyList<CsvReader.CsvRecord> records;
        try
        {
            records = CsvReader.Parse(content);
        }
        catch (CsvReader.CsvFormatException ex)
        {
            return new BulkParseResult(Array.Empty<ParsedBulkRow>(), new[] { new BulkRowError(ex.LineNumber, "*", "csv_format", ex.Message) }, 0);
        }

        if (records.Count == 0)
        {
            return new BulkParseResult(Array.Empty<ParsedBulkRow>(), new[] { new BulkRowError(1, "*", "empty", "The file is empty.") }, 0);
        }

        var header = records[0];
        var columns = ResolveColumns(header, errors);
        if (columns is null)
        {
            return new BulkParseResult(Array.Empty<ParsedBulkRow>(), errors, records.Count - 1);
        }

        var dataRows = records.Skip(1).ToList();
        if (dataRows.Count == 0)
        {
            errors.Add(new BulkRowError(header.LineNumber, "*", "no_rows", "The file has a header but no order rows."));
        }

        if (dataRows.Count > BulkUpload.MaxRows)
        {
            errors.Add(new BulkRowError(dataRows[BulkUpload.MaxRows].LineNumber, "*", "too_many_rows",
                $"A bulk upload may contain at most {BulkUpload.MaxRows} rows; split the file."));
            return new BulkParseResult(Array.Empty<ParsedBulkRow>(), errors, dataRows.Count);
        }

        var parsed = new List<ParsedBulkRow>();
        var seenReferences = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var seenUprns = new Dictionary<string, int>(StringComparer.Ordinal);

        foreach (var record in dataRows)
        {
            if (record.Fields.Count != header.Fields.Count)
            {
                errors.Add(new BulkRowError(record.LineNumber, "*", "column_count",
                    $"Expected {header.Fields.Count} columns but found {record.Fields.Count}."));
                continue;
            }

            string? Get(string column) => columns.TryGetValue(column, out var idx) ? NullIfBlank(record.Fields[idx]) : null;

            var rowErrors = new List<BulkRowError>();
            var requestedDate = ParseDate(Get("requested_date"), record.LineNumber, rowErrors);
            var serviceId = ParseGuid(Get("existing_service_id"), record.LineNumber, rowErrors);

            var request = new PlaceOrderRequest(
                Get("partner_reference") ?? string.Empty,
                Get("order_type") ?? string.Empty,
                Get("uprn") ?? string.Empty,
                Get("product_code"),
                Get("care_level"),
                serviceId,
                Get("migration_auth_code"),
                requestedDate ?? today);

            var (validated, fieldErrors) = OrderRequestValidator.Validate(request, today);
            rowErrors.AddRange(fieldErrors
                .Where(e => !(requestedDate is null && e.Field == "requestedDate"))
                .Select(e => new BulkRowError(record.LineNumber, ToColumn(e.Field), e.Code, e.Message)));

            if (validated is not null && rowErrors.Count == 0)
            {
                if (seenReferences.TryGetValue(validated.PartnerReference, out var firstRefLine))
                {
                    rowErrors.Add(new BulkRowError(record.LineNumber, "partner_reference", "duplicate_in_file",
                        $"Partner reference also used on line {firstRefLine}."));
                }
                else
                {
                    seenReferences[validated.PartnerReference] = record.LineNumber;
                }

                if (seenUprns.TryGetValue(validated.Uprn, out var firstUprnLine))
                {
                    rowErrors.Add(new BulkRowError(record.LineNumber, "uprn", "duplicate_in_file",
                        $"UPRN also ordered on line {firstUprnLine}; only one order per premise is allowed."));
                }
                else
                {
                    seenUprns[validated.Uprn] = record.LineNumber;
                }
            }

            if (rowErrors.Count == 0 && validated is not null)
            {
                parsed.Add(new ParsedBulkRow(record.LineNumber, validated));
            }

            errors.AddRange(rowErrors);
        }

        return new BulkParseResult(parsed, errors, dataRows.Count);
    }

    /// <summary>A template the portal offers for download.</summary>
    public static string Template() =>
        "partner_reference,order_type,uprn,product_code,care_level,requested_date,existing_service_id,migration_auth_code\n";

    private static Dictionary<string, int>? ResolveColumns(CsvReader.CsvRecord header, List<BulkRowError> errors)
    {
        var map = new Dictionary<string, int>(StringComparer.Ordinal);
        var known = RequiredColumns.Concat(OptionalColumns).ToHashSet(StringComparer.Ordinal);

        for (var i = 0; i < header.Fields.Count; i++)
        {
            var name = header.Fields[i].Trim().ToLowerInvariant().Replace(' ', '_');
            if (!known.Contains(name))
            {
                errors.Add(new BulkRowError(header.LineNumber, header.Fields[i], "unknown_column", $"Unknown column '{header.Fields[i]}'."));
                continue;
            }

            if (!map.TryAdd(name, i))
            {
                errors.Add(new BulkRowError(header.LineNumber, name, "duplicate_column", $"Column '{name}' appears more than once."));
            }
        }

        foreach (var required in RequiredColumns.Where(r => !map.ContainsKey(r)))
        {
            errors.Add(new BulkRowError(header.LineNumber, required, "missing_column", $"Required column '{required}' is missing."));
        }

        return errors.Count == 0 ? map : null;
    }

    private static DateOnly? ParseDate(string? value, int line, List<BulkRowError> errors)
    {
        if (value is null)
        {
            errors.Add(new BulkRowError(line, "requested_date", "required", "Requested date is required."));
            return null;
        }

        if (DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            return date;
        }

        errors.Add(new BulkRowError(line, "requested_date", "format", $"'{value}' is not a date in YYYY-MM-DD format."));
        return null;
    }

    private static Guid? ParseGuid(string? value, int line, List<BulkRowError> errors)
    {
        if (value is null)
        {
            return null;
        }

        if (Guid.TryParse(value, out var id))
        {
            return id;
        }

        errors.Add(new BulkRowError(line, "existing_service_id", "format", $"'{value}' is not a valid service id."));
        return null;
    }

    private static string? NullIfBlank(string value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string ToColumn(string field) => field switch
    {
        "partnerReference" => "partner_reference",
        "orderType" => "order_type",
        "productCode" => "product_code",
        "careLevel" => "care_level",
        "existingServiceId" => "existing_service_id",
        "migrationAuthCode" => "migration_auth_code",
        "requestedDate" => "requested_date",
        _ => field,
    };
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/BulkOrders/BulkOrderService.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/BulkOrders/BulkOrderService.cs`.

```csharp
using System.Security.Cryptography;
using System.Text;
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Application.Orders;
using IConnect.Wholesale.Domain.Orders;
using Microsoft.Extensions.Logging;

namespace IConnect.Wholesale.Application.BulkOrders;

public sealed record BulkUploadResultDto(
    Guid? UploadId,
    string FileName,
    string Status,
    int RowCount,
    int ValidRows,
    int OrdersCreated,
    int OrdersRejected,
    IReadOnlyList<BulkRowError> Errors,
    IReadOnlyList<BulkOrderOutcomeDto> Orders);

public sealed record BulkOrderOutcomeDto(int Line, string PartnerReference, string? OrderReference, string Status, string? Reason);

/// <summary>
/// Bulk order upload. A dry run validates only. A real upload is all-or-nothing at the syntax
/// level: any row error rejects the whole file. Rows that pass syntax are then placed one by one;
/// each may still be FAILED by inventory checks, which is reported per row (the order exists and
/// is visible in the order list, exactly as if it had been placed through the API).
/// </summary>
public sealed class BulkOrderService
{
    public const int MaxFileBytes = 1_048_576;

    private readonly OrderService _orderService;
    private readonly IOrderRepository _orders;
    private readonly IBulkUploadRepository _uploads;
    private readonly ICurrentCaller _caller;
    private readonly ICalendarProvider _calendars;
    private readonly IClock _clock;
    private readonly IUnitOfWork _uow;
    private readonly ILogger<BulkOrderService> _logger;

    public BulkOrderService(OrderService orderService, IOrderRepository orders, IBulkUploadRepository uploads, ICurrentCaller caller,
        ICalendarProvider calendars, IClock clock, IUnitOfWork uow, ILogger<BulkOrderService> logger)
    {
        _orderService = orderService;
        _orders = orders;
        _uploads = uploads;
        _caller = caller;
        _calendars = calendars;
        _clock = clock;
        _uow = uow;
        _logger = logger;
    }

    public async Task<BulkUploadResultDto> UploadAsync(string fileName, byte[] content, bool dryRun, CancellationToken ct)
    {
        if (content.Length == 0)
        {
            throw new RequestValidationException("file", "The uploaded file is empty.");
        }

        if (content.Length > MaxFileBytes)
        {
            throw new RequestValidationException("file", $"The file exceeds the {MaxFileBytes / 1024} KB limit.");
        }

        if (!fileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
        {
            throw new RequestValidationException("file", "Only .csv files are accepted.");
        }

        string text;
        try
        {
            text = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true).GetString(content);
        }
        catch (DecoderFallbackException)
        {
            throw new RequestValidationException("file", "The file must be UTF-8 encoded.");
        }

        var now = _clock.UtcNow;
        var today = _calendars.Get(Domain.Sla.CalendarKind.BusinessHours).LocalDate(now);
        var parse = BulkOrderCsvParser.Parse(text, today);
        var errors = parse.Errors.ToList();

        foreach (var row in parse.Rows)
        {
            if (await _orders.GetByPartnerReferenceAsync(_caller.PartnerId, row.Request.PartnerReference, ct) is { } existing)
            {
                errors.Add(new BulkRowError(row.Line, "partner_reference", "already_used", $"Partner reference already used by order {existing.Reference}."));
            }
        }

        if (dryRun)
        {
            return new BulkUploadResultDto(null, fileName, errors.Count == 0 ? "VALID" : "INVALID", parse.DataRowCount,
                parse.Rows.Count(r => errors.All(e => e.Row != r.Line)),
                0, 0, SortErrors(errors), Array.Empty<BulkOrderOutcomeDto>());
        }

        var hash = Convert.ToHexString(SHA256.HashData(content));
        if (await _uploads.GetByHashAsync(_caller.PartnerId, hash, ct) is { Status: BulkUploadStatus.Submitted } previous)
        {
            throw new ConflictException("bulk.duplicate_file", $"This file was already submitted on {previous.CreatedAt:yyyy-MM-dd HH:mm} UTC.");
        }

        var upload = new BulkUpload(_caller.PartnerId, fileName, hash, parse.DataRowCount, errors, now, _caller.ActorId);
        await _uploads.AddAsync(upload, ct);

        var outcomes = new List<BulkOrderOutcomeDto>();
        if (upload.Status == BulkUploadStatus.Validated)
        {
            var created = new List<Order>();
            foreach (var row in parse.Rows)
            {
                var order = await _orderService.CreateAndValidateAsync(row.Request, upload.Id, ct);
                created.Add(order);
                outcomes.Add(new BulkOrderOutcomeDto(row.Line, order.PartnerReference, order.Reference,
                    order.Status.ToString().ToUpperInvariant(), order.FailureReason));
            }

            await _orders.AddRangeAsync(created, ct);
            upload.MarkSubmitted(created.Count, now);
        }

        await _uow.SaveChangesAsync(ct);
        _logger.LogInformation("Bulk upload {UploadId} ({FileName}) by partner {PartnerId}: {Status}, {Rows} rows, {Errors} errors",
            upload.Id, fileName, _caller.PartnerId, upload.Status, parse.DataRowCount, errors.Count);

        return new BulkUploadResultDto(
            upload.Id,
            fileName,
            upload.Status.ToString().ToUpperInvariant(),
            parse.DataRowCount,
            upload.Status == BulkUploadStatus.Submitted ? parse.Rows.Count : 0,
            outcomes.Count(o => o.Status == "VALIDATED"),
            outcomes.Count(o => o.Status == "FAILED"),
            SortErrors(errors),
            outcomes);
    }

    private static IReadOnlyList<BulkRowError> SortErrors(IEnumerable<BulkRowError> errors) =>
        errors.OrderBy(e => e.Row).ThenBy(e => e.Column, StringComparer.Ordinal).ToList();
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/BulkOrders/CsvReader.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/BulkOrders/CsvReader.cs`.

```csharp
using System.Text;

namespace IConnect.Wholesale.Application.BulkOrders;

/// <summary>
/// Minimal RFC 4180 CSV reader: comma separated, double-quote enclosed fields, doubled quotes
/// as escapes, CRLF or LF line endings, embedded newlines inside quoted fields. Reports the
/// 1-based physical line on which each record starts so errors can point at the file.
/// </summary>
public static class CsvReader
{
    public sealed record CsvRecord(int LineNumber, IReadOnlyList<string> Fields);

    public sealed class CsvFormatException : Exception
    {
        public CsvFormatException(int lineNumber, string message)
            : base($"Line {lineNumber}: {message}")
        {
            LineNumber = lineNumber;
        }

        public int LineNumber { get; }
    }

    public static IReadOnlyList<CsvRecord> Parse(string content)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (content.Length > 0 && content[0] == '﻿')
        {
            content = content[1..];
        }

        var records = new List<CsvRecord>();
        var fields = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;
        var fieldWasQuoted = false;
        var line = 1;
        var recordStartLine = 1;

        for (var i = 0; i < content.Length; i++)
        {
            var c = content[i];

            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < content.Length && content[i + 1] == '"')
                    {
                        field.Append('"');
                        i++;
                    }
                    else
                    {
                        inQuotes = false;
                    }
                }
                else
                {
                    if (c == '\n')
                    {
                        line++;
                    }

                    field.Append(c);
                }

                continue;
            }

            switch (c)
            {
                case '"' when field.Length == 0 && !fieldWasQuoted:
                    inQuotes = true;
                    fieldWasQuoted = true;
                    break;
                case '"':
                    throw new CsvFormatException(line, "Unexpected quote inside an unquoted field.");
                case ',':
                    fields.Add(field.ToString());
                    field.Clear();
                    fieldWasQuoted = false;
                    break;
                case '\r':
                    break;
                case '\n':
                    fields.Add(field.ToString());
                    AddRecord(records, fields, recordStartLine);
                    fields = new List<string>();
                    field.Clear();
                    fieldWasQuoted = false;
                    line++;
                    recordStartLine = line;
                    break;
                default:
                    if (fieldWasQuoted)
                    {
                        throw new CsvFormatException(line, "Characters after closing quote.");
                    }

                    field.Append(c);
                    break;
            }
        }

        if (inQuotes)
        {
            throw new CsvFormatException(recordStartLine, "Unterminated quoted field.");
        }

        if (field.Length > 0 || fields.Count > 0 || fieldWasQuoted)
        {
            fields.Add(field.ToString());
            AddRecord(records, fields, recordStartLine);
        }

        return records;
    }

    private static void AddRecord(List<CsvRecord> records, List<string> fields, int lineNumber)
    {
        // Skip completely blank lines (common at the end of spreadsheet exports).
        if (fields.Count == 1 && fields[0].Length == 0)
        {
            return;
        }

        records.Add(new CsvRecord(lineNumber, fields));
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Catalogue/CatalogueService.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Catalogue/CatalogueService.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Catalogue;

public sealed record ProductDto(string Code, string Name, int DownstreamMbps, int UpstreamMbps, IReadOnlyList<string> CareLevels, bool IsActive);

public sealed record PriceBookEntryDto(string ProductCode, string CareLevel, long MonthlyRentalMinor, long ConnectionChargeMinor,
    long MigrationChargeMinor, long ModifyChargeMinor);

public sealed record VolumeTierDto(int MinimumActiveLines, int DiscountBps);

public sealed record PriceBookDto(string Version, DateOnly EffectiveFrom, DateOnly? EffectiveTo, string Currency,
    IReadOnlyList<PriceBookEntryDto> Entries, IReadOnlyList<VolumeTierDto> Tiers);

public sealed record NewPriceBookRequest(string Version, DateOnly EffectiveFrom, string Currency,
    IReadOnlyList<PriceBookEntryDto> Entries, IReadOnlyList<VolumeTierDto> Tiers);

public sealed class CatalogueService
{
    private readonly ICatalogueRepository _catalogue;
    private readonly IUnitOfWork _uow;
    private readonly IClock _clock;

    public CatalogueService(ICatalogueRepository catalogue, IUnitOfWork uow, IClock clock)
    {
        _catalogue = catalogue;
        _uow = uow;
        _clock = clock;
    }

    public async Task<IReadOnlyList<ProductDto>> ListProductsAsync(bool includeWithdrawn, CancellationToken ct)
    {
        var products = await _catalogue.ListProductsAsync(includeWithdrawn, ct);
        return products.OrderBy(p => p.DownstreamMbps).Select(ToDto).ToList();
    }

    public async Task<PriceBookDto> GetPriceBookAsync(DateOnly? onDate, CancellationToken ct)
    {
        var date = onDate ?? DateOnly.FromDateTime(_clock.UtcNow.UtcDateTime);
        var book = await _catalogue.GetEffectivePriceBookAsync(date, ct)
            ?? throw new NotFoundException("PriceBook", date.ToString("yyyy-MM-dd"));
        return ToDto(book);
    }

    /// <summary>
    /// Publishes a new price book version (support agents only). Must start in the future and
    /// price every active product at every care level it offers; closes the current version
    /// the day before the new one takes effect.
    /// </summary>
    public async Task<PriceBookDto> PublishPriceBookAsync(NewPriceBookRequest request, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(_clock.UtcNow.UtcDateTime);
        var v = new ValidationBuilder()
            .Require(!string.IsNullOrWhiteSpace(request.Version), "version", "Version is required.")
            .Require(request.EffectiveFrom > today, "effectiveFrom", "A new price book must take effect in the future.")
            .Require(request.Currency is { Length: 3 }, "currency", "Currency must be an ISO-4217 code.");

        var existing = await _catalogue.ListPriceBooksAsync(ct);
        v.Require(existing.All(b => !string.Equals(b.Version, request.Version, StringComparison.OrdinalIgnoreCase)),
            "version", $"Version {request.Version} already exists.");
        v.Require(existing.All(b => b.EffectiveFrom < request.EffectiveFrom), "effectiveFrom",
            "A later price book version already exists.");

        var book = new PriceBook(request.Version, request.EffectiveFrom, request.Currency);
        for (var i = 0; i < request.Entries.Count; i++)
        {
            var e = request.Entries[i];
            if (!Enum.TryParse<CareLevel>(e.CareLevel, true, out var care))
            {
                v.Add($"entries[{i}].careLevel", $"Unknown care level '{e.CareLevel}'.");
                continue;
            }

            try
            {
                book.AddEntry(e.ProductCode, care, e.MonthlyRentalMinor, e.ConnectionChargeMinor, e.MigrationChargeMinor, e.ModifyChargeMinor);
            }
            catch (Domain.Common.DomainException ex)
            {
                v.Add($"entries[{i}]", ex.Message);
            }
        }

        foreach (var tier in request.Tiers)
        {
            try
            {
                book.AddTier(tier.MinimumActiveLines, tier.DiscountBps);
            }
            catch (Domain.Common.DomainException ex)
            {
                v.Add("tiers", ex.Message);
            }
        }

        var products = await _catalogue.ListProductsAsync(includeWithdrawn: false, ct);
        foreach (var product in products)
        {
            foreach (var care in product.AvailableCareLevels)
            {
                v.Require(book.Find(product.Code, care) is not null, "entries", $"Missing price for {product.Code}/{care}.");
            }
        }

        v.ThrowIfInvalid();

        var current = existing.FirstOrDefault(b => b.IsEffectiveOn(request.EffectiveFrom.AddDays(-1)));
        current?.CloseOn(request.EffectiveFrom.AddDays(-1));

        await _catalogue.AddPriceBookAsync(book, ct);
        await _uow.SaveChangesAsync(ct);
        return ToDto(book);
    }

    internal static ProductDto ToDto(WholesaleProduct p) =>
        new(p.Code, p.Name, p.DownstreamMbps, p.UpstreamMbps, p.AvailableCareLevels.Select(c => c.ToString()).ToList(), p.IsActive);

    private static PriceBookDto ToDto(PriceBook b) => new(
        b.Version,
        b.EffectiveFrom,
        b.EffectiveTo,
        b.Currency,
        b.Entries.Select(e => new PriceBookEntryDto(e.ProductCode, e.CareLevel.ToString(), e.MonthlyRentalMinor,
            e.ConnectionChargeMinor, e.MigrationChargeMinor, e.ModifyChargeMinor)).ToList(),
        b.Tiers.Select(t => new VolumeTierDto(t.MinimumActiveLines, t.DiscountBps)).ToList());
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Catalogue/PricingService.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Catalogue/PricingService.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Catalogue;

public sealed record PriceQuote(
    string ProductCode,
    CareLevel CareLevel,
    string PriceBookVersion,
    Money ListMonthlyRental,
    int VolumeDiscountBps,
    Money MonthlyRental,
    Money OneOffCharge,
    string OneOffChargeType);

/// <summary>
/// Prices an order line from the price book effective on the requested date. The partner's
/// volume tier (by active line count) discounts the monthly rental only; one-off charges are
/// list price. Cease orders carry no charge.
/// </summary>
public sealed class PricingService
{
    private readonly ICatalogueRepository _catalogue;
    private readonly IServiceRepository _services;

    public PricingService(ICatalogueRepository catalogue, IServiceRepository services)
    {
        _catalogue = catalogue;
        _services = services;
    }

    public async Task<PriceQuote> QuoteAsync(Guid partnerId, OrderType type, string productCode, CareLevel careLevel, DateOnly onDate, CancellationToken ct)
    {
        var product = await _catalogue.GetProductAsync(productCode, ct)
            ?? throw new NotFoundException("Product", productCode);

        if (!product.IsActive && type != OrderType.Cease)
        {
            throw new ConflictException("product.withdrawn", $"Product {product.Code} has been withdrawn from sale.");
        }

        if (!product.SupportsCareLevel(careLevel))
        {
            throw new RequestValidationException("careLevel", $"{product.Code} is not offered with {careLevel} care.");
        }

        var book = await _catalogue.GetEffectivePriceBookAsync(onDate, ct)
            ?? throw new ConflictException("pricebook.none_effective", $"No price book is effective on {onDate:yyyy-MM-dd}.");

        var entry = book.Find(product.Code, careLevel)
            ?? throw new ConflictException("pricebook.unpriced", $"{product.Code}/{careLevel} is not priced in {book.Version}.");

        var activeLines = await _services.CountActiveAsync(partnerId, ct);
        return Calculate(book, entry, type, activeLines);
    }

    public static PriceQuote Calculate(PriceBook book, PriceBookEntry entry, OrderType type, int partnerActiveLines)
    {
        var list = new Money(entry.MonthlyRentalMinor, book.Currency);
        var discountBps = book.DiscountBpsFor(partnerActiveLines);
        var discounted = list.Subtract(list.PercentageOf(discountBps));

        var (oneOffMinor, label) = type switch
        {
            OrderType.Provide => (entry.ConnectionChargeMinor, "connection"),
            OrderType.Migrate => (entry.MigrationChargeMinor, "migration"),
            OrderType.Modify => (entry.ModifyChargeMinor, "modify"),
            OrderType.Cease => (0L, "none"),
            _ => throw new ArgumentOutOfRangeException(nameof(type), type, null),
        };

        return new PriceQuote(
            entry.ProductCode,
            entry.CareLevel,
            book.Version,
            list,
            discountBps,
            type == OrderType.Cease ? Money.Zero(book.Currency) : discounted,
            new Money(oneOffMinor, book.Currency),
            label);
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Common/ApplicationExceptions.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Common/ApplicationExceptions.cs`.

```csharp
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
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Common/Paging.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Common/Paging.cs`.

```csharp
namespace IConnect.Wholesale.Application.Common;

public sealed record PageRequest
{
    public const int DefaultPageSize = 25;
    public const int MaxPageSize = 200;

    public PageRequest(int page, int pageSize)
    {
        Page = page < 1 ? 1 : page;
        PageSize = pageSize switch
        {
            < 1 => DefaultPageSize,
            > MaxPageSize => MaxPageSize,
            _ => pageSize,
        };
    }

    public int Page { get; }

    public int PageSize { get; }

    public int Skip => (Page - 1) * PageSize;

    public static PageRequest Default => new(1, DefaultPageSize);
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total)
{
    public PagedResult<TOut> Map<TOut>(Func<T, TOut> map) => new(Items.Select(map).ToList(), Page, PageSize, Total);
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/DependencyInjection.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/DependencyInjection.cs`.

```csharp
using IConnect.Wholesale.Application.ApiKeys;
using IConnect.Wholesale.Application.Appointments;
using IConnect.Wholesale.Application.Availability;
using IConnect.Wholesale.Application.Billing;
using IConnect.Wholesale.Application.BulkOrders;
using IConnect.Wholesale.Application.Catalogue;
using IConnect.Wholesale.Application.Faults;
using IConnect.Wholesale.Application.Orders;
using IConnect.Wholesale.Application.Sla;
using IConnect.Wholesale.Domain.Sla;
using Microsoft.Extensions.DependencyInjection;

namespace IConnect.Wholesale.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddWholesaleApplication(this IServiceCollection services)
    {
        services.AddSingleton(SlaPolicy.Default());
        services.AddSingleton(ServiceCreditCalculator.Default());
        services.AddSingleton<StatementGenerator>();

        services.AddScoped<PricingService>();
        services.AddScoped<CatalogueService>();
        services.AddScoped<AvailabilityService>();
        services.AddScoped<OrderService>();
        services.AddScoped<BulkOrderService>();
        services.AddScoped<AppointmentService>();
        services.AddScoped<FaultService>();
        services.AddScoped<ApiKeyService>();
        services.AddScoped<BillingService>();
        services.AddScoped<SlaBreachMonitor>();
        services.AddScoped<SlaDashboardService>();
        return services;
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Faults/FaultService.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Faults/FaultService.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Sla;
using Microsoft.Extensions.Logging;

namespace IConnect.Wholesale.Application.Faults;

public sealed record RaiseFaultRequest(Guid ServiceId, string Priority, string Category, string Description);

public sealed record FaultNoteRequest(string Text);

public sealed record FaultTransitionRequest(string Action, string? Note, string? ResolutionCode);

public sealed record FaultSlaDto(string Status, double ElapsedWorkingHours, double TargetWorkingHours, DateTimeOffset? DueAt, string Calendar);

public sealed record FaultNoteDto(DateTimeOffset At, string Author, string Text);

public sealed record FaultSummaryDto(Guid Id, string Reference, string ServiceUprn, string Priority, string Status, string Category,
    string SlaStatus, DateTimeOffset? DueAt, DateTimeOffset CreatedAt);

public sealed record FaultDetailDto(Guid Id, string Reference, Guid ServiceId, string Uprn, string Priority, string Category, string CareLevel,
    string Status, string Description, FaultSlaDto Sla, DateTimeOffset? ResolvedAt, string? ResolutionCode, long? ServiceCreditMinor,
    string? ServiceCreditBasis, IReadOnlyList<string> AllowedActions, IReadOnlyList<FaultNoteDto> Notes, DateTimeOffset CreatedAt);

/// <summary>Fault raising and handling, including SLA clock control and credit assessment.</summary>
public sealed class FaultService
{
    private readonly IFaultRepository _faults;
    private readonly IServiceRepository _services;
    private readonly IReferenceGenerator _references;
    private readonly ICalendarProvider _calendars;
    private readonly SlaPolicy _policy;
    private readonly ServiceCreditCalculator _credits;
    private readonly ICurrentCaller _caller;
    private readonly IClock _clock;
    private readonly IUnitOfWork _uow;
    private readonly ILogger<FaultService> _logger;

    public FaultService(IFaultRepository faults, IServiceRepository services, IReferenceGenerator references, ICalendarProvider calendars,
        SlaPolicy policy, ServiceCreditCalculator credits, ICurrentCaller caller, IClock clock, IUnitOfWork uow, ILogger<FaultService> logger)
    {
        _faults = faults;
        _services = services;
        _references = references;
        _calendars = calendars;
        _policy = policy;
        _credits = credits;
        _caller = caller;
        _clock = clock;
        _uow = uow;
        _logger = logger;
    }

    public async Task<FaultDetailDto> RaiseAsync(RaiseFaultRequest request, CancellationToken ct)
    {
        var v = new ValidationBuilder();
        var priorityOk = Enum.TryParse<FaultPriority>(request.Priority, true, out var priority) && Enum.IsDefined(priority);
        var categoryOk = Enum.TryParse<FaultCategory>(request.Category?.Replace("_", string.Empty, StringComparison.Ordinal), true, out var category)
            && Enum.IsDefined(category);
        v.Require(priorityOk, "priority", "Priority must be P1, P2, P3 or P4.")
            .Require(categoryOk, "category", "Unknown fault category.")
            .Require(!string.IsNullOrWhiteSpace(request.Description) && request.Description.Trim().Length is >= 10 and <= 2000,
                "description", "Description must be 10 to 2000 characters.");
        v.ThrowIfInvalid();

        var service = await _services.GetAsync(request.ServiceId, ct);
        if (service is null || service.PartnerId != _caller.PartnerId)
        {
            throw new NotFoundException("Service", request.ServiceId);
        }

        if (!service.IsActive)
        {
            throw new ConflictException("fault.service_ceased", "Faults cannot be raised on a ceased service.");
        }

        if (await _faults.HasOpenFaultForServiceAsync(service.Id, ct))
        {
            throw new ConflictException("fault.already_open", "An open fault already exists for this service; add a note to it instead.");
        }

        var target = _policy.RepairTarget(service.CareLevel, priority);
        var calendar = _calendars.Get(target.Calendar);
        var reference = await _references.NextAsync("FLT", ct);
        var fault = Fault.Raise(reference, _caller.PartnerId, service.Id, service.Uprn, priority, category, service.CareLevel,
            request.Description, service.MonthlyRental, target, calendar.Name, _clock.UtcNow);

        await _faults.AddAsync(fault, ct);
        await _uow.SaveChangesAsync(ct);
        _logger.LogInformation("Fault {Reference} raised on service {ServiceId} at {Priority}/{Care}", reference, service.Id, fault.Priority, service.CareLevel);
        return ToDetail(fault);
    }

    public async Task<PagedResult<FaultSummaryDto>> ListAsync(FaultStatus? status, FaultPriority? priority, PageRequest page, CancellationToken ct)
    {
        var result = await _faults.QueryAsync(new FaultQuery(_caller.PartnerId, status, priority, page), ct);
        var now = _clock.UtcNow;
        return result.Map(f =>
        {
            var calendar = _calendars.GetByName(f.RepairClock.CalendarName);
            return new FaultSummaryDto(f.Id, f.Reference, f.Uprn, f.Priority.ToString(), Upper(f.Status), f.Category.ToString(),
                f.RepairClock.Status(calendar, now).ToString(), f.RepairClock.DueAt(calendar, now), f.CreatedAt);
        });
    }

    public async Task<FaultDetailDto> GetAsync(Guid id, CancellationToken ct) => ToDetail(await LoadOwnedAsync(id, ct));

    public async Task<FaultDetailDto> AddNoteAsync(Guid id, FaultNoteRequest request, CancellationToken ct)
    {
        var fault = await LoadOwnedAsync(id, ct);
        fault.AddNote(_clock.UtcNow, _caller.ActorId, request.Text, internalOnly: false);
        await _uow.SaveChangesAsync(ct);
        return ToDetail(fault);
    }

    /// <summary>
    /// Applies a lifecycle action. Partners may respond to a customer query, reopen a resolved
    /// fault or confirm closure; field actions (start, await-customer, resolve) are support only.
    /// </summary>
    public async Task<FaultDetailDto> TransitionAsync(Guid id, FaultTransitionRequest request, CancellationToken ct)
    {
        var fault = await LoadOwnedAsync(id, ct);
        var now = _clock.UtcNow;
        var actor = _caller.ActorId;
        var note = request.Note?.Trim() ?? string.Empty;

        switch (request.Action?.ToLowerInvariant())
        {
            case "respond":
                RequireNote(note);
                fault.CustomerResponded(now, actor, note);
                break;
            case "reopen":
                RequireNote(note);
                fault.Reopen(now, actor, note);
                break;
            case "close":
                fault.Close(now, actor);
                break;
            case "start":
                RequireSupport();
                fault.StartWork(now, actor);
                break;
            case "await-customer":
                RequireSupport();
                RequireNote(note);
                fault.AwaitCustomer(now, actor, note);
                break;
            case "resolve":
                RequireSupport();
                var calendar = _calendars.GetByName(fault.RepairClock.CalendarName);
                fault.Resolve(now, actor, request.ResolutionCode ?? string.Empty, calendar, _credits);
                break;
            default:
                throw new RequestValidationException("action", "Action must be one of respond, reopen, close, start, await-customer, resolve.");
        }

        await _uow.SaveChangesAsync(ct);
        return ToDetail(fault);
    }

    private async Task<Fault> LoadOwnedAsync(Guid id, CancellationToken ct)
    {
        var fault = await _faults.GetAsync(id, ct);
        if (fault is null || (!_caller.IsSupportAgent && fault.PartnerId != _caller.PartnerId))
        {
            throw new NotFoundException("Fault", id);
        }

        return fault;
    }

    private FaultDetailDto ToDetail(Fault f)
    {
        var now = _clock.UtcNow;
        var calendar = _calendars.GetByName(f.RepairClock.CalendarName);
        var clock = f.RepairClock;
        var sla = new FaultSlaDto(clock.Status(calendar, now).ToString(), Math.Round(clock.Elapsed(calendar, now).TotalHours, 2),
            clock.Target.TotalHours, clock.DueAt(calendar, now), calendar.Name);

        return new FaultDetailDto(f.Id, f.Reference, f.ServiceId, f.Uprn, f.Priority.ToString(), f.Category.ToString(), f.CareLevel.ToString(),
            Upper(f.Status), f.Description, sla, f.ResolvedAt, f.ResolutionCode, f.ServiceCredit?.MinorUnits, f.ServiceCreditBasis,
            AllowedActions(f), f.Notes.Where(n => !n.InternalOnly || _caller.IsSupportAgent).Select(n => new FaultNoteDto(n.At, n.Author, n.Text)).ToList(),
            f.CreatedAt);
    }

    private IReadOnlyList<string> AllowedActions(Fault f)
    {
        var actions = new List<string>();
        switch (f.Status)
        {
            case FaultStatus.PendingCustomer:
                actions.Add("respond");
                break;
            case FaultStatus.Resolved:
                actions.Add("close");
                if (f.ResolvedAt is { } at && _clock.UtcNow - at <= Fault.ReopenWindow)
                {
                    actions.Add("reopen");
                }

                break;
        }

        if (_caller.IsSupportAgent)
        {
            if (Fault.CanTransition(f.Status, FaultStatus.InProgress) && f.Status != FaultStatus.Resolved)
            {
                actions.Add("start");
            }

            if (Fault.CanTransition(f.Status, FaultStatus.PendingCustomer))
            {
                actions.Add("await-customer");
            }

            if (Fault.CanTransition(f.Status, FaultStatus.Resolved))
            {
                actions.Add("resolve");
            }
        }

        return actions;
    }

    private void RequireSupport()
    {
        if (!_caller.IsSupportAgent)
        {
            throw new ForbiddenException("Only support agents can perform this action.");
        }
    }

    private static void RequireNote(string note)
    {
        if (note.Length < 5)
        {
            throw new RequestValidationException("note", "A note of at least 5 characters is required for this action.");
        }
    }

    private static string Upper(FaultStatus status) => status switch
    {
        FaultStatus.InProgress => "IN_PROGRESS",
        FaultStatus.PendingCustomer => "PENDING_CUSTOMER",
        _ => status.ToString().ToUpperInvariant(),
    };
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/IConnect.Wholesale.Application.csproj

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: xml. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/IConnect.Wholesale.Application.csproj`.

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <RootNamespace>IConnect.Wholesale.Application</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="..\IConnect.Wholesale.Domain\IConnect.Wholesale.Domain.csproj" />
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.DependencyInjection.Abstractions" Version="8.0.1" />
    <PackageReference Include="Microsoft.Extensions.Logging.Abstractions" Version="8.0.1" />
    <PackageReference Include="Microsoft.Extensions.Options" Version="8.0.2" />
  </ItemGroup>
  <ItemGroup>
    <InternalsVisibleTo Include="IConnect.Wholesale.Tests" />
  </ItemGroup>
</Project>
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Orders/OrderContracts.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Orders/OrderContracts.cs`.

```csharp
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Orders;

public sealed record PlaceOrderRequest(
    string PartnerReference,
    string OrderType,
    string Uprn,
    string? ProductCode,
    string? CareLevel,
    Guid? ExistingServiceId,
    string? MigrationAuthCode,
    DateOnly RequestedDate);

public sealed record OrderSummaryDto(
    Guid Id,
    string Reference,
    string PartnerReference,
    string Type,
    string Status,
    string Uprn,
    string? ProductCode,
    DateOnly RequestedDate,
    DateOnly? CommittedDate,
    bool OnHold,
    string? SlaStatus,
    DateTimeOffset CreatedAt);

public sealed record OrderHistoryDto(string? From, string To, DateTimeOffset At, string Note, string? Actor);

public sealed record OrderSlaDto(string Status, double ElapsedWorkingHours, double TargetWorkingHours, DateTimeOffset? DueAt, int WorkingDaysLate);

public sealed record OrderDetailDto(
    Guid Id,
    string Reference,
    string PartnerReference,
    string Type,
    string Status,
    string Uprn,
    string? ProductCode,
    string CareLevel,
    Guid? ExistingServiceId,
    Guid? ResultingServiceId,
    DateOnly RequestedDate,
    DateOnly? CommittedDate,
    DateOnly? CompletedDate,
    Guid? AppointmentSlotId,
    long? MonthlyRentalMinor,
    long? OneOffChargeMinor,
    long? CancellationChargeMinor,
    string Currency,
    string? FailureReason,
    string? HoldReason,
    OrderSlaDto? Sla,
    IReadOnlyList<string> AllowedActions,
    IReadOnlyList<OrderHistoryDto> History);

public sealed record CancelOrderRequest(string Reason);

public sealed record HoldOrderRequest(string Reason);

public sealed record AmendOrderRequest(DateOnly RequestedDate);

public sealed record CompleteOrderRequest(DateOnly CompletedDate);

public sealed record RejectOrderRequest(string Reason);

/// <summary>Placement outcome; <see cref="Created"/> is false when an idempotent replay returned an existing order.</summary>
public sealed record PlaceOrderResult(OrderDetailDto Order, bool Created);

internal static class OrderMapping
{
    public static OrderSummaryDto ToSummary(Order o, WorkingCalendar calendar, DateTimeOffset now) => new(
        o.Id,
        o.Reference,
        o.PartnerReference,
        o.Type.ToString().ToUpperInvariant(),
        o.Status.ToString().ToUpperInvariant(),
        o.Uprn,
        o.ProductCode,
        o.RequestedDate,
        o.CommittedDate,
        o.IsOnHold,
        o.DeliveryClock?.Status(calendar, now).ToString(),
        o.CreatedAt);

    public static OrderDetailDto ToDetail(Order o, WorkingCalendar calendar, DateTimeOffset now, bool isSupport)
    {
        OrderSlaDto? sla = null;
        if (o.DeliveryClock is { } clock)
        {
            sla = new OrderSlaDto(
                clock.Status(calendar, now).ToString(),
                Math.Round(clock.Elapsed(calendar, now).TotalHours, 2),
                Math.Round(clock.Target.TotalHours, 2),
                clock.DueAt(calendar, now),
                o.WorkingDaysLate(calendar));
        }

        return new OrderDetailDto(
            o.Id,
            o.Reference,
            o.PartnerReference,
            o.Type.ToString().ToUpperInvariant(),
            o.Status.ToString().ToUpperInvariant(),
            o.Uprn,
            o.ProductCode,
            o.CareLevel.ToString(),
            o.ExistingServiceId,
            o.ResultingServiceId,
            o.RequestedDate,
            o.CommittedDate,
            o.CompletedDate,
            o.AppointmentSlotId,
            o.MonthlyRental?.MinorUnits,
            o.OneOffCharge?.MinorUnits,
            o.CancellationCharge?.MinorUnits,
            o.MonthlyRental?.Currency ?? "GBP",
            o.FailureReason,
            o.HoldReason,
            sla,
            AllowedActions(o, isSupport),
            o.History.Select(h => new OrderHistoryDto(h.From?.ToString().ToUpperInvariant(), h.To.ToString().ToUpperInvariant(), h.At, h.Note, h.Actor)).ToList());
    }

    /// <summary>Actions the UI may offer for this order and caller; the server re-checks on execution.</summary>
    public static IReadOnlyList<string> AllowedActions(Order o, bool isSupport)
    {
        var actions = new List<string>();
        if (OrderStateMachine.CanTransition(o.Status, OrderStatus.Cancelled))
        {
            actions.Add("cancel");
        }

        if (OrderStateMachine.IsAmendable(o.Status) && o.Status != OrderStatus.Draft)
        {
            actions.Add("amend");
            actions.Add("book-appointment");
        }

        if (!isSupport)
        {
            return actions;
        }

        if (o.Status is OrderStatus.Validated or OrderStatus.Provisioning)
        {
            actions.Add(o.IsOnHold ? "release-hold" : "hold");
        }

        if (o.Status == OrderStatus.Validated)
        {
            actions.Add("start-provisioning");
        }

        if (o.Status == OrderStatus.Provisioning && !o.IsOnHold)
        {
            actions.Add("complete");
        }

        if (OrderStateMachine.CanTransition(o.Status, OrderStatus.Failed))
        {
            actions.Add("reject");
        }

        return actions;
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Orders/OrderRequestValidator.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application/Orders/OrderRequestValidator.cs`.

```csharp
using System.Text.RegularExpressions;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Orders;

/// <summary>A syntactically valid order request with enums parsed and identifiers normalised.</summary>
public sealed record ValidatedOrderRequest(
    string PartnerReference,
    OrderType Type,
    string Uprn,
    string? ProductCode,
    CareLevel CareLevel,
    Guid? ExistingServiceId,
    string? MigrationAuthCode,
    DateOnly RequestedDate);

public sealed record FieldError(string Field, string Code, string Message);

/// <summary>
/// Stateless boundary validation of a single order request, shared by the REST endpoint and the
/// bulk CSV upload so that both paths enforce identical rules.
/// </summary>
public static partial class OrderRequestValidator
{
    public const int MaxRequestedDateHorizonDays = 180;

    public static (ValidatedOrderRequest? Request, IReadOnlyList<FieldError> Errors) Validate(PlaceOrderRequest request, DateOnly today)
    {
        var errors = new List<FieldError>();

        var partnerRef = request.PartnerReference?.Trim() ?? string.Empty;
        if (partnerRef.Length == 0)
        {
            errors.Add(new("partnerReference", "required", "Partner reference is required."));
        }
        else if (!PartnerReferencePattern().IsMatch(partnerRef))
        {
            errors.Add(new("partnerReference", "format", "Partner reference must be 1-40 letters, digits, '-', '_' or '/'."));
        }

        if (!Enum.TryParse<OrderType>(request.OrderType, ignoreCase: true, out var type) || !Enum.IsDefined(type))
        {
            errors.Add(new("orderType", "unknown", "Order type must be one of PROVIDE, CEASE, MODIFY, MIGRATE."));
        }

        string? uprn = null;
        if (!Uprns.IsValid(request.Uprn))
        {
            errors.Add(new("uprn", "format", "UPRN must be 1 to 12 digits."));
        }
        else
        {
            uprn = Uprns.Normalise(request.Uprn);
        }

        var care = CareLevel.Standard;
        if (!string.IsNullOrWhiteSpace(request.CareLevel) && (!Enum.TryParse(request.CareLevel, true, out care) || !Enum.IsDefined(care)))
        {
            errors.Add(new("careLevel", "unknown", "Care level must be STANDARD, ENHANCED or PREMIUM."));
        }

        var productCode = string.IsNullOrWhiteSpace(request.ProductCode) ? null : request.ProductCode.Trim().ToUpperInvariant();
        var authCode = string.IsNullOrWhiteSpace(request.MigrationAuthCode) ? null : request.MigrationAuthCode.Trim().ToUpperInvariant();

        if (errors.All(e => e.Field != "orderType"))
        {
            ValidateTypeSpecific(type, productCode, request.ExistingServiceId, authCode, errors);
        }

        if (request.RequestedDate < today.AddDays(1))
        {
            errors.Add(new("requestedDate", "past", "Requested date must be after today."));
        }
        else if (request.RequestedDate > today.AddDays(MaxRequestedDateHorizonDays))
        {
            errors.Add(new("requestedDate", "too_far", $"Requested date must be within {MaxRequestedDateHorizonDays} days."));
        }

        if (errors.Count > 0)
        {
            return (null, errors);
        }

        return (new ValidatedOrderRequest(partnerRef, type, uprn!, productCode, care, request.ExistingServiceId, authCode, request.RequestedDate), errors);
    }

    private static void ValidateTypeSpecific(OrderType type, string? productCode, Guid? serviceId, string? authCode, List<FieldError> errors)
    {
        var needsProduct = type is OrderType.Provide or OrderType.Modify or OrderType.Migrate;
        if (needsProduct && productCode is null)
        {
            errors.Add(new("productCode", "required", $"{type} orders require a product code."));
        }

        if (type == OrderType.Cease && productCode is not null)
        {
            errors.Add(new("productCode", "not_allowed", "Cease orders must not specify a product."));
        }

        var needsService = type is OrderType.Cease or OrderType.Modify;
        if (needsService && serviceId is null)
        {
            errors.Add(new("existingServiceId", "required", $"{type} orders require the existing service id."));
        }

        if (!needsService && serviceId is not null)
        {
            errors.Add(new("existingServiceId", "not_allowed", $"{type} orders must not reference an existing service."));
        }

        if (type == OrderType.Migrate)
        {
            if (authCode is null)
            {
                errors.Add(new("migrationAuthCode", "required", "Migrate orders require the switching code from the losing provider."));
            }
            else if (!SwitchingCodePattern().IsMatch(authCode))
            {
                errors.Add(new("migrationAuthCode", "format", "Switching code must be 3 letters followed by 6 digits (e.g. ABC123456)."));
            }
        }
        else if (authCode is not null)
        {
            errors.Add(new("migrationAuthCode", "not_allowed", "Only migrate orders take a switching code."));
        }
    }

    [GeneratedRegex("^[A-Za-z0-9_/-]{1,40}$")]
    private static partial Regex PartnerReferencePattern();

    [GeneratedRegex("^[A-Z]{3}[0-9]{6}$")]
    private static partial Regex SwitchingCodePattern();
}
```
