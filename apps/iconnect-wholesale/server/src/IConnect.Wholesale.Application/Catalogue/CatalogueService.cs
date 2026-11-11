using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Catalogue;

public sealed record ProductDto(string Code, string Name, int DownstreamMbps, int UpstreamMbps, IReadOnlyList<string> CareLevels, bool IsActive);

public sealed record PriceBookEntryDto(string ProductCode, string CareLevel, long MonthlyRentalMinor, long ConnectionChargeMinor,
    long MigrationChargeMinor, long ModifyChargeMinor);

public sealed record VolumeTierDto(int MinimumActiveLines, int DiscountBps);

public sealed record PriceBookDto(string Version, DateOnly EffectiveFrom, DateOnly? EffectiveTo, string Currency,
    IReadOnlyList<PriceBookEntryDto> Entries, IReadOnlyList<VolumeTierDto> Tiers);

public sealed record NewPriceBookRequest(string Version, DateOnly EffectiveFrom, string Currency,
    IReadOnlyList<PriceBookEntryDto> Entries, IReadOnlyList<VolumeTierDto> Tiers);

public sealed class CatalogueService
{
    private readonly ICatalogueRepository _catalogue;
    private readonly IUnitOfWork _uow;
    private readonly IClock _clock;

    public CatalogueService(ICatalogueRepository catalogue, IUnitOfWork uow, IClock clock)
    {
        _catalogue = catalogue;
        _uow = uow;
        _clock = clock;
    }

    public async Task<IReadOnlyList<ProductDto>> ListProductsAsync(bool includeWithdrawn, CancellationToken ct)
    {
        var products = await _catalogue.ListProductsAsync(includeWithdrawn, ct);
        return products.OrderBy(p => p.DownstreamMbps).Select(ToDto).ToList();
    }

    public async Task<PriceBookDto> GetPriceBookAsync(DateOnly? onDate, CancellationToken ct)
    {
        var date = onDate ?? DateOnly.FromDateTime(_clock.UtcNow.UtcDateTime);
        var book = await _catalogue.GetEffectivePriceBookAsync(date, ct)
            ?? throw new NotFoundException("PriceBook", date.ToString("yyyy-MM-dd"));
        return ToDto(book);
    }

    /// <summary>
    /// Publishes a new price book version (support agents only). Must start in the future and
    /// price every active product at every care level it offers; closes the current version
    /// the day before the new one takes effect.
    /// </summary>
    public async Task<PriceBookDto> PublishPriceBookAsync(NewPriceBookRequest request, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(_clock.UtcNow.UtcDateTime);
        var v = new ValidationBuilder()
            .Require(!string.IsNullOrWhiteSpace(request.Version), "version", "Version is required.")
            .Require(request.EffectiveFrom > today, "effectiveFrom", "A new price book must take effect in the future.")
            .Require(request.Currency is { Length: 3 }, "currency", "Currency must be an ISO-4217 code.");

        var existing = await _catalogue.ListPriceBooksAsync(ct);
        v.Require(existing.All(b => !string.Equals(b.Version, request.Version, StringComparison.OrdinalIgnoreCase)),
            "version", $"Version {request.Version} already exists.");
        v.Require(existing.All(b => b.EffectiveFrom < request.EffectiveFrom), "effectiveFrom",
            "A later price book version already exists.");

        var book = new PriceBook(request.Version, request.EffectiveFrom, request.Currency);
        for (var i = 0; i < request.Entries.Count; i++)
        {
            var e = request.Entries[i];
            if (!Enum.TryParse<CareLevel>(e.CareLevel, true, out var care))
            {
                v.Add($"entries[{i}].careLevel", $"Unknown care level '{e.CareLevel}'.");
                continue;
            }

            try
            {
                book.AddEntry(e.ProductCode, care, e.MonthlyRentalMinor, e.ConnectionChargeMinor, e.MigrationChargeMinor, e.ModifyChargeMinor);
            }
            catch (Domain.Common.DomainException ex)
            {
                v.Add($"entries[{i}]", ex.Message);
            }
        }

        foreach (var tier in request.Tiers)
        {
            try
            {
                book.AddTier(tier.MinimumActiveLines, tier.DiscountBps);
            }
            catch (Domain.Common.DomainException ex)
            {
                v.Add("tiers", ex.Message);
            }
        }

        var products = await _catalogue.ListProductsAsync(includeWithdrawn: false, ct);
        foreach (var product in products)
        {
            foreach (var care in product.AvailableCareLevels)
            {
                v.Require(book.Find(product.Code, care) is not null, "entries", $"Missing price for {product.Code}/{care}.");
            }
        }

        v.ThrowIfInvalid();

        var current = existing.FirstOrDefault(b => b.IsEffectiveOn(request.EffectiveFrom.AddDays(-1)));
        current?.CloseOn(request.EffectiveFrom.AddDays(-1));

        await _catalogue.AddPriceBookAsync(book, ct);
        await _uow.SaveChangesAsync(ct);
        return ToDto(book);
    }

    internal static ProductDto ToDto(WholesaleProduct p) =>
        new(p.Code, p.Name, p.DownstreamMbps, p.UpstreamMbps, p.AvailableCareLevels.Select(c => c.ToString()).ToList(), p.IsActive);

    private static PriceBookDto ToDto(PriceBook b) => new(
        b.Version,
        b.EffectiveFrom,
        b.EffectiveTo,
        b.Currency,
        b.Entries.Select(e => new PriceBookEntryDto(e.ProductCode, e.CareLevel.ToString(), e.MonthlyRentalMinor,
            e.ConnectionChargeMinor, e.MigrationChargeMinor, e.ModifyChargeMinor)).ToList(),
        b.Tiers.Select(t => new VolumeTierDto(t.MinimumActiveLines, t.DiscountBps)).ToList());
}
