using Microsoft.EntityFrameworkCore;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Payments;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;
using Uconnect.Domain.Tickets;
using Uconnect.Domain.Usage;

namespace Uconnect.Infrastructure.Persistence;

public sealed class UconnectDbContext : DbContext
{
    public const string Schema = "uconnect";

    public UconnectDbContext(DbContextOptions<UconnectDbContext> options) : base(options)
    {
    }

    public DbSet<Account> Accounts => Set<Account>();

    public DbSet<AccountUser> AccountUsers => Set<AccountUser>();

    public DbSet<Plan> Plans => Set<Plan>();

    public DbSet<Service> Services => Set<Service>();

    public DbSet<PlanChange> PlanChanges => Set<PlanChange>();

    public DbSet<Invoice> Invoices => Set<Invoice>();

    public DbSet<AccountAdjustment> Adjustments => Set<AccountAdjustment>();

    public DbSet<Payment> Payments => Set<Payment>();

    public DbSet<PaymentMethod> PaymentMethods => Set<PaymentMethod>();

    public DbSet<AutopaySettings> AutopaySettings => Set<AutopaySettings>();

    public DbSet<UsageRecord> UsageRecords => Set<UsageRecord>();

    public DbSet<Outage> Outages => Set<Outage>();

    public DbSet<OutageNotification> OutageNotifications => Set<OutageNotification>();

    public DbSet<Ticket> Tickets => Set<Ticket>();

    public DbSet<Appointment> Appointments => Set<Appointment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        foreach (var sequence in ReferenceSequences.All)
        {
            modelBuilder.HasSequence<long>(sequence, Schema).StartsAt(1).IncrementsBy(1);
        }

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(UconnectDbContext).Assembly);

        foreach (var entityType in modelBuilder.Model.GetEntityTypes().Where(t => typeof(AggregateRoot).IsAssignableFrom(t.ClrType)))
        {
            var builder = modelBuilder.Entity(entityType.ClrType);
            builder.Ignore(nameof(AggregateRoot.DomainEvents));
            builder.Property(nameof(AggregateRoot.RowVersion)).IsRowVersion();
        }
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<string>().HaveMaxLength(256);
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(32);
        configurationBuilder.Properties<AccountNumber>().HaveConversion<AccountNumberConverter>().HaveMaxLength(12);
        configurationBuilder.Properties<EmailAddress>().HaveConversion<EmailAddressConverter>().HaveMaxLength(254);
        configurationBuilder.Properties<PhoneNumber>().HaveConversion<PhoneNumberConverter>().HaveMaxLength(16);
    }
}
