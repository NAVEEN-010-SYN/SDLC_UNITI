using System.Globalization;
using IConnect.Wholesale.Application.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace IConnect.Wholesale.Infrastructure.Persistence;

/// <summary>
/// Issues references such as ORD-00001234 from PostgreSQL sequences. Sequences are gap-tolerant
/// and never reused, so a rolled-back transaction cannot cause two orders to share a reference.
/// Only whitelisted prefixes are accepted because the sequence name is interpolated into SQL.
/// </summary>
internal sealed class SequenceReferenceGenerator : IReferenceGenerator
{
    private readonly WholesaleDbContext _db;

    public SequenceReferenceGenerator(WholesaleDbContext db)
    {
        _db = db;
    }

    public async Task<string> NextAsync(string prefix, CancellationToken ct)
    {
        if (!ReferenceSequences.All.TryGetValue(prefix, out var sequence))
        {
            throw new ArgumentOutOfRangeException(nameof(prefix), prefix, "Unknown reference prefix.");
        }

#pragma warning disable EF1002 // Sequence name comes from a fixed whitelist, never from user input.
        var value = await _db.Database
            .SqlQueryRaw<long>($"SELECT nextval('wholesale.{sequence}') AS \"Value\"")
            .SingleAsync(ct);
#pragma warning restore EF1002

        return Format(prefix, value);
    }

    internal static string Format(string prefix, long value) =>
        prefix + "-" + value.ToString("D8", CultureInfo.InvariantCulture);
}
