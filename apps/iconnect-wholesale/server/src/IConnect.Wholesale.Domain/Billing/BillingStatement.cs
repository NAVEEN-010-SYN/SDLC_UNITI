using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Billing;

public enum StatementStatus
{
    Draft,
    Issued,
    Disputed,
    Settled,
}

public enum ChargeType
{
    Rental,
    Connection,
    Migration,
    Modify,
    CancellationCharge,
    FaultCredit,
    LateDeliveryCredit,
    DisputeAdjustment,
}

/// <summary>
/// A partner's monthly wholesale statement. Lines are generated in Draft, then the statement is
/// issued with a payment due date. Credits are negative lines. Disputes reference specific lines.
/// </summary>
public sealed class BillingStatement : AggregateRoot
{
    public const int PaymentTermsDays = 30;

    private readonly List<StatementLine> _lines = new();

    private BillingStatement()
    {
    }

    public BillingStatement(string reference, Guid partnerId, DateOnly periodStart, DateOnly periodEnd, string currency)
    {
        if (periodEnd < periodStart)
        {
            throw new DomainException("statement.invalid_period", "Statement period end precedes start.");
        }

        Reference = reference;
        PartnerId = partnerId;
        PeriodStart = periodStart;
        PeriodEnd = periodEnd;
        Currency = currency;
        Status = StatementStatus.Draft;
    }

    public string Reference { get; private set; } = string.Empty;

    public Guid PartnerId { get; private set; }

    public DateOnly PeriodStart { get; private set; }

    public DateOnly PeriodEnd { get; private set; }

    public string Currency { get; private set; } = "GBP";

    public StatementStatus Status { get; private set; }

    public DateTimeOffset? IssuedAt { get; private set; }

    public DateOnly? DueDate { get; private set; }

    public IReadOnlyList<StatementLine> Lines => _lines;

    public int DaysInPeriod => PeriodEnd.DayNumber - PeriodStart.DayNumber + 1;

    public Money Subtotal(Func<StatementLine, bool> predicate) =>
        Money.Sum(_lines.Where(predicate).Select(l => l.Amount), Currency);

    public Money Charges => Subtotal(l => !l.Amount.IsNegative);

    public Money Credits => Subtotal(l => l.Amount.IsNegative);

    public Money Total => Subtotal(_ => true);

    public StatementLine AddLine(ChargeType type, string description, Money amount, string? sourceReference, int quantity = 1)
    {
        if (Status != StatementStatus.Draft && type != ChargeType.DisputeAdjustment)
        {
            throw new DomainException("statement.not_draft", "Lines can only be added while the statement is a draft.");
        }

        if (amount.Currency != Currency)
        {
            throw new DomainException("statement.currency_mismatch", $"Line currency {amount.Currency} differs from statement {Currency}.");
        }

        var isCredit = type is ChargeType.FaultCredit or ChargeType.LateDeliveryCredit;
        if (isCredit && amount.MinorUnits > 0)
        {
            amount = new Money(-amount.MinorUnits, amount.Currency);
        }

        var line = new StatementLine(Guid.NewGuid(), _lines.Count + 1, type, description, quantity, amount, sourceReference);
        _lines.Add(line);
        return line;
    }

    public void Issue(DateTimeOffset now)
    {
        if (Status != StatementStatus.Draft)
        {
            throw new InvalidTransitionException("statement", Status.ToString().ToUpperInvariant(), "ISSUED");
        }

        Status = StatementStatus.Issued;
        IssuedAt = now;
        DueDate = DateOnly.FromDateTime(now.UtcDateTime).AddDays(PaymentTermsDays);
        Touch(now);
    }

    public void MarkDisputed()
    {
        if (Status is not (StatementStatus.Issued or StatementStatus.Disputed))
        {
            throw new DomainException("statement.not_disputable", "Only issued statements can be disputed.");
        }

        Status = StatementStatus.Disputed;
    }

    public void ReturnToIssued()
    {
        if (Status == StatementStatus.Disputed)
        {
            Status = StatementStatus.Issued;
        }
    }

    public void MarkSettled(DateTimeOffset now)
    {
        if (Status == StatementStatus.Disputed)
        {
            throw new DomainException("statement.open_dispute", "Statements with an open dispute cannot be settled.");
        }

        if (Status != StatementStatus.Issued)
        {
            throw new InvalidTransitionException("statement", Status.ToString().ToUpperInvariant(), "SETTLED");
        }

        Status = StatementStatus.Settled;
        Touch(now);
    }

    public StatementLine? FindLine(Guid lineId) => _lines.FirstOrDefault(l => l.Id == lineId);
}

public sealed record StatementLine(
    Guid Id,
    int LineNumber,
    ChargeType Type,
    string Description,
    int Quantity,
    Money Amount,
    string? SourceReference);
