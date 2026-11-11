using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using IConnect.Wholesale.Application.Common;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Http;

/// <summary>Writes every instant as ISO-8601 UTC ("2024-05-01T09:30:00.000Z") regardless of the stored offset.</summary>
public sealed class UtcDateTimeOffsetConverter : JsonConverter<DateTimeOffset>
{
    public const string Format = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";

    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var text = reader.GetString();
        if (text is null || !DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var value))
        {
            throw new JsonException("Expected an ISO-8601 timestamp.");
        }

        return value.ToUniversalTime();
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.UtcDateTime.ToString(Format, CultureInfo.InvariantCulture));
}

/// <summary>Standard <c>?page=&amp;pageSize=</c> query binding; out-of-range values are clamped by <see cref="PageRequest"/>.</summary>
public sealed class PageQuery
{
    [FromQuery(Name = "page")]
    public int Page { get; init; } = 1;

    [FromQuery(Name = "pageSize")]
    public int PageSize { get; init; } = PageRequest.DefaultPageSize;

    public PageRequest ToRequest() => new(Page, PageSize);
}

public static class QueryParsing
{
    /// <summary>
    /// Parses an optional enum filter from its wire form ("IN_PROGRESS", "in-progress", "InProgress").
    /// Unknown values are a 400 rather than being silently ignored.
    /// </summary>
    public static TEnum? OptionalEnum<TEnum>(string? value, string field)
        where TEnum : struct, Enum
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var compact = value.Replace("_", string.Empty, StringComparison.Ordinal).Replace("-", string.Empty, StringComparison.Ordinal);
        if (Enum.TryParse<TEnum>(compact, ignoreCase: true, out var parsed) && Enum.IsDefined(parsed) && !int.TryParse(compact, out _))
        {
            return parsed;
        }

        var allowed = string.Join(", ", Enum.GetNames<TEnum>().Select(n => n.ToUpperInvariant()));
        throw new RequestValidationException(field, $"'{value}' is not valid. Allowed: {allowed}.");
    }

    public static void EnsureRange(DateOnly? from, DateOnly? to, string fromField = "from")
    {
        if (from.HasValue && to.HasValue && to.Value < from.Value)
        {
            throw new RequestValidationException(fromField, "The start of the range must not be after its end.");
        }
    }
}
