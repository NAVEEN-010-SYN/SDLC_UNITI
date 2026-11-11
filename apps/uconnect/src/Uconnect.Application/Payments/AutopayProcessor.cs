using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
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
        int evaluated = 0, charged = 0, declined = 0, skipped = 0, errors = 0;

        foreach (var settings in await _autopay.ListEnabledAsync(ct))
        {
            try
            {
                var account = await _accounts.GetByIdAsync(settings.AccountId, ct);
                if (account is null || account.Status == AccountStatus.Closed)
                {
                    continue;
                }

                foreach (var invoice in await _invoices.ListPayableAsync(account.Id, ct))
                {
                    evaluated++;
                    var decision = settings.Evaluate(invoice, today);
                    var key = $"autopay-{invoice.Id:N}-{today:yyyyMMdd}";
                    var earlierAttempt = decision.ShouldCharge ? await _payments.FindByIdempotencyKeyAsync(account.Id, key, ct) : null;
                    if (!decision.ShouldCharge || earlierAttempt is { Status: not PaymentStatus.Pending })
                    {
                        skipped++;
                        continue;
                    }

                    var method = await _methods.GetByIdAsync(decision.PaymentMethodId!.Value, ct);
                    var succeeded = false;
                    if (method is not null && method.IsUsable(today))
                    {
                        // A payment left pending by a gateway outage earlier today is resumed rather than duplicated.
                        var payment = earlierAttempt is null
                            ? await _executor.ExecuteAsync(account, invoice, method, decision.Amount!, PaymentChannel.Autopay, key, ct)
                            : await _executor.ChargeAsync(account, invoice, method, earlierAttempt, ct);
                        succeeded = payment.Status == PaymentStatus.Succeeded;
                    }

                    if (succeeded)
                    {
                        charged++;
                        settings.RecordSuccess();
                    }
                    else
                    {
                        declined++;
                        if (settings.RecordFailure(_clock.UtcNow))
                        {
                            _logger.LogWarning("Autopay suspended for {AccountNumber} after {Failures} failed collections", account.Number, settings.ConsecutiveFailures);
                        }
                    }

                    await _unitOfWork.SaveChangesAsync(ct);
                    if (!settings.Enabled)
                    {
                        break;
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                errors++;
                _logger.LogError(ex, "Autopay collection failed for account {AccountId}", settings.AccountId);
            }
        }

        _logger.LogInformation(
            "Autopay run: {Evaluated} invoices evaluated, {Charged} charged, {Declined} declined, {Skipped} skipped, {Errors} errors",
            evaluated, charged, declined, skipped, errors);
        return new AutopayRunSummary(evaluated, charged, declined, skipped, errors);
    }
}
