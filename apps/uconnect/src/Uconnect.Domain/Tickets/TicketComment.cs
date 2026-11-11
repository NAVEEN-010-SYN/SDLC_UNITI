using Uconnect.Domain.Common;

namespace Uconnect.Domain.Tickets;

/// <summary>A message on a ticket from the customer or an agent. Internal notes are agent-only.</summary>
public sealed class TicketComment : Entity
{
    private TicketComment()
    {
    }

    internal TicketComment(
        Guid id,
        Guid ticketId,
        Guid authorUserId,
        string authorName,
        string body,
        bool isAgent,
        bool isInternal,
        DateTimeOffset createdAt)
        : base(id)
    {
        if (isInternal && !isAgent)
        {
            throw new DomainException("ticket.internal_note_customer", "Customers cannot add internal notes.");
        }

        TicketId = ticketId;
        AuthorUserId = authorUserId;
        AuthorName = Guard.NotBlank(authorName, "comment.author", 120);
        Body = Guard.NotBlank(body, "comment.body", 4000);
        IsAgent = isAgent;
        IsInternal = isInternal;
        CreatedAt = createdAt;
    }

    public Guid TicketId { get; private set; }

    public Guid AuthorUserId { get; private set; }

    public string AuthorName { get; private set; } = string.Empty;

    public string Body { get; private set; } = string.Empty;

    public bool IsAgent { get; private set; }

    public bool IsInternal { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }
}

/// <summary>SLA targets by priority.</summary>
public sealed record TicketSla(TimeSpan FirstResponse, TimeSpan Resolution);

/// <summary>
/// Service-level targets. P1 is a total loss of service for a business customer; P4 is a general
/// enquiry. Targets are in elapsed (24x7) time.
/// </summary>
public static class TicketSlaPolicy
{
    private static readonly IReadOnlyDictionary<TicketPriority, TicketSla> Targets = new Dictionary<TicketPriority, TicketSla>
    {
        [TicketPriority.P1] = new(TimeSpan.FromHours(1), TimeSpan.FromHours(4)),
        [TicketPriority.P2] = new(TimeSpan.FromHours(4), TimeSpan.FromHours(24)),
        [TicketPriority.P3] = new(TimeSpan.FromHours(8), TimeSpan.FromHours(72)),
        [TicketPriority.P4] = new(TimeSpan.FromHours(24), TimeSpan.FromHours(120)),
    };

    public static TicketSla For(TicketPriority priority) => Targets[priority];
}

/// <summary>
/// Derives a ticket's initial priority from what the customer tells us. Customers never choose a
/// priority directly; agents may escalate afterwards.
/// </summary>
public static class TicketTriage
{
    public static TicketPriority DeterminePriority(TicketCategory category, bool serviceDown, bool isBusiness, bool isInKnownOutage)
    {
        if (category == TicketCategory.Fault)
        {
            if (serviceDown && isInKnownOutage)
            {
                // Already tracked by the network operations centre; the ticket only links the customer.
                return TicketPriority.P3;
            }

            if (serviceDown)
            {
                return isBusiness ? TicketPriority.P1 : TicketPriority.P2;
            }

            return isBusiness ? TicketPriority.P2 : TicketPriority.P3;
        }

        switch (category)
        {
            case TicketCategory.Installation:
                return TicketPriority.P2;
            case TicketCategory.Complaint:
                return TicketPriority.P3;
            case TicketCategory.Billing:
            case TicketCategory.PlanChange:
                return isBusiness ? TicketPriority.P3 : TicketPriority.P4;
            default:
                return TicketPriority.P4;
        }
    }
}
