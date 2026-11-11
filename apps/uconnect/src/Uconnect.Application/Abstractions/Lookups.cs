namespace Uconnect.Application.Abstractions;

/// <summary>Resolves invoice numbers for display without loading whole invoice aggregates.</summary>
public interface IInvoiceNumberLookup
{
    Task<IReadOnlyDictionary<Guid, string>> GetNumbersAsync(IReadOnlyCollection<Guid> invoiceIds, CancellationToken ct);
}
