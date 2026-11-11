using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Orders;

public enum OrderType
{
    Provide,
    Cease,
    Modify,
    Migrate,
}

public enum OrderStatus
{
    Draft,
    Submitted,
    Validated,
    Provisioning,
    Active,
    Cancelled,
    Failed,
}

/// <summary>
/// The wholesale order lifecycle: DRAFT → SUBMITTED → VALIDATED → PROVISIONING → ACTIVE,
/// with CANCELLED and FAILED as terminal side exits. The table is the single source of truth
/// for which moves are legal; aggregates call <see cref="EnsureCanTransition"/> before mutating.
/// </summary>
public static class OrderStateMachine
{
    private static readonly IReadOnlyDictionary<OrderStatus, OrderStatus[]> Allowed = new Dictionary<OrderStatus, OrderStatus[]>
    {
        [OrderStatus.Draft] = new[] { OrderStatus.Submitted, OrderStatus.Cancelled },
        [OrderStatus.Submitted] = new[] { OrderStatus.Validated, OrderStatus.Failed, OrderStatus.Cancelled },
        [OrderStatus.Validated] = new[] { OrderStatus.Provisioning, OrderStatus.Failed, OrderStatus.Cancelled },
        [OrderStatus.Provisioning] = new[] { OrderStatus.Active, OrderStatus.Failed, OrderStatus.Cancelled },
        [OrderStatus.Active] = Array.Empty<OrderStatus>(),
        [OrderStatus.Cancelled] = Array.Empty<OrderStatus>(),
        [OrderStatus.Failed] = Array.Empty<OrderStatus>(),
    };

    public static bool CanTransition(OrderStatus from, OrderStatus to) => Allowed[from].Contains(to);

    public static IReadOnlyCollection<OrderStatus> NextStates(OrderStatus from) => Allowed[from];

    public static bool IsTerminal(OrderStatus status) => Allowed[status].Length == 0;

    /// <summary>Statuses during which the partner may still amend the requested date or appointment.</summary>
    public static bool IsAmendable(OrderStatus status) =>
        status is OrderStatus.Draft or OrderStatus.Submitted or OrderStatus.Validated;

    public static void EnsureCanTransition(OrderStatus from, OrderStatus to)
    {
        if (!CanTransition(from, to))
        {
            throw new InvalidTransitionException("order", from.ToString().ToUpperInvariant(), to.ToString().ToUpperInvariant());
        }
    }
}
