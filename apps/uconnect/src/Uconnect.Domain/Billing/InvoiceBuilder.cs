using Uconnect.Domain.Accounts;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;
using Uconnect.Domain.Usage;

namespace Uconnect.Domain.Billing;

/// <summary>Everything the builder needs to produce one account's invoice for one period.</summary>
public sealed record InvoiceInputs(
    Account Account,
    BillingPeriod Period,
    IReadOnlyList<(Service Service, Plan Plan)> Services,
    IReadOnlyList<PlanChange> UnbilledPlanChanges,
    IReadOnlyList<UsageCharge> UsageCharges,
    IReadOnlyList<AccountAdjustment> Adjustments,
    Money CreditBroughtForward);

/// <summary>
/// Assembles a draft invoice. Recurring charges are billed in advance for <see cref="InvoiceInputs.Period"/>
/// and prorated when a service activates or is cancelled part-way through it; plan-change proration
/// and fees, usage overage from the previous period and unbilled account adjustments are billed in arrears.
/// </summary>
public static class InvoiceBuilder
{
    public static Invoice Build(Guid invoiceId, string invoiceNumber, InvoiceInputs inputs, DateTimeOffset now)
    {
        var account = inputs.Account;
        var period = inputs.Period;
        var invoice = new Invoice(invoiceId, invoiceNumber, account.Id, period, account.Currency, now);

        foreach (var (service, plan) in inputs.Services.OrderBy(s => s.Service.ServiceReference, StringComparer.Ordinal))
        {
            AddRecurringCharge(invoice, period, service, plan);
        }

        foreach (var change in inputs.UnbilledPlanChanges.Where(c => c.Status == PlanChangeStatus.Completed && c.BilledOnInvoiceId is null))
        {
            AddPlanChangeLines(invoice, change);
        }

        foreach (var usage in inputs.UsageCharges.Where(u => u.Amount.IsPositive))
        {
            invoice.AddLine(
                InvoiceLineType.Usage,
                $"Usage above {usage.AllowanceGb} GB fair-use allowance ({usage.ExcessGb} GB)",
                usage.RatePerGb,
                usage.ExcessGb,
                usage.ServiceId,
                taxable: true,
                usage.Period.Start,
                usage.Period.End);
        }

        foreach (var adjustment in inputs.Adjustments.Where(a => !a.IsBilled).OrderBy(a => a.RaisedAt))
        {
            invoice.AddLine(adjustment.LineType, adjustment.Description, adjustment.Amount, 1, adjustment.ServiceId, adjustment.Taxable);
        }

        if (inputs.CreditBroughtForward.IsPositive)
        {
            // Carried-forward credit already included tax when it arose, so it is applied untaxed.
            invoice.AddLine(InvoiceLineType.Credit, "Credit brought forward from previous invoice", inputs.CreditBroughtForward.Negate(), taxable: false);
        }

        return invoice;
    }

    private static void AddRecurringCharge(Invoice invoice, BillingPeriod period, Service service, Plan plan)
    {
        if (service.ActivatedOn is not { } activatedOn || activatedOn >= period.End)
        {
            return;
        }

        var until = service.CancelledOn ?? period.End;
        if (until <= period.Start)
        {
            return;
        }

        var amount = ProrationCalculator.PartialPeriodCharge(period, activatedOn, until, service.MonthlyPrice);
        if (amount.IsZero)
        {
            return;
        }

        var from = activatedOn > period.Start ? activatedOn : period.Start;
        var to = until < period.End ? until : period.End;
        var partial = from != period.Start || to != period.End;
        var description = partial
            ? $"{plan.Name} ({service.ServiceReference}) {from:dd MMM} – {to.AddDays(-1):dd MMM}, part period"
            : $"{plan.Name} ({service.ServiceReference}) monthly charge";

        invoice.AddLine(InvoiceLineType.Recurring, description, amount, 1, service.Id, taxable: true, from, to);
    }

    private static void AddPlanChangeLines(Invoice invoice, PlanChange change)
    {
        if (!change.ProrationCredit.IsZero)
        {
            invoice.AddLine(
                InvoiceLineType.Credit,
                $"Credit for {change.ProrationDays} unused days on previous plan",
                change.ProrationCredit.Negate(),
                1,
                change.ServiceId);
        }

        if (!change.ProrationCharge.IsZero)
        {
            invoice.AddLine(
                InvoiceLineType.Proration,
                $"Charge for {change.ProrationDays} days on new plan from {change.EffectiveOn:dd MMM yyyy}",
                change.ProrationCharge,
                1,
                change.ServiceId);
        }

        if (change.EarlyTerminationFee.IsPositive)
        {
            invoice.AddLine(
                InvoiceLineType.EarlyTerminationFee,
                "Early plan change fee (within minimum term)",
                change.EarlyTerminationFee,
                1,
                change.ServiceId,
                taxable: true);
        }
    }
}
