using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Accounts;
using Uconnect.Application.Appointments;
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Application.Dashboard;
using Uconnect.Application.Notifications;
using Uconnect.Application.Outages;
using Uconnect.Application.Payments;
using Uconnect.Application.PlanChanges;
using Uconnect.Application.Services;
using Uconnect.Application.Tickets;
using Uconnect.Application.Usage;

namespace Uconnect.Application;

public static class DependencyInjection
{
    /// <summary>
    /// Registers use-case services, validators and domain event handlers. Everything is scoped so it
    /// shares the request's unit of work. Options and I/O adapters are registered by the infrastructure layer.
    /// </summary>
    public static IServiceCollection AddUconnectApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssemblyContaining<UpdateProfileRequestValidator>(ServiceLifetime.Singleton, includeInternalTypes: true);

        services.AddScoped<AccountAccessGuard>();
        services.AddScoped<CustomerNotifier>();
        services.AddScoped<ProfileService>();
        services.AddScoped<AccountUserService>();
        services.AddScoped<ServiceInventoryService>();
        services.AddScoped<PlanChangeService>();
        services.AddScoped<PlanChangeProcessor>();
        services.AddScoped<InvoiceService>();
        services.AddScoped<BillingRunService>();
        services.AddScoped<AdjustmentService>();
        services.AddScoped<PaymentExecutor>();
        services.AddScoped<PaymentService>();
        services.AddScoped<PaymentMethodService>();
        services.AddScoped<AutopayProcessor>();
        services.AddScoped<TicketService>();
        services.AddScoped<TicketHousekeeping>();
        services.AddScoped<AppointmentService>();
        services.AddScoped<OutageService>();
        services.AddScoped<UsageService>();
        services.AddScoped<DashboardService>();

        RegisterEventHandlers(services);
        return services;
    }

    /// <summary>Registers every <see cref="IDomainEventHandler{TEvent}"/> implementation once per handled event type.</summary>
    private static void RegisterEventHandlers(IServiceCollection services)
    {
        var handlerTypes = typeof(DependencyInjection).Assembly.GetTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false });

        foreach (var type in handlerTypes)
        {
            var handled = type.GetInterfaces()
                .Where(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IDomainEventHandler<>))
                .ToList();
            if (handled.Count == 0)
            {
                continue;
            }

            services.AddScoped(type);
            foreach (var contract in handled)
            {
                services.AddScoped(contract, sp => sp.GetRequiredService(type));
            }
        }
    }
}
