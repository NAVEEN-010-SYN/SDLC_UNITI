using Uconnect.Domain.Common;

namespace Uconnect.Domain.Outages;

/// <summary>
/// A network incident affecting one or more postcode districts (outward codes). Customers whose
/// service address falls in an affected district see it in the portal and are notified on
/// declaration and on resolution.
/// </summary>
public sealed class Outage : AggregateRoot
{
    private readonly List<OutageUpdate> _updates = new();

    private Outage()
    {
    }

    public Outage(
        Guid id,
        string reference,
        string title,
        string description,
        OutageSeverity severity,
        IEnumerable<string> affectedOutwardCodes,
        DateTimeOffset startedAt,
        DateTimeOffset? estimatedResolutionAt,
        DateTimeOffset now)
        : base(id)
    {
        Reference = Guard.NotBlank(reference, "outage.reference", 20);
        Title = Guard.NotBlank(title, "outage.title", 150);
        Description = Guard.NotBlank(description, "outage.description", 2000);
        Severity = severity;
        AffectedOutwardCodes = NormaliseCodes(affectedOutwardCodes);
        if (startedAt > now)
        {
            throw new DomainException("outage.start_in_future", "An outage cannot start in the future.");
        }

        StartedAt = startedAt;
        SetEta(estimatedResolutionAt);
        Status = OutageStatus.Investigating;
        _updates.Add(new OutageUpdate(Guid.NewGuid(), Id, Status, Description, now));
        Raise(new OutageDeclared(Id, Reference, AffectedOutwardCodes, now));
    }

    public string Reference { get; private set; } = string.Empty;

    public string Title { get; private set; } = string.Empty;

    public string Description { get; private set; } = string.Empty;

    public OutageSeverity Severity { get; private set; }

    public OutageStatus Status { get; private set; }

    /// <summary>Postcode outward codes, e.g. "LS1", "LS2".</summary>
    public List<string> AffectedOutwardCodes { get; private set; } = new();

    public DateTimeOffset StartedAt { get; private set; }

    public DateTimeOffset? EstimatedResolutionAt { get; private set; }

    public DateTimeOffset? ResolvedAt { get; private set; }

    public IReadOnlyList<OutageUpdate> Updates => _updates.OrderBy(u => u.PostedAt).ToList();

    public bool IsResolved => Status == OutageStatus.Resolved;

    public bool Affects(PostalAddress address) =>
        AffectedOutwardCodes.Contains(address.OutwardCode, StringComparer.OrdinalIgnoreCase);

    public TimeSpan Duration(DateTimeOffset now) => (ResolvedAt ?? now) - StartedAt;

    /// <summary>
    /// Posts a progress update. Status may only move forward (Investigating -> Identified -> Monitoring ->
    /// Resolved); Monitoring can fall back to Identified if the fix did not hold.
    /// </summary>
    public void PostUpdate(OutageStatus status, string message, DateTimeOffset? newEta, DateTimeOffset now)
    {
        if (IsResolved)
        {
            throw new DomainException("outage.resolved", "Resolved outages cannot be updated.");
        }

        var regressing = status < Status && !(Status == OutageStatus.Monitoring && status == OutageStatus.Identified);
        if (regressing)
        {
            throw new InvalidStateTransitionException(nameof(Outage), Status.ToString(), status.ToString());
        }

        Status = status;
        if (newEta is not null)
        {
            SetEta(newEta);
        }

        _updates.Add(new OutageUpdate(Guid.NewGuid(), Id, status, Guard.NotBlank(message, "outage.update_message", 2000), now));

        if (status == OutageStatus.Resolved)
        {
            ResolvedAt = now;
            EstimatedResolutionAt = null;
            Raise(new OutageResolved(Id, Reference, AffectedOutwardCodes, StartedAt, now));
        }
    }

    /// <summary>Widens the affected area as the incident is diagnosed; returns the newly added codes.</summary>
    public IReadOnlyList<string> AddAffectedAreas(IEnumerable<string> outwardCodes, DateTimeOffset now)
    {
        if (IsResolved)
        {
            throw new DomainException("outage.resolved", "Resolved outages cannot be updated.");
        }

        var added = NormaliseCodes(outwardCodes).Except(AffectedOutwardCodes, StringComparer.OrdinalIgnoreCase).ToList();
        if (added.Count > 0)
        {
            AffectedOutwardCodes = AffectedOutwardCodes.Concat(added).OrderBy(c => c, StringComparer.Ordinal).ToList();
            Raise(new OutageDeclared(Id, Reference, added, now));
        }

        return added;
    }

    private void SetEta(DateTimeOffset? eta)
    {
        if (eta is not null && eta <= StartedAt)
        {
            throw new DomainException("outage.eta_before_start", "Estimated resolution must be after the outage start.");
        }

        EstimatedResolutionAt = eta;
    }

    private static List<string> NormaliseCodes(IEnumerable<string> codes)
    {
        var list = codes
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Select(c => c.Trim().ToUpperInvariant())
            .Distinct(StringComparer.Ordinal)
            .OrderBy(c => c, StringComparer.Ordinal)
            .ToList();

        if (list.Count == 0)
        {
            throw new DomainException("outage.no_area", "At least one affected postcode district is required.");
        }

        if (list.Any(c => c.Length > 4 || !char.IsLetter(c[0])))
        {
            throw new DomainException("outage.invalid_area", "Affected areas must be postcode outward codes such as 'LS1'.");
        }

        return list;
    }
}

/// <summary>A timestamped status message on an outage, shown to customers.</summary>
public sealed class OutageUpdate : Entity
{
    private OutageUpdate()
    {
    }

    internal OutageUpdate(Guid id, Guid outageId, OutageStatus status, string message, DateTimeOffset postedAt)
        : base(id)
    {
        OutageId = outageId;
        Status = status;
        Message = message;
        PostedAt = postedAt;
    }

    public Guid OutageId { get; private set; }

    public OutageStatus Status { get; private set; }

    public string Message { get; private set; } = string.Empty;

    public DateTimeOffset PostedAt { get; private set; }
}

public sealed record OutageDeclared(Guid OutageId, string Reference, IReadOnlyList<string> OutwardCodes, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record OutageResolved(Guid OutageId, string Reference, IReadOnlyList<string> OutwardCodes, DateTimeOffset StartedAt, DateTimeOffset OccurredAt) : IDomainEvent;
