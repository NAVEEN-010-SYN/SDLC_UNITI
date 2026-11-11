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
        var aggregates = _db.ChangeTracker.Entries<AggregateRoot>()
            .Select(e => e.Entity)
            .Where(a => a.DomainEvents.Count > 0)
            .ToList();
        var events = aggregates.SelectMany(a => a.DomainEvents).ToList();

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("concurrency.stale", "The resource was changed by someone else; reload and try again.");
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: UniqueViolation } pg)
        {
            throw new ConflictException("persistence.duplicate", $"A record with the same key already exists ({pg.ConstraintName}).");
        }

        aggregates.ForEach(a => a.ClearDomainEvents());
        foreach (var domainEvent in events)
        {
            await PublishAsync(domainEvent, ct);
        }
    }

    private async Task PublishAsync(IDomainEvent domainEvent, CancellationToken ct)
    {
        var (partnerId, type, payload) = domainEvent switch
        {
            OrderStatusChanged e => (e.PartnerId, "order.status_changed", (object)new
            {
                orderId = e.OrderId,
                reference = e.Reference,
                from = e.From.ToString().ToUpperInvariant(),
                to = e.To.ToString().ToUpperInvariant(),
                occurredAt = e.OccurredAt,
            }),
            FaultCreditAssessed e => (e.PartnerId, "fault.credit_assessed", new
            {
                faultId = e.FaultId,
                reference = e.Reference,
                amountMinor = e.Amount.MinorUnits,
                currency = e.Amount.Currency,
                basis = e.Basis,
                occurredAt = e.OccurredAt,
            }),
            _ => (Guid.Empty, string.Empty, new object()),
        };

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
