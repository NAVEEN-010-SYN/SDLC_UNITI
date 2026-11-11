using Uconnect.Domain.Common;

namespace Uconnect.Domain.Catalog;

/// <summary>
/// A sellable product tier, e.g. "Fibre 500". Plans of the same <see cref="ProductType"/> are
/// ranked by <see cref="Tier"/>, which defines whether a change is an upgrade or a downgrade.
/// </summary>
public sealed class Plan : AggregateRoot
{
    private Plan()
    {
    }

    public Plan(
        Guid id,
        string code,
        string name,
        ProductType productType,
        int tier,
        Money monthlyPrice,
        int downloadMbps,
        int uploadMbps,
        int minimumTermMonths,
        Money setupFee,
        bool availableToConsumers,
        bool availableToBusinesses)
        : base(id)
    {
        Code = Guard.NotBlank(code, "plan.code", 40).ToUpperInvariant();
        Name = Guard.NotBlank(name, "plan.name", 120);
        ProductType = productType;
        Guard.InRange(tier, 1, 100, "plan.tier");
        Tier = tier;
        Guard.NotNegative(monthlyPrice, "plan.monthly_price");
        Guard.NotNegative(setupFee, "plan.setup_fee");
        MonthlyPrice = monthlyPrice;
        SetupFee = setupFee;
        DownloadMbps = downloadMbps;
        UploadMbps = uploadMbps;
        Guard.InRange(minimumTermMonths, 0, 36, "plan.minimum_term");
        MinimumTermMonths = minimumTermMonths;
        AvailableToConsumers = availableToConsumers;
        AvailableToBusinesses = availableToBusinesses;
        IsActive = true;
    }

    /// <summary>Stable catalog code, e.g. <c>FIBRE-500</c>.</summary>
    public string Code { get; private set; } = string.Empty;

    public string Name { get; private set; } = string.Empty;

    public ProductType ProductType { get; private set; }

    /// <summary>Rank within the product type; higher is better.</summary>
    public int Tier { get; private set; }

    public Money MonthlyPrice { get; private set; } = null!;

    public Money SetupFee { get; private set; } = null!;

    public int DownloadMbps { get; private set; }

    public int UploadMbps { get; private set; }

    public int MinimumTermMonths { get; private set; }

    /// <summary>
    /// Monthly fair-use threshold in gigabytes; <c>null</c> means unlimited. Exceeding it never
    /// blocks service but triggers notifications and may attract usage charges on business plans.
    /// </summary>
    public int? FairUseAllowanceGb { get; private set; }

    /// <summary>Per-GB overage charge applied beyond the allowance (business plans only).</summary>
    public Money? OveragePerGb { get; private set; }

    public bool AvailableToConsumers { get; private set; }

    public bool AvailableToBusinesses { get; private set; }

    public bool IsActive { get; private set; }

    public bool IsAvailableTo(AccountType accountType) =>
        IsActive && (accountType == AccountType.Business ? AvailableToBusinesses : AvailableToConsumers);

    public void ConfigureFairUse(int? allowanceGb, Money? overagePerGb)
    {
        if (allowanceGb is <= 0)
        {
            throw new DomainException("plan.allowance_invalid", "Fair-use allowance must be positive when set.");
        }

        if (overagePerGb is not null && allowanceGb is null)
        {
            throw new DomainException("plan.overage_without_allowance", "An overage rate requires an allowance.");
        }

        if (overagePerGb is not null)
        {
            Guard.NotNegative(overagePerGb, "plan.overage_per_gb");
        }

        FairUseAllowanceGb = allowanceGb;
        OveragePerGb = overagePerGb;
    }

    public void Reprice(Money newMonthlyPrice)
    {
        Guard.NotNegative(newMonthlyPrice, "plan.monthly_price");
        if (newMonthlyPrice.Currency != MonthlyPrice.Currency)
        {
            throw new DomainException("plan.currency_change", "A plan's currency cannot be changed.");
        }

        MonthlyPrice = newMonthlyPrice;
    }

    public void Retire() => IsActive = false;

    /// <summary>Classifies a move from this plan to <paramref name="target"/>.</summary>
    public PlanChangeType ClassifyChangeTo(Plan target)
    {
        if (target.ProductType != ProductType)
        {
            throw new DomainException("plan_change.product_mismatch", "Plans must be of the same product type.");
        }

        if (target.Id == Id)
        {
            throw new DomainException("plan_change.same_plan", "The service is already on this plan.");
        }

        if (target.Tier > Tier)
        {
            return PlanChangeType.Upgrade;
        }

        return target.Tier < Tier ? PlanChangeType.Downgrade : PlanChangeType.Lateral;
    }
}
