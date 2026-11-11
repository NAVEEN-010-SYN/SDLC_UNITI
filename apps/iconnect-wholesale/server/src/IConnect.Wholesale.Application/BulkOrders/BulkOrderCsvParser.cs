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
