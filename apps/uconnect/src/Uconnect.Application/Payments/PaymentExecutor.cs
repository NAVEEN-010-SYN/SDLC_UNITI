using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;

namespace Uconnect.Application.Payments;

/// <summary>
/// The single code path that takes money, shared by portal, agent and autopay payments:
/// <list type="number">
/// <item>persist a <c>Pending</c> payment before the gateway is called, so a crash leaves an audit trail;</item>
/// <item>charge the gateway with a key derived from the payment id, so resuming the same payment can never double-charge;</item>
/// <item>apply the money to the invoice, refunding immediately if the invoice can no longer accept it;</item>
/// <item>lift an arrears suspension once nothing remains overdue.</item>
/// </list>
/// A transient gateway failure propagates and leaves the payment pending for a retry to resume.
/// </summary>
public sealed class PaymentExecutor
{
    private readonly IPaymentRepository _payments;
    private readonly IInvoiceRepository _invoices;
    private readonly IPaymentGateway _gateway;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly ILogger<PaymentExecutor> _logger;

    public PaymentExecutor(
        IPaymentRepository payments,
        IInvoiceRepository invoices,
        IPaymentGateway gateway,
        IUnitOfWork unitOfWork,
        IClock clock,
        ILogger<PaymentExecutor> logger)
    {
        _payments = payments;
        _invoices = invoices;
        _gateway = gateway;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _logger = logger;
    }

    public async Task<Payment> ExecuteAsync(
        Account account,
        Invoice invoice,
        PaymentMethod method,
        Money amount,
        PaymentChannel channel,
        string idempotencyKey,
        CancellationToken ct)
    {
        EnsureChargeable(invoice, method, amount);
        var payment = new Payment(Guid.NewGuid(), account.Id, invoice.Id, method.Id, amount, channel, idempotencyKey, _clock.UtcNow);
        _payments.Add(payment);
        await _unitOfWork.SaveChangesAsync(ct);
        return await ChargeAsync(account, invoice, method, payment, ct);
    }

    /// <summary>Charges a payment that is still pending, either just created or left over from an interrupted attempt.</summary>
    public async Task<Payment> ChargeAsync(Account account, Invoice invoice, PaymentMethod method, Payment payment, CancellationToken ct)
    {
        if (payment.Status != PaymentStatus.Pending)
        {
            return payment;
        }

        var result = await _gateway.ChargeAsync(
            new GatewayChargeRequest(method.GatewayToken, payment.Amount, GatewayKey(payment), $"Invoice {invoice.InvoiceNumber}", account.Number.Value),
            ct);

        var now = _clock.UtcNow;
        if (!result.Succeeded)
        {
            payment.MarkFailed(result.FailureCode ?? "declined", result.FailureMessage, now);
            await _unitOfWork.SaveChangesAsync(ct);
            _logger.LogWarning(
                "Payment {PaymentId} of {Amount} on {InvoiceNumber} declined: {FailureCode}",
                payment.Id, payment.Amount, invoice.InvoiceNumber, payment.FailureCode);
            return payment;
        }

        payment.MarkSucceeded(result.Reference!, now);
        try
        {
            invoice.ApplyPayment(payment.Amount, now);
        }
        catch (DomainException ex)
        {
            // The invoice changed while the card was being charged (paid elsewhere, voided). Hand the money back.
            await RefundUnappliedAsync(payment, ex, ct);
            return payment;
        }

        await LiftArrearsSuspensionAsync(account, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation(
            "Payment {PaymentId} of {Amount} applied to {InvoiceNumber} via {Channel}",
            payment.Id, payment.Amount, invoice.InvoiceNumber, payment.Channel);
        return payment;
    }

    internal static void EnsureChargeable(Invoice invoice, PaymentMethod method, Money amount)
    {
        if (!invoice.IsPayable)
        {
            throw new ConflictException("invoice.not_payable", $"Invoice {invoice.InvoiceNumber} is {invoice.Status.ToString().ToLowerInvariant()} and cannot be paid.");
        }

        if (amount.Currency != invoice.Currency)
        {
            throw new RequestValidationException("amount.currency", $"Invoice {invoice.InvoiceNumber} is billed in {invoice.Currency}.");
        }

        if (amount > invoice.BalanceDue)
        {
            throw new RequestValidationException("amount", $"The balance due on {invoice.InvoiceNumber} is {invoice.BalanceDue}.");
        }

        if (method.AccountId != invoice.AccountId)
        {
            throw new NotFoundException("PaymentMethod", method.Id);
        }
    }

    private static string GatewayKey(Payment payment) => $"pay-{payment.Id:N}";

    private async Task RefundUnappliedAsync(Payment payment, DomainException reason, CancellationToken ct)
    {
        var refund = await _gateway.RefundAsync(payment.GatewayReference!, payment.Amount, $"unapplied-{payment.Id:N}", ct);
        if (refund.Succeeded)
        {
            payment.Refund(payment.Amount, _clock.UtcNow);
            _logger.LogWarning(reason, "Payment {PaymentId} could not be applied and was refunded", payment.Id);
        }
        else
        {
            _logger.LogCritical(reason, "Payment {PaymentId} could not be applied and the automatic refund failed ({FailureCode}); manual action required", payment.Id, refund.FailureCode);
        }

        await _unitOfWork.SaveChangesAsync(ct);
    }

    private async Task LiftArrearsSuspensionAsync(Account account, CancellationToken ct)
    {
        if (account.Status != AccountStatus.Suspended
            || account.SuspensionReason?.StartsWith(BillingRunService.ArrearsSuspensionPrefix, StringComparison.Ordinal) != true)
        {
            return;
        }

        // Tracked invoices reflect this payment in memory even before it is saved.
        var payable = await _invoices.ListPayableAsync(account.Id, ct);
        if (payable.Any(i => i.Status == InvoiceStatus.Overdue))
        {
            return;
        }

        account.Reinstate(_clock.UtcNow);
        _logger.LogInformation("Account {AccountNumber} reinstated after arrears were cleared", account.Number);
    }
}
