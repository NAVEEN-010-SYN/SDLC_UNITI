using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.Services;
using Uconnect.Domain.Usage;

namespace Uconnect.Application.Billing;

/// <summary>
/// The daily billing and collections jobs.
/// <list type="bullet">
/// <item><see cref="RunAsync"/> issues an invoice to every account whose cycle starts today. It is safe
/// to re-run: accounts already invoiced for the period are skipped.</item>
/// <item><see cref="ProcessCollectionsAsync"/> marks late invoices overdue, raises the late-payment fee
/// once per invoice and suspends accounts that stay in arrears.</item>
/// </list>
/// Each account is processed in its own transaction so one bad account never blocks the run.
/// </summary>
public sealed class BillingRunService
{
    /// <summary>Suspension reasons written by collections start with this, so a payment can lift them automatically.</summary>
    public const string ArrearsSuspensionPrefix = "Arrears:";

    private readonly IAccountRepository _accounts;
    private readonly IServiceRepository _services;
    private readonly IPlanRepository _plans;
    private readonly IPlanChangeRepository _planChanges;
    private readonly IUsageRepository _usage;
    private readonly IAdjustmentRepository _adjustments;
    private readonly IInvoiceRepository _invoices;
    private readonly IReferenceGenerator _references;
    private readonly IBillingSystemClient _billingSystem;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly BillingOptions _options;
    private readonly ILogger<BillingRunService> _logger;

