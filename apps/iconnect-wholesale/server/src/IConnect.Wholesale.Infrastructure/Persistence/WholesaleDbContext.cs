using IConnect.Wholesale.Domain.Appointments;
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Partners;
using IConnect.Wholesale.Domain.Services;
using IConnect.Wholesale.Domain.Sla;
using IConnect.Wholesale.Infrastructure.Persistence.Converters;
using Microsoft.EntityFrameworkCore;

namespace IConnect.Wholesale.Infrastructure.Persistence;

public sealed class WholesaleDbContext : DbContext
{
    public WholesaleDbContext(DbContextOptions<WholesaleDbContext> options)
        : base(options)
    {
    }

    public DbSet<Partner> Partners => Set<Partner>();

    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();

    public DbSet<Premise> Premises => Set<Premise>();

    public DbSet<WholesaleProduct> Products => Set<WholesaleProduct>();

    public DbSet<PriceBook> PriceBooks => Set<PriceBook>();

    public DbSet<Order> Orders => Set<Order>();

    public DbSet<BulkUpload> BulkUploads => Set<BulkUpload>();

    public DbSet<WholesaleService> Services => Set<WholesaleService>();

    public DbSet<AppointmentSlot> AppointmentSlots => Set<AppointmentSlot>();

    public DbSet<Fault> Faults => Set<Fault>();

    public DbSet<BillingStatement> Statements => Set<BillingStatement>();

    public DbSet<Dispute> Disputes => Set<Dispute>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<Money>().HaveConversion<MoneyConverter>().HaveMaxLength(32);
        configurationBuilder.Properties<DateOnly>().HaveColumnType("date");

        configurationBuilder.Properties<OrderType>().HaveConversion<string>().HaveMaxLength(16);
        configurationBuilder.Properties<OrderStatus>().HaveConversion<string>().HaveMaxLength(16);
        configurationBuilder.Properties<CareLevel>().HaveConversion<string>().HaveMaxLength(16);
        configurationBuilder.Properties<FaultPriority>().HaveConversion<string>().HaveMaxLength(4);
        configurationBuilder.Properties<FaultStatus>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<FaultCategory>().HaveConversion<string>().HaveMaxLength(24);
        configurationBuilder.Properties<PremiseBuildStatus>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<PartnerStatus>().HaveConversion<string>().HaveMaxLength(16);
        configurationBuilder.Properties<SlotBand>().HaveConversion<string>().HaveMaxLength(8);
        configurationBuilder.Properties<StatementStatus>().HaveConversion<string>().HaveMaxLength(16);
        configurationBuilder.Properties<ChargeType>().HaveConversion<string>().HaveMaxLength(24);
        configurationBuilder.Properties<DisputeStatus>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<BulkUploadStatus>().HaveConversion<string>().HaveMaxLength(16);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("wholesale");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(WholesaleDbContext).Assembly);

        foreach (var sequence in ReferenceSequences.All)
        {
            modelBuilder.HasSequence<long>(sequence.Value).StartsAt(1).IncrementsBy(1);
        }
    }
}

/// <summary>Whitelisted reference prefixes and their database sequences.</summary>
public static class ReferenceSequences
{
    public static readonly IReadOnlyDictionary<string, string> All = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["ORD"] = "seq_order_ref",
        ["SVC"] = "seq_service_ref",
        ["FLT"] = "seq_fault_ref",
        ["STM"] = "seq_statement_ref",
        ["DSP"] = "seq_dispute_ref",
    };
}
