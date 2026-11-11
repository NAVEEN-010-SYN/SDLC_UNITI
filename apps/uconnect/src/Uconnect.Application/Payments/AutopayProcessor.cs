using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;

namespace Uconnect.Application.Payments;

/// <summary>
/// Daily autopay collection. For each enabled account, every payable invoice is evaluated against the
/// autopay rules and charged at most once per day (the idempotency key embeds the date), so a failed
/// collection is retried on the following days until autopay suspends itself after repeated failures.
/// </summary>
public sealed class AutopayProcessor
{
    private readonly IAutopayRepository _autopay;
    private readonly IAccountRepository _accounts;
    private readonly IInvoiceRepository _invoices;
    private readonly IPaymentRepository _payments;
    private readonly IPaymentMethodRepository _methods;
    private readonly PaymentExecutor _executor;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly ILogger<AutopayProcessor> _logger;

    public AutopayProcessor(
        IAutopayRepository autopay,
        IAccountRepository accounts,
        IInvoiceRepository invoices,
        IPaymentRepository payments,
        IPaymentMethodRepository methods,
        PaymentExecutor executor,
        IUnitOfWork unitOfWork,
        IClock clock,
        ILogger<AutopayProcessor> logger)
    {
        _autopay = autopay;
        _accounts = accounts;
        _invoices = invoices;
        _payments = payments;
        _methods = methods;
        _executor = executor;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _logger = logger;
    }

    public async Task<AutopayRunSummary> RunAsync(CancellationToken ct)
    {
        var today = _clock.Today;
        var counts = new RunCounts();

        foreach (var settings in await _autopay.ListEnabledAsync(ct))
        {
            try
            {
                await ProcessAccountAsync(settings, today, counts, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                counts.Errors++;
                _logger.LogError(ex, "Autopay collection failed for account {AccountId}", settings.AccountId);
            }
        }

        _logger.LogInformation(
            "Autopay run: {Evaluated} invoices evaluated, {Charged} charged, {Declined} declined, {Skipped} skipped, {Errors} errors",
            counts.Evaluated, counts.Charged, counts.Declined, counts.Skipped, counts.Errors);
        return new AutopayRunSummary(counts.Evaluated, counts.Charged, counts.Declined, counts.Skipped, counts.Errors);
    }

    private async Task ProcessAccountAsync(AutopaySettings settings, DateOnly today, RunCounts counts, CancellationToken ct)
    {
        var account = await _accounts.GetByIdAsync(settings.AccountId, ct);
        if (account is null || account.Status == AccountStatus.Closed)
        {
            return;
        }

        foreach (var invoice in await _invoices.ListPayableAsync(account.Id, ct))
        {
            counts.Evaluated++;
            await ProcessInvoiceAsync(settings, account, invoice, today, counts, ct);

            // Stop once autopay has suspended itself after repeated failures.
            if (!settings.Enabled)
            {
                break;
            }
        }
    }

    private async Task ProcessInvoiceAsync(
        AutopaySettings settings, Account account, Invoice invoice, DateOnly today, RunCounts counts, CancellationToken ct)
    {
        var decision = settings.Evaluate(invoice, today);
        if (!decision.ShouldCharge)
        {
            counts.Skipped++;
            return;
        }

        var key = $"autopay-{invoice.Id:N}-{today:yyyyMMdd}";
        var earlierAttempt = await _payments.FindByIdempotencyKeyAsync(account.Id, key, ct);
        if (earlierAttempt != null && earlierAttempt.Status != PaymentStatus.Pending)
        {
            counts.Skipped++;
            return;
        }

        var succeeded = await TryChargeAsync(account, invoice, decision, earlierAttempt, key, today, ct);
        if (succeeded)
        {
            counts.Charged++;
            settings.RecordSuccess();
        }
        else
        {
            counts.Declined++;
            if (settings.RecordFailure(_clock.UtcNow))
            {
                _logger.LogWarning("Autopay suspended for {AccountNumber} after {Failures} failed collections", account.Number, settings.ConsecutiveFailures);
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);
    }

    private async Task<bool> TryChargeAsync(
        Account account, Invoice invoice, AutopayDecision decision, Payment? earlierAttempt, string key, DateOnly today, CancellationToken ct)
    {
        var method = await _methods.GetByIdAsync(decision.PaymentMethodId!.Value, ct);
        if (method is null || !method.IsUsable(today))
        {
            return false;
        }

        // A payment left pending by a gateway outage earlier today is resumed rather than duplicated.
        Payment payment;
        if (earlierAttempt is null)
        {
            payment = await _executor.ExecuteAsync(account, invoice, method, decision.Amount!, PaymentChannel.Autopay, key, ct);
        }
        else
        {
            payment = await _executor.ChargeAsync(account, invoice, method, earlierAttempt, ct);
        }

        return payment.Status == PaymentStatus.Succeeded;
    }

    /// <summary>Running totals for one autopay run.</summary>
    private sealed class RunCounts
    {
        public int Evaluated;
        public int Charged;
        public int Declined;
        public int Skipped;
        public int Errors;
    }
}
