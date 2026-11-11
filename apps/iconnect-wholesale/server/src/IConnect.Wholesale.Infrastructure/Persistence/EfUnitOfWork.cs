using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Orders;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace IConnect.Wholesale.Infrastructure.Persistence;

/// <summary>
/// Commits the scoped DbContext and, only after a successful commit, publishes the domain events
/// raised by tracked aggregates as partner notifications. Optimistic-concurrency and unique-key
/// violations are translated into <see cref="ConflictException"/> so the API returns 409.
/// </summary>
internal sealed class EfUnitOfWork : IUnitOfWork
{
    private const string UniqueViolation = "23505";

    private readonly WholesaleDbContext _db;
    private readonly IPartnerNotifier _notifier;
    private readonly ILogger<EfUnitOfWork> _logger;

    public EfUnitOfWork(WholesaleDbContext db, IPartnerNotifier notifier, ILogger<EfUnitOfWork> logger)
    {
        _db = db;
        _notifier = notifier;
        _logger = logger;
    }

    public async Task SaveChangesAsync(CancellationToken ct)
    {
        // Snapshot events before saving; they are published only after a successful commit.
        var aggregates = new List<AggregateRoot>();
        var events = new List<IDomainEvent>();
        foreach (var entry in _db.ChangeTracker.Entries<AggregateRoot>())
        {
            var aggregate = entry.Entity;
            if (aggregate.DomainEvents.Count > 0)
            {
                aggregates.Add(aggregate);
                events.AddRange(aggregate.DomainEvents);
            }
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("concurrency.stale", "The resource was changed by someone else; reload and try again.");
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            var pg = (PostgresException)ex.InnerException!;
            throw new ConflictException("persistence.duplicate", $"A record with the same key already exists ({pg.ConstraintName}).");
        }

        foreach (var aggregate in aggregates)
        {
            aggregate.ClearDomainEvents();
        }
        foreach (var domainEvent in events)
        {
            await PublishAsync(domainEvent, ct);
        }
    }

    private static bool IsUniqueViolation(DbUpdateException ex)
    {
        return ex.InnerException is PostgresException pg && pg.SqlState == UniqueViolation;
    }

    private async Task PublishAsync(IDomainEvent domainEvent, CancellationToken ct)
    {
        Guid partnerId;
        string type;
        object payload;

        if (domainEvent is OrderStatusChanged orderChanged)
        {
            partnerId = orderChanged.PartnerId;
            type = "order.status_changed";
            payload = new
            {
                orderId = orderChanged.OrderId,
                reference = orderChanged.Reference,
                from = orderChanged.From.ToString().ToUpperInvariant(),
                to = orderChanged.To.ToString().ToUpperInvariant(),
                occurredAt = orderChanged.OccurredAt,
            };
        }
        else if (domainEvent is FaultCreditAssessed credit)
        {
            partnerId = credit.PartnerId;
            type = "fault.credit_assessed";
            payload = new
            {
                faultId = credit.FaultId,
                reference = credit.Reference,
                amountMinor = credit.Amount.MinorUnits,
                currency = credit.Amount.Currency,
                basis = credit.Basis,
                occurredAt = credit.OccurredAt,
            };
        }
        else
        {
            partnerId = Guid.Empty;
            type = string.Empty;
            payload = new object();
        }

        if (partnerId == Guid.Empty)
        {
            _logger.LogDebug("No partner notification mapped for {EventType}", domainEvent.GetType().Name);
            return;
        }

        try
        {
            await _notifier.NotifyAsync(partnerId, type, payload, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // The state change is committed; a failed webhook must not turn a success into an error.
            _logger.LogError(ex, "Failed to notify partner {PartnerId} of {EventType}", partnerId, type);
        }
    }
}
