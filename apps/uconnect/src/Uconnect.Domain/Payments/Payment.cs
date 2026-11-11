using Uconnect.Domain.Common;

namespace Uconnect.Domain.Payments;

/// <summary>
/// A payment attempt against an invoice. Created <c>Pending</c> before the gateway is called so that
/// a crash mid-call leaves an auditable record; the idempotency key guarantees a retried request
/// never charges the customer twice.
/// </summary>
public sealed class Payment : AggregateRoot
{
    private Payment()
    {
    }

    public Payment(
        Guid id,
        Guid accountId,
        Guid invoiceId,
        Guid paymentMethodId,
        Money amount,
        PaymentChannel channel,
        string idempotencyKey,
        DateTimeOffset createdAt)
        : base(id)
    {
        Guard.Positive(amount, "payment.amount");
        AccountId = accountId;
        InvoiceId = invoiceId;
        PaymentMethodId = paymentMethodId;
        Amount = amount;
        RefundedAmount = Money.Zero(amount.Currency);
        Channel = channel;
        IdempotencyKey = Guard.NotBlank(idempotencyKey, "payment.idempotency_key", 80);
        Status = PaymentStatus.Pending;
        CreatedAt = createdAt;
    }

    public Guid AccountId { get; private set; }

    public Guid InvoiceId { get; private set; }

    public Guid PaymentMethodId { get; private set; }

    public Money Amount { get; private set; } = null!;

    public Money RefundedAmount { get; private set; } = null!;

    public PaymentChannel Channel { get; private set; }

    public PaymentStatus Status { get; private set; }

    public string IdempotencyKey { get; private set; } = string.Empty;

    public string? GatewayReference { get; private set; }

    public string? FailureCode { get; private set; }

    public string? FailureMessage { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset? CompletedAt { get; private set; }

    public Money RefundableAmount => Status is PaymentStatus.Succeeded or PaymentStatus.PartiallyRefunded
        ? Amount - RefundedAmount
        : Money.Zero(Amount.Currency);

    public void MarkSucceeded(string gatewayReference, DateTimeOffset completedAt)
    {
        EnsurePending(PaymentStatus.Succeeded);
        GatewayReference = Guard.NotBlank(gatewayReference, "payment.gateway_reference", 100);
        Status = PaymentStatus.Succeeded;
        CompletedAt = completedAt;
        Raise(new PaymentSucceeded(Id, AccountId, InvoiceId, Amount, completedAt));
    }

    public void MarkFailed(string failureCode, string? failureMessage, DateTimeOffset completedAt)
    {
        EnsurePending(PaymentStatus.Failed);
        FailureCode = Guard.NotBlank(failureCode, "payment.failure_code", 50);
        FailureMessage = failureMessage?.Length > 300 ? failureMessage[..300] : failureMessage;
        Status = PaymentStatus.Failed;
        CompletedAt = completedAt;
        Raise(new PaymentFailed(Id, AccountId, InvoiceId, Amount, FailureCode, Channel, completedAt));
    }

    /// <summary>Records a (partial) refund. The total refunded can never exceed the original amount.</summary>
    public void Refund(Money amount, DateTimeOffset now)
    {
        Guard.Positive(amount, "refund.amount");
        if (amount > RefundableAmount)
        {
            throw new DomainException("payment.refund_exceeds", $"Refund of {amount} exceeds the refundable amount of {RefundableAmount}.");
        }

        RefundedAmount += amount;
        Status = RefundedAmount == Amount ? PaymentStatus.Refunded : PaymentStatus.PartiallyRefunded;
        Raise(new PaymentRefunded(Id, AccountId, InvoiceId, amount, now));
    }

    private void EnsurePending(PaymentStatus target)
    {
        if (Status != PaymentStatus.Pending)
        {
            throw new InvalidStateTransitionException(nameof(Payment), Status.ToString(), target.ToString());
        }
    }
}

public sealed record PaymentSucceeded(Guid PaymentId, Guid AccountId, Guid InvoiceId, Money Amount, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record PaymentFailed(Guid PaymentId, Guid AccountId, Guid InvoiceId, Money Amount, string FailureCode, PaymentChannel Channel, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record PaymentRefunded(Guid PaymentId, Guid AccountId, Guid InvoiceId, Money Amount, DateTimeOffset OccurredAt) : IDomainEvent;
