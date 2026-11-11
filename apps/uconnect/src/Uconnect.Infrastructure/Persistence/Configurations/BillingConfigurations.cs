using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Payments;

namespace Uconnect.Infrastructure.Persistence.Configurations;

internal sealed class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.ToTable("invoices");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.InvoiceNumber).HasMaxLength(32).IsRequired();
        builder.HasIndex(i => i.InvoiceNumber).IsUnique();
        builder.HasOne<Account>().WithMany().HasForeignKey(i => i.AccountId).OnDelete(DeleteBehavior.Restrict);

        // One invoice per account per cycle: a concurrent second billing run fails on this index.
        builder.HasIndex(i => new { i.AccountId, i.PeriodStart }).IsUnique();
        builder.HasIndex(i => new { i.Status, i.DueOn });

        builder.Property(i => i.Currency).HasMaxLength(3).IsFixedLength();
        builder.Property(i => i.VoidReason).HasMaxLength(500);
        builder.HasMoney(i => i.Subtotal, "subtotal");
        builder.HasMoney(i => i.TaxTotal, "tax_total");
        builder.HasMoney(i => i.Total, "total");
        builder.HasMoney(i => i.AmountPaid, "amount_paid");
        builder.HasMoney(i => i.CreditCarriedForward, "credit_carried_forward");

        builder.HasMany(i => i.Lines).WithOne().HasForeignKey(l => l.InvoiceId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(i => i.Lines).UsePropertyAccessMode(PropertyAccessMode.Field).AutoInclude();
    }
}

internal sealed class InvoiceLineConfiguration : IEntityTypeConfiguration<InvoiceLine>
{
    public void Configure(EntityTypeBuilder<InvoiceLine> builder)
    {
        builder.ToTable("invoice_lines");
        builder.HasKey(l => l.Id);
        builder.Property(l => l.Id).ValueGeneratedNever();
        builder.Property(l => l.Description).HasMaxLength(200).IsRequired();
        builder.HasMoney(l => l.UnitAmount, "unit_amount");
        builder.HasMoney(l => l.Amount, "amount");
    }
}

internal sealed class AccountAdjustmentConfiguration : IEntityTypeConfiguration<AccountAdjustment>
{
    public void Configure(EntityTypeBuilder<AccountAdjustment> builder)
    {
        builder.ToTable("account_adjustments");
        builder.HasKey(a => a.Id);
        builder.HasOne<Account>().WithMany().HasForeignKey(a => a.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(a => a.Description).HasMaxLength(200).IsRequired();
        builder.Property(a => a.ApprovalReference).HasMaxLength(40);
        builder.Property(a => a.SourceReference).HasMaxLength(64);
        builder.HasMoney(a => a.Amount, "amount");
        builder.HasIndex(a => new { a.AccountId, a.BilledOnInvoiceId });

        // Compensation is paid once per source (outage / visit / late invoice) and service.
        builder.HasIndex(a => new { a.AccountId, a.SourceReference, a.ServiceId }).IsUnique().HasFilter("[SourceReference] IS NOT NULL");
    }
}

internal sealed class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder.ToTable("payments");
        builder.HasKey(p => p.Id);
        builder.HasOne<Invoice>().WithMany().HasForeignKey(p => p.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<PaymentMethod>().WithMany().HasForeignKey(p => p.PaymentMethodId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(p => p.IdempotencyKey).HasMaxLength(80).IsRequired();
        builder.HasIndex(p => new { p.AccountId, p.IdempotencyKey }).IsUnique();
        builder.Property(p => p.GatewayReference).HasMaxLength(100);
        builder.Property(p => p.FailureCode).HasMaxLength(50);
        builder.Property(p => p.FailureMessage).HasMaxLength(300);
        builder.HasMoney(p => p.Amount, "amount");
        builder.HasMoney(p => p.RefundedAmount, "refunded_amount");
        builder.HasIndex(p => new { p.AccountId, p.CreatedAt });
    }
}

internal sealed class PaymentMethodConfiguration : IEntityTypeConfiguration<PaymentMethod>
{
    public void Configure(EntityTypeBuilder<PaymentMethod> builder)
    {
        builder.ToTable("payment_methods");
        builder.HasKey(m => m.Id);
        builder.HasOne<Account>().WithMany().HasForeignKey(m => m.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(m => m.GatewayToken).HasMaxLength(128).IsRequired();
        builder.Property(m => m.DisplayLabel).HasMaxLength(60).IsRequired();
        builder.Property(m => m.Last4).HasMaxLength(4).IsFixedLength().IsRequired();
        builder.HasIndex(m => m.AccountId);
    }
}

internal sealed class AutopaySettingsConfiguration : IEntityTypeConfiguration<AutopaySettings>
{
    public void Configure(EntityTypeBuilder<AutopaySettings> builder)
    {
        builder.ToTable("autopay_settings");
        builder.HasKey(a => a.Id);
        builder.HasOne<Account>().WithOne().HasForeignKey<AutopaySettings>(a => a.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(a => a.MaxAmount).HasConversion<OptionalMoneyConverter>().HasMaxLength(32);
        builder.HasIndex(a => a.Enabled);
    }
}
