using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Appointments;
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Faults;
using Microsoft.EntityFrameworkCore;

namespace IConnect.Wholesale.Infrastructure.Persistence.Repositories;

internal sealed class FaultRepository : IFaultRepository
{
    private static readonly FaultStatus[] Open = { FaultStatus.Open, FaultStatus.InProgress, FaultStatus.PendingCustomer };
    private static readonly FaultStatus[] ClockRunning = { FaultStatus.Open, FaultStatus.InProgress };

    private readonly WholesaleDbContext _db;

    public FaultRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<Fault?> GetAsync(Guid id, CancellationToken ct) => _db.Faults.FirstOrDefaultAsync(f => f.Id == id, ct);

    public async Task<PagedResult<Fault>> QueryAsync(FaultQuery query, CancellationToken ct)
    {
        var q = _db.Faults.AsNoTracking().Where(f => f.PartnerId == query.PartnerId);
        if (query.Status is { } status)
        {
            q = q.Where(f => f.Status == status);
        }

        if (query.Priority is { } priority)
        {
            q = q.Where(f => f.Priority == priority);
        }

        var total = await q.CountAsync(ct);
        var items = await q.OrderBy(f => f.Priority).ThenByDescending(f => f.CreatedAt)
            .Skip(query.Page.Skip).Take(query.Page.PageSize).ToListAsync(ct);
        return new PagedResult<Fault>(items, query.Page.Page, query.Page.PageSize, total);
    }

    public Task<bool> HasOpenFaultForServiceAsync(Guid serviceId, CancellationToken ct) =>
        _db.Faults.AnyAsync(f => f.ServiceId == serviceId && Open.Contains(f.Status), ct);

    public async Task<IReadOnlyList<Fault>> ListWithRunningClocksAsync(CancellationToken ct) =>
        await _db.Faults.Where(f => ClockRunning.Contains(f.Status)).ToListAsync(ct);

    public async Task<IReadOnlyList<Fault>> ListResolvedWithCreditBetweenAsync(Guid partnerId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct) =>
        await _db.Faults.AsNoTracking()
            .Where(f => f.PartnerId == partnerId && f.ServiceCredit != null && f.ResolvedAt >= from && f.ResolvedAt < to
                        && (f.Status == FaultStatus.Resolved || f.Status == FaultStatus.Closed))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Fault>> ListAutoCloseCandidatesAsync(DateTimeOffset resolvedBefore, CancellationToken ct) =>
        await _db.Faults.Where(f => f.Status == FaultStatus.Resolved && f.ResolvedAt < resolvedBefore).Take(500).ToListAsync(ct);

    public async Task AddAsync(Fault fault, CancellationToken ct) => await _db.Faults.AddAsync(fault, ct);
}

internal sealed class AppointmentSlotRepository : IAppointmentSlotRepository
{
    private readonly WholesaleDbContext _db;

    public AppointmentSlotRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<AppointmentSlot?> GetAsync(Guid id, CancellationToken ct) => _db.AppointmentSlots.FirstOrDefaultAsync(s => s.Id == id, ct);

    public async Task<IReadOnlyList<AppointmentSlot>> ListAsync(string exchangeCode, DateOnly from, DateOnly to, CancellationToken ct) =>
        await _db.AppointmentSlots.AsNoTracking()
            .Where(s => s.ExchangeCode == exchangeCode && s.Date >= from && s.Date <= to)
            .ToListAsync(ct);
}

internal sealed class StatementRepository : IStatementRepository
{
    private readonly WholesaleDbContext _db;

    public StatementRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<BillingStatement?> GetAsync(Guid id, CancellationToken ct) => _db.Statements.FirstOrDefaultAsync(s => s.Id == id, ct);

    public Task<BillingStatement?> GetForPeriodAsync(Guid partnerId, DateOnly periodStart, CancellationToken ct) =>
        _db.Statements.FirstOrDefaultAsync(s => s.PartnerId == partnerId && s.PeriodStart == periodStart, ct);

    public async Task<PagedResult<BillingStatement>> ListForPartnerAsync(Guid partnerId, PageRequest page, CancellationToken ct)
    {
        var q = _db.Statements.AsNoTracking().Where(s => s.PartnerId == partnerId && s.Status != StatementStatus.Draft);
        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(s => s.PeriodStart).Skip(page.Skip).Take(page.PageSize).ToListAsync(ct);
        return new PagedResult<BillingStatement>(items, page.Page, page.PageSize, total);
    }

    public async Task AddAsync(BillingStatement statement, CancellationToken ct) => await _db.Statements.AddAsync(statement, ct);
}

internal sealed class DisputeRepository : IDisputeRepository
{
    private readonly WholesaleDbContext _db;

    public DisputeRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<Dispute?> GetAsync(Guid id, CancellationToken ct) => _db.Disputes.FirstOrDefaultAsync(d => d.Id == id, ct);

    public async Task<IReadOnlyList<Dispute>> ListForStatementAsync(Guid statementId, CancellationToken ct) =>
        await _db.Disputes.Where(d => d.StatementId == statementId).ToListAsync(ct);

    public async Task<IReadOnlyList<Dispute>> ListForPartnerAsync(Guid partnerId, CancellationToken ct) =>
        await _db.Disputes.AsNoTracking().Where(d => d.PartnerId == partnerId).ToListAsync(ct);

    public async Task AddAsync(Dispute dispute, CancellationToken ct) => await _db.Disputes.AddAsync(dispute, ct);
}
