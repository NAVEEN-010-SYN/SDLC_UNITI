using IConnect.Wholesale.Application.BulkOrders;
using IConnect.Wholesale.Domain.Orders;

namespace IConnect.Wholesale.Tests.Application;

public sealed class CsvReaderTests
{
    [Fact]
    public void Quoted_fields_may_contain_commas_quotes_and_newlines()
    {
        var records = CsvReader.Parse("a,b\n\"x, y\",\"say \"\"hi\"\"\nthere\"\nlast,row\n");

        Assert.Equal(3, records.Count);
        Assert.Equal(new[] { "x, y", "say \"hi\"\nthere" }, records[1].Fields);
        Assert.Equal(2, records[1].LineNumber);
        Assert.Equal(4, records[2].LineNumber);
    }

    [Fact]
    public void Byte_order_mark_crlf_and_blank_lines_are_tolerated()
    {
        var records = CsvReader.Parse("﻿a,b\r\n\r\n1,2\r\n");
        Assert.Equal(2, records.Count);
        Assert.Equal("a", records[0].Fields[0]);
        Assert.Equal(3, records[1].LineNumber);
    }

    [Fact]
    public void Unterminated_quote_reports_the_starting_line()
    {
        var ex = Assert.Throws<CsvReader.CsvFormatException>(() => CsvReader.Parse("a,b\n1,\"open\n2,3\n"));
        Assert.Equal(2, ex.LineNumber);
    }

    [Fact]
    public void Text_after_a_closing_quote_is_malformed() =>
        Assert.Throws<CsvReader.CsvFormatException>(() => CsvReader.Parse("\"a\"b,c\n"));
}

public sealed class BulkOrderCsvParserTests
{
    private static readonly DateOnly Today = new(2024, 1, 8);
    private const string Header = "partner_reference,order_type,uprn,product_code,care_level,requested_date,existing_service_id,migration_auth_code";

    private static BulkParseResult Parse(params string[] rows) =>
        BulkOrderCsvParser.Parse(string.Join("\n", new[] { Header }.Concat(rows)) + "\n", Today);

    [Fact]
    public void Valid_rows_become_validated_requests()
    {
        var serviceId = Guid.NewGuid();
        var result = Parse(
            "REF-1,provide,0012345678,fttp500,enhanced,2024-02-01,,",
            $"REF-2,CEASE,200012345678,,,2024-02-02,{serviceId},");

        Assert.True(result.IsValid);
        Assert.Equal(2, result.DataRowCount);
        var provide = result.Rows[0].Request;
        Assert.Equal(OrderType.Provide, provide.Type);
        Assert.Equal("12345678", provide.Uprn);
        Assert.Equal("FTTP500", provide.ProductCode);
        Assert.Equal(serviceId, result.Rows[1].Request.ExistingServiceId);
    }

    [Fact]
    public void Header_is_case_insensitive_and_order_independent()
    {
        var result = BulkOrderCsvParser.Parse("Requested Date,UPRN,Order_Type,Partner_Reference,Product_Code\n2024-02-01,12345,PROVIDE,R1,FTTP100\n", Today);
        Assert.True(result.IsValid);
    }

    [Fact]
    public void Unknown_and_missing_columns_are_reported_against_the_header()
    {
        var result = BulkOrderCsvParser.Parse("partner_reference,order_type,uprn,requsted_date\nR1,PROVIDE,1,2024-02-01\n", Today);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Code == "unknown_column" && e.Row == 1);
        Assert.Contains(result.Errors, e => e.Code == "missing_column" && e.Column == "requested_date");
        Assert.Empty(result.Rows);
    }

    [Fact]
    public void Field_errors_are_mapped_to_csv_columns_and_lines()
    {
        var result = Parse("REF-1,PROVIDE,abc,,STANDARD,2024-02-01,,");

        Assert.Contains(result.Errors, e => e.Row == 2 && e.Column == "uprn" && e.Code == "format");
        Assert.Contains(result.Errors, e => e.Row == 2 && e.Column == "product_code" && e.Code == "required");
    }

    [Fact]
    public void Unparseable_date_is_reported_once()
    {
        var result = Parse("REF-1,PROVIDE,12345,FTTP500,,01/02/2024,,");
        var dateErrors = result.Errors.Where(e => e.Column == "requested_date").ToList();

        Assert.Single(dateErrors);
        Assert.Equal("format", dateErrors[0].Code);
    }

    [Fact]
    public void Duplicate_references_and_premises_within_a_file_are_rejected()
    {
        var result = Parse(
            "REF-1,PROVIDE,12345,FTTP500,,2024-02-01,,",
            "ref-1,PROVIDE,67890,FTTP500,,2024-02-01,,",
            "REF-3,PROVIDE,12345,FTTP500,,2024-02-01,,");

        Assert.Contains(result.Errors, e => e.Row == 3 && e.Column == "partner_reference" && e.Code == "duplicate_in_file");
        Assert.Contains(result.Errors, e => e.Row == 4 && e.Column == "uprn" && e.Code == "duplicate_in_file");
        Assert.Single(result.Rows);
    }

    [Fact]
    public void Ragged_rows_are_rejected() =>
        Assert.Contains(Parse("REF-1,PROVIDE,12345").Errors, e => e.Code == "column_count" && e.Row == 2);

    [Fact]
    public void Header_only_file_has_no_rows() =>
        Assert.Contains(Parse().Errors, e => e.Code == "no_rows");

    [Fact]
    public void Oversized_files_are_rejected_without_row_validation()
    {
        var rows = Enumerable.Range(1, BulkUpload.MaxRows + 1).Select(i => $"R{i},PROVIDE,{i},FTTP500,,2024-02-01,,").ToArray();
        var result = Parse(rows);

        var error = Assert.Single(result.Errors);
        Assert.Equal("too_many_rows", error.Code);
        Assert.Equal(BulkUpload.MaxRows + 2, error.Row);
    }

    [Fact]
    public void Malformed_csv_is_a_single_file_level_error()
    {
        var result = BulkOrderCsvParser.Parse(Header + "\n\"REF-1,PROVIDE\n", Today);
        Assert.Equal("csv_format", Assert.Single(result.Errors).Code);
    }

    [Fact]
    public void Template_header_parses_cleanly()
    {
        var header = CsvReader.Parse(BulkOrderCsvParser.Template()).Single();
        var expected = BulkOrderCsvParser.RequiredColumns.Concat(BulkOrderCsvParser.OptionalColumns).Order(StringComparer.Ordinal);
        Assert.Equal(expected, header.Fields.Order(StringComparer.Ordinal));
    }
}
