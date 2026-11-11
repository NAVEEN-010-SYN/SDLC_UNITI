using FluentValidation;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;
using Uconnect.Domain.Tickets;

namespace Uconnect.Application.Tickets;

public sealed record TicketSummaryDto(
    string Reference,
    string Subject,
    string Category,
    string Priority,
    string Status,
    Guid? ServiceId,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastActivityAt,
    DateTimeOffset ResolutionDueAt,
    bool SlaBreached);

public sealed record TicketCommentDto(Guid Id, string AuthorName, string Body, bool IsAgent, bool IsInternal, DateTimeOffset CreatedAt);

public sealed record TicketDetailDto(
    TicketSummaryDto Summary,
    string Description,
    string? ResolutionSummary,
    DateTimeOffset? FirstRespondedAt,
    DateTimeOffset FirstResponseDueAt,
    DateTimeOffset? ResolvedAt,
    int ReopenCount,
    bool CanReopen,
    bool CanClose,
    IReadOnlyList<TicketCommentDto> Comments);

/// <summary>
/// Customers describe the problem; priority is derived by triage, never chosen.
/// <see cref="ServiceDown"/> means the service is completely unusable.
/// </summary>
public sealed record CreateTicketRequest(Guid? ServiceId, string Category, string Subject, string Description, bool ServiceDown);

public sealed record AddTicketCommentRequest(string Body, bool Internal);

public sealed record ReopenTicketRequest(string Reason);

public sealed record ResolveTicketRequest(string Summary);

public sealed record EscalateTicketRequest(string Priority, string Reason);

public sealed class CreateTicketRequestValidator : AbstractValidator<CreateTicketRequest>
{
    public CreateTicketRequestValidator()
    {
        RuleFor(r => r.Category).Must(EnumParsing.IsValid<TicketCategory>)
            .WithMessage($"Category must be one of: {string.Join(", ", Enum.GetNames<TicketCategory>())}.");
        RuleFor(r => r.ServiceId).NotEmpty()
            .When(r => EnumParsing.TryParse<TicketCategory>(r.Category, out var c) && c == TicketCategory.Fault)
            .WithMessage("Choose the service that has the fault.");
        RuleFor(r => r.Subject).NotEmpty().MaximumLength(150).SafeText(150);
        RuleFor(r => r.Description).NotEmpty().MaximumLength(4000).SafeText(4000);
    }
}

public sealed class AddTicketCommentRequestValidator : AbstractValidator<AddTicketCommentRequest>
{
    public AddTicketCommentRequestValidator()
    {
        RuleFor(r => r.Body).NotEmpty().MaximumLength(4000).SafeText(4000);
    }
}

public sealed class ReopenTicketRequestValidator : AbstractValidator<ReopenTicketRequest>
{
    public ReopenTicketRequestValidator()
    {
        RuleFor(r => r.Reason).NotEmpty().MaximumLength(1000).SafeText(1000);
    }
}

public sealed class ResolveTicketRequestValidator : AbstractValidator<ResolveTicketRequest>
{
    public ResolveTicketRequestValidator()
    {
        RuleFor(r => r.Summary).NotEmpty().MaximumLength(2000).SafeText(2000);
    }
}

public sealed class EscalateTicketRequestValidator : AbstractValidator<EscalateTicketRequest>
{
    public EscalateTicketRequestValidator()
    {
        RuleFor(r => r.Priority).Must(EnumParsing.IsValid<TicketPriority>).WithMessage("Priority must be P1, P2, P3 or P4.");
        RuleFor(r => r.Reason).NotEmpty().MaximumLength(1000).SafeText(1000);
    }
}

internal static class TicketMapping
{
    public static TicketSummaryDto ToSummaryDto(this Ticket ticket, DateTimeOffset now) => new(
        ticket.Reference,
        ticket.Subject,
        ticket.Category.ToString(),
        ticket.Priority.ToString(),
        ticket.Status.ToString(),
        ticket.ServiceId,
        ticket.CreatedAt,
        ticket.LastActivityAt,
        ticket.ResolutionDueAt,
        ticket.IsFirstResponseBreached(now) || ticket.IsResolutionBreached(now));

    public static TicketDetailDto ToDetailDto(this Ticket ticket, DateTimeOffset now, bool includeInternal) => new(
        ticket.ToSummaryDto(now),
        ticket.Description,
        ticket.ResolutionSummary,
        ticket.FirstRespondedAt,
        ticket.FirstResponseDueAt,
        ticket.ResolvedAt,
        ticket.ReopenCount,
        CanReopen(ticket, now),
        ticket.Status is TicketStatus.Open or TicketStatus.PendingCustomer or TicketStatus.Resolved,
        ticket.Comments
            .Where(c => includeInternal || !c.IsInternal)
            .OrderBy(c => c.CreatedAt)
            .Select(c => new TicketCommentDto(c.Id, c.AuthorName, c.Body, c.IsAgent, c.IsInternal, c.CreatedAt))
            .ToList());

    private static bool CanReopen(Ticket ticket, DateTimeOffset now) =>
        ticket.Status == TicketStatus.Resolved
        && ticket.ResolvedAt is { } resolved
        && (now - resolved).TotalDays <= Ticket.ReopenWindowDays
        && ticket.ReopenCount < Ticket.MaxReopens;
}
