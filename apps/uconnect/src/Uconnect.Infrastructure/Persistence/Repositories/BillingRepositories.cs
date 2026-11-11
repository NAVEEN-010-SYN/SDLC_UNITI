using Microsoft.EntityFrameworkCore;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;
using Uconnect.Domain.Usage;

namespace Uconnect.Infrastructure.Persistence.Repositories;

internal static class QueryablePaging
{
    public static async Task<PagedResult<T>> ToPagedResultAsync<T>(this IQueryable<T> query, PageRequest page, CancellationToken ct)
    {
        var total = await query.CountAsync(ct);
        if (total == 0)
        {
            return PagedResult<T>.Empty(page);
        }

        var items = await query.Skip(page.Skip).Take(page.PageSize).ToListAsync(ct);
        return new PagedResult<T>(items, page.Page, page.PageSize, total);
    }
}

internal sealed class InvoiceRepository : IInvoiceRepository, IInvoiceNumberLookup
{
    private static readonly InvoiceStatus[] PayableStatuses = { InvoiceStatus.Issued, InvoiceStatus.PartiallyPaid, InvoiceStatus.Overdue };

    private readonly UconnectDbContext _db;

    public InvoiceRepository(UconnectDbContext db) => _db = db;

    public Task<Invoice?> GetByIdAsync(Guid id, CancellationToken ct) => _db.Invoices.FirstOrDefaultAsync(i => i.Id == id, ct);

    public Task<Invoice?> GetByNumberAsync(Guid accountId, string invoiceNumber, CancellationToken ct) =>
        _db.Invoices.FirstOrDefaultAsync(i => i.AccountId == accountId && i.InvoiceNumber == invoiceNumber, ct);

    /// <summary>Without a status filter, drafts are excluded: they are the billing run's work in progress.</summary>
    public Task<PagedResult<Invoice>> ListByAccountAsync(Guid accountId, InvoiceStatus? status, PageRequest page, CancellationToken ct)
    {
        var query = _db.Invoices.AsNoTracking().IgnoreAutoIncludes().Where(i => i.AccountId == accountId);
        query = status is { } s ? query.Where(i => i.Status == s) : query.Where(i => i.Status != InvoiceStatus.Draft);
        return query.OrderByDescending(i => i.PeriodStart).ToPagedResultAsync(page, ct);
    }

    public async Task<IReadOnlyList<Invoice>> ListPayableAsync(Guid accountId, CancellationToken ct) =>
        await _db.Invoices
            .Where(i => i.AccountId == accountId && PayableStatuses.Contains(i.Status))
            .OrderBy(i => i.DueOn)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Invoice>> ListPayableDueByAsync(DateOnly dueOnOrBefore, CancellationToken ct) =>
        await _db.Invoices
            .Where(i => PayableStatuses.Contains(i.Status) && i.DueOn <= dueOnOrBefore)
            .OrderBy(i => i.DueOn)
            .ToListAsync(ct);

    public Task<Invoice?> GetLatestIssuedAsync(Guid accountId, CancellationToken ct) =>
        _db.Invoices
            .Where(i => i.AccountId == accountId && i.Status != InvoiceStatus.Draft && i.Status != InvoiceStatus.Void)
            .OrderByDescending(i => i.PeriodStart)
            .FirstOrDefaultAsync(ct);

    public Task<bool> ExistsForPeriodAsync(Guid accountId, DateOnly periodStart, CancellationToken ct) =>
        _db.Invoices.AnyAsync(i => i.AccountId == accountId && i.PeriodStart == periodStart && i.Status != InvoiceStatus.Void, ct);

    public void Add(Invoice invoice) => _db.Invoices.Add(invoice);

    public async Task<IReadOnlyDictionary<Guid, string>> GetNumbersAsync(IReadOnlyCollection<Guid> invoiceIds, CancellationToken ct)
    {
        if (invoiceIds.Count == 0)
        {
            return new Dictionary<Guid, string>();
        }

        return await _db.Invoices.AsNoTracking().IgnoreAutoIncludes()
            .Where(i => invoiceIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.InvoiceNumber, ct);
    }
}

internal sealed class AdjustmentRepository : IAdjustmentRepository
{
    private readonly UconnectDbContext _db;

    public AdjustmentRepository(UconnectDbContext db) => _db = db;

    public async Task<IReadOnlyList<AccountAdjustment>> ListUnbilledAsync(Guid accountId, CancellationToken ct) =>
        await _db.Adjustments.Where(a => a.AccountId == accountId && a.BilledOnInvoiceId == null).ToListAsync(ct);

