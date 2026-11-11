using Microsoft.EntityFrameworkCore;
using Uconnect.Application.Abstractions;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;
using Uconnect.Infrastructure.Persistence.Configurations;

namespace Uconnect.Infrastructure.Persistence.Repositories;

internal sealed class AccountRepository : IAccountRepository
{
    private readonly UconnectDbContext _db;

    public AccountRepository(UconnectDbContext db) => _db = db;

    public Task<Account?> GetByIdAsync(Guid id, CancellationToken ct) =>
        _db.Accounts.FirstOrDefaultAsync(a => a.Id == id, ct);

    public Task<Account?> GetByNumberAsync(AccountNumber number, CancellationToken ct) =>
        _db.Accounts.FirstOrDefaultAsync(a => a.Number == number, ct);

    public async Task<IReadOnlyList<Account>> ListByBillingDayAsync(int billingDay, CancellationToken ct) =>
        await _db.Accounts.Where(a => a.BillingDay == billingDay && a.Status == AccountStatus.Active).ToListAsync(ct);

    public void Add(Account account) => _db.Accounts.Add(account);
}

internal sealed class AccountUserRepository : IAccountUserRepository
{
    private readonly UconnectDbContext _db;

    public AccountUserRepository(UconnectDbContext db) => _db = db;

    public Task<AccountUser?> FindActiveAsync(Guid accountId, string subjectId, CancellationToken ct) =>
        _db.AccountUsers.FirstOrDefaultAsync(u => u.AccountId == accountId && u.SubjectId == subjectId && u.IsActive, ct);

    public async Task<IReadOnlyList<AccountUser>> ListByAccountAsync(Guid accountId, CancellationToken ct) =>
        await _db.AccountUsers.Where(u => u.AccountId == accountId).ToListAsync(ct);

    public async Task<IReadOnlyList<(Account Account, string Role)>> ListAccountsForSubjectAsync(string subjectId, CancellationToken ct)
    {
        var rows = await (
                from user in _db.AccountUsers
                join account in _db.Accounts on user.AccountId equals account.Id
                where user.SubjectId == subjectId && user.IsActive
                select new { account, user.Role })
            .ToListAsync(ct);
        return rows.Select(r => (r.account, r.Role)).ToList();
    }

    public void Add(AccountUser user) => _db.AccountUsers.Add(user);
}

internal sealed class PlanRepository : IPlanRepository
{
    private readonly UconnectDbContext _db;

    public PlanRepository(UconnectDbContext db) => _db = db;

    public Task<Plan?> GetByIdAsync(Guid id, CancellationToken ct) => _db.Plans.FirstOrDefaultAsync(p => p.Id == id, ct);

    public Task<Plan?> GetByCodeAsync(string code, CancellationToken ct) => _db.Plans.FirstOrDefaultAsync(p => p.Code == code, ct);

    public async Task<IReadOnlyList<Plan>> GetManyAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var idList = ids.Distinct().ToList();
        return await _db.Plans.Where(p => idList.Contains(p.Id)).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<Plan>> ListActiveAsync(ProductType productType, CancellationToken ct) =>
        await _db.Plans.Where(p => p.ProductType == productType && p.IsActive).ToListAsync(ct);
}

internal sealed class ServiceRepository : IServiceRepository
{
    private readonly UconnectDbContext _db;

    public ServiceRepository(UconnectDbContext db) => _db = db;

    public Task<Service?> GetByIdAsync(Guid id, CancellationToken ct) => _db.Services.FirstOrDefaultAsync(s => s.Id == id, ct);

    public async Task<IReadOnlyList<Service>> ListByAccountAsync(Guid accountId, CancellationToken ct) =>
        await _db.Services.Where(s => s.AccountId == accountId).ToListAsync(ct);

    public async Task<IReadOnlyList<Service>> ListLiveInOutwardCodesAsync(IReadOnlyCollection<string> outwardCodes, CancellationToken ct)
    {
        var codes = outwardCodes.Select(c => c.Trim().ToUpperInvariant()).Distinct().ToList();
        return await _db.Services
            .Where(s => codes.Contains(EF.Property<string>(s, ServiceConfiguration.OutwardCodeColumn)))
            .Where(s => s.Status == ServiceStatus.Active || s.Status == ServiceStatus.Suspended)
            .ToListAsync(ct);
    }

    public Task<int> CountLiveAsync(Guid accountId, CancellationToken ct) =>
        _db.Services.CountAsync(s => s.AccountId == accountId && (s.Status == ServiceStatus.Active || s.Status == ServiceStatus.Suspended), ct);
}

internal sealed class PlanChangeRepository : IPlanChangeRepository
{
    private readonly UconnectDbContext _db;

    public PlanChangeRepository(UconnectDbContext db) => _db = db;

    public Task<PlanChange?> GetByIdAsync(Guid id, CancellationToken ct) => _db.PlanChanges.FirstOrDefaultAsync(c => c.Id == id, ct);

    public Task<PlanChange?> GetByProvisioningRefAsync(string orderRef, CancellationToken ct) =>
        _db.PlanChanges.FirstOrDefaultAsync(c => c.ProvisioningOrderRef == orderRef, ct);

    public async Task<IReadOnlyList<PlanChange>> ListByAccountAsync(Guid accountId, CancellationToken ct) =>
        await _db.PlanChanges.Where(c => c.AccountId == accountId).ToListAsync(ct);

    public async Task<IReadOnlyList<PlanChange>> ListDueAsync(DateOnly today, CancellationToken ct) =>
        await _db.PlanChanges
            .Where(c => (c.Status == PlanChangeStatus.Requested || c.Status == PlanChangeStatus.Scheduled) && c.EffectiveOn <= today)
            .OrderBy(c => c.EffectiveOn)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<PlanChange>> ListProvisioningAsync(CancellationToken ct) =>
        await _db.PlanChanges.Where(c => c.Status == PlanChangeStatus.Provisioning).ToListAsync(ct);

    public async Task<IReadOnlyList<PlanChange>> ListUnbilledCompletedAsync(Guid accountId, CancellationToken ct) =>
        await _db.PlanChanges
            .Where(c => c.AccountId == accountId && c.Status == PlanChangeStatus.Completed && c.BilledOnInvoiceId == null)
            .ToListAsync(ct);

    public void Add(PlanChange planChange) => _db.PlanChanges.Add(planChange);
}
