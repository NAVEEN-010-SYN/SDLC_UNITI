using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;

namespace Uconnect.Infrastructure.Persistence;

/// <summary>
/// Commits the request's changes, translating concurrency and unique-key violations into
/// <see cref="ConflictException"/>, and then dispatches the domain events the committed aggregates
/// raised. Handlers run after the commit, so a failing notification never undoes a payment.
/// </summary>
internal sealed class UnitOfWork : IUnitOfWork
{
    private const int UniqueIndexViolation = 2601;
    private const int UniqueConstraintViolation = 2627;

    private readonly UconnectDbContext _db;
    private readonly IDomainEventDispatcher _dispatcher;
    private readonly ILogger<UnitOfWork> _logger;

    public UnitOfWork(UconnectDbContext db, IDomainEventDispatcher dispatcher, ILogger<UnitOfWork> logger)
    {
        _db = db;
        _dispatcher = dispatcher;
        _logger = logger;
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var aggregates = _db.ChangeTracker.Entries<AggregateRoot>()
            .Select(e => e.Entity)
            .Where(a => a.DomainEvents.Count > 0)
            .ToList();
        var events = aggregates.SelectMany(a => a.DomainEvents).ToList();

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            _logger.LogWarning(ex, "Concurrent update detected on {Entities}", string.Join(",", ex.Entries.Select(e => e.Metadata.ClrType.Name)));
            throw new ConflictException("concurrency_conflict", "This record was changed by someone else. Please reload and try again.");
        }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: UniqueIndexViolation or UniqueConstraintViolation })
        {
            _logger.LogWarning(ex, "Unique constraint violated while saving");
            throw new ConflictException("duplicate", "This change conflicts with an existing record.");
        }

        foreach (var aggregate in aggregates)
        {
            aggregate.ClearDomainEvents();
        }

        if (events.Count > 0)
        {
            await _dispatcher.DispatchAsync(events, cancellationToken);
        }
    }
}
