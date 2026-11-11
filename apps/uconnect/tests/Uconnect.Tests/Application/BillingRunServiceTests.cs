using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Services;
using static Uconnect.Tests.TestData;

namespace Uconnect.Tests.Application;

public sealed class BillingRunServiceTests
{
    private readonly IAccountRepository _accounts = Substitute.For<IAccountRepository>();
    private readonly IServiceRepository _services = Substitute.For<IServiceRepository>();
    private readonly IPlanRepository _plans = Substitute.For<IPlanRepository>();
    private readonly IPlanChangeRepository _planChanges = Substitute.For<IPlanChangeRepository>();
    private readonly IUsageRepository _usage = Substitute.For<IUsageRepository>();
    private readonly IAdjustmentRepository _adjustments = Substitute.For<IAdjustmentRepository>();
    private readonly IInvoiceRepository _invoices = Substitute.For<IInvoiceRepository>();
    private readonly IReferenceGenerator _references = Substitute.For<IReferenceGenerator>();
    private readonly IClock _clock = Substitute.For<IClock>();
    private readonly BillingRunService _service;

    public BillingRunServiceTests()
    {
        _clock.UtcNow.Returns(Now);
        _clock.Today.Returns(Today);
        _references.NextInvoiceNumberAsync(Arg.Any<DateOnly>(), Arg.Any<CancellationToken>()).Returns("INV-202612-000001");
        _service = new BillingRunService(
            _accounts, _services, _plans, _planChanges, _usage, _adjustments, _invoices, _references,
            Substitute.For<IBillingSystemClient>(), Substitute.For<IUnitOfWork>(), _clock,
            Options.Create(new BillingOptions()), NullLogger<BillingRunService>.Instance);
    }

    [Fact]
    public async Task Long_overdue_invoice_gets_one_late_fee_and_suspends_the_account()
    {
        var account = Account();
        var invoice = IssuedInvoice(account.Id, 50_00, new DateOnly(2026, 9, 1));
        _invoices.ListPayableDueByAsync(Arg.Any<DateOnly>(), Arg.Any<CancellationToken>()).Returns(new[] { invoice });
        _accounts.GetByIdAsync(account.Id, Arg.Any<CancellationToken>()).Returns(account);

        var summary = await _service.ProcessCollectionsAsync(CancellationToken.None);

        Assert.Equal(new CollectionsRunSummary(1, 1, 1, 0), summary);
        Assert.Equal(InvoiceStatus.Overdue, invoice.Status);
        Assert.Equal(AccountStatus.Suspended, account.Status);
        Assert.StartsWith(BillingRunService.ArrearsSuspensionPrefix, account.SuspensionReason);
        _adjustments.Received(1).Add(Arg.Is<AccountAdjustment>(a =>
            a.Reason == AdjustmentReason.LatePaymentFee && a.Amount.AmountMinor == 500 && a.SourceReference == $"late-fee:{invoice.InvoiceNumber}"));
    }

    [Fact]
    public async Task Late_fee_is_not_raised_twice()
    {
        var account = Account();
        var invoice = IssuedInvoice(account.Id, 50_00, new DateOnly(2026, 10, 1));
        _invoices.ListPayableDueByAsync(Arg.Any<DateOnly>(), Arg.Any<CancellationToken>()).Returns(new[] { invoice });
        _adjustments.ExistsForSourceAsync(account.Id, null, $"late-fee:{invoice.InvoiceNumber}", Arg.Any<CancellationToken>()).Returns(true);

        var summary = await _service.ProcessCollectionsAsync(CancellationToken.None);

        Assert.Equal(0, summary.LateFeesRaised);
        Assert.Equal(0, summary.AccountsSuspended);
        _adjustments.DidNotReceiveWithAnyArgs().Add(default!);
    }

    [Fact]
    public async Task Invoice_bills_the_new_cycle_in_advance_with_unbilled_credits_and_brought_forward_credit()
    {
        var account = Account(billingDay: 1);
        var plan = Plan(priceMinor: 30_00);
        var service = ActiveService(account, plan, new DateOnly(2025, 1, 1));
        var credit = new AccountAdjustment(Guid.NewGuid(), account.Id, service.Id, AdjustmentReason.Goodwill, "Goodwill", Gbp(-5_00), Guid.NewGuid(), Now);
        _services.ListByAccountAsync(account.Id, Arg.Any<CancellationToken>()).Returns(new[] { service });
        _plans.GetManyAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>()).Returns(new[] { plan });
        _adjustments.ListUnbilledAsync(account.Id, Arg.Any<CancellationToken>()).Returns(new[] { credit });
        _planChanges.ListUnbilledCompletedAsync(account.Id, Arg.Any<CancellationToken>()).Returns(Array.Empty<Uconnect.Domain.PlanChanges.PlanChange>());
        _usage.ListAsync(default, default, default, default).ReturnsForAnyArgs(Array.Empty<Uconnect.Domain.Usage.UsageRecord>());

        var invoice = await _service.BillAccountAsync(account, new BillingPeriod(new DateOnly(2026, 12, 1), new DateOnly(2027, 1, 1)), new DateOnly(2026, 12, 1), CancellationToken.None);

        Assert.NotNull(invoice);
        Assert.Equal(2, invoice.Lines.Count);
        Assert.Equal((30_00 - 5_00) * 12 / 10, invoice.Total.AmountMinor);
        Assert.Equal(new DateOnly(2026, 12, 15), invoice.DueOn);
        Assert.True(credit.IsBilled);
        _invoices.Received(1).Add(invoice);
    }

    [Fact]
    public async Task Already_billed_period_is_skipped()
    {
        var account = Account();
        _invoices.ExistsForPeriodAsync(account.Id, new DateOnly(2026, 12, 1), Arg.Any<CancellationToken>()).Returns(true);

        var invoice = await _service.BillAccountAsync(account, new BillingPeriod(new DateOnly(2026, 12, 1), new DateOnly(2027, 1, 1)), new DateOnly(2026, 12, 1), CancellationToken.None);

        Assert.Null(invoice);
        _invoices.DidNotReceiveWithAnyArgs().Add(default!);
    }

    [Fact]
    public async Task No_billing_runs_on_days_after_the_28th()
    {
        var summary = await _service.RunAsync(new DateOnly(2026, 12, 30), CancellationToken.None);

        Assert.Equal(0, summary.AccountsConsidered);
        await _accounts.DidNotReceiveWithAnyArgs().ListByBillingDayAsync(default, default);
    }
}
