using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Services;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Billing;

/// <summary>Inputs for one partner-month, gathered by the caller from the repositories.</summary>
public sealed record StatementInputs(
    IReadOnlyList<WholesaleService> Services,
    IReadOnlyList<Order> CompletedOrders,
    IReadOnlyList<Order> CancelledWithCharge,
    IReadOnlyList<Fault> CreditedFaults);

/// <summary>
/// Pure statement calculation: no I/O, so it can be tested exhaustively.
/// <list type="bullet">
/// <item>Rental is billed for the statement month, pro-rated by day for every rental period
/// (activation, product change, cease) that overlaps it.</item>
/// <item>One-off charges are billed in the month the order completed.</item>
/// <item>Late delivery credits are assessed against the committed date on completion.</item>
/// <item>Fault credits are taken as assessed at resolution.</item>
/// </list>
/// </summary>
public sealed class StatementGenerator
{
    private readonly ServiceCreditCalculator _credits;

    public StatementGenerator(ServiceCreditCalculator credits)
    {
        _credits = credits;
    }

    public void Populate(BillingStatement statement, StatementInputs inputs, WorkingCalendar orderCalendar)
    {
        var services = inputs.Services.OrderBy(s => s.Reference, StringComparer.Ordinal);
        foreach (var service in services)
        {
            AddRentalLines(statement, service);
        }

        var completed = inputs.CompletedOrders
            .OrderBy(o => o.CompletedDate)
            .ThenBy(o => o.Reference, StringComparer.Ordinal);
        foreach (var order in completed)
        {
            AddCompletedOrderLines(statement, order, orderCalendar);
        }

        foreach (var order in inputs.CancelledWithCharge.OrderBy(o => o.Reference, StringComparer.Ordinal))
        {
            statement.AddLine(ChargeType.CancellationCharge, $"Cancellation after dispatch {order.Uprn}", order.CancellationCharge!.Value, order.Reference);
        }

        foreach (var fault in inputs.CreditedFaults.OrderBy(f => f.ResolvedAt))
        {
            statement.AddLine(ChargeType.FaultCredit, $"Fault repair credit: {fault.ServiceCreditBasis}", fault.ServiceCredit!.Value, fault.Reference);
        }
    }

    /// <summary>One rental line per rental period overlapping the month, pro-rated by day.</summary>
    private static void AddRentalLines(BillingStatement statement, WholesaleService service)
    {
        var days = statement.DaysInPeriod;
        foreach (var period in service.RentalPeriods)
        {
            var billedDays = period.DaysWithin(statement.PeriodStart, statement.PeriodEnd);
            if (billedDays == 0)
            {
                continue;
            }

            var monthly = new Money(period.MonthlyRentalMinor, period.Currency);
            if (billedDays == days)
            {
                statement.AddLine(ChargeType.Rental, $"{period.ProductCode} rental {service.Uprn}", monthly, service.Reference, billedDays);
            }
            else
            {
                var description = $"{period.ProductCode} rental {service.Uprn} ({billedDays}/{days} days)";
                statement.AddLine(ChargeType.Rental, description, monthly.ProRate(billedDays, days), service.Reference, billedDays);
            }
        }
    }

    /// <summary>One-off charge (if any) and late delivery credit (if any) for a completed order.</summary>
    private void AddCompletedOrderLines(BillingStatement statement, Order order, WorkingCalendar orderCalendar)
    {
        var chargeType = OneOffChargeType(order.Type);
        if (order.OneOffCharge is not null && !order.OneOffCharge.Value.IsZero && chargeType is not null)
        {
            var description = $"{order.Type} {order.Uprn} completed {order.CompletedDate:yyyy-MM-dd}";
            statement.AddLine(chargeType.Value, description, order.OneOffCharge.Value, order.Reference);
        }

        var late = order.WorkingDaysLate(orderCalendar);
        if (late > 0)
        {
            var credit = _credits.ForLateDelivery(order.CareLevel, late, statement.Currency);
            statement.AddLine(ChargeType.LateDeliveryCredit, $"Late delivery credit: {credit.Basis}", credit.Amount, order.Reference, credit.Units);
        }
    }

    private static ChargeType? OneOffChargeType(OrderType type)
    {
        switch (type)
        {
            case OrderType.Provide:
                return ChargeType.Connection;
            case OrderType.Migrate:
                return ChargeType.Migration;
            case OrderType.Modify:
                return ChargeType.Modify;
            default:
                return null;
        }
    }
}
