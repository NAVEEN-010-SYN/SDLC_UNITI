using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.EntityFrameworkCore;

namespace IConnect.Wholesale.Infrastructure.Persistence.Repositories;

internal sealed class PremiseRepository : IPremiseRepository
{
    private readonly WholesaleDbContext _db;

    public PremiseRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<Premise?> GetByUprnAsync(string uprn, CancellationToken ct) => _db.Premises.FirstOrDefaultAsync(p => p.Uprn == uprn, ct);

    public async Task<IReadOnlyList<Premise>> SearchByPostcodeAsync(string postcode, CancellationToken ct) =>
        await _db.Premises.AsNoTracking().Where(p => p.Postcode == postcode).Take(500).ToListAsync(ct);
}

internal sealed class CatalogueRepository : ICatalogueRepository
{
    private readonly WholesaleDbContext _db;

    public CatalogueRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<WholesaleProduct>> ListProductsAsync(bool includeWithdrawn, CancellationToken ct) =>
        await _db.Products.AsNoTracking().Where(p => includeWithdrawn || p.IsActive).ToListAsync(ct);

    public Task<WholesaleProduct?> GetProductAsync(string code, CancellationToken ct)
    {
        var normalised = code.ToUpperInvariant();
        return _db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Code == normalised, ct);
    }

    public Task<PriceBook?> GetEffectivePriceBookAsync(DateOnly onDate, CancellationToken ct) =>
        _db.PriceBooks.AsNoTracking()
            .Where(b => b.EffectiveFrom <= onDate && (b.EffectiveTo == null || b.EffectiveTo >= onDate))
            .OrderByDescending(b => b.EffectiveFrom)
            .FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<PriceBook>> ListPriceBooksAsync(CancellationToken ct) =>
        await _db.PriceBooks.OrderBy(b => b.EffectiveFrom).ToListAsync(ct);

    public async Task AddPriceBookAsync(PriceBook priceBook, CancellationToken ct) => await _db.PriceBooks.AddAsync(priceBook, ct);
}

internal sealed class PartnerRepository : IPartnerRepository
{
    private readonly WholesaleDbContext _db;

    public PartnerRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<Partner?> GetAsync(Guid id, CancellationToken ct) => _db.Partners.FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<IReadOnlyList<Partner>> ListActiveAsync(CancellationToken ct) =>
        await _db.Partners.AsNoTracking().Where(p => p.Status == PartnerStatus.Active).ToListAsync(ct);
}

internal sealed class ApiKeyRepository : IApiKeyRepository
{
    private readonly WholesaleDbContext _db;

    public ApiKeyRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<ApiKey?> GetAsync(Guid id, CancellationToken ct) => _db.ApiKeys.FirstOrDefaultAsync(k => k.Id == id, ct);

    public Task<ApiKey?> GetByPrefixAsync(string prefix, CancellationToken ct) => _db.ApiKeys.FirstOrDefaultAsync(k => k.Prefix == prefix, ct);

    public async Task<IReadOnlyList<ApiKey>> ListForPartnerAsync(Guid partnerId, CancellationToken ct) =>
        await _db.ApiKeys.Where(k => k.PartnerId == partnerId).ToListAsync(ct);

    public async Task AddAsync(ApiKey key, CancellationToken ct) => await _db.ApiKeys.AddAsync(key, ct);
}
