using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;

namespace Uconnect.Infrastructure.Persistence.Configurations;

internal sealed class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.ToTable("accounts");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Number).HasColumnName("account_number").IsRequired();
        builder.HasIndex(a => a.Number).IsUnique();
        builder.Property(a => a.Name).HasMaxLength(160).IsRequired();
        builder.Property(a => a.BillingEmail).IsRequired();
        builder.Property(a => a.Currency).HasMaxLength(3).IsFixedLength();
        builder.Property(a => a.SuspensionReason).HasMaxLength(500);
        builder.HasAddress(a => a.BillingAddress, "billing");
        builder.HasIndex(a => new { a.BillingDay, a.Status });
    }
}

internal sealed class AccountUserConfiguration : IEntityTypeConfiguration<AccountUser>
{
    public void Configure(EntityTypeBuilder<AccountUser> builder)
    {
        builder.ToTable("account_users");
        builder.HasKey(u => u.Id);
        builder.Property(u => u.SubjectId).HasMaxLength(128).IsRequired();
        builder.Property(u => u.DisplayName).HasMaxLength(120).IsRequired();
        builder.Property(u => u.Role).HasMaxLength(32).IsRequired();
        builder.HasOne<Account>().WithMany().HasForeignKey(u => u.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(u => new { u.AccountId, u.SubjectId }).IsUnique().HasFilter("[IsActive] = 1");
        builder.HasIndex(u => u.SubjectId);
    }
}

internal sealed class PlanConfiguration : IEntityTypeConfiguration<Plan>
{
    public void Configure(EntityTypeBuilder<Plan> builder)
    {
        builder.ToTable("plans");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Code).HasMaxLength(40).IsRequired();
        builder.HasIndex(p => p.Code).IsUnique();
        builder.Property(p => p.Name).HasMaxLength(120).IsRequired();
        builder.HasMoney(p => p.MonthlyPrice, "monthly_price");
        builder.HasMoney(p => p.SetupFee, "setup_fee");
        builder.Property(p => p.OveragePerGb).HasConversion<OptionalMoneyConverter>().HasMaxLength(32);
        builder.HasIndex(p => new { p.ProductType, p.IsActive });
    }
}

internal sealed class ServiceConfiguration : IEntityTypeConfiguration<Service>
{
    /// <summary>Persisted outward code of the service postcode, so outage impact is an indexed lookup.</summary>
    public const string OutwardCodeColumn = "ServiceOutwardCode";

    public void Configure(EntityTypeBuilder<Service> builder)
    {
        builder.ToTable("services");
        builder.HasKey(s => s.Id);
        builder.Property(s => s.ServiceReference).HasMaxLength(32).IsRequired();
        builder.HasIndex(s => s.ServiceReference).IsUnique();
        builder.HasOne<Account>().WithMany().HasForeignKey(s => s.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Plan>().WithMany().HasForeignKey(s => s.PlanId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMoney(s => s.MonthlyPrice, "monthly_price");
        builder.HasAddress(s => s.ServiceAddress, "service");
        builder.Property<string>(OutwardCodeColumn)
            .HasMaxLength(4)
            .HasComputedColumnSql("LEFT([service_postcode], CHARINDEX(' ', [service_postcode] + ' ') - 1)", stored: true);
        builder.HasIndex(OutwardCodeColumn, nameof(Service.Status));
        builder.HasIndex(s => s.AccountId);
    }
}

internal sealed class PlanChangeConfiguration : IEntityTypeConfiguration<PlanChange>
{
    public void Configure(EntityTypeBuilder<PlanChange> builder)
    {
        builder.ToTable("plan_changes");
        builder.HasKey(c => c.Id);
        builder.HasOne<Service>().WithMany().HasForeignKey(c => c.ServiceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMoney(c => c.PreviousMonthlyPrice, "previous_monthly_price");
        builder.HasMoney(c => c.NewMonthlyPrice, "new_monthly_price");
        builder.HasMoney(c => c.ProrationCredit, "proration_credit");
        builder.HasMoney(c => c.ProrationCharge, "proration_charge");
        builder.HasMoney(c => c.EarlyTerminationFee, "early_termination_fee");
        builder.Property(c => c.ProvisioningOrderRef).HasMaxLength(64);
        builder.Property(c => c.FailureReason).HasMaxLength(500);
        builder.HasIndex(c => c.ProvisioningOrderRef).IsUnique().HasFilter("[ProvisioningOrderRef] IS NOT NULL");
        builder.HasIndex(c => new { c.Status, c.EffectiveOn });
        builder.HasIndex(c => c.AccountId);
    }
}
