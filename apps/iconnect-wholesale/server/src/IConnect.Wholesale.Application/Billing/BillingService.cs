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
