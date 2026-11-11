using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Services;
using Uconnect.Domain.Tickets;
using Uconnect.Domain.Usage;

namespace Uconnect.Infrastructure.Persistence.Configurations;

internal sealed class TicketConfiguration : IEntityTypeConfiguration<Ticket>
{
    public void Configure(EntityTypeBuilder<Ticket> builder)
    {
        builder.ToTable("tickets");
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Reference).HasMaxLength(20).IsRequired();
        builder.HasIndex(t => t.Reference).IsUnique();
        builder.HasOne<Account>().WithMany().HasForeignKey(t => t.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(t => t.Subject).HasMaxLength(150).IsRequired();
        builder.Property(t => t.Description).HasMaxLength(4000).IsRequired();
        builder.Property(t => t.ResolutionSummary).HasMaxLength(2000);
        builder.HasIndex(t => new { t.AccountId, t.Status, t.LastActivityAt });
        builder.HasIndex(t => new { t.ServiceId, t.Status });

        builder.HasMany(t => t.Comments).WithOne().HasForeignKey(c => c.TicketId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(t => t.Comments).UsePropertyAccessMode(PropertyAccessMode.Field).AutoInclude();
    }
}

internal sealed class TicketCommentConfiguration : IEntityTypeConfiguration<TicketComment>
{
    public void Configure(EntityTypeBuilder<TicketComment> builder)
    {
        builder.ToTable("ticket_comments");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).ValueGeneratedNever();
        builder.Property(c => c.AuthorName).HasMaxLength(120).IsRequired();
        builder.Property(c => c.Body).HasMaxLength(4000).IsRequired();
    }
}

internal sealed class AppointmentConfiguration : IEntityTypeConfiguration<Appointment>
{
    public void Configure(EntityTypeBuilder<Appointment> builder)
    {
        builder.ToTable("appointments");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Reference).HasMaxLength(20).IsRequired();
        builder.HasIndex(a => a.Reference).IsUnique();
        builder.HasOne<Account>().WithMany().HasForeignKey(a => a.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Service>().WithMany().HasForeignKey(a => a.ServiceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Ticket>().WithMany().HasForeignKey(a => a.TicketId).OnDelete(DeleteBehavior.Restrict);
        builder.HasAddress(a => a.VisitAddress, "visit");
        builder.Property(a => a.ContactName).HasMaxLength(120).IsRequired();
        builder.Property(a => a.ContactPhone).IsRequired();
        builder.Property(a => a.AccessNotes).HasMaxLength(500);
        builder.Property(a => a.EngineerName).HasMaxLength(120);
        builder.Property(a => a.FieldWorkOrderRef).HasMaxLength(40);
        builder.Property(a => a.CancellationReason).HasMaxLength(500);
        builder.Property(a => a.OutcomeNotes).HasMaxLength(2000);
        builder.HasIndex(a => new { a.AccountId, a.Date });
        builder.HasIndex(a => new { a.ServiceId, a.Type, a.Status });
    }
}

internal sealed class OutageConfiguration : IEntityTypeConfiguration<Outage>
{
    public void Configure(EntityTypeBuilder<Outage> builder)
    {
        builder.ToTable("outages");
        builder.HasKey(o => o.Id);
        builder.Property(o => o.Reference).HasMaxLength(20).IsRequired();
        builder.HasIndex(o => o.Reference).IsUnique();
        builder.Property(o => o.Title).HasMaxLength(150).IsRequired();
        builder.Property(o => o.Description).HasMaxLength(2000).IsRequired();
        builder.Property(o => o.AffectedOutwardCodes).HasMaxLength(4000);
        builder.HasIndex(o => new { o.Status, o.ResolvedAt });

        builder.HasMany(o => o.Updates).WithOne().HasForeignKey(u => u.OutageId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(o => o.Updates).HasField("_updates").UsePropertyAccessMode(PropertyAccessMode.Field).AutoInclude();
    }
}

internal sealed class OutageUpdateConfiguration : IEntityTypeConfiguration<OutageUpdate>
{
    public void Configure(EntityTypeBuilder<OutageUpdate> builder)
    {
        builder.ToTable("outage_updates");
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Id).ValueGeneratedNever();
        builder.Property(u => u.Message).HasMaxLength(2000).IsRequired();
    }
}

internal sealed class OutageNotificationConfiguration : IEntityTypeConfiguration<OutageNotification>
{
    public void Configure(EntityTypeBuilder<OutageNotification> builder)
    {
        builder.ToTable("outage_notifications");
        builder.HasKey(n => n.Id);
        builder.HasOne<Outage>().WithMany().HasForeignKey(n => n.OutageId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(n => new { n.OutageId, n.AccountId, n.Kind, n.Channel }).IsUnique();
    }
}

internal sealed class UsageRecordConfiguration : IEntityTypeConfiguration<UsageRecord>
{
    public void Configure(EntityTypeBuilder<UsageRecord> builder)
    {
        builder.ToTable("usage_records");
        builder.HasKey(u => u.Id);
        builder.HasOne<Service>().WithMany().HasForeignKey(u => u.ServiceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(u => new { u.ServiceId, u.UsageDate }).IsUnique();
    }
}
