using Uconnect.Domain.Common;

namespace Uconnect.Domain.Billing;

/// <summary>
/// A monthly bill. Built as a <see cref="InvoiceStatus.Draft"/>, totals are recalculated on every
/// line change, and once issued the lines are frozen. Payments move it through
/// <c>Issued → PartiallyPaid → Paid</c>; an unpaid invoice past its due date becomes <c>Overdue</c>.
/// An invoice whose total is negative (credits exceed charges) is settled on issue and the surplus is
/// carried forward as a credit to the next invoice.
/// </summary>
public sealed class Invoice : AggregateRoot
{
    private readonly List<InvoiceLine> _lines = new();

    private Invoice()
    {
    }

    public Invoice(Guid id, string invoiceNumber, Guid accountId, BillingPeriod period, string currency, DateTimeOffset createdAt)
        : base(id)
    {
        InvoiceNumber = Guard.NotBlank(invoiceNumber, "invoice.number", 32);
        AccountId = accountId;
        PeriodStart = period.Start;
        PeriodEnd = period.End;
        Currency = Money.Zero(currency).Currency;
        Status = InvoiceStatus.Draft;
        CreatedAt = createdAt;
        Subtotal = Money.Zero(Currency);
        TaxTotal = Money.Zero(Currency);
        Total = Money.Zero(Currency);
        AmountPaid = Money.Zero(Currency);
        CreditCarriedForward = Money.Zero(Currency);
    }

    /// <summary>Customer-visible number, e.g. <c>INV-202611-000123</c>.</summary>
    public string InvoiceNumber { get; private set; } = string.Empty;

    public Guid AccountId { get; private set; }

    public DateOnly PeriodStart { get; private set; }

    public DateOnly PeriodEnd { get; private set; }

    public BillingPeriod Period => new(PeriodStart, PeriodEnd);

    public string Currency { get; private set; } = "GBP";

    public InvoiceStatus Status { get; private set; }

    public IReadOnlyList<InvoiceLine> Lines => _lines.AsReadOnly();

    public Money Subtotal { get; private set; } = null!;

    public Money TaxTotal { get; private set; } = null!;

    public Money Total { get; private set; } = null!;

    public Money AmountPaid { get; private set; } = null!;

    /// <summary>Credit (positive amount) to be applied to the next invoice when this one totals below zero.</summary>
    public Money CreditCarriedForward { get; private set; } = null!;

