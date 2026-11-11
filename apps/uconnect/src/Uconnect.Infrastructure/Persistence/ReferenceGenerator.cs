using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Uconnect.Application.Common;

namespace Uconnect.Infrastructure.Persistence;

/// <summary>SQL Server sequences backing customer-visible references.</summary>
internal static class ReferenceSequences
{
    public const string Ticket = "ticket_reference_seq";
    public const string Appointment = "appointment_reference_seq";
    public const string Outage = "outage_reference_seq";
    public const string Service = "service_reference_seq";
    public const string Invoice = "invoice_number_seq";

    public static readonly IReadOnlyList<string> All = new[] { Ticket, Appointment, Outage, Service, Invoice };
}

/// <summary>
/// Allocates references from database sequences, so they are unique across all API instances without
/// locking. Gaps (from rolled-back transactions) are acceptable; duplicates are not.
/// </summary>
internal sealed class ReferenceGenerator : IReferenceGenerator
{
    private readonly UconnectDbContext _db;

    public ReferenceGenerator(UconnectDbContext db) => _db = db;

    public async Task<string> NextAsync(ReferenceKind kind, CancellationToken cancellationToken = default)
    {
        string sequence;
        string prefix;
        int digits = 6;
        switch (kind)
        {
            case ReferenceKind.Ticket:
                sequence = ReferenceSequences.Ticket;
                prefix = "TKT";
                break;
            case ReferenceKind.Appointment:
                sequence = ReferenceSequences.Appointment;
                prefix = "APT";
                break;
            case ReferenceKind.Outage:
                sequence = ReferenceSequences.Outage;
                prefix = "OUT";
                break;
            case ReferenceKind.Service:
                sequence = ReferenceSequences.Service;
                prefix = "SVC";
                digits = 8;
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(kind), kind, "Unknown reference kind.");
        }

        var value = await NextValueAsync(sequence, cancellationToken);
        return string.Create(CultureInfo.InvariantCulture, $"{prefix}-{value.ToString(new string('0', digits), CultureInfo.InvariantCulture)}");
    }

    public async Task<string> NextInvoiceNumberAsync(DateOnly periodStart, CancellationToken cancellationToken = default)
    {
        var value = await NextValueAsync(ReferenceSequences.Invoice, cancellationToken);
        return string.Create(CultureInfo.InvariantCulture, $"INV-{periodStart:yyyyMM}-{value:000000}");
    }

    private async Task<long> NextValueAsync(string sequence, CancellationToken ct)
    {
        // NEXT VALUE FOR cannot appear in a derived table, so the query is materialised without composition.
#pragma warning disable EF1002 // Sequence names are compile-time constants, not user input.
        var values = await _db.Database
            .SqlQueryRaw<long>($"SELECT NEXT VALUE FOR [{UconnectDbContext.Schema}].[{sequence}] AS [Value]")
            .ToListAsync(ct);
#pragma warning restore EF1002
        return values.Single();
    }
}
