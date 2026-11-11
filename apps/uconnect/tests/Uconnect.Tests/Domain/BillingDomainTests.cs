using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.PlanChanges;
using static Uconnect.Tests.TestData;

namespace Uconnect.Tests.Domain;

public sealed class MoneyTests
{
    [Theory]
    [InlineData(1000, 1, 3, 333)]
    [InlineData(1000, 2, 3, 667)]
    [InlineData(-1000, 2, 3, -667)]
    [InlineData(5, 1, 2, 3)]
    public void MultiplyRatio_rounds_half_away_from_zero(long amount, long numerator, long denominator, long expected) =>
        Assert.Equal(expected, Gbp(amount).MultiplyRatio(numerator, denominator).AmountMinor);

    [Fact]
    public void Allocate_never_loses_a_minor_unit()
    {
        var parts = Gbp(100).Allocate(new[] { 1, 1, 1 });

        Assert.Equal(new long[] { 34, 33, 33 }, parts.Select(p => p.AmountMinor));
    }

    [Fact]
    public void Adding_different_currencies_is_rejected()
    {
        var ex = Assert.Throws<DomainException>(() => Gbp(100) + Money.FromMinor(100, "EUR"));
        Assert.Equal("money.currency_mismatch", ex.Code);
    }

    [Fact]
    public void FromMajor_rejects_sub_penny_amounts() =>
        Assert.Throws<DomainException>(() => Money.FromMajor(1.005m, "GBP"));
}

public sealed class InvoiceTests
{
    [Fact]
    public void Issue_applies_tax_once_on_the_taxable_base_and_sets_due_date()
    {
        var invoice = new Invoice(Guid.NewGuid(), "INV-1", Guid.NewGuid(), new BillingPeriod(new DateOnly(2026, 11, 1), new DateOnly(2026, 12, 1)), "GBP", Now);
        invoice.AddLine(InvoiceLineType.Recurring, "Plan", Gbp(33_33));
        invoice.AddLine(InvoiceLineType.Recurring, "Voice", Gbp(33_33));
        invoice.AddLine(InvoiceLineType.OneOff, "Late fee", Gbp(5_00), taxable: false);

        invoice.Issue(new DateOnly(2026, 11, 1), 14, 2000, Now);

        Assert.Equal(13_33, invoice.TaxTotal.AmountMinor);
        Assert.Equal(66_66 + 5_00 + 13_33, invoice.Total.AmountMinor);
        Assert.Equal(new DateOnly(2026, 11, 15), invoice.DueOn);
        Assert.Equal(InvoiceStatus.Issued, invoice.Status);
    }

    [Fact]
    public void Net_credit_invoice_is_settled_and_carries_the_credit_forward()
    {
        var invoice = new Invoice(Guid.NewGuid(), "INV-2", Guid.NewGuid(), new BillingPeriod(new DateOnly(2026, 11, 1), new DateOnly(2026, 12, 1)), "GBP", Now);
        invoice.AddLine(InvoiceLineType.Recurring, "Plan", Gbp(10_00));
        invoice.AddLine(InvoiceLineType.Credit, "Outage credit", Gbp(-25_00));

        invoice.Issue(new DateOnly(2026, 11, 1), 14, 2000, Now);

        Assert.Equal(InvoiceStatus.Paid, invoice.Status);
        Assert.Equal(18_00, invoice.CreditCarriedForward.AmountMinor);
        Assert.True(invoice.BalanceDue.IsZero);
    }

    [Fact]
    public void Partial_payment_then_overdue_then_full_payment()
    {
        var invoice = IssuedInvoice(Guid.NewGuid(), 50_00, new DateOnly(2026, 11, 1));

        invoice.ApplyPayment(Gbp(20_00), Now);
        Assert.Equal(InvoiceStatus.PartiallyPaid, invoice.Status);

        Assert.True(invoice.MarkOverdueIfLate(new DateOnly(2026, 11, 20)));
        Assert.Equal(5, invoice.DaysOverdue(new DateOnly(2026, 11, 20)));

        invoice.ApplyPayment(invoice.BalanceDue, Now);
        Assert.Equal(InvoiceStatus.Paid, invoice.Status);
    }

    [Fact]
    public void Overpayment_is_rejected()
    {
        var invoice = IssuedInvoice(Guid.NewGuid(), 10_00, new DateOnly(2026, 11, 1));

        var ex = Assert.Throws<DomainException>(() => invoice.ApplyPayment(Gbp(12_01), Now));
        Assert.Equal("invoice.overpayment", ex.Code);
    }

    [Fact]
    public void Issued_invoice_lines_are_frozen()
    {
        var invoice = IssuedInvoice(Guid.NewGuid(), 10_00, new DateOnly(2026, 11, 1));

        Assert.Throws<DomainException>(() => invoice.AddLine(InvoiceLineType.OneOff, "Extra", Gbp(1_00)));
    }
}

public sealed class PlanChangePolicyTests
{
    [Fact]
    public void Mid_cycle_upgrade_is_prorated_for_the_remaining_days()
    {
        var account = Account(billingDay: 1);
        var current = Plan("FIBRE-100", tier: 1, priceMinor: 30_00);
        var target = Plan("FIBRE-900", tier: 3, priceMinor: 60_00);
        var service = ActiveService(account, current, new DateOnly(2025, 1, 1));

        var quote = PlanChangePolicy.Quote(account, service, current, target, new DateOnly(2026, 11, 16));

        Assert.Equal(PlanChangeType.Upgrade, quote.ChangeType);
        Assert.NotNull(quote.Proration);
        Assert.Equal(15, quote.Proration.DaysRemaining);
        Assert.Equal(15_00, quote.Proration.Credit.AmountMinor);
        Assert.Equal(30_00, quote.Proration.Charge.AmountMinor);
        Assert.Equal(15_00, quote.OneOffTotal.AmountMinor);
        Assert.True(quote.ResetsContract);
    }

    [Fact]
    public void Downgrade_inside_contract_takes_effect_next_cycle_with_capped_fee()
    {
        var account = Account(billingDay: 1);
        var current = Plan("FIBRE-900", tier: 3, priceMinor: 60_00, minimumTermMonths: 24);
        var target = Plan("FIBRE-100", tier: 1, priceMinor: 30_00);
        var service = ActiveService(account, current, new DateOnly(2026, 10, 1));

        var quote = PlanChangePolicy.Quote(account, service, current, target, new DateOnly(2026, 11, 16));

        Assert.Equal(new DateOnly(2026, 12, 1), quote.EffectiveOn);
        Assert.Null(quote.Proration);
        Assert.Equal(30_00 * PlanChangePolicy.EarlyTerminationFeeCapMonths, quote.EarlyTerminationFee.AmountMinor);
    }

    [Fact]
    public void Downgrade_cannot_be_dated_mid_cycle()
    {
        var account = Account();
        var current = Plan("FIBRE-900", tier: 3, priceMinor: 60_00);
        var target = Plan("FIBRE-100", tier: 1, priceMinor: 30_00);
        var service = ActiveService(account, current, new DateOnly(2025, 1, 1));

        var ex = Assert.Throws<DomainException>(() =>
            PlanChangePolicy.Quote(account, service, current, target, new DateOnly(2026, 11, 16), new DateOnly(2026, 11, 20)));
        Assert.Equal("plan_change.downgrade_date", ex.Code);
    }
}
