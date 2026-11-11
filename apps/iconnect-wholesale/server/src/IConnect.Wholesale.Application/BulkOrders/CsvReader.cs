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