    /// <summary>Tax rate applied at issue, in basis points.</summary>
    public int TaxRateBasisPoints { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateOnly? IssuedOn { get; private set; }

    public DateOnly? DueOn { get; private set; }

    public DateTimeOffset? PaidAt { get; private set; }

    public string? VoidReason { get; private set; }

    public Money BalanceDue => Total.IsNegative ? Money.Zero(Currency) : Total - AmountPaid;

    public bool IsPayable => Status is InvoiceStatus.Issued or InvoiceStatus.PartiallyPaid or InvoiceStatus.Overdue;

    public InvoiceLine AddLine(
        InvoiceLineType type,
        string description,
        Money unitAmount,
        int quantity = 1,
        Guid? serviceId = null,
        bool taxable = true,
        DateOnly? servicePeriodStart = null,
        DateOnly? servicePeriodEnd = null)
    {
        EnsureDraft();
        if (unitAmount.Currency != Currency)
        {
            throw new DomainException("invoice.currency_mismatch", $"Line currency {unitAmount.Currency} differs from invoice currency {Currency}.");
        }

        if (quantity <= 0)
        {
            throw new DomainException("invoice.line_quantity", "Line quantity must be positive.");
        }

        var expectsCredit = type is InvoiceLineType.Credit or InvoiceLineType.Discount;
        if (expectsCredit && unitAmount.IsPositive)
        {
            throw new DomainException("invoice.credit_sign", "Credit and discount lines must have a negative amount.");
        }

        var line = new InvoiceLine(
            Guid.NewGuid(), Id, type, description, unitAmount, quantity, serviceId, taxable, servicePeriodStart, servicePeriodEnd);
        _lines.Add(line);
        Recalculate();
        return line;
    }

    public void RemoveLine(Guid lineId)
    {
        EnsureDraft();
        var line = _lines.FirstOrDefault(l => l.Id == lineId)
            ?? throw new DomainException("invoice.line_not_found", "Invoice line not found.");
        _lines.Remove(line);
        Recalculate();
    }

    /// <summary>Applies tax, freezes the invoice and sets the due date.</summary>
    public void Issue(DateOnly issuedOn, int paymentTermsDays, int taxRateBasisPoints, DateTimeOffset now)
    {
        EnsureDraft();
        if (_lines.Count == 0)
        {
            throw new DomainException("invoice.empty", "An invoice must have at least one line before it is issued.");
        }

        Guard.InRange(paymentTermsDays, 0, 60, "invoice.payment_terms");
        Guard.InRange(taxRateBasisPoints, 0, 10_000, "invoice.tax_rate");

        TaxRateBasisPoints = taxRateBasisPoints;
        Recalculate();
        IssuedOn = issuedOn;
        DueOn = issuedOn.AddDays(paymentTermsDays);

        if (Total.IsPositive)
        {
            Status = InvoiceStatus.Issued;
        }
        else
        {
            Status = InvoiceStatus.Paid;
            PaidAt = now;
            CreditCarriedForward = Total.Negate();
        }

        Raise(new InvoiceIssued(Id, AccountId, InvoiceNumber, Total, DueOn.Value, now));
    }

    /// <summary>Records a settled payment against the invoice. Overpayment is rejected.</summary>
    public void ApplyPayment(Money amount, DateTimeOffset paidAt)
    {
        if (!IsPayable)
        {
            throw new DomainException("invoice.not_payable", $"Invoice {InvoiceNumber} is {Status.ToString().ToLowerInvariant()} and cannot be paid.");
        }

        Guard.Positive(amount, "payment.amount");
        if (amount > BalanceDue)
        {
            throw new DomainException("invoice.overpayment", $"Payment of {amount} exceeds the balance due of {BalanceDue}.");
        }

        AmountPaid += amount;
        if (BalanceDue.IsZero)
        {
            Status = InvoiceStatus.Paid;
            PaidAt = paidAt;
            Raise(new InvoicePaid(Id, AccountId, InvoiceNumber, paidAt));
        }
        else if (Status != InvoiceStatus.Overdue)
        {
            Status = InvoiceStatus.PartiallyPaid;
        }
    }

    /// <summary>Reverses part of a previously applied payment, e.g. after a refund or chargeback.</summary>
    public void ReversePayment(Money amount, DateOnly today)
    {
        Guard.Positive(amount, "refund.amount");
        if (amount > AmountPaid)
        {
            throw new DomainException("invoice.reversal_exceeds_paid", "Cannot reverse more than has been paid.");
        }

        if (Status is InvoiceStatus.Draft or InvoiceStatus.Void)
        {
            throw new DomainException("invoice.not_reversible", "Payments cannot be reversed on a draft or void invoice.");
        }

        AmountPaid -= amount;
        PaidAt = null;
        if (DueOn is { } due && today > due)
        {
            Status = InvoiceStatus.Overdue;
        }
        else
        {
            Status = AmountPaid.IsZero ? InvoiceStatus.Issued : InvoiceStatus.PartiallyPaid;
        }
    }

    /// <summary>Flags the invoice as overdue when unpaid after its due date. Returns true if the status changed.</summary>
    public bool MarkOverdueIfLate(DateOnly today)
    {
        if (Status is not (InvoiceStatus.Issued or InvoiceStatus.PartiallyPaid) || DueOn is not { } due || today <= due)
        {
            return false;
        }

        Status = InvoiceStatus.Overdue;
        Raise(new InvoiceOverdue(Id, AccountId, InvoiceNumber, BalanceDue, new DateTimeOffset(today.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero)));
        return true;
    }

    public void Void(string reason)
    {
        if (Status is not (InvoiceStatus.Draft or InvoiceStatus.Issued))
        {
            throw new InvalidStateTransitionException(nameof(Invoice), Status.ToString(), InvoiceStatus.Void.ToString());
        }

        if (AmountPaid.IsPositive)
        {
            throw new DomainException("invoice.has_payments", "Refund payments before voiding the invoice.");
        }

        VoidReason = Guard.NotBlank(reason, "invoice.void_reason");
        Status = InvoiceStatus.Void;
    }

    public int DaysOverdue(DateOnly today) =>
        Status == InvoiceStatus.Overdue && DueOn is { } due ? Math.Max(0, today.DayNumber - due.DayNumber) : 0;

    private void Recalculate()
    {
        Subtotal = _lines.Select(l => l.Amount).Sum(Currency);
        var taxableBase = _lines.Where(l => l.Taxable).Select(l => l.Amount).Sum(Currency);
        TaxTotal = TaxCalculator.Calculate(taxableBase, TaxRateBasisPoints);
        Total = Subtotal + TaxTotal;
    }

    private void EnsureDraft()
    {
        if (Status != InvoiceStatus.Draft)
        {
            throw new DomainException("invoice.not_draft", $"Invoice {InvoiceNumber} has been issued and can no longer be changed.");
        }
    }
}

public sealed record InvoiceIssued(Guid InvoiceId, Guid AccountId, string InvoiceNumber, Money Total, DateOnly DueOn, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record InvoicePaid(Guid InvoiceId, Guid AccountId, string InvoiceNumber, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record InvoiceOverdue(Guid InvoiceId, Guid AccountId, string InvoiceNumber, Money BalanceDue, DateTimeOffset OccurredAt) : IDomainEvent;
