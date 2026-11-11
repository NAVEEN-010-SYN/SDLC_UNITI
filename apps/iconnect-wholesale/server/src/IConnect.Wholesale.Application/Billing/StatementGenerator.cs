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
        var start = statement.PeriodStart;
        var end = statement.PeriodEnd;
        var days = statement.DaysInPeriod;

        foreach (var service in inputs.Services.OrderBy(s => s.Reference, StringComparer.Ordinal))
        {
            foreach (var period in service.RentalPeriods)
            {
                var billedDays = period.DaysWithin(start, end);
                if (billedDays == 0)
                {
                    continue;
                }

                var monthly = new Money(period.MonthlyRentalMinor, period.Currency);
                var amount = billedDays == days ? monthly : monthly.ProRate(billedDays, days);
                var description = billedDays == days
                    ? $"{period.ProductCode} rental {service.Uprn}"
                    : $"{period.ProductCode} rental {service.Uprn} ({billedDays}/{days} days)";
                statement.AddLine(ChargeType.Rental, description, amount, service.Reference, billedDays);
            }
        }

        foreach (var order in inputs.CompletedOrders.OrderBy(o => o.CompletedDate).ThenBy(o => o.Reference, StringComparer.Ordinal))
        {
            if (order.OneOffCharge is { IsZero: false } charge)
            {
                var type = order.Type switch
                {
                    OrderType.Provide => ChargeType.Connection,
                    OrderType.Migrate => ChargeType.Migration,
                    OrderType.Modify => ChargeType.Modify,
                    _ => (ChargeType?)null,
                };

                if (type is { } chargeType)
                {
                    statement.AddLine(chargeType, $"{order.Type} {order.Uprn} completed {order.CompletedDate:yyyy-MM-dd}", charge, order.Reference);
                }
            }

            var late = order.WorkingDaysLate(orderCalendar);
            if (late > 0)
            {
                var credit = _credits.ForLateDelivery(order.CareLevel, late, statement.Currency);
                statement.AddLine(ChargeType.LateDeliveryCredit, $"Late delivery credit: {credit.Basis}", credit.Amount, order.Reference, credit.Units);
            }
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
}
