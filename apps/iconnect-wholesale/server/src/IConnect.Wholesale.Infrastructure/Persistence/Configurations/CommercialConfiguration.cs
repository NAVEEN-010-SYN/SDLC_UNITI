using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IConnect.Wholesale.Infrastructure.Persistence.Configurations;

internal sealed class PartnerConfiguration : IEntityTypeConfiguration<Partner>
{
    public void Configure(EntityTypeBuilder<Partner> builder)
    {
        builder.ToTable("partners");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.RowVersion).IsRowVersion();
        builder.Ignore(p => p.CanTrade);
        builder.Property(p => p.Name).HasMaxLength(120).IsRequired();
        builder.Property(p => p.AccountNumber).HasMaxLength(12).IsFixedLength().IsRequired();
        builder.HasIndex(p => p.AccountNumber).IsUnique();
        builder.Property(p => p.Currency).HasMaxLength(3).IsFixedLength();
    }
}

internal sealed class ApiKeyConfiguration : IEntityTypeConfiguration<ApiKey>
{
    public void Configure(EntityTypeBuilder<ApiKey> builder)
    {
        builder.ToTable("api_keys");
        builder.HasKey(k => k.Id);
        builder.Property(k => k.RowVersion).IsRowVersion();
        builder.Property(k => k.Name).HasMaxLength(60).IsRequired();
        builder.Property(k => k.Prefix).HasMaxLength(12).IsFixedLength().IsRequired();
        builder.HasIndex(k => k.Prefix).IsUnique();
        builder.Property(k => k.SecretHash).HasMaxLength(64).IsFixedLength().IsRequired();
        builder.Property(k => k.CreatedBy).HasMaxLength(128).IsRequired();
        builder.HasIndex(k => k.PartnerId);
        builder.HasOne<Partner>().WithMany().HasForeignKey(k => k.PartnerId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class PremiseConfiguration : IEntityTypeConfiguration<Premise>
{
    public void Configure(EntityTypeBuilder<Premise> builder)
    {
        builder.ToTable("premises");
        builder.HasKey(p => p.Uprn);
        builder.Property(p => p.Uprn).HasMaxLength(12);
        builder.Ignore(p => p.SingleLineAddress);
        builder.Property(p => p.AddressLine1).HasMaxLength(120).IsRequired();
        builder.Property(p => p.AddressLine2).HasMaxLength(120);
        builder.Property(p => p.Town).HasMaxLength(60).IsRequired();
        builder.Property(p => p.Postcode).HasMaxLength(8).IsRequired();
        builder.Property(p => p.ExchangeCode).HasMaxLength(8).IsRequired();
        builder.HasIndex(p => p.Postcode);
    }
}

internal sealed class ProductConfiguration : IEntityTypeConfiguration<WholesaleProduct>
{
    public void Configure(EntityTypeBuilder<WholesaleProduct> builder)
    {
        builder.ToTable("products");
        builder.HasKey(p => p.Code);
        builder.Property(p => p.Code).HasMaxLength(24);
        builder.Property(p => p.Name).HasMaxLength(80).IsRequired();
        builder.PrimitiveCollection(p => p.AvailableCareLevels);
    }
}

internal sealed class PriceBookConfiguration : IEntityTypeConfiguration<PriceBook>
{
    public void Configure(EntityTypeBuilder<PriceBook> builder)
    {
        builder.ToTable("price_books");
        builder.HasKey(b => b.Id);
        builder.Property(b => b.Version).HasMaxLength(20).IsRequired();
        builder.HasIndex(b => b.Version).IsUnique();
        builder.HasIndex(b => b.EffectiveFrom).IsUnique();
        builder.Property(b => b.Currency).HasMaxLength(3).IsFixedLength();

        builder.OwnsMany(b => b.Entries, e => e.ToJson("entries"));
        builder.Navigation(b => b.Entries).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_entries");
        builder.OwnsMany(b => b.Tiers, t => t.ToJson("tiers"));
        builder.Navigation(b => b.Tiers).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_tiers");
    }
}

internal sealed class StatementConfiguration : IEntityTypeConfiguration<BillingStatement>
{
    public void Configure(EntityTypeBuilder<BillingStatement> builder)
    {
        builder.ToTable("statements");
        builder.HasKey(s => s.Id);
        builder.Property(s => s.RowVersion).IsRowVersion();
        builder.Ignore(s => s.DomainEvents);
        builder.Ignore(s => s.Charges);
        builder.Ignore(s => s.Credits);
        builder.Ignore(s => s.Total);
        builder.Ignore(s => s.DaysInPeriod);
        builder.Property(s => s.Reference).HasMaxLength(16).IsRequired();
        builder.HasIndex(s => s.Reference).IsUnique();
        builder.HasIndex(s => new { s.PartnerId, s.PeriodStart }).IsUnique();
        builder.Property(s => s.Currency).HasMaxLength(3).IsFixedLength();

        builder.OwnsMany(s => s.Lines, l => l.ToJson("lines"));
        builder.Navigation(s => s.Lines).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_lines");
    }
}

internal sealed class DisputeConfiguration : IEntityTypeConfiguration<Dispute>
{
    public void Configure(EntityTypeBuilder<Dispute> builder)
    {
        builder.ToTable("disputes");
        builder.HasKey(d => d.Id);
        builder.Property(d => d.RowVersion).IsRowVersion();
        builder.Ignore(d => d.DomainEvents);
        builder.Ignore(d => d.IsOpen);
        builder.Property(d => d.Reference).HasMaxLength(16).IsRequired();
        builder.HasIndex(d => d.Reference).IsUnique();
        builder.HasIndex(d => d.StatementId);
        builder.HasIndex(d => d.PartnerId);
        builder.Property(d => d.Reason).HasMaxLength(2000).IsRequired();
        builder.Property(d => d.Outcome).HasMaxLength(2000);
        builder.PrimitiveCollection(d => d.LineIds);
        builder.HasOne<BillingStatement>().WithMany().HasForeignKey(d => d.StatementId).OnDelete(DeleteBehavior.Restrict);
    }
}
