using Uconnect.Domain.Common;

namespace Uconnect.Domain.Billing;

public enum AdjustmentReason
{
    Goodwill = 1,
    OutageCompensation = 2,
    MissedAppointmentCompensation = 3,
    EngineerCallOutFee = 4,
    LatePaymentFee = 5,
    BillingCorrection = 6,
}

/// <summary>
/// A one-off charge or credit raised against an account outside the recurring cycle (outage
/// compensation, goodwill gesture, call-out fee...). It waits until the next invoice is built,
/// at which point it is billed exactly once.
/// </summary>
public sealed class AccountAdjustment : AggregateRoot
{
    /// <summary>Largest goodwill credit an agent may raise without a team-lead approval reference.</summary>
    public static readonly long AgentGoodwillLimitMinor = 50_00;

    private AccountAdjustment()
    {
    }

    public AccountAdjustment(
        Guid id,
        Guid accountId,
        Guid? serviceId,
        AdjustmentReason reason,
        string description,
        Money amount,
        Guid raisedByUserId,
        DateTimeOffset raisedAt,
        string? approvalReference = null,
        string? sourceReference = null)
        : base(id)
    {
        if (amount.IsZero)
        {
            throw new DomainException("adjustment.zero", "Adjustment amount must not be zero.");
        }

        var isCredit = reason is AdjustmentReason.Goodwill or AdjustmentReason.OutageCompensation
            or AdjustmentReason.MissedAppointmentCompensation;
        if (isCredit && amount.IsPositive)
        {
            throw new DomainException("adjustment.credit_sign", "Compensation and goodwill adjustments must be credits (negative).");
        }

        if (!isCredit && reason != AdjustmentReason.BillingCorrection && amount.IsNegative)
        {
            throw new DomainException("adjustment.charge_sign", "Fees must be charges (positive).");
        }

        if (reason == AdjustmentReason.Goodwill && amount.Abs().AmountMinor > AgentGoodwillLimitMinor && string.IsNullOrWhiteSpace(approvalReference))
        {
            throw new DomainException("adjustment.approval_required", "Goodwill credits above the agent limit need an approval reference.");
        }

        AccountId = accountId;
        ServiceId = serviceId;
        Reason = reason;
        Description = Guard.NotBlank(description, "adjustment.description", 200);
        Amount = amount;
        RaisedByUserId = raisedByUserId;
        RaisedAt = raisedAt;
        ApprovalReference = approvalReference;
        SourceReference = sourceReference;
    }

    public Guid AccountId { get; private set; }

    public Guid? ServiceId { get; private set; }

    public AdjustmentReason Reason { get; private set; }

    public string Description { get; private set; } = string.Empty;

    /// <summary>Signed amount: negative for credits, positive for charges.</summary>
    public Money Amount { get; private set; } = null!;

    public Guid RaisedByUserId { get; private set; }

    public DateTimeOffset RaisedAt { get; private set; }

    public string? ApprovalReference { get; private set; }

    /// <summary>What triggered the adjustment (outage or appointment reference); used to prevent duplicate compensation.</summary>
    public string? SourceReference { get; private set; }

    public Guid? BilledOnInvoiceId { get; private set; }

    public bool IsBilled => BilledOnInvoiceId is not null;

    /// <summary>Fees are subject to VAT; compensation credits reduce the VAT-able total as well.</summary>
    public bool Taxable => Reason != AdjustmentReason.LatePaymentFee;

    public InvoiceLineType LineType => Amount.IsNegative ? InvoiceLineType.Credit : InvoiceLineType.OneOff;

    public void MarkBilled(Guid invoiceId)
    {
        if (IsBilled)
        {
            throw new DomainException("adjustment.already_billed", "This adjustment has already been billed.");
        }

        BilledOnInvoiceId = invoiceId;
    }
}
