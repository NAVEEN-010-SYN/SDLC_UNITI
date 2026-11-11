using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Domain.Catalogue;

/// <summary>A wholesale fibre access product (e.g. FTTP 500/75) sold to partners.</summary>
public sealed class WholesaleProduct
{
    private WholesaleProduct()
    {
    }

    public WholesaleProduct(string code, string name, int downstreamMbps, int upstreamMbps, IEnumerable<CareLevel> careLevels, bool isActive = true)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            throw new DomainException("product.code_required", "Product code is required.");
        }

        if (downstreamMbps <= 0 || upstreamMbps <= 0 || upstreamMbps > downstreamMbps)
        {
            throw new DomainException("product.invalid_speed", "Speeds must be positive and upstream must not exceed downstream.");
        }

        Code = code.ToUpperInvariant();
        Name = name;
        DownstreamMbps = downstreamMbps;
        UpstreamMbps = upstreamMbps;
        AvailableCareLevels = careLevels.Distinct().OrderBy(c => c).ToList();
        IsActive = isActive;

        if (AvailableCareLevels.Count == 0)
        {
            throw new DomainException("product.care_required", "At least one care level must be offered.");
        }
    }

    public string Code { get; private set; } = string.Empty;

    public string Name { get; private set; } = string.Empty;

    public int DownstreamMbps { get; private set; }

    public int UpstreamMbps { get; private set; }

    public List<CareLevel> AvailableCareLevels { get; private set; } = new();

    public bool IsActive { get; private set; }

    public bool SupportsCareLevel(CareLevel careLevel) => AvailableCareLevels.Contains(careLevel);

    public void Withdraw() => IsActive = false;
}

/// <summary>
/// A dated version of the price book. Exactly one version is effective on any date; a new
/// version takes effect from its <see cref="EffectiveFrom"/> and closes the previous one.
/// </summary>
public sealed class PriceBook
{
    private readonly List<PriceBookEntry> _entries = new();
    private readonly List<VolumeDiscountTier> _tiers = new();

    private PriceBook()
    {
    }

    public PriceBook(string version, DateOnly effectiveFrom, string currency)
    {
        Version = version;
        EffectiveFrom = effectiveFrom;
        Currency = currency;
    }

    public Guid Id { get; private set; } = Guid.NewGuid();

    public string Version { get; private set; } = string.Empty;

    public DateOnly EffectiveFrom { get; private set; }

    public DateOnly? EffectiveTo { get; private set; }

    public string Currency { get; private set; } = "GBP";

    public IReadOnlyList<PriceBookEntry> Entries => _entries;

    public IReadOnlyList<VolumeDiscountTier> Tiers => _tiers;

    public bool IsEffectiveOn(DateOnly date) => date >= EffectiveFrom && (EffectiveTo is null || date <= EffectiveTo);

    public void CloseOn(DateOnly lastDay)
    {
        if (lastDay < EffectiveFrom)
        {
            throw new DomainException("pricebook.invalid_close", "A price book cannot close before it opens.");
        }

        EffectiveTo = lastDay;
    }

    public void AddEntry(string productCode, CareLevel careLevel, long monthlyRentalMinor, long connectionMinor, long migrationMinor, long modifyMinor)
    {
        if (monthlyRentalMinor < 0 || connectionMinor < 0 || migrationMinor < 0 || modifyMinor < 0)
        {
            throw new DomainException("pricebook.negative_price", "Prices must not be negative.");
        }

        var code = productCode.ToUpperInvariant();
        if (_entries.Any(e => e.ProductCode == code && e.CareLevel == careLevel))
        {
            throw new DomainException("pricebook.duplicate_entry", $"{code}/{careLevel} is already priced in {Version}.");
        }

        _entries.Add(new PriceBookEntry(code, careLevel, monthlyRentalMinor, connectionMinor, migrationMinor, modifyMinor));
    }

    public void AddTier(int minimumActiveLines, int discountBps)
    {
        if (minimumActiveLines < 0 || discountBps is < 0 or > 5_000)
        {
            throw new DomainException("pricebook.invalid_tier", "Tier threshold must be non-negative and discount between 0 and 50%.");
        }

        _tiers.Add(new VolumeDiscountTier(minimumActiveLines, discountBps));
        _tiers.Sort((a, b) => a.MinimumActiveLines.CompareTo(b.MinimumActiveLines));
    }

    public PriceBookEntry? Find(string productCode, CareLevel careLevel) =>
        _entries.FirstOrDefault(e => e.ProductCode == productCode.ToUpperInvariant() && e.CareLevel == careLevel);

    /// <summary>The discount of the highest tier whose threshold the partner's active base meets.</summary>
    public int DiscountBpsFor(int activeLines) =>
        _tiers.LastOrDefault(t => activeLines >= t.MinimumActiveLines)?.DiscountBps ?? 0;
}

public sealed record PriceBookEntry(
    string ProductCode,
    CareLevel CareLevel,
    long MonthlyRentalMinor,
    long ConnectionChargeMinor,
    long MigrationChargeMinor,
    long ModifyChargeMinor);

public sealed record VolumeDiscountTier(int MinimumActiveLines, int DiscountBps);
