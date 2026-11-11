using IConnect.Wholesale.Application.ApiKeys;
using IConnect.Wholesale.Application.Appointments;
using IConnect.Wholesale.Application.Availability;
using IConnect.Wholesale.Application.Billing;
using IConnect.Wholesale.Application.BulkOrders;
using IConnect.Wholesale.Application.Catalogue;
using IConnect.Wholesale.Application.Faults;
using IConnect.Wholesale.Application.Orders;
using IConnect.Wholesale.Application.Sla;
using IConnect.Wholesale.Domain.Sla;
using Microsoft.Extensions.DependencyInjection;

namespace IConnect.Wholesale.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddWholesaleApplication(this IServiceCollection services)
    {
        services.AddSingleton(SlaPolicy.Default());
        services.AddSingleton(ServiceCreditCalculator.Default());
        services.AddSingleton<StatementGenerator>();

        services.AddScoped<PricingService>();
        services.AddScoped<CatalogueService>();
        services.AddScoped<AvailabilityService>();
        services.AddScoped<OrderService>();
        services.AddScoped<BulkOrderService>();
        services.AddScoped<AppointmentService>();
        services.AddScoped<FaultService>();
        services.AddScoped<ApiKeyService>();
        services.AddScoped<BillingService>();
        services.AddScoped<SlaBreachMonitor>();
        services.AddScoped<SlaDashboardService>();
        return services;
    }
}
