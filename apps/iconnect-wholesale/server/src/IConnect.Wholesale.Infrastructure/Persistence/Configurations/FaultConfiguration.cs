using IConnect.Wholesale.Domain.Appointments;
using IConnect.Wholesale.Domain.Faults;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IConnect.Wholesale.Infrastructure.Persistence.Configurations;

internal sealed class FaultConfiguration : IEntityTypeConfiguration<Fault>
{
    public void Configure(EntityTypeBuilder<Fault> builder)
    {
        builder.ToTable("faults");
        builder.HasKey(f => f.Id);
        builder.Property(f => f.RowVersion).IsRowVersion();
        builder.Ignore(f => f.DomainEvents);

        builder.Property(f => f.Reference).HasMaxLength(16).IsRequired();
        builder.HasIndex(f => f.Reference).IsUnique();
        builder.HasIndex(f => new { f.PartnerId, f.Status, f.CreatedAt });
        builder.HasIndex(f => new { f.ServiceId, f.Status });
        builder.Property(f => f.Uprn).HasMaxLength(12).IsRequired();
        builder.Property(f => f.Description).HasMaxLength(2000).IsRequired();
        builder.Property(f => f.ResolutionCode).HasMaxLength(40);
        builder.Property(f => f.ServiceCreditBasis).HasMaxLength(200);

        builder.OwnsOne(f => f.RepairClock, clock =>
        {
            clock.ToJson("repair_clock");
            clock.OwnsMany(c => c.Pauses);
            clock.Navigation(c => c.Pauses).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_pauses");
        });

        builder.OwnsMany(f => f.Notes, notes => notes.ToJson("notes"));
        builder.Navigation(f => f.Notes).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_notes");
    }
}

internal sealed class AppointmentSlotConfiguration : IEntityTypeConfiguration<AppointmentSlot>
{
    public void Configure(EntityTypeBuilder<AppointmentSlot> builder)
    {
        builder.ToTable("appointment_slots");
        builder.HasKey(s => s.Id);

        // Concurrency token matters here: two partners reserving the last unit of capacity.
        builder.Property(s => s.RowVersion).IsRowVersion();
        builder.Property(s => s.ExchangeCode).HasMaxLength(8).IsRequired();
        builder.HasIndex(s => new { s.ExchangeCode, s.Date, s.Band }).IsUnique();

        builder.OwnsMany(s => s.Reservations, r => r.ToJson("reservations"));
        builder.Navigation(s => s.Reservations).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_reservations");
    }
}
