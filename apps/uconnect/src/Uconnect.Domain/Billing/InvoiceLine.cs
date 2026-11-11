using Uconnect.Domain.Common;

namespace Uconnect.Domain.Billing;

/// <summary>A single charge or credit on an invoice. Amount = unit amount × quantity.</summary>
public sealed class InvoiceLine : Entity
{
    private InvoiceLine()
    {
    }

    internal InvoiceLine(
        Guid id,
        Guid invoiceId,
        InvoiceLineType type,
        string description,
        Money unitAmount,
        int quantity,
        Guid? serviceId,
        bool taxable,
        DateOnly? servicePeriodStart,
        DateOnly? servicePeriodEnd)
        : base(id)
    {
        if (servicePeriodStart is not null && servicePeriodEnd is not null && servicePeriodEnd <= servicePeriodStart)
        {
            throw new DomainException("invoice.line_period", "Line service period end must be after its start.");
        }

        InvoiceId = invoiceId;
        Type = type;
        Description = Guard.NotBlank(description, "invoice.line_description", 200);
        UnitAmount = unitAmount;
        Quantity = quantity;
        Amount = unitAmount.Multiply(quantity);
        ServiceId = serviceId;
        Taxable = taxable;
        ServicePeriodStart = servicePeriodStart;
        ServicePeriodEnd = servicePeriodEnd;
    }

    public Guid InvoiceId { get; private set; }

    public InvoiceLineType Type { get; private set; }

    public string Description { get; private set; } = string.Empty;

    public Money UnitAmount { get; private set; } = null!;

    public int Quantity { get; private set; }

    public Money Amount { get; private set; } = null!;

    public Guid? ServiceId { get; private set; }

    public bool Taxable { get; private set; }

    public DateOnly? ServicePeriodStart { get; private set; }

    public DateOnly? ServicePeriodEnd { get; private set; }
}

/// <summary>
/// Computes tax on a taxable base at a basis-point rate. Tax is calculated once on the invoice
/// total (not per line) to avoid accumulated rounding differences; a negative base (net credit)
/// produces negative tax so a credit note refunds the tax originally charged.
/// </summary>
public static class TaxCalculator
{
    /// <summary>UK standard VAT rate (20%).</summary>
    public const int UkStandardVatBasisPoints = 2000;

    public static Money Calculate(Money taxableBase, int rateBasisPoints)
    {
        if (rateBasisPoints < 0)
        {
            throw new DomainException("tax.invalid_rate", "Tax rate must not be negative.");
        }

        return taxableBase.ApplyBasisPoints(rateBasisPoints);
    }

    /// <summary>Splits a tax-inclusive gross amount into net and tax components.</summary>
    public static (Money Net, Money Tax) SplitGross(Money gross, int rateBasisPoints)
    {
        var net = gross.MultiplyRatio(10_000, 10_000 + rateBasisPoints);
        return (net, gross - net);
    }
}
