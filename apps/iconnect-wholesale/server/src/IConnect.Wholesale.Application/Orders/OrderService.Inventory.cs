using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Services;

namespace IConnect.Wholesale.Application.Orders;

/// <summary>Inventory checks at placement and inventory updates at completion.</summary>
public sealed partial class OrderService
{
    /// <summary>Returns a rejection reason, or null when the order can be accepted.</summary>
    internal async Task<string?> CheckInventoryAsync(Order order, CancellationToken ct)
    {
        var partner = await _partners.GetAsync(order.PartnerId, ct);
        if (partner is null || !partner.CanTrade)
        {
            return "Partner account is not active for trading.";
        }

        if (await _orders.CountOpenAsync(order.PartnerId, ct) >= partner.MaxOpenOrders)
        {
            return $"Partner has reached its limit of {partner.MaxOpenOrders} open orders.";
        }

        var premise = await _premises.GetByUprnAsync(order.Uprn, ct);
        if (premise is null)
        {
            return $"UPRN {order.Uprn} is not on the network.";
        }

        if (!premise.IsOrderable(order.RequestedDate))
        {
            if (premise.BuildStatus == PremiseBuildStatus.PlannedBuild)
            {
                return $"Premise is not ready for service until {premise.ReadyForServiceDate:yyyy-MM-dd}.";
            }

            return "Premise is not serviceable.";
        }

        if (await _orders.HasOpenOrderForUprnAsync(order.Uprn, ct))
        {
            return "Another order is already in flight for this premise.";
        }

        var productRejection = await CheckProductAsync(order, premise, ct);
        if (productRejection is not null)
        {
            return productRejection;
        }

        return await CheckExistingServiceAsync(order, ct);
    }

    private async Task<string?> CheckProductAsync(Order order, Premise premise, CancellationToken ct)
    {
        if (order.ProductCode is null)
        {
            return null;
        }

        var code = order.ProductCode;
        var product = await _catalogue.GetProductAsync(code, ct);
        if (product is null)
        {
            return $"Product {code} does not exist.";
        }

        if (product.DownstreamMbps > premise.MaxDownstreamMbps)
        {
            return $"Product {code} exceeds the premise capability of {premise.MaxDownstreamMbps} Mbps.";
        }

        return null;
    }

    /// <summary>Checks the order type against the service currently active at the premise.</summary>
    private async Task<string?> CheckExistingServiceAsync(Order order, CancellationToken ct)
    {
        var activeAtPremise = await _services.GetActiveByUprnAsync(order.Uprn, ct);

        if (order.Type == OrderType.Provide)
        {
            if (activeAtPremise is null)
            {
                return null;
            }

            if (activeAtPremise.PartnerId == order.PartnerId)
            {
                return "You already have an active service at this premise; place a modify order instead.";
            }

            return "Another provider has an active service at this premise; place a migrate order instead.";
        }

        if (order.Type == OrderType.Migrate)
        {
            if (activeAtPremise is null)
            {
                return "There is no active service to migrate at this premise; place a provide order instead.";
            }

            if (activeAtPremise.PartnerId == order.PartnerId)
            {
                return "You cannot migrate a service you already own.";
            }

            return null;
        }

        if (order.Type == OrderType.Cease || order.Type == OrderType.Modify)
        {
            return await CheckReferencedServiceAsync(order, ct);
        }

        return null;
    }

    private async Task<string?> CheckReferencedServiceAsync(Order order, CancellationToken ct)
    {
        WholesaleService? service = null;
        if (order.ExistingServiceId is not null)
        {
            service = await _services.GetAsync(order.ExistingServiceId.Value, ct);
        }

        if (service is null || service.PartnerId != order.PartnerId)
        {
            return "The referenced service does not exist on your account.";
        }

        if (!service.IsActive)
        {
            return "The referenced service has already been ceased.";
        }

        if (service.Uprn != order.Uprn)
        {
            return "The referenced service is not at the ordered UPRN.";
        }

        bool sameProduct = service.ProductCode == order.ProductCode && service.CareLevel == order.CareLevel;
        if (order.Type == OrderType.Modify && sameProduct)
        {
            return "The service already has the requested product and care level.";
        }

        return null;
    }

    private async Task<Guid?> ApplyToInventoryAsync(Order order, DateOnly completedDate, CancellationToken ct)
    {
        var premise = await _premises.GetByUprnAsync(order.Uprn, ct);
        if (premise is null)
        {
            throw new NotFoundException("Premise", order.Uprn);
        }

        switch (order.Type)
        {
            case OrderType.Provide:
                return await ProvideServiceAsync(order, premise, completedDate, ct);

            case OrderType.Cease:
            {
                var service = await LoadExistingServiceAsync(order, ct);
                service.Cease(completedDate);
                premise.MarkServiceActive(false);
                return service.Id;
            }

            case OrderType.Modify:
            {
                var service = await LoadExistingServiceAsync(order, ct);
                service.ChangeProduct(order.ProductCode!, order.CareLevel, order.MonthlyRental!.Value, completedDate);
                return service.Id;
            }

            case OrderType.Migrate:
            {
                var service = await _services.GetActiveByUprnAsync(order.Uprn, ct);
                if (service is null)
                {
                    throw new ConflictException("order.nothing_to_migrate", "No active service remains at the premise to migrate.");
                }

                service.TransferTo(order.PartnerId, order.ProductCode!, order.CareLevel, order.MonthlyRental!.Value, completedDate);
                return service.Id;
            }

            default:
                throw new DomainException("order.unknown_type", $"Unsupported order type {order.Type}.");
        }
    }

    private async Task<Guid?> ProvideServiceAsync(Order order, Premise premise, DateOnly completedDate, CancellationToken ct)
    {
        var reference = await _references.NextAsync("SVC", ct);
        var service = new WholesaleService(reference, order.PartnerId, order.Uprn, order.ProductCode!, order.CareLevel,
            order.MonthlyRental!.Value, completedDate);
        await _services.AddAsync(service, ct);
        premise.MarkServiceActive(true);
        return service.Id;
    }

    private async Task<WholesaleService> LoadExistingServiceAsync(Order order, CancellationToken ct)
    {
        var service = await _services.GetAsync(order.ExistingServiceId!.Value, ct);
        if (service is null)
        {
            throw new NotFoundException("Service", order.ExistingServiceId);
        }

        return service;
    }
}
