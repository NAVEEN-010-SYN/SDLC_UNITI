using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Billing;

public enum DisputeStatus
{
    Open,
    UnderReview,
    Upheld,
    PartiallyUpheld,
    Rejected,
}

/// <summary>
/// A partner's challenge to one or more statement lines. Must be raised within the dispute
/// window after issue; the claimed amount cannot exceed the disputed lines' total. When upheld,
/// the awarded amount becomes a credit adjustment on the statement.
/// </summary>
public sealed class Dispute : AggregateRoot
{
    public const int DisputeWindowDays = 90;

    private Dispute()
    {
    }

    private Dispute(string reference, Guid statementId, Guid partnerId, List<Guid> lineIds, string reason, Money claimed, DateTimeOffset now)
    {
        Reference = reference;
        StatementId = statementId;
        PartnerId = partnerId;
        LineIds = lineIds;
        Reason = reason;
        ClaimedAmount = claimed;
        Status = DisputeStatus.Open;
        Touch(now);
    }

    public string Reference { get; private set; } = string.Empty;

    public Guid StatementId { get; private set; }

    public Guid PartnerId { get; private set; }

    public List<Guid> LineIds { get; private set; } = new();

    public string Reason { get; private set; } = string.Empty;

    public Money ClaimedAmount { get; private set; }

    public DisputeStatus Status { get; private set; }

    public Money? AwardedAmount { get; private set; }

    public string? Outcome { get; private set; }

    public DateTimeOffset? DecidedAt { get; private set; }

    public bool IsOpen => Status is DisputeStatus.Open or DisputeStatus.UnderReview;

    public static Dispute Raise(string reference, BillingStatement statement, IReadOnlyCollection<Guid> lineIds, string reason,
        Money claimed, DateTimeOffset now)
    {
        if (statement.IssuedAt is not { } issued)
        {
            throw new DomainException("dispute.statement_not_issued", "Only issued statements can be disputed.");
        }

        if ((now - issued).TotalDays > DisputeWindowDays)
        {
            throw new DomainException("dispute.window_closed", $"Disputes must be raised within {DisputeWindowDays} days of issue.");
        }

        if (lineIds.Count == 0)
        {
            throw new DomainException("dispute.no_lines", "Select at least one statement line to dispute.");
        }

        var lines = new List<StatementLine>();
        foreach (var id in lineIds.Distinct())
        {
            lines.Add(statement.FindLine(id) ?? throw new DomainException("dispute.unknown_line", $"Line {id} is not on statement {statement.Reference}."));
        }

        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length < 20)
        {
            throw new DomainException("dispute.reason_too_short", "Explain the dispute in at least 20 characters.");
        }

        var disputable = Money.Sum(lines.Where(l => !l.Amount.IsNegative).Select(l => l.Amount), statement.Currency);
        if (claimed.MinorUnits <= 0 || claimed.MinorUnits > disputable.MinorUnits)
        {
            throw new DomainException("dispute.invalid_claim", $"Claimed amount must be positive and at most {disputable}.");
        }

        statement.MarkDisputed();
        return new Dispute(reference, statement.Id, statement.PartnerId, lines.Select(l => l.Id).ToList(), reason.Trim(), claimed, now);
    }

    public void StartReview(DateTimeOffset now)
    {
        if (Status != DisputeStatus.Open)
        {
            throw new InvalidTransitionException("dispute", Status.ToString().ToUpperInvariant(), "UNDER_REVIEW");
        }

        Status = DisputeStatus.UnderReview;
        Touch(now);
    }

    /// <summary>Decides the dispute. An award of zero rejects it; the full claim upholds it.</summary>
    public void Decide(Money awarded, string outcome, DateTimeOffset now)
    {
        if (!IsOpen)
        {
            throw new DomainException("dispute.closed", "Dispute has already been decided.");
        }

        if (awarded.IsNegative || awarded.MinorUnits > ClaimedAmount.MinorUnits)
        {
            throw new DomainException("dispute.invalid_award", "Award must be between zero and the claimed amount.");
        }

        if (string.IsNullOrWhiteSpace(outcome))
        {
            throw new DomainException("dispute.outcome_required", "An outcome explanation is required.");
        }

        AwardedAmount = awarded;
        Outcome = outcome.Trim();
        DecidedAt = now;
        Status = awarded.IsZero
            ? DisputeStatus.Rejected
            : awarded.MinorUnits == ClaimedAmount.MinorUnits ? DisputeStatus.Upheld : DisputeStatus.PartiallyUpheld;
        Touch(now);
    }
}