    public BillingRunService(
        IAccountRepository accounts,
        IServiceRepository services,
        IPlanRepository plans,
        IPlanChangeRepository planChanges,
        IUsageRepository usage,
        IAdjustmentRepository adjustments,
        IInvoiceRepository invoices,
        IReferenceGenerator references,
        IBillingSystemClient billingSystem,
        IUnitOfWork unitOfWork,
        IClock clock,
        IOptions<BillingOptions> options,
        ILogger<BillingRunService> logger)
    {
        _accounts = accounts;
        _services = services;
        _plans = plans;
        _planChanges = planChanges;
        _usage = usage;
        _adjustments = adjustments;
        _invoices = invoices;
        _references = references;
        _billingSystem = billingSystem;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<BillingRunSummary> RunAsync(DateOnly runDate, CancellationToken ct)
    {
        // Billing days are limited to 1..28, so nothing starts a cycle on the 29th-31st.
        if (runDate.Day > Account.MaxBillingDay)
        {
            return new BillingRunSummary(runDate, 0, 0, 0, 0);
        }

        var accounts = await _accounts.ListByBillingDayAsync(runDate.Day, ct);
        int issued = 0, alreadyBilled = 0, errors = 0;

        foreach (var account in accounts)
        {
            try
            {
                var invoice = await BillAccountAsync(account, BillingPeriod.Containing(runDate, account.BillingDay), runDate, ct);
                if (invoice is null)
                {
                    alreadyBilled++;
                    continue;
                }

                issued++;
                await PostToLedgerAsync(invoice, account, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                errors++;
                _logger.LogError(ex, "Billing run failed for account {AccountNumber} on {RunDate}", account.Number, runDate);
            }
        }

        _logger.LogInformation(
            "Billing run {RunDate}: {Accounts} accounts, {Issued} invoices issued, {AlreadyBilled} already billed, {Errors} errors",
            runDate, accounts.Count, issued, alreadyBilled, errors);
        return new BillingRunSummary(runDate, accounts.Count, issued, alreadyBilled, errors);
    }

    /// <summary>
    /// Builds, issues and commits one account's invoice for <paramref name="period"/>. Returns null when
    /// the period has already been invoiced or there is nothing to bill.
    /// </summary>
    internal async Task<Invoice?> BillAccountAsync(Account account, BillingPeriod period, DateOnly issueDate, CancellationToken ct)
    {
        if (await _invoices.ExistsForPeriodAsync(account.Id, period.Start, ct))
        {
            return null;
        }

        var billable = await LoadBillableServicesAsync(account.Id, period, ct);
        var planChanges = await _planChanges.ListUnbilledCompletedAsync(account.Id, ct);
        var adjustments = await _adjustments.ListUnbilledAsync(account.Id, ct);
        var usageCharges = await CalculateUsageChargesAsync(billable, period.Previous(), ct);
        var lastInvoice = await _invoices.GetLatestIssuedAsync(account.Id, ct);
        var creditBroughtForward = lastInvoice?.CreditCarriedForward ?? Money.Zero(account.Currency);

        var inputs = new InvoiceInputs(account, period, billable, planChanges, usageCharges, adjustments, creditBroughtForward);
        var number = await _references.NextInvoiceNumberAsync(period.Start, ct);
        var invoice = InvoiceBuilder.Build(Guid.NewGuid(), number, inputs, _clock.UtcNow);
        if (invoice.Lines.Count == 0)
        {
            return null;
        }

        invoice.Issue(issueDate, _options.PaymentTermsDays, _options.TaxRateBasisPoints, _clock.UtcNow);

        foreach (var change in planChanges.Where(c => c.BilledOnInvoiceId is null))
        {
            change.MarkBilled(invoice.Id);
        }

        foreach (var adjustment in adjustments.Where(a => !a.IsBilled))
        {
            adjustment.MarkBilled(invoice.Id);
        }

        _invoices.Add(invoice);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Invoice {InvoiceNumber} issued to {AccountNumber} for {Period}: total {Total}, due {DueOn}",
            invoice.InvoiceNumber, account.Number, period, invoice.Total, invoice.DueOn);
        return invoice;
    }

    public async Task<CollectionsRunSummary> ProcessCollectionsAsync(CancellationToken ct)
    {
        var today = _clock.Today;
        var late = await _invoices.ListPayableDueByAsync(today.AddDays(-1), ct);
        int markedOverdue = 0, lateFees = 0, suspended = 0, errors = 0;

        foreach (var invoice in late)
        {
            try
            {
                if (invoice.MarkOverdueIfLate(today))
                {
                    markedOverdue++;
                }

                var daysOverdue = invoice.DaysOverdue(today);
                if (await RaiseLateFeeIfDueAsync(invoice, daysOverdue, ct))
                {
                    lateFees++;
                }

                if (daysOverdue >= _options.SuspendAfterDaysOverdue && await SuspendForArrearsAsync(invoice, daysOverdue, ct))
                {
                    suspended++;
                }

                await _unitOfWork.SaveChangesAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                errors++;
                _logger.LogError(ex, "Collections processing failed for invoice {InvoiceNumber}", invoice.InvoiceNumber);
            }
        }

        _logger.LogInformation(
            "Collections: {Overdue} invoices marked overdue, {Fees} late fees raised, {Suspended} accounts suspended, {Errors} errors",
            markedOverdue, lateFees, suspended, errors);
        return new CollectionsRunSummary(markedOverdue, lateFees, suspended, errors);
    }

    private async Task<IReadOnlyList<(Service Service, Plan Plan)>> LoadBillableServicesAsync(Guid accountId, BillingPeriod period, CancellationToken ct)
    {
        var services = (await _services.ListByAccountAsync(accountId, ct))
            .Where(s => s.ActivatedOn is { } activated && activated < period.End)
            .Where(s => s.CancelledOn is not { } cancelled || cancelled > period.Start.AddMonths(-1))
            .ToList();
        if (services.Count == 0)
        {
            return Array.Empty<(Service, Plan)>();
        }

        var plans = (await _plans.GetManyAsync(services.Select(s => s.PlanId).Distinct(), ct)).ToDictionary(p => p.Id);
        return services.Select(s => (Service: s, Plan: plans[s.PlanId])).ToList();
    }

    /// <summary>Overage is billed in arrears: usage in the previous cycle above the plan's allowance.</summary>
    private async Task<IReadOnlyList<UsageCharge>> CalculateUsageChargesAsync(
        IReadOnlyList<(Service Service, Plan Plan)> services, BillingPeriod usagePeriod, CancellationToken ct)
    {
        var charges = new List<UsageCharge>();
        foreach (var (service, plan) in services.Where(s => s.Plan.OveragePerGb is not null))
        {
            var records = await _usage.ListAsync(service.Id, usagePeriod.Start, usagePeriod.End, ct);
            if (FairUsePolicy.Summarise(service.Id, usagePeriod, plan, records).Charge is { } charge)
            {
                charges.Add(charge);
            }
        }

        return charges;
    }

    private async Task<bool> RaiseLateFeeIfDueAsync(Invoice invoice, int daysOverdue, CancellationToken ct)
    {
        if (_options.LatePaymentFeeMinor <= 0 || daysOverdue < _options.LatePaymentFeeAfterDays)
        {
            return false;
        }

        var source = $"late-fee:{invoice.InvoiceNumber}";
        if (await _adjustments.ExistsForSourceAsync(invoice.AccountId, null, source, ct))
        {
            return false;
        }

        _adjustments.Add(new AccountAdjustment(
            Guid.NewGuid(),
            invoice.AccountId,
            null,
            AdjustmentReason.LatePaymentFee,
            $"Late payment fee for invoice {invoice.InvoiceNumber}",
            Money.FromMinor(_options.LatePaymentFeeMinor, invoice.Currency),
            SystemActors.BillingRun,
            _clock.UtcNow,
            sourceReference: source));
        return true;
    }

    private async Task<bool> SuspendForArrearsAsync(Invoice invoice, int daysOverdue, CancellationToken ct)
    {
        var account = await _accounts.GetByIdAsync(invoice.AccountId, ct);
        if (account is null || account.Status != AccountStatus.Active)
        {
            return false;
        }

        account.Suspend($"{ArrearsSuspensionPrefix} invoice {invoice.InvoiceNumber} is {daysOverdue} days overdue", _clock.UtcNow);
        _logger.LogWarning("Account {AccountNumber} suspended for arrears on {InvoiceNumber}", account.Number, invoice.InvoiceNumber);
        return true;
    }

    private async Task PostToLedgerAsync(Invoice invoice, Account account, CancellationToken ct)
    {
        try
        {
            await _billingSystem.PostInvoiceAsync(invoice, account.Number.Value, ct);
        }
        catch (ExternalServiceException ex)
        {
            // The invoice stands; finance reconciles unposted invoices from the ledger exception report.
            _logger.LogError(ex, "Invoice {InvoiceNumber} issued but not posted to the ledger", invoice.InvoiceNumber);
        }
    }
}
