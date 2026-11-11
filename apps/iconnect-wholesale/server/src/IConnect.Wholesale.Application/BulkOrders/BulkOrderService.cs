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
        var text = DecodeCsvFile(fileName, content);

        var now = _clock.UtcNow;
        var today = _calendars.Get(Domain.Sla.CalendarKind.BusinessHours).LocalDate(now);
        var parse = BulkOrderCsvParser.Parse(text, today);
        var errors = parse.Errors.ToList();
        await AddUsedReferenceErrorsAsync(parse.Rows, errors, ct);

        if (dryRun)
        {
            return new BulkUploadResultDto(null, fileName, errors.Count == 0 ? "VALID" : "INVALID", parse.DataRowCount,
                CountRowsWithoutErrors(parse.Rows, errors), 0, 0, SortErrors(errors), Array.Empty<BulkOrderOutcomeDto>());
        }

        var hash = Convert.ToHexString(SHA256.HashData(content));
        var previous = await _uploads.GetByHashAsync(_caller.PartnerId, hash, ct);
        if (previous is not null && previous.Status == BulkUploadStatus.Submitted)
        {
            throw new ConflictException("bulk.duplicate_file", $"This file was already submitted on {previous.CreatedAt:yyyy-MM-dd HH:mm} UTC.");
        }

        var upload = new BulkUpload(_caller.PartnerId, fileName, hash, parse.DataRowCount, errors, now, _caller.ActorId);
        await _uploads.AddAsync(upload, ct);

        var outcomes = new List<BulkOrderOutcomeDto>();
        if (upload.Status == BulkUploadStatus.Validated)
        {
            outcomes = await CreateOrdersAsync(upload, parse.Rows, now, ct);
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

    /// <summary>Checks size, extension and UTF-8 encoding, and returns the file text.</summary>
    private static string DecodeCsvFile(string fileName, byte[] content)
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

        return text;
    }

    /// <summary>Rejects rows whose partner reference is already used by an existing order.</summary>
    private async Task AddUsedReferenceErrorsAsync(IReadOnlyList<ParsedBulkRow> rows, List<BulkRowError> errors, CancellationToken ct)
    {
        foreach (var row in rows)
        {
            var existing = await _orders.GetByPartnerReferenceAsync(_caller.PartnerId, row.Request.PartnerReference, ct);
            if (existing is not null)
            {
                errors.Add(new BulkRowError(row.Line, "partner_reference", "already_used", $"Partner reference already used by order {existing.Reference}."));
            }
        }
    }

    private static int CountRowsWithoutErrors(IReadOnlyList<ParsedBulkRow> rows, List<BulkRowError> errors)
    {
        var linesWithErrors = new HashSet<int>();
        foreach (var e in errors)
        {
            linesWithErrors.Add(e.Row);
        }

        var count = 0;
        foreach (var r in rows)
        {
            if (!linesWithErrors.Contains(r.Line))
            {
                count++;
            }
        }

        return count;
    }

    private async Task<List<BulkOrderOutcomeDto>> CreateOrdersAsync(BulkUpload upload, IReadOnlyList<ParsedBulkRow> rows, DateTimeOffset now,
        CancellationToken ct)
    {
        var outcomes = new List<BulkOrderOutcomeDto>();
        var created = new List<Order>();
        foreach (var row in rows)
        {
            var order = await _orderService.CreateAndValidateAsync(row.Request, upload.Id, ct);
            created.Add(order);
            outcomes.Add(new BulkOrderOutcomeDto(row.Line, order.PartnerReference, order.Reference,
                order.Status.ToString().ToUpperInvariant(), order.FailureReason));
        }

        await _orders.AddRangeAsync(created, ct);
        upload.MarkSubmitted(created.Count, now);
        return outcomes;
    }

    private static IReadOnlyList<BulkRowError> SortErrors(IEnumerable<BulkRowError> errors) =>
        errors.OrderBy(e => e.Row).ThenBy(e => e.Column, StringComparer.Ordinal).ToList();
}
