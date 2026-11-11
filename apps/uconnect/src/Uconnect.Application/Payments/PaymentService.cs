using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;

namespace Uconnect.Application.Payments;

/// <summary>
/// Invoice payments made in the portal or by an agent on the phone, payment history and agent refunds.
/// Every payment request carries a client-generated idempotency key: a retry with the same key returns
/// the original outcome (or resumes a payment interrupted by a gateway outage) and never charges twice.
/// </summary>
public sealed class PaymentService
{
    public const int MaxIdempotencyKeyLength = 80;

    private readonly AccountAccessGuard _guard;
    private readonly IInvoiceRepository _invoices;
    private readonly IPaymentRepository _payments;
    private readonly IPaymentMethodRepository _methods;
    private readonly IInvoiceNumberLookup _invoiceNumbers;
    private readonly IPaymentGateway _gateway;
    private readonly PaymentExecutor _executor;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<PayInvoiceRequest> _payValidator;
    private readonly IValidator<RefundPaymentRequest> _refundValidator;
    private readonly ILogger<PaymentService> _logger;

    public PaymentService(
        AccountAccessGuard guard,
        IInvoiceRepository invoices,
        IPaymentRepository payments,
        IPaymentMethodRepository methods,
        IInvoiceNumberLookup invoiceNumbers,
        IPaymentGateway gateway,
        PaymentExecutor executor,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<PayInvoiceRequest> payValidator,
        IValidator<RefundPaymentRequest> refundValidator,
        ILogger<PaymentService> logger)
    {
        _guard = guard;
        _invoices = invoices;
        _payments = payments;
        _methods = methods;
        _invoiceNumbers = invoiceNumbers;
        _gateway = gateway;
        _executor = executor;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _payValidator = payValidator;
        _refundValidator = refundValidator;
        _logger = logger;
    }

    public async Task<PaymentDto> PayInvoiceAsync(
        string accountNumber, string invoiceNumber, PayInvoiceRequest request, string? idempotencyKey, CancellationToken ct)
    {
        await _payValidator.EnsureValidAsync(request, ct);
        var key = NormaliseIdempotencyKey(idempotencyKey);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        var invoice = await _invoices.GetByNumberAsync(account.Id, invoiceNumber.Trim().ToUpperInvariant(), ct);
        if (invoice is null || invoice.Status == InvoiceStatus.Draft)
        {
            throw new NotFoundException("Invoice", invoiceNumber);
        }

        var amount = request.Amount!.ToMoney();
        var existing = await _payments.FindByIdempotencyKeyAsync(account.Id, key, ct);
        if (existing is not null)
        {
            return await ReplayAsync(account, invoice, existing, request.PaymentMethodId, amount, ct);
        }

        var method = await LoadUsableMethodAsync(account.Id, request.PaymentMethodId, ct);
        var channel = _currentUser.IsSupportAgent ? PaymentChannel.Agent : PaymentChannel.Portal;
        var payment = await _executor.ExecuteAsync(account, invoice, method, amount, channel, key, ct);
        return EnsureSucceeded(payment, invoice.InvoiceNumber);
    }

    public async Task<PagedResult<PaymentDto>> ListAsync(string accountNumber, PageRequest page, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var payments = await _payments.ListByAccountAsync(account.Id, page, ct);
        var numbers = await _invoiceNumbers.GetNumbersAsync(payments.Items.Select(p => p.InvoiceId).Distinct().ToList(), ct);
        return payments.Map(p => p.ToDto(numbers.GetValueOrDefault(p.InvoiceId)));
    }

    /// <summary>Refunds part or all of a settled payment (agents only) and reopens the invoice balance.</summary>
    public async Task<PaymentDto> RefundAsync(string accountNumber, Guid paymentId, RefundPaymentRequest request, CancellationToken ct)
    {
        if (!_currentUser.IsSupportAgent)
        {
            throw new ForbiddenException("Only support agents can issue refunds.");
        }

        await _refundValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        var payment = await _payments.GetByIdAsync(paymentId, ct);
        if (payment is null || payment.AccountId != account.Id)
        {
            throw new NotFoundException("Payment", paymentId);
        }

        var amount = request.Amount!.ToMoney();
        if (amount.Currency != payment.Amount.Currency || amount > payment.RefundableAmount)
        {
            throw new RequestValidationException("amount", $"At most {payment.RefundableAmount} can be refunded on this payment.");
        }

        var invoice = await _invoices.GetByIdAsync(payment.InvoiceId, ct) ?? throw new NotFoundException("Invoice", payment.InvoiceId);

        // Key on the cumulative refunded total so a retried request is idempotent but a second refund is not blocked.
        var refundKey = $"refund-{payment.Id:N}-{payment.RefundedAmount.AmountMinor + amount.AmountMinor}";
        var result = await _gateway.RefundAsync(payment.GatewayReference!, amount, refundKey, ct);
        if (!result.Succeeded)
        {
            throw new ConflictException("refund.rejected", $"The payment gateway rejected the refund ({result.FailureCode}).");
        }

        payment.Refund(amount, _clock.UtcNow);
        invoice.ReversePayment(amount, _clock.Today);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Refund of {Amount} on payment {PaymentId} ({InvoiceNumber}) by agent {UserId}: {Reason}",
            amount, payment.Id, invoice.InvoiceNumber, _currentUser.UserId, request.Reason);
        return payment.ToDto(invoice.InvoiceNumber);
    }

    internal static string NormaliseIdempotencyKey(string? idempotencyKey)
    {
        var key = idempotencyKey?.Trim();
        if (string.IsNullOrEmpty(key) || key.Length > MaxIdempotencyKeyLength || key.Any(char.IsControl))
        {
            throw new RequestValidationException("idempotencyKey", $"An Idempotency-Key header of 1 to {MaxIdempotencyKeyLength} characters is required.");
        }

        return key;
    }

    private async Task<PaymentDto> ReplayAsync(
        Account account, Invoice invoice, Payment existing, Guid paymentMethodId, Money amount, CancellationToken ct)
    {
        if (existing.InvoiceId != invoice.Id || existing.PaymentMethodId != paymentMethodId || existing.Amount != amount)
        {
            throw new ConflictException("payment.idempotency_key_reused", "This idempotency key was already used for a different payment.");
        }

        if (existing.Status == PaymentStatus.Pending)
        {
            var method = await LoadUsableMethodAsync(account.Id, existing.PaymentMethodId, ct);
            existing = await _executor.ChargeAsync(account, invoice, method, existing, ct);
        }

        return EnsureSucceeded(existing, invoice.InvoiceNumber);
    }

    private async Task<PaymentMethod> LoadUsableMethodAsync(Guid accountId, Guid methodId, CancellationToken ct)
    {
        var method = await _methods.GetByIdAsync(methodId, ct);
        if (method is null || method.AccountId != accountId || method.IsRemoved)
        {
            throw new NotFoundException("PaymentMethod", methodId);
        }

        method.EnsureUsable(_clock.Today);
        return method;
    }

    private static PaymentDto EnsureSucceeded(Payment payment, string invoiceNumber) => payment.Status == PaymentStatus.Failed
        ? throw new PaymentDeclinedException(payment.Id, payment.FailureCode ?? "declined", payment.FailureMessage)
        : payment.ToDto(invoiceNumber);
}
