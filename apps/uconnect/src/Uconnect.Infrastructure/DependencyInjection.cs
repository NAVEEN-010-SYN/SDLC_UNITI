using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Infrastructure.Common;
using Uconnect.Infrastructure.External;
using Uconnect.Infrastructure.Persistence;
using Uconnect.Infrastructure.Persistence.Repositories;

namespace Uconnect.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Registers persistence, downstream clients and validated options. The connection string and API
    /// keys are read from configuration, which in production is populated from environment variables.
    /// </summary>
    public static IServiceCollection AddUconnectInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        AddOptions<BillingOptions>(services, configuration, BillingOptions.SectionName);
        AddOptions<CompensationOptions>(services, configuration, CompensationOptions.SectionName);
        AddOptions<PortalOptions>(services, configuration, PortalOptions.SectionName);
        AddOptions<AppointmentOptions>(services, configuration, AppointmentOptions.SectionName);
        services.Configure<HolidayOptions>(configuration.GetSection(HolidayOptions.SectionName));

        var connectionString = configuration.GetConnectionString("Uconnect")
            ?? throw new InvalidOperationException("Connection string 'Uconnect' is not configured (set ConnectionStrings__Uconnect).");
        services.AddDbContext<UconnectDbContext>(options => options.UseSqlServer(connectionString, sql =>
        {
            sql.EnableRetryOnFailure(maxRetryCount: 3);
            sql.MigrationsHistoryTable("__ef_migrations", UconnectDbContext.Schema);
        }));

        services.AddSingleton<IClock, SystemClock>();
        services.AddSingleton<IHolidayCalendar, ConfiguredHolidayCalendar>();
        services.AddScoped<IDomainEventDispatcher, DomainEventDispatcher>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IReferenceGenerator, ReferenceGenerator>();

        services.AddScoped<IAccountRepository, AccountRepository>();
        services.AddScoped<IAccountUserRepository, AccountUserRepository>();
        services.AddScoped<IPlanRepository, PlanRepository>();
        services.AddScoped<IServiceRepository, ServiceRepository>();
        services.AddScoped<IPlanChangeRepository, PlanChangeRepository>();
        services.AddScoped<InvoiceRepository>();
        services.AddScoped<IInvoiceRepository>(sp => sp.GetRequiredService<InvoiceRepository>());
        services.AddScoped<IInvoiceNumberLookup>(sp => sp.GetRequiredService<InvoiceRepository>());
        services.AddScoped<IAdjustmentRepository, AdjustmentRepository>();
        services.AddScoped<IPaymentRepository, PaymentRepository>();
        services.AddScoped<IPaymentMethodRepository, PaymentMethodRepository>();
        services.AddScoped<IAutopayRepository, AutopayRepository>();
        services.AddScoped<IUsageRepository, UsageRepository>();
        services.AddScoped<IOutageRepository, OutageRepository>();
        services.AddScoped<ITicketRepository, TicketRepository>();
        services.AddScoped<IAppointmentRepository, AppointmentRepository>();

        AddDownstream<IProvisioningClient, ProvisioningClient>(services, configuration, ExternalSystems.Provisioning);
        AddDownstream<IBillingSystemClient, BillingSystemClient>(services, configuration, ExternalSystems.BillingSystem);
        AddDownstream<IFieldServiceClient, FieldServiceClient>(services, configuration, ExternalSystems.FieldService);
        AddDownstream<NotificationServiceClient, NotificationServiceClient>(services, configuration, ExternalSystems.Notifications);
        services.AddTransient<IEmailSender>(sp => sp.GetRequiredService<NotificationServiceClient>());
        services.AddTransient<ISmsSender>(sp => sp.GetRequiredService<NotificationServiceClient>());

        // Card charges are never retried by the HTTP pipeline beyond what the idempotency key makes safe.
        AddDownstream<IPaymentGateway, PaymentGatewayClient>(services, configuration, ExternalSystems.PaymentGateway);
        return services;
    }

    private static void AddOptions<TOptions>(IServiceCollection services, IConfiguration configuration, string section)
        where TOptions : class =>
        services.AddOptions<TOptions>().Bind(configuration.GetSection(section)).ValidateDataAnnotations().ValidateOnStart();

    private static void AddDownstream<TContract, TClient>(IServiceCollection services, IConfiguration configuration, string system)
        where TContract : class
        where TClient : class, TContract
    {
        services.AddOptions<ExternalEndpointOptions>(system)
            .Bind(configuration.GetSection($"{ExternalSystems.SectionPrefix}:{system}"))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddHttpClient<TContract, TClient>((sp, client) =>
            {
                var options = sp.GetRequiredService<IOptionsMonitor<ExternalEndpointOptions>>().Get(system);
                client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
                client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds * 4);
                client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
            })
            .AddHttpMessageHandler(sp => new DownstreamHeadersHandler(sp.GetRequiredService<IOptionsMonitor<ExternalEndpointOptions>>(), system))
            .AddStandardResilienceHandler(resilience =>
            {
                var timeout = TimeSpan.FromSeconds(configuration.GetValue($"{ExternalSystems.SectionPrefix}:{system}:TimeoutSeconds", 15));
                resilience.AttemptTimeout.Timeout = timeout;
                resilience.TotalRequestTimeout.Timeout = timeout * 3;
                resilience.CircuitBreaker.SamplingDuration = timeout * 2;
            });
    }
}
