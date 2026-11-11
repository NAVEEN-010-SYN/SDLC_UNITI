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
        if (content.Length > 0 && content[0] == '\uFEFF')
        {
            content = content[1..];
        }

        var parser = new Parser(content);
        return parser.Run();
    }

    /// <summary>Character-by-character state machine; one instance per Parse call.</summary>
    private sealed class Parser
    {
        private readonly string _content;
        private readonly List<CsvRecord> _records = new();
        private readonly StringBuilder _field = new();
        private List<string> _fields = new();
        private bool _inQuotes;
        private bool _fieldWasQuoted;
        private int _line = 1;
        private int _recordStartLine = 1;

        public Parser(string content)
        {
            _content = content;
        }

        public List<CsvRecord> Run()
        {
            for (var i = 0; i < _content.Length; i++)
            {
                if (_inQuotes)
                {
                    i = ReadQuotedChar(i);
                }
                else
                {
                    ReadUnquotedChar(_content[i]);
                }
            }

            if (_inQuotes)
            {
                throw new CsvFormatException(_recordStartLine, "Unterminated quoted field.");
            }

            if (_field.Length > 0 || _fields.Count > 0 || _fieldWasQuoted)
            {
                _fields.Add(_field.ToString());
                AddRecord();
            }

            return _records;
        }

        /// <summary>Handles one character inside quotes; returns the index of the last character consumed.</summary>
        private int ReadQuotedChar(int i)
        {
            var c = _content[i];
            if (c != '"')
            {
                if (c == '\n')
                {
                    _line++;
                }

                _field.Append(c);
                return i;
            }

            // A doubled quote is an escaped quote; a single quote closes the field.
            var nextIsQuote = i + 1 < _content.Length && _content[i + 1] == '"';
            if (nextIsQuote)
            {
                _field.Append('"');
                return i + 1;
            }

            _inQuotes = false;
            return i;
        }

        private void ReadUnquotedChar(char c)
        {
            if (c == '"')
            {
                if (_field.Length > 0 || _fieldWasQuoted)
                {
                    throw new CsvFormatException(_line, "Unexpected quote inside an unquoted field.");
                }

                _inQuotes = true;
                _fieldWasQuoted = true;
                return;
            }

            if (c == ',')
            {
                _fields.Add(_field.ToString());
                _field.Clear();
                _fieldWasQuoted = false;
                return;
            }

            if (c == '\r')
            {
                return;
            }

            if (c == '\n')
            {
                EndRecord();
                return;
            }

            if (_fieldWasQuoted)
            {
                throw new CsvFormatException(_line, "Characters after closing quote.");
            }

            _field.Append(c);
        }

        private void EndRecord()
        {
            _fields.Add(_field.ToString());
            AddRecord();
            _fields = new List<string>();
            _field.Clear();
            _fieldWasQuoted = false;
            _line++;
            _recordStartLine = _line;
        }

        private void AddRecord()
        {
            // Skip completely blank lines (common at the end of spreadsheet exports).
            if (_fields.Count == 1 && _fields[0].Length == 0)
            {
                return;
            }

            _records.Add(new CsvRecord(_recordStartLine, _fields));
        }
    }
}