    public async Task<IReadOnlyList<AccountAdjustment>> ListByAccountAsync(Guid accountId, int take, CancellationToken ct) =>
        await _db.Adjustments.AsNoTracking()
            .Where(a => a.AccountId == accountId)
            .OrderByDescending(a => a.RaisedAt)
            .Take(take)
            .ToListAsync(ct);

    public async Task<bool> ExistsForSourceAsync(Guid accountId, Guid? serviceId, string sourceReference, CancellationToken ct) =>
        _db.Adjustments.Local.Any(a => a.AccountId == accountId && a.ServiceId == serviceId && a.SourceReference == sourceReference)
        || await _db.Adjustments.AnyAsync(a => a.AccountId == accountId && a.ServiceId == serviceId && a.SourceReference == sourceReference, ct);

    public void Add(AccountAdjustment adjustment) => _db.Adjustments.Add(adjustment);
}

internal sealed class PaymentRepository : IPaymentRepository
{
    private readonly UconnectDbContext _db;

    public PaymentRepository(UconnectDbContext db) => _db = db;

    public Task<Payment?> GetByIdAsync(Guid id, CancellationToken ct) => _db.Payments.FirstOrDefaultAsync(p => p.Id == id, ct);

    public Task<Payment?> FindByIdempotencyKeyAsync(Guid accountId, string idempotencyKey, CancellationToken ct) =>
        _db.Payments.FirstOrDefaultAsync(p => p.AccountId == accountId && p.IdempotencyKey == idempotencyKey, ct);

    public Task<PagedResult<Payment>> ListByAccountAsync(Guid accountId, PageRequest page, CancellationToken ct) =>
        _db.Payments.AsNoTracking().Where(p => p.AccountId == accountId).OrderByDescending(p => p.CreatedAt).ToPagedResultAsync(page, ct);

    public async Task<IReadOnlyList<Payment>> ListByInvoiceAsync(Guid invoiceId, CancellationToken ct) =>
        await _db.Payments.AsNoTracking().Where(p => p.InvoiceId == invoiceId).ToListAsync(ct);

    public void Add(Payment payment) => _db.Payments.Add(payment);
}

internal sealed class PaymentMethodRepository : IPaymentMethodRepository
{
    private readonly UconnectDbContext _db;

    public PaymentMethodRepository(UconnectDbContext db) => _db = db;

    public async Task<IReadOnlyList<PaymentMethod>> ListByAccountAsync(Guid accountId, CancellationToken ct) =>
        await _db.PaymentMethods.Where(m => m.AccountId == accountId).ToListAsync(ct);

    public Task<PaymentMethod?> GetByIdAsync(Guid id, CancellationToken ct) => _db.PaymentMethods.FirstOrDefaultAsync(m => m.Id == id, ct);

    public void Add(PaymentMethod method) => _db.PaymentMethods.Add(method);
}

internal sealed class AutopayRepository : IAutopayRepository
{
    private readonly UconnectDbContext _db;

    public AutopayRepository(UconnectDbContext db) => _db = db;

    public Task<AutopaySettings?> GetByAccountAsync(Guid accountId, CancellationToken ct) =>
        _db.AutopaySettings.FirstOrDefaultAsync(a => a.AccountId == accountId, ct);

    public async Task<IReadOnlyList<AutopaySettings>> ListEnabledAsync(CancellationToken ct) =>
        await _db.AutopaySettings.Where(a => a.Enabled).ToListAsync(ct);

    public void Add(AutopaySettings settings) => _db.AutopaySettings.Add(settings);
}

internal sealed class UsageRepository : IUsageRepository
{
    private readonly UconnectDbContext _db;

    public UsageRepository(UconnectDbContext db) => _db = db;

    public async Task<IReadOnlyList<UsageRecord>> ListAsync(Guid serviceId, DateOnly fromInclusive, DateOnly toExclusive, CancellationToken ct) =>
        await _db.UsageRecords.AsNoTracking()
            .Where(u => u.ServiceId == serviceId && u.UsageDate >= fromInclusive && u.UsageDate < toExclusive)
            .OrderBy(u => u.UsageDate)
            .ToListAsync(ct);

    public async Task<UsageRecord?> FindAsync(Guid serviceId, DateOnly date, CancellationToken ct) =>
        _db.UsageRecords.Local.FirstOrDefault(u => u.ServiceId == serviceId && u.UsageDate == date)
        ?? await _db.UsageRecords.FirstOrDefaultAsync(u => u.ServiceId == serviceId && u.UsageDate == date, ct);

    public void Add(UsageRecord record) => _db.UsageRecords.Add(record);
}
