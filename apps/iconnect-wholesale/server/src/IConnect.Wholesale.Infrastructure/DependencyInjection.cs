using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Infrastructure.Notifications;
using IConnect.Wholesale.Infrastructure.Persistence;
using IConnect.Wholesale.Infrastructure.Persistence.Repositories;
using IConnect.Wholesale.Infrastructure.Time;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace IConnect.Wholesale.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Registers persistence, calendars, references and outbound notifications.
    /// <paramref name="configureWebhookClient"/> lets the host add message handlers (e.g. correlation-id propagation).
    /// </summary>
    public static IServiceCollection AddWholesaleInfrastructure(this IServiceCollection services, IConfiguration configuration,
        Action<IHttpClientBuilder>? configureWebhookClient = null)
    {
        var connectionString = configuration.GetConnectionString("Wholesale");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("ConnectionStrings:Wholesale is not configured (set ConnectionStrings__Wholesale).");
        }

        services.AddDbContext<WholesaleDbContext>(options => options.UseNpgsql(connectionString, npgsql =>
        {
            npgsql.MigrationsHistoryTable("__ef_migrations", "wholesale");
            npgsql.EnableRetryOnFailure(3);
        }));

        services.AddScoped<IPremiseRepository, PremiseRepository>();
        services.AddScoped<ICatalogueRepository, CatalogueRepository>();
        services.AddScoped<IPartnerRepository, PartnerRepository>();
        services.AddScoped<IApiKeyRepository, ApiKeyRepository>();
        services.AddScoped<IOrderRepository, OrderRepository>();
        services.AddScoped<IServiceRepository, ServiceRepository>();
        services.AddScoped<IBulkUploadRepository, BulkUploadRepository>();
        services.AddScoped<IFaultRepository, FaultRepository>();
        services.AddScoped<IAppointmentSlotRepository, AppointmentSlotRepository>();
        services.AddScoped<IStatementRepository, StatementRepository>();
        services.AddScoped<IDisputeRepository, DisputeRepository>();
        services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        services.AddScoped<IReferenceGenerator, SequenceReferenceGenerator>();

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IClock, SystemClock>();

        services.Configure<CalendarOptions>(configuration.GetSection(CalendarOptions.Section));
        services.AddSingleton<ICalendarProvider, CalendarProvider>();

        services.Configure<WebhookOptions>(configuration.GetSection(WebhookOptions.Section));
        var webhookClient = services.AddHttpClient(WebhookPartnerNotifier.ClientName);
        configureWebhookClient?.Invoke(webhookClient);
        services.AddScoped<IPartnerNotifier, WebhookPartnerNotifier>();

        return services;
    }
}
