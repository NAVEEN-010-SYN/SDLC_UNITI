using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IConnect.Wholesale.Infrastructure.Persistence.Configurations;

internal sealed class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("orders");
        builder.HasKey(o => o.Id);
        builder.Property(o => o.RowVersion).IsRowVersion();
        builder.Ignore(o => o.DomainEvents);
        builder.Ignore(o => o.IsOnHold);

        builder.Property(o => o.Reference).HasMaxLength(16).IsRequired();
        builder.HasIndex(o => o.Reference).IsUnique();
        builder.Property(o => o.PartnerReference).HasMaxLength(40).IsRequired();
        builder.HasIndex(o => new { o.PartnerId, o.PartnerReference }).IsUnique();
        builder.HasIndex(o => new { o.PartnerId, o.Status, o.CreatedAt });
        builder.HasIndex(o => new { o.Uprn, o.Status });

        builder.Property(o => o.Uprn).HasMaxLength(12).IsRequired();
        builder.Property(o => o.ProductCode).HasMaxLength(24);
        builder.Property(o => o.MigrationAuthCode).HasMaxLength(9);
        builder.Property(o => o.FailureReason).HasMaxLength(500);
        builder.Property(o => o.HoldReason).HasMaxLength(500);

        builder.OwnsOne(o => o.DeliveryClock, clock =>
        {
            clock.ToJson("delivery_clock");
            clock.OwnsMany(c => c.Pauses);
            clock.Navigation(c => c.Pauses).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_pauses");
        });

        builder.OwnsMany(o => o.History, history => history.ToJson("history"));
        builder.Navigation(o => o.History).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_history");
    }
}

internal sealed class BulkUploadConfiguration : IEntityTypeConfiguration<BulkUpload>
{
    public void Configure(EntityTypeBuilder<BulkUpload> builder)
    {
        builder.ToTable("bulk_uploads");
        builder.HasKey(b => b.Id);
        builder.Property(b => b.RowVersion).IsRowVersion();
        builder.Property(b => b.FileName).HasMaxLength(255).IsRequired();
        builder.Property(b => b.ContentSha256).HasMaxLength(64).IsFixedLength().IsRequired();
        builder.Property(b => b.UploadedBy).HasMaxLength(128).IsRequired();
        builder.HasIndex(b => new { b.PartnerId, b.ContentSha256 });
        builder.OwnsMany(b => b.Errors, errors => errors.ToJson("errors"));
    }
}

internal sealed class WholesaleServiceConfiguration : IEntityTypeConfiguration<WholesaleService>
{
    public void Configure(EntityTypeBuilder<WholesaleService> builder)
    {
        builder.ToTable("services");
        builder.HasKey(s => s.Id);
        builder.Property(s => s.RowVersion).IsRowVersion();
        builder.Ignore(s => s.IsActive);
        builder.Property(s => s.Reference).HasMaxLength(16).IsRequired();
        builder.HasIndex(s => s.Reference).IsUnique();
        builder.Property(s => s.Uprn).HasMaxLength(12).IsRequired();
        builder.Property(s => s.ProductCode).HasMaxLength(24).IsRequired();
        builder.HasIndex(s => new { s.PartnerId, s.CeasedOn });

        // At most one live service per premise (single ONT port).
        builder.HasIndex(s => s.Uprn).IsUnique().HasFilter("\"CeasedOn\" IS NULL");

        builder.OwnsMany(s => s.RentalPeriods, periods => periods.ToJson("rental_periods"));
        builder.Navigation(s => s.RentalPeriods).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_rentalPeriods");
    }
}
