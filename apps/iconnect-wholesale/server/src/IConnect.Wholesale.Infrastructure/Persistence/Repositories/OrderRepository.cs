using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Services;
using Microsoft.EntityFrameworkCore;

namespace IConnect.Wholesale.Infrastructure.Persistence.Repositories;

internal sealed class OrderRepository : IOrderRepository
{
    private static readonly OrderStatus[] OpenStatuses = { OrderStatus.Draft, OrderStatus.Submitted, OrderStatus.Validated, OrderStatus.Provisioning };
    private static readonly OrderStatus[] ClockRunningStatuses = { OrderStatus.Validated, OrderStatus.Provisioning };

    private readonly WholesaleDbContext _db;

    public OrderRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<Order?> GetAsync(Guid id, CancellationToken ct) => _db.Orders.FirstOrDefaultAsync(o => o.Id == id, ct);

    public Task<Order?> GetByPartnerReferenceAsync(Guid partnerId, string partnerReference, CancellationToken ct) =>
        _db.Orders.FirstOrDefaultAsync(o => o.PartnerId == partnerId && o.PartnerReference == partnerReference, ct);

    public async Task<PagedResult<Order>> QueryAsync(OrderQuery query, CancellationToken ct)
    {
        var q = _db.Orders.AsNoTracking().Where(o => o.PartnerId == query.PartnerId);

        if (query.Status is { } status)
        {
            q = q.Where(o => o.Status == status);
        }

        if (query.Type is { } type)
        {
            q = q.Where(o => o.Type == type);
        }

        if (!string.IsNullOrEmpty(query.Search))
        {
            var term = query.Search;
            q = q.Where(o => o.Reference == term || o.PartnerReference.StartsWith(term) || o.Uprn == term);
        }

        if (query.CreatedFrom is { } from)
        {
            var fromInstant = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            q = q.Where(o => o.CreatedAt >= fromInstant);
        }

        if (query.CreatedTo is { } to)
        {
            var toInstant = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            q = q.Where(o => o.CreatedAt < toInstant);
        }

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(o => o.CreatedAt).Skip(query.Page.Skip).Take(query.Page.PageSize).ToListAsync(ct);
        return new PagedResult<Order>(items, query.Page.Page, query.Page.PageSize, total);
    }

    public Task<int> CountOpenAsync(Guid partnerId, CancellationToken ct) =>
        _db.Orders.CountAsync(o => o.PartnerId == partnerId && OpenStatuses.Contains(o.Status), ct);

    public Task<bool> HasOpenOrderForUprnAsync(string uprn, CancellationToken ct) =>
        _db.Orders.AnyAsync(o => o.Uprn == uprn && OpenStatuses.Contains(o.Status), ct);

    public async Task<IReadOnlyList<Order>> ListWithRunningClocksAsync(CancellationToken ct) =>
        await _db.Orders.Where(o => ClockRunningStatuses.Contains(o.Status) && o.HoldReason == null).ToListAsync(ct);

    public async Task<IReadOnlyList<Order>> ListCompletedBetweenAsync(Guid partnerId, DateOnly from, DateOnly to, CancellationToken ct) =>
        await _db.Orders.AsNoTracking()
            .Where(o => o.PartnerId == partnerId && o.Status == OrderStatus.Active && o.CompletedDate >= from && o.CompletedDate <= to)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Order>> ListCancelledWithChargeBetweenAsync(Guid partnerId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var fromInstant = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toInstant = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        return await _db.Orders.AsNoTracking()
            .Where(o => o.PartnerId == partnerId && o.Status == OrderStatus.Cancelled && o.CancellationCharge != null
                        && o.UpdatedAt >= fromInstant && o.UpdatedAt < toInstant)
            .ToListAsync(ct);
    }

    public async Task AddAsync(Order order, CancellationToken ct) => await _db.Orders.AddAsync(order, ct);

    public async Task AddRangeAsync(IEnumerable<Order> orders, CancellationToken ct) => await _db.Orders.AddRangeAsync(orders, ct);
}

internal sealed class ServiceRepository : IServiceRepository
{
    private readonly WholesaleDbContext _db;

    public ServiceRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<WholesaleService?> GetAsync(Guid id, CancellationToken ct) => _db.Services.FirstOrDefaultAsync(s => s.Id == id, ct);

    public Task<WholesaleService?> GetActiveByUprnAsync(string uprn, CancellationToken ct) =>
        _db.Services.FirstOrDefaultAsync(s => s.Uprn == uprn && s.CeasedOn == null, ct);

    public Task<int> CountActiveAsync(Guid partnerId, CancellationToken ct) =>
        _db.Services.CountAsync(s => s.PartnerId == partnerId && s.CeasedOn == null, ct);

    public async Task<IReadOnlyList<WholesaleService>> ListBillableAsync(Guid partnerId, DateOnly from, DateOnly to, CancellationToken ct) =>
        await _db.Services.AsNoTracking()
            .Where(s => s.PartnerId == partnerId && s.ActivatedOn <= to && (s.CeasedOn == null || s.CeasedOn >= from))
            .ToListAsync(ct);

    public async Task AddAsync(WholesaleService service, CancellationToken ct) => await _db.Services.AddAsync(service, ct);
}

internal sealed class BulkUploadRepository : IBulkUploadRepository
{
    private readonly WholesaleDbContext _db;

    public BulkUploadRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<Domain.Orders.BulkUpload?> GetAsync(Guid id, CancellationToken ct) => _db.BulkUploads.FirstOrDefaultAsync(b => b.Id == id, ct);

    public Task<Domain.Orders.BulkUpload?> GetByHashAsync(Guid partnerId, string contentSha256, CancellationToken ct) =>
        _db.BulkUploads.Where(b => b.PartnerId == partnerId && b.ContentSha256 == contentSha256)
            .OrderByDescending(b => b.Status == BulkUploadStatus.Submitted)
            .FirstOrDefaultAsync(ct);

    public async Task AddAsync(Domain.Orders.BulkUpload upload, CancellationToken ct) => await _db.BulkUploads.AddAsync(upload, ct);
}
