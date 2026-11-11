using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Catalogue;

public sealed record PriceQuote(
    string ProductCode,
    CareLevel CareLevel,
    string PriceBookVersion,
    Money ListMonthlyRental,
    int VolumeDiscountBps,
    Money MonthlyRental,
    Money OneOffCharge,
    string OneOffChargeType);

/// <summary>
/// Prices an order line from the price book effective on the requested date. The partner's
/// volume tier (by active line count) discounts the monthly rental only; one-off charges are
/// list price. Cease orders carry no charge.
/// </summary>
public sealed class PricingService
{
    private readonly ICatalogueRepository _catalogue;
    private readonly IServiceRepository _services;

    public PricingService(ICatalogueRepository catalogue, IServiceRepository services)
    {
        _catalogue = catalogue;
        _services = services;
    }

    public async Task<PriceQuote> QuoteAsync(Guid partnerId, OrderType type, string productCode, CareLevel careLevel, DateOnly onDate, CancellationToken ct)
    {
        var product = await _catalogue.GetProductAsync(productCode, ct)
            ?? throw new NotFoundException("Product", productCode);

        if (!product.IsActive && type != OrderType.Cease)
        {
            throw new ConflictException("product.withdrawn", $"Product {product.Code} has been withdrawn from sale.");
        }

        if (!product.SupportsCareLevel(careLevel))
        {
            throw new RequestValidationException("careLevel", $"{product.Code} is not offered with {careLevel} care.");
        }

        var book = await _catalogue.GetEffectivePriceBookAsync(onDate, ct)
            ?? throw new ConflictException("pricebook.none_effective", $"No price book is effective on {onDate:yyyy-MM-dd}.");

        var entry = book.Find(product.Code, careLevel)
            ?? throw new ConflictException("pricebook.unpriced", $"{product.Code}/{careLevel} is not priced in {book.Version}.");

        var activeLines = await _services.CountActiveAsync(partnerId, ct);
        return Calculate(book, entry, type, activeLines);
    }

    public static PriceQuote Calculate(PriceBook book, PriceBookEntry entry, OrderType type, int partnerActiveLines)
    {
        var list = new Money(entry.MonthlyRentalMinor, book.Currency);
        var discountBps = book.DiscountBpsFor(partnerActiveLines);
        var discounted = list.Subtract(list.PercentageOf(discountBps));

        long oneOffMinor;
        string label;
        switch (type)
        {
            case OrderType.Provide:
                oneOffMinor = entry.ConnectionChargeMinor;
                label = "connection";
                break;
            case OrderType.Migrate:
                oneOffMinor = entry.MigrationChargeMinor;
                label = "migration";
                break;
            case OrderType.Modify:
                oneOffMinor = entry.ModifyChargeMinor;
                label = "modify";
                break;
            case OrderType.Cease:
                oneOffMinor = 0L;
                label = "none";
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(type), type, null);
        }

        return new PriceQuote(
            entry.ProductCode,
            entry.CareLevel,
            book.Version,
            list,
            discountBps,
            type == OrderType.Cease ? Money.Zero(book.Currency) : discounted,
            new Money(oneOffMinor, book.Currency),
            label);
    }
}
