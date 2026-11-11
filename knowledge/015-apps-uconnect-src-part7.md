# Uconnect account & service management: apps/uconnect/src (part 7 of 8)

- **Application:** Uconnect account & service management
- **Tech stack:** .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 31

## Files

- `apps/uconnect/src/Uconnect.Infrastructure/Persistence/Repositories/BillingRepositories.cs` (173 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/Persistence/Repositories/SupportRepositories.cs` (111 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/Persistence/UconnectDbContext.cs` (81 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/Persistence/UnitOfWork.cs` (64 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/Persistence/ValueMappings.cs` (79 lines)
- `apps/uconnect/src/Uconnect.Infrastructure/Uconnect.Infrastructure.csproj` (24 lines)
- `apps/uconnect/src/Uconnect.Web/Api/UconnectApiClient.cs` (149 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/AccountPageModel.cs` (125 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Appointments/Appointments.cshtml.cs` (149 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Appointments/Book.cshtml` (67 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Appointments/Index.cshtml` (34 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Error.cshtml` (6 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Index.cshtml` (70 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Index.cshtml.cs` (41 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Invoices/Details.cshtml` (41 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Invoices/Index.cshtml` (49 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Invoices/Invoices.cshtml.cs` (135 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Invoices/Pay.cshtml` (32 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/NoAccount.cshtml` (7 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Outages.cshtml` (27 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Services/ChangePlan.cshtml` (37 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Services/Details.cshtml` (59 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Services/Index.cshtml` (48 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Services/Services.cshtml.cs` (113 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Shared/_Layout.cshtml` (54 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Shared/_Pager.cshtml` (16 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Shared/_StatusBadge.cshtml` (3 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/SwitchAccount.cshtml` (3 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Tickets/Details.cshtml` (46 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Tickets/Index.cshtml` (26 lines)
- `apps/uconnect/src/Uconnect.Web/Pages/Tickets/New.cshtml` (27 lines)

## apps/uconnect/src/Uconnect.Infrastructure/Persistence/Repositories/BillingRepositories.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/Persistence/Repositories/BillingRepositories.cs`.

```csharp
using Microsoft.EntityFrameworkCore;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;
using Uconnect.Domain.Usage;

namespace Uconnect.Infrastructure.Persistence.Repositories;

internal static class QueryablePaging
{
    public static async Task<PagedResult<T>> ToPagedResultAsync<T>(this IQueryable<T> query, PageRequest page, CancellationToken ct)
    {
        var total = await query.CountAsync(ct);
        if (total == 0)
        {
            return PagedResult<T>.Empty(page);
        }

        var items = await query.Skip(page.Skip).Take(page.PageSize).ToListAsync(ct);
        return new PagedResult<T>(items, page.Page, page.PageSize, total);
    }
}

internal sealed class InvoiceRepository : IInvoiceRepository, IInvoiceNumberLookup
{
    private static readonly InvoiceStatus[] PayableStatuses = { InvoiceStatus.Issued, InvoiceStatus.PartiallyPaid, InvoiceStatus.Overdue };

    private readonly UconnectDbContext _db;

    public InvoiceRepository(UconnectDbContext db) => _db = db;

    public Task<Invoice?> GetByIdAsync(Guid id, CancellationToken ct) => _db.Invoices.FirstOrDefaultAsync(i => i.Id == id, ct);

    public Task<Invoice?> GetByNumberAsync(Guid accountId, string invoiceNumber, CancellationToken ct) =>
        _db.Invoices.FirstOrDefaultAsync(i => i.AccountId == accountId && i.InvoiceNumber == invoiceNumber, ct);

    /// <summary>Without a status filter, drafts are excluded: they are the billing run's work in progress.</summary>
    public Task<PagedResult<Invoice>> ListByAccountAsync(Guid accountId, InvoiceStatus? status, PageRequest page, CancellationToken ct)
    {
        var query = _db.Invoices.AsNoTracking().IgnoreAutoIncludes().Where(i => i.AccountId == accountId);
        query = status is { } s ? query.Where(i => i.Status == s) : query.Where(i => i.Status != InvoiceStatus.Draft);
        return query.OrderByDescending(i => i.PeriodStart).ToPagedResultAsync(page, ct);
    }

    public async Task<IReadOnlyList<Invoice>> ListPayableAsync(Guid accountId, CancellationToken ct) =>
        await _db.Invoices
            .Where(i => i.AccountId == accountId && PayableStatuses.Contains(i.Status))
            .OrderBy(i => i.DueOn)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Invoice>> ListPayableDueByAsync(DateOnly dueOnOrBefore, CancellationToken ct) =>
        await _db.Invoices
            .Where(i => PayableStatuses.Contains(i.Status) && i.DueOn <= dueOnOrBefore)
            .OrderBy(i => i.DueOn)
            .ToListAsync(ct);

    public Task<Invoice?> GetLatestIssuedAsync(Guid accountId, CancellationToken ct) =>
        _db.Invoices
            .Where(i => i.AccountId == accountId && i.Status != InvoiceStatus.Draft && i.Status != InvoiceStatus.Void)
            .OrderByDescending(i => i.PeriodStart)
            .FirstOrDefaultAsync(ct);

    public Task<bool> ExistsForPeriodAsync(Guid accountId, DateOnly periodStart, CancellationToken ct) =>
        _db.Invoices.AnyAsync(i => i.AccountId == accountId && i.PeriodStart == periodStart && i.Status != InvoiceStatus.Void, ct);

    public void Add(Invoice invoice) => _db.Invoices.Add(invoice);

    public async Task<IReadOnlyDictionary<Guid, string>> GetNumbersAsync(IReadOnlyCollection<Guid> invoiceIds, CancellationToken ct)
    {
        if (invoiceIds.Count == 0)
        {
            return new Dictionary<Guid, string>();
        }

        return await _db.Invoices.AsNoTracking().IgnoreAutoIncludes()
            .Where(i => invoiceIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.InvoiceNumber, ct);
    }
}

internal sealed class AdjustmentRepository : IAdjustmentRepository
{
    private readonly UconnectDbContext _db;

    public AdjustmentRepository(UconnectDbContext db) => _db = db;

    public async Task<IReadOnlyList<AccountAdjustment>> ListUnbilledAsync(Guid accountId, CancellationToken ct) =>
        await _db.Adjustments.Where(a => a.AccountId == accountId && a.BilledOnInvoiceId == null).ToListAsync(ct);

    public async Task<IReadOnlyList<AccountAdjustment>> ListByAccountAsync(Guid accountId, int take, CancellationToken ct) =>
        await _db.Adjustments.AsNoTracking()
            .Where(a => a.AccountId == accountId)
            .OrderByDescending(a => a.RaisedAt)
            .Take(take)
            .ToListAsync(ct);

    public async Task<bool> ExistsForSourceAsync(Guid accountId, Guid? serviceId, string sourceReference, CancellationToken ct) =>
        _db.Adjustments.Local.Any(a => a.AccountId == accountId && a.ServiceId == serviceId && a.SourceReference == sourceReference)
        || await _db.Adjustments.AnyAsync(a => a.AccountId == accountId && a.ServiceId == serviceId && a.SourceReference == sourceReference, ct);

    public void Add(AccountAdjustment adjustment) => _db.Adjustments.Add(adjustment);
}

internal sealed class PaymentRepository : IPaymentRepository
{
    private readonly UconnectDbContext _db;

    public PaymentRepository(UconnectDbContext db) => _db = db;

    public Task<Payment?> GetByIdAsync(Guid id, CancellationToken ct) => _db.Payments.FirstOrDefaultAsync(p => p.Id == id, ct);

    public Task<Payment?> FindByIdempotencyKeyAsync(Guid accountId, string idempotencyKey, CancellationToken ct) =>
        _db.Payments.FirstOrDefaultAsync(p => p.AccountId == accountId && p.IdempotencyKey == idempotencyKey, ct);

    public Task<PagedResult<Payment>> ListByAccountAsync(Guid accountId, PageRequest page, CancellationToken ct) =>
        _db.Payments.AsNoTracking().Where(p => p.AccountId == accountId).OrderByDescending(p => p.CreatedAt).ToPagedResultAsync(page, ct);

    public async Task<IReadOnlyList<Payment>> ListByInvoiceAsync(Guid invoiceId, CancellationToken ct) =>
        await _db.Payments.AsNoTracking().Where(p => p.InvoiceId == invoiceId).ToListAsync(ct);

    public void Add(Payment payment) => _db.Payments.Add(payment);
}

internal sealed class PaymentMethodRepository : IPaymentMethodRepository
{
    private readonly UconnectDbContext _db;

    public PaymentMethodRepository(UconnectDbContext db) => _db = db;

    public async Task<IReadOnlyList<PaymentMethod>> ListByAccountAsync(Guid accountId, CancellationToken ct) =>
        await _db.PaymentMethods.Where(m => m.AccountId == accountId).ToListAsync(ct);

    public Task<PaymentMethod?> GetByIdAsync(Guid id, CancellationToken ct) => _db.PaymentMethods.FirstOrDefaultAsync(m => m.Id == id, ct);

    public void Add(PaymentMethod method) => _db.PaymentMethods.Add(method);
}

internal sealed class AutopayRepository : IAutopayRepository
{
    private readonly UconnectDbContext _db;

    public AutopayRepository(UconnectDbContext db) => _db = db;

    public Task<AutopaySettings?> GetByAccountAsync(Guid accountId, CancellationToken ct) =>
        _db.AutopaySettings.FirstOrDefaultAsync(a => a.AccountId == accountId, ct);

    public async Task<IReadOnlyList<AutopaySettings>> ListEnabledAsync(CancellationToken ct) =>
        await _db.AutopaySettings.Where(a => a.Enabled).ToListAsync(ct);

    public void Add(AutopaySettings settings) => _db.AutopaySettings.Add(settings);
}

internal sealed class UsageRepository : IUsageRepository
{
    private readonly UconnectDbContext _db;

    public UsageRepository(UconnectDbContext db) => _db = db;

    public async Task<IReadOnlyList<UsageRecord>> ListAsync(Guid serviceId, DateOnly fromInclusive, DateOnly toExclusive, CancellationToken ct) =>
        await _db.UsageRecords.AsNoTracking()
            .Where(u => u.ServiceId == serviceId && u.UsageDate >= fromInclusive && u.UsageDate < toExclusive)
            .OrderBy(u => u.UsageDate)
            .ToListAsync(ct);

    public async Task<UsageRecord?> FindAsync(Guid serviceId, DateOnly date, CancellationToken ct) =>
        _db.UsageRecords.Local.FirstOrDefault(u => u.ServiceId == serviceId && u.UsageDate == date)
        ?? await _db.UsageRecords.FirstOrDefaultAsync(u => u.ServiceId == serviceId && u.UsageDate == date, ct);

    public void Add(UsageRecord record) => _db.UsageRecords.Add(record);
}
```

## apps/uconnect/src/Uconnect.Infrastructure/Persistence/Repositories/SupportRepositories.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/Persistence/Repositories/SupportRepositories.cs`.

```csharp
using Microsoft.EntityFrameworkCore;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Tickets;

namespace Uconnect.Infrastructure.Persistence.Repositories;

internal sealed class OutageRepository : IOutageRepository
{
    private readonly UconnectDbContext _db;

    public OutageRepository(UconnectDbContext db) => _db = db;

    public Task<Outage?> GetByIdAsync(Guid id, CancellationToken ct) => _db.Outages.FirstOrDefaultAsync(o => o.Id == id, ct);

    public Task<Outage?> GetByReferenceAsync(string reference, CancellationToken ct) =>
        _db.Outages.FirstOrDefaultAsync(o => o.Reference == reference, ct);

    public async Task<IReadOnlyList<Outage>> ListCurrentAsync(DateTimeOffset resolvedSince, CancellationToken ct) =>
        await _db.Outages
            .Where(o => o.Status != OutageStatus.Resolved || o.ResolvedAt >= resolvedSince)
            .OrderByDescending(o => o.StartedAt)
            .ToListAsync(ct);

    public Task<PagedResult<Outage>> ListAsync(bool includeResolved, PageRequest page, CancellationToken ct)
    {
        var query = _db.Outages.AsNoTracking();
        if (!includeResolved)
        {
            query = query.Where(o => o.Status != OutageStatus.Resolved);
        }

        return query.OrderByDescending(o => o.StartedAt).ToPagedResultAsync(page, ct);
    }

    public async Task<bool> HasNotificationAsync(Guid outageId, Guid accountId, OutageNotificationKind kind, NotificationChannel channel, CancellationToken ct) =>
        _db.OutageNotifications.Local.Any(n => n.OutageId == outageId && n.AccountId == accountId && n.Kind == kind && n.Channel == channel)
        || await _db.OutageNotifications.AnyAsync(n => n.OutageId == outageId && n.AccountId == accountId && n.Kind == kind && n.Channel == channel, ct);

    public void Add(Outage outage) => _db.Outages.Add(outage);

    public void AddNotification(OutageNotification notification) => _db.OutageNotifications.Add(notification);
}

internal sealed class TicketRepository : ITicketRepository
{
    private static readonly TicketStatus[] OpenStatuses = { TicketStatus.Open, TicketStatus.InProgress, TicketStatus.PendingCustomer };

    private readonly UconnectDbContext _db;

    public TicketRepository(UconnectDbContext db) => _db = db;

    public Task<Ticket?> GetByReferenceAsync(string reference, CancellationToken ct) =>
        _db.Tickets.FirstOrDefaultAsync(t => t.Reference == reference, ct);

    public Task<PagedResult<Ticket>> ListByAccountAsync(Guid accountId, bool openOnly, PageRequest page, CancellationToken ct)
    {
        var query = _db.Tickets.AsNoTracking().IgnoreAutoIncludes().Where(t => t.AccountId == accountId);
        if (openOnly)
        {
            query = query.Where(t => OpenStatuses.Contains(t.Status));
        }

        return query.OrderByDescending(t => t.LastActivityAt).ToPagedResultAsync(page, ct);
    }

    public async Task<IReadOnlyList<Ticket>> ListOpenByServiceAsync(Guid serviceId, CancellationToken ct) =>
        await _db.Tickets.AsNoTracking().IgnoreAutoIncludes()
            .Where(t => t.ServiceId == serviceId && OpenStatuses.Contains(t.Status))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Ticket>> ListAutoCloseCandidatesAsync(DateTimeOffset inactiveSince, CancellationToken ct) =>
        await _db.Tickets
            .Where(t => (t.Status == TicketStatus.Resolved && t.ResolvedAt <= inactiveSince)
                || (t.Status == TicketStatus.PendingCustomer && t.LastActivityAt <= inactiveSince))
            .ToListAsync(ct);

    public void Add(Ticket ticket) => _db.Tickets.Add(ticket);
}

internal sealed class AppointmentRepository : IAppointmentRepository
{
    private readonly UconnectDbContext _db;

    public AppointmentRepository(UconnectDbContext db) => _db = db;

    public Task<Appointment?> GetByReferenceAsync(string reference, CancellationToken ct) =>
        _db.Appointments.FirstOrDefaultAsync(a => a.Reference == reference, ct);

    public async Task<IReadOnlyList<Appointment>> ListByAccountAsync(Guid accountId, bool upcomingOnly, DateOnly today, CancellationToken ct)
    {
        var query = _db.Appointments.AsNoTracking().Where(a => a.AccountId == accountId);
        if (upcomingOnly)
        {
            query = query.Where(a => a.Date >= today && (a.Status == AppointmentStatus.Requested || a.Status == AppointmentStatus.Confirmed));
        }

        return await query.OrderByDescending(a => a.Date).Take(100).ToListAsync(ct);
    }

    public Task<bool> HasActiveForServiceAsync(Guid serviceId, AppointmentType type, CancellationToken ct) =>
        _db.Appointments.AnyAsync(
            a => a.ServiceId == serviceId && a.Type == type && (a.Status == AppointmentStatus.Requested || a.Status == AppointmentStatus.Confirmed),
            ct);

    public void Add(Appointment appointment) => _db.Appointments.Add(appointment);
}
```

## apps/uconnect/src/Uconnect.Infrastructure/Persistence/UconnectDbContext.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/Persistence/UconnectDbContext.cs`.

```csharp
using Microsoft.EntityFrameworkCore;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Payments;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;
using Uconnect.Domain.Tickets;
using Uconnect.Domain.Usage;

namespace Uconnect.Infrastructure.Persistence;

public sealed class UconnectDbContext : DbContext
{
    public const string Schema = "uconnect";

    public UconnectDbContext(DbContextOptions<UconnectDbContext> options) : base(options)
    {
    }

    public DbSet<Account> Accounts => Set<Account>();

    public DbSet<AccountUser> AccountUsers => Set<AccountUser>();

    public DbSet<Plan> Plans => Set<Plan>();

    public DbSet<Service> Services => Set<Service>();

    public DbSet<PlanChange> PlanChanges => Set<PlanChange>();

    public DbSet<Invoice> Invoices => Set<Invoice>();

    public DbSet<AccountAdjustment> Adjustments => Set<AccountAdjustment>();

    public DbSet<Payment> Payments => Set<Payment>();

    public DbSet<PaymentMethod> PaymentMethods => Set<PaymentMethod>();

    public DbSet<AutopaySettings> AutopaySettings => Set<AutopaySettings>();

    public DbSet<UsageRecord> UsageRecords => Set<UsageRecord>();

    public DbSet<Outage> Outages => Set<Outage>();

    public DbSet<OutageNotification> OutageNotifications => Set<OutageNotification>();

    public DbSet<Ticket> Tickets => Set<Ticket>();

    public DbSet<Appointment> Appointments => Set<Appointment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        foreach (var sequence in ReferenceSequences.All)
        {
            modelBuilder.HasSequence<long>(sequence, Schema).StartsAt(1).IncrementsBy(1);
        }

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(UconnectDbContext).Assembly);

        foreach (var entityType in modelBuilder.Model.GetEntityTypes().Where(t => typeof(AggregateRoot).IsAssignableFrom(t.ClrType)))
        {
            var builder = modelBuilder.Entity(entityType.ClrType);
            builder.Ignore(nameof(AggregateRoot.DomainEvents));
            builder.Property(nameof(AggregateRoot.RowVersion)).IsRowVersion();
        }
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<string>().HaveMaxLength(256);
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(32);
        configurationBuilder.Properties<AccountNumber>().HaveConversion<AccountNumberConverter>().HaveMaxLength(12);
        configurationBuilder.Properties<EmailAddress>().HaveConversion<EmailAddressConverter>().HaveMaxLength(254);
        configurationBuilder.Properties<PhoneNumber>().HaveConversion<PhoneNumberConverter>().HaveMaxLength(16);
    }
}
```

## apps/uconnect/src/Uconnect.Infrastructure/Persistence/UnitOfWork.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/Persistence/UnitOfWork.cs`.

```csharp
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
```

## apps/uconnect/src/Uconnect.Infrastructure/Persistence/ValueMappings.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Infrastructure/Persistence/ValueMappings.cs`.

```csharp
using System.Globalization;
using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Uconnect.Domain.Common;

namespace Uconnect.Infrastructure.Persistence;

internal sealed class AccountNumberConverter : ValueConverter<AccountNumber, string>
{
    public AccountNumberConverter() : base(v => v.Value, v => AccountNumber.Parse(v))
    {
    }
}

internal sealed class EmailAddressConverter : ValueConverter<EmailAddress, string>
{
    public EmailAddressConverter() : base(v => v.Value, v => EmailAddress.Create(v))
    {
    }
}

internal sealed class PhoneNumberConverter : ValueConverter<PhoneNumber, string>
{
    public PhoneNumberConverter() : base(v => v.Value, v => PhoneNumber.Create(v))
    {
    }
}

/// <summary>
/// Stores an optional <see cref="Money"/> in a single column as <c>"GBP:1234"</c>. Used only for
/// optional limits (overage rate, autopay ceiling) that are never aggregated in SQL; amounts that
/// are summed or sorted use two-column complex properties instead.
/// </summary>
internal sealed class OptionalMoneyConverter : ValueConverter<Money, string>
{
    public OptionalMoneyConverter()
        : base(v => string.Create(CultureInfo.InvariantCulture, $"{v.Currency}:{v.AmountMinor}"), v => Parse(v))
    {
    }

    private static Money Parse(string value)
    {
        var separator = value.IndexOf(':', StringComparison.Ordinal);
        return Money.FromMinor(long.Parse(value[(separator + 1)..], CultureInfo.InvariantCulture), value[..separator]);
    }
}

internal static class MappingExtensions
{
    /// <summary>Maps a <see cref="Money"/> as two columns: <c>{column}_minor</c> (bigint) and <c>{column}_currency</c> (char(3)).</summary>
    public static EntityTypeBuilder<TEntity> HasMoney<TEntity>(this EntityTypeBuilder<TEntity> builder, Expression<Func<TEntity, Money>> property, string column)
        where TEntity : class
    {
        builder.ComplexProperty(property, money =>
        {
            money.Property(m => m.AmountMinor).HasColumnName($"{column}_minor").IsRequired();
            money.Property(m => m.Currency).HasColumnName($"{column}_currency").HasMaxLength(3).IsFixedLength().IsRequired();
        });
        return builder;
    }

    /// <summary>Maps a <see cref="PostalAddress"/> as columns prefixed with <paramref name="prefix"/>.</summary>
    public static EntityTypeBuilder<TEntity> HasAddress<TEntity>(this EntityTypeBuilder<TEntity> builder, Expression<Func<TEntity, PostalAddress>> property, string prefix)
        where TEntity : class
    {
        builder.ComplexProperty(property, address =>
        {
            address.Property(a => a.Line1).HasColumnName($"{prefix}_line1").HasMaxLength(120).IsRequired();
            address.Property(a => a.Line2).HasColumnName($"{prefix}_line2").HasMaxLength(120);
            address.Property(a => a.Town).HasColumnName($"{prefix}_town").HasMaxLength(80).IsRequired();
            address.Property(a => a.Postcode).HasColumnName($"{prefix}_postcode").HasMaxLength(10).IsRequired();
            address.Property(a => a.CountryCode).HasColumnName($"{prefix}_country").HasMaxLength(2).IsFixedLength().IsRequired();
        });
        return builder;
    }
}
```

## apps/uconnect/src/Uconnect.Infrastructure/Uconnect.Infrastructure.csproj

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: xml. Path: `apps/uconnect/src/Uconnect.Infrastructure/Uconnect.Infrastructure.csproj`.

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <RootNamespace>Uconnect.Infrastructure</RootNamespace>
    <Description>Uconnect adapters: EF Core persistence (SQL Server), repositories and typed HTTP clients for provisioning, payments, billing, field service and notifications.</Description>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\Uconnect.Application\Uconnect.Application.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="8.0.8" />
    <PackageReference Include="Microsoft.Extensions.Http.Resilience" Version="8.8.0" />
    <PackageReference Include="Microsoft.Extensions.Options.ConfigurationExtensions" Version="8.0.0" />
    <PackageReference Include="Microsoft.Extensions.Options.DataAnnotations" Version="8.0.0" />
  </ItemGroup>

  <ItemGroup>
    <InternalsVisibleTo Include="Uconnect.Tests" />
  </ItemGroup>

</Project>
```

## apps/uconnect/src/Uconnect.Web/Api/UconnectApiClient.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Web/Api/UconnectApiClient.cs`.

```csharp
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;

namespace Uconnect.Web.Api;

/// <summary>An RFC 7807 problem returned by the API, surfaced to pages as validation messages.</summary>
public sealed class ApiProblemException : Exception
{
    public ApiProblemException(HttpStatusCode status, string? code, string message, IReadOnlyDictionary<string, string[]> errors)
        : base(message)
    {
        Status = status;
        Code = code;
        Errors = errors;
    }

    public HttpStatusCode Status { get; }

    public string? Code { get; }

    public IReadOnlyDictionary<string, string[]> Errors { get; }
}

/// <summary>Forwards the signed-in user's access token and the request's correlation id to the API.</summary>
internal sealed class ApiAuthenticationHandler : DelegatingHandler
{
    private readonly IHttpContextAccessor _accessor;

    public ApiAuthenticationHandler(IHttpContextAccessor accessor) => _accessor = accessor;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (_accessor.HttpContext is { } context)
        {
            var token = await context.GetTokenAsync("access_token");
            if (!string.IsNullOrEmpty(token))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }

            request.Headers.TryAddWithoutValidation("X-Correlation-Id", context.TraceIdentifier);
        }

        return await base.SendAsync(request, cancellationToken);
    }
}

/// <summary>Typed client for Uconnect.Api. All paths are relative to <c>/api/v1/</c>.</summary>
public sealed class UconnectApiClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly HttpClient _http;

    public UconnectApiClient(HttpClient http) => _http = http;

    public static string Account(string accountNumber, string path = "") =>
        $"accounts/{Uri.EscapeDataString(accountNumber)}/{path}".TrimEnd('/');

    public async Task<T> GetAsync<T>(string path, CancellationToken ct)
    {
        using var response = await _http.GetAsync(path, ct);
        return await ReadAsync<T>(response, ct);
    }

    public async Task<T> SendAsync<T>(HttpMethod method, string path, object? body, CancellationToken ct, string? idempotencyKey = null)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null)
        {
            request.Content = JsonContent.Create(body, body.GetType(), options: Json);
        }

        if (idempotencyKey is not null)
        {
            request.Headers.Add("Idempotency-Key", idempotencyKey);
        }

        using var response = await _http.SendAsync(request, ct);
        return await ReadAsync<T>(response, ct);
    }

    public async Task SendAsync(HttpMethod method, string path, object? body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null)
        {
            request.Content = JsonContent.Create(body, body.GetType(), options: Json);
        }

        using var response = await _http.SendAsync(request, ct);
        await EnsureSuccessAsync(response, ct);
    }

    public async Task<(byte[] Content, string ContentType, string FileName)> DownloadAsync(string path, CancellationToken ct)
    {
        using var response = await _http.GetAsync(path, ct);
        await EnsureSuccessAsync(response, ct);
        var content = await response.Content.ReadAsByteArrayAsync(ct);
        var fileName = response.Content.Headers.ContentDisposition?.FileNameStar ?? response.Content.Headers.ContentDisposition?.FileName ?? "document";
        return (content, response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream", fileName.Trim('"'));
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, CancellationToken ct)
    {
        await EnsureSuccessAsync(response, ct);
        return await response.Content.ReadFromJsonAsync<T>(Json, ct)
            ?? throw new ApiProblemException(response.StatusCode, null, "The service returned an empty response.", new Dictionary<string, string[]>());
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        ProblemBody? problem = null;
        if (response.Content.Headers.ContentType?.MediaType is "application/problem+json" or "application/json")
        {
            try
            {
                problem = await response.Content.ReadFromJsonAsync<ProblemBody>(Json, ct);
            }
            catch (JsonException)
            {
                problem = null;
            }
        }

        var message = problem?.Detail ?? problem?.Title ?? response.StatusCode switch
        {
            HttpStatusCode.Unauthorized => "Your session has expired. Please sign in again.",
            HttpStatusCode.ServiceUnavailable => "This service is temporarily unavailable. Please try again shortly.",
            _ => "Something went wrong. Please try again.",
        };
        throw new ApiProblemException(response.StatusCode, problem?.Code, message, problem?.Errors ?? new Dictionary<string, string[]>());
    }

    private sealed record ProblemBody(string? Title, string? Detail, string? Code, Dictionary<string, string[]>? Errors);
}
```

## apps/uconnect/src/Uconnect.Web/Pages/AccountPageModel.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Web/Pages/AccountPageModel.cs`.

```csharp
using System.Globalization;
using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Uconnect.Application.Accounts;
using Uconnect.Application.Common;
using Uconnect.Web.Api;

namespace Uconnect.Web.Pages;

/// <summary>
/// Base for every portal page that works on "the current account". Resolves the account from the
/// switcher cookie (falling back to the user's first account), exposes it to the layout, and turns API
/// problems into page-level validation messages instead of error pages.
/// </summary>
public abstract class AccountPageModel : PageModel
{
    public const string AccountCookie = "uconnect.account";

    protected AccountPageModel(UconnectApiClient api) => Api = api;

    protected UconnectApiClient Api { get; }

    public string AccountNumber { get; private set; } = string.Empty;

    public IReadOnlyList<AccountSummaryDto> Accounts { get; private set; } = Array.Empty<AccountSummaryDto>();

    public AccountSummaryDto? CurrentAccount => Accounts.FirstOrDefault(a => a.AccountNumber == AccountNumber);

    /// <summary>True when the signed-in role may pay, change plans and manage payment methods.</summary>
    public bool CanManage => CurrentAccount?.Role is "CONSUMER" or "BUSINESS_ADMIN";

    protected string AccountPath(string path = "") => UconnectApiClient.Account(AccountNumber, path);

    public override async Task OnPageHandlerExecutionAsync(PageHandlerExecutingContext context, PageHandlerExecutionDelegate next)
    {
        Accounts = await Api.GetAsync<IReadOnlyList<AccountSummaryDto>>("me/accounts", HttpContext.RequestAborted);
        if (Accounts.Count == 0)
        {
            context.Result = RedirectToPage("/NoAccount");
            return;
        }

        var selected = Request.Cookies[AccountCookie];
        AccountNumber = Accounts.Any(a => a.AccountNumber == selected) ? selected! : Accounts[0].AccountNumber;
        ViewData["Accounts"] = Accounts;
        ViewData["AccountNumber"] = AccountNumber;

        var executed = await next();
        if (executed.Exception is ApiProblemException problem && !executed.ExceptionHandled)
        {
            executed.ExceptionHandled = true;
            if (problem.Status == HttpStatusCode.NotFound)
            {
                executed.Result = NotFound();
                return;
            }

            AddProblem(problem);
            executed.Result = Page();
        }
    }

    /// <summary>Copies API field errors (camelCase paths) onto the page's model state.</summary>
    protected void AddProblem(ApiProblemException problem, string prefix = "Input")
    {
        if (problem.Errors.Count == 0)
        {
            ModelState.AddModelError(string.Empty, problem.Message);
            return;
        }

        foreach (var (field, messages) in problem.Errors)
        {
            var property = field.Length == 0 ? string.Empty : $"{char.ToUpperInvariant(field[0])}{field[1..]}";
            var key = prefix.Length == 0 || property.Length == 0 ? property : $"{prefix}.{property}";
            foreach (var message in messages)
            {
                ModelState.AddModelError(key, message);
            }
        }
    }

    protected static PageRequest PageOf(int? page) => PageRequest.Normalise(page, 10);
}

/// <summary>Formatting helpers shared by the views.</summary>
public static class Display
{
    private static readonly CultureInfo UkCulture = CultureInfo.GetCultureInfo("en-GB");

    public static string Money(MoneyDto? money)
    {
        if (money is null)
        {
            return "-";
        }

        var symbol = money.Currency switch { "GBP" => "£", "EUR" => "€", "USD" => "$", _ => money.Currency + " " };
        var major = Math.Abs(money.AmountMinor) / 100m;
        return (money.AmountMinor < 0 ? "-" : string.Empty) + symbol + major.ToString("#,##0.00", UkCulture);
    }

    public static string Date(DateOnly? date) => date?.ToString("d MMM yyyy", UkCulture) ?? "-";

    public static string When(DateTimeOffset? instant) =>
        instant is null ? "-" : instant.Value.ToUniversalTime().ToString("d MMM yyyy HH:mm 'UTC'", UkCulture);

    public static string Bytes(long bytes) => bytes switch
    {
        >= 1_000_000_000_000 => $"{bytes / 1_000_000_000_000d:0.00} TB",
        >= 1_000_000_000 => $"{bytes / 1_000_000_000d:0.0} GB",
        _ => $"{bytes / 1_000_000d:0} MB",
    };

    /// <summary>CSS modifier for a status badge: green for done, amber for in-flight, red for problems.</summary>
    public static string Tone(string status) => status switch
    {
        "Paid" or "Active" or "Completed" or "Resolved" or "Succeeded" or "Confirmed" or "Closed" => "ok",
        "Overdue" or "Failed" or "Suspended" or "Critical" or "Major" or "Missed" or "Cancelled" => "bad",
        _ => "info",
    };
}
```

## apps/uconnect/src/Uconnect.Web/Pages/Appointments/Appointments.cshtml.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Web/Pages/Appointments/Appointments.cshtml.cs`.

```csharp
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Application.Appointments;
using Uconnect.Application.Outages;
using Uconnect.Application.Services;
using Uconnect.Web.Api;

namespace Uconnect.Web.Pages.Appointments;

public sealed class IndexModel : AccountPageModel
{
    public IndexModel(UconnectApiClient api) : base(api)
    {
    }

    public IReadOnlyList<AppointmentDto> Appointments { get; private set; } = Array.Empty<AppointmentDto>();

    public async Task OnGetAsync(CancellationToken ct) =>
        Appointments = await Api.GetAsync<IReadOnlyList<AppointmentDto>>(AccountPath("appointments?upcomingOnly=false"), ct);

    public async Task<IActionResult> OnPostCancelAsync(string reference, [Required, StringLength(500)] string reason, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            await OnGetAsync(ct);
            return Page();
        }

        var appointment = await Api.SendAsync<AppointmentDto>(
            HttpMethod.Post, AccountPath($"appointments/{Uri.EscapeDataString(reference)}/cancel"), new CancelAppointmentRequest(reason), ct);
        TempData["Notice"] = appointment.LateCancellation
            ? $"Visit {reference} cancelled. As this was within 24 hours of the visit, a call-out fee may apply."
            : $"Visit {reference} cancelled.";
        return RedirectToPage();
    }
}

/// <summary>
/// Booking flow: pick the visit type and service, see the windows with engineer capacity, then book.
/// Also used to reschedule an existing visit when <see cref="Reference"/> is supplied.
/// </summary>
public sealed class BookModel : AccountPageModel
{
    public BookModel(UconnectApiClient api) : base(api)
    {
    }

    [BindProperty(SupportsGet = true)]
    public string Type { get; set; } = "Repair";

    [BindProperty(SupportsGet = true)]
    public Guid? ServiceId { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? TicketReference { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? Reference { get; set; }

    [BindProperty]
    [Required(ErrorMessage = "Choose a visit window.")]
    public string? Slot { get; set; }

    [BindProperty]
    [Required]
    [StringLength(120)]
    public string ContactName { get; set; } = string.Empty;

    [BindProperty]
    [Required]
    [Phone]
    public string ContactPhone { get; set; } = string.Empty;

    [BindProperty]
    [StringLength(500)]
    public string? AccessNotes { get; set; }

    public IReadOnlyList<ServiceSummaryDto> Services { get; private set; } = Array.Empty<ServiceSummaryDto>();

    public IReadOnlyList<AvailableSlotDto> Slots { get; private set; } = Array.Empty<AvailableSlotDto>();

    public async Task OnGetAsync(CancellationToken ct)
    {
        ContactName = User.Identity?.Name ?? string.Empty;
        await LoadAsync(ct);
    }

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
    {
        if (!ModelState.IsValid || !TryParseSlot(Slot, out var date, out var window))
        {
            ModelState.AddModelError(nameof(Slot), "Choose a visit window.");
            await LoadAsync(ct);
            return Page();
        }

        if (Reference is not null)
        {
            await Api.SendAsync<AppointmentDto>(
                HttpMethod.Put, AccountPath($"appointments/{Uri.EscapeDataString(Reference)}/slot"), new RescheduleAppointmentRequest(date, window), ct);
            TempData["Notice"] = $"Visit {Reference} moved to {Display.Date(date)} ({window.ToLowerInvariant()}).";
        }
        else
        {
            var booked = await Api.SendAsync<AppointmentDto>(
                HttpMethod.Post,
                AccountPath("appointments"),
                new BookAppointmentRequest(Type, ServiceId, TicketReference, date, window, ContactName, ContactPhone, AccessNotes),
                ct);
            TempData["Notice"] = $"Visit {booked.Reference} booked for {Display.Date(booked.Date)} ({booked.Window.ToLowerInvariant()}).";
        }

        return RedirectToPage("Index");
    }

    internal static bool TryParseSlot(string? value, out DateOnly date, out string window)
    {
        date = default;
        window = string.Empty;
        var parts = value?.Split('|');
        if (parts is not { Length: 2 } || !DateOnly.TryParseExact(parts[0], "yyyy-MM-dd", out date))
        {
            return false;
        }

        window = parts[1];
        return window.Length > 0;
    }

    private async Task LoadAsync(CancellationToken ct)
    {
        Services = await Api.GetAsync<IReadOnlyList<ServiceSummaryDto>>(AccountPath("services"), ct);
        var query = $"appointment-slots?type={Uri.EscapeDataString(Type)}" + (ServiceId is { } id ? $"&serviceId={id}" : string.Empty);
        Slots = await Api.GetAsync<IReadOnlyList<AvailableSlotDto>>(AccountPath(query), ct);
    }
}

public sealed class OutagesModel : AccountPageModel
{
    public OutagesModel(UconnectApiClient api) : base(api)
    {
    }

    public IReadOnlyList<AccountOutageDto> Outages { get; private set; } = Array.Empty<AccountOutageDto>();

    public async Task OnGetAsync(CancellationToken ct) =>
        Outages = await Api.GetAsync<IReadOnlyList<AccountOutageDto>>(AccountPath("outages"), ct);
}
```

## apps/uconnect/src/Uconnect.Web/Pages/Appointments/Book.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Appointments/Book.cshtml`.

```cshtml
@page
@model Uconnect.Web.Pages.Appointments.BookModel
@{
    ViewData["Title"] = Model.Reference is null ? "Book an engineer visit" : $"Reschedule {Model.Reference}";
    var types = new[] { "Repair", "Installation", "Upgrade", "Survey" };
}
@if (Model.Reference is null)
{
    <form method="get" class="form inline">
        <select asp-for="Type">
            @foreach (var t in types)
            {
                <option value="@t" selected="@(t == Model.Type)">@t</option>
            }
        </select>
        <select asp-for="ServiceId">
            <option value="">No specific service</option>
            @foreach (var s in Model.Services)
            {
                <option value="@s.Id" selected="@(s.Id == Model.ServiceId)">@s.ServiceReference, @s.ServiceAddress.Postcode</option>
            }
        </select>
        @if (Model.Type == "Repair")
        {
            <input asp-for="TicketReference" placeholder="Fault ticket, e.g. TKT-000123" />
        }
        <button type="submit">Find times</button>
    </form>
}
<form method="post" class="form">
    <input type="hidden" asp-for="Type" />
    <input type="hidden" asp-for="ServiceId" />
    <input type="hidden" asp-for="TicketReference" />
    <input type="hidden" asp-for="Reference" />
    <fieldset class="slots">
        <legend>Available windows</legend>
        @if (Model.Slots.Count == 0)
        {
            <p>No windows are available in the next 30 days. Please contact us.</p>
        }
        @foreach (var slot in Model.Slots)
        {
            var value = $"{slot.Date:yyyy-MM-dd}|{slot.Window}";
            <label><input type="radio" name="Slot" value="@value" checked="@(value == Model.Slot)" /> @Display.Date(slot.Date) @slot.Window.ToLowerInvariant()</label>
        }
        <span asp-validation-for="Slot" class="bad"></span>
    </fieldset>
    @if (Model.Reference is null)
    {
        <label asp-for="ContactName">Contact name</label>
        <input asp-for="ContactName" />
        <span asp-validation-for="ContactName" class="bad"></span>
        <label asp-for="ContactPhone">Contact phone</label>
        <input asp-for="ContactPhone" type="tel" />
        <span asp-validation-for="ContactPhone" class="bad"></span>
        <label asp-for="AccessNotes">Access notes (parking, gate codes, pets)</label>
        <textarea asp-for="AccessNotes" maxlength="500"></textarea>
    }
    else
    {
        @* Contact details are unchanged when moving a visit; these satisfy the form's validation only. *@
        <input type="hidden" name="ContactName" value="unchanged" />
        <input type="hidden" name="ContactPhone" value="07000000000" />
    }
    <button type="submit" class="button">@(Model.Reference is null ? "Book visit" : "Move visit")</button>
</form>
```

## apps/uconnect/src/Uconnect.Web/Pages/Appointments/Index.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Appointments/Index.cshtml`.

```cshtml
@page
@model Uconnect.Web.Pages.Appointments.IndexModel
@{
    ViewData["Title"] = "Engineer visits";
}
<p><a class="button" asp-page="Book" asp-route-type="Survey">Book a visit</a></p>
@if (Model.Appointments.Count == 0)
{
    <p>You have no engineer visits.</p>
}
@foreach (var a in Model.Appointments)
{
    <article class="card">
        <h2>@a.Type visit @a.Reference <partial name="_StatusBadge" model="a.Status" /></h2>
        <p>@Display.Date(a.Date), @a.Window.ToLowerInvariant() (@Display.When(a.WindowStartsAt) to @Display.When(a.WindowEndsAt))</p>
        <p>@a.VisitAddress.Line1, @a.VisitAddress.Postcode · contact @a.ContactName @(a.EngineerName is null ? null : $"· engineer {a.EngineerName}")</p>
        @if (a.CanChange)
        {
            <a asp-page="Book" asp-route-reference="@a.Reference" asp-route-type="@a.Type" asp-route-serviceId="@a.ServiceId">Reschedule</a>
        }
        @if (a.Status is "Requested" or "Confirmed")
        {
            <form method="post" asp-page-handler="Cancel" asp-route-reference="@a.Reference" class="inline">
                <input name="reason" required maxlength="500" placeholder="Reason for cancelling" />
                <button type="submit" class="link">Cancel visit</button>
            </form>
            @if (!a.CanChange)
            {
                <p class="hint">This visit is less than 24 hours away; cancelling now may incur a call-out fee.</p>
            }
        }
    </article>
}
```

## apps/uconnect/src/Uconnect.Web/Pages/Error.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Error.cshtml`.

```cshtml
@page
@{
    ViewData["Title"] = "Something went wrong";
}
<p>We couldn't complete your request. Please try again. If the problem continues, contact support quoting reference <code>@HttpContext.TraceIdentifier</code>.</p>
```

## apps/uconnect/src/Uconnect.Web/Pages/Index.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Index.cshtml`.

```cshtml
@page
@model IndexModel
@{
    ViewData["Title"] = "Dashboard";
    var d = Model.Dashboard!;
}
@if (d.AccountStatus != "Active")
{
    <div class="alert alert--bad">Your account is @d.AccountStatus.ToLowerInvariant(). <a asp-page="/Invoices/Index">Review your bills</a> or contact us.</div>
}
@foreach (var o in d.Outages.Where(o => o.Outage.Status != "Resolved"))
{
    <div class="alert alert--bad">
        <strong>@o.Outage.Title</strong> is affecting @string.Join(", ", o.AffectedServiceReferences).
        @(o.Outage.EstimatedResolutionAt is { } eta ? $"Expected fix: {Display.When(eta)}." : "We are investigating.")
        <a asp-page="/Outages">Details</a>
    </div>
}
<section class="tiles">
    <article class="tile">
        <h2>Balance</h2>
        <p class="figure">@Display.Money(d.Balance.Outstanding)</p>
        @if (d.Balance.Overdue.AmountMinor > 0)
        {
            <p class="bad">@Display.Money(d.Balance.Overdue) overdue</p>
        }
        else if (d.Balance.NextDueOn is { } due)
        {
            <p>Next payment due @Display.Date(due)</p>
        }
        <p>Autopay is @(d.AutopayEnabled ? "on" : "off")</p>
        @if (d.Balance.NextDueInvoiceNumber is { } next && Model.CanManage)
        {
            <a class="button" asp-page="/Invoices/Pay" asp-route-invoiceNumber="@next">Pay now</a>
        }
    </article>
    <article class="tile">
        <h2>Latest bill</h2>
        @if (d.LatestInvoice is { } inv)
        {
            <p class="figure">@Display.Money(inv.Total)</p>
            <p>@Display.Date(inv.PeriodStart) – @Display.Date(inv.PeriodEnd) <partial name="_StatusBadge" model="inv.Status" /></p>
            <a asp-page="/Invoices/Details" asp-route-invoiceNumber="@inv.InvoiceNumber">View bill</a>
        }
        else
        {
            <p>No bills yet.</p>
        }
    </article>
    <article class="tile">
        <h2>Services</h2>
        <p class="figure">@d.LiveServices</p>
        @if (d.ServicesWithPendingPlanChange > 0)
        {
            <p>@d.ServicesWithPendingPlanChange plan change(s) in progress</p>
        }
        <a asp-page="/Services/Index">Manage services</a>
    </article>
    <article class="tile">
        <h2>Support</h2>
        <p class="figure">@d.OpenTickets</p>
        <p>open ticket(s)</p>
        @if (d.NextAppointment is { } apt)
        {
            <p>Engineer visit @Display.Date(apt.Date), @apt.Window.ToLowerInvariant()</p>
        }
        <a asp-page="/Tickets/New">Report a problem</a>
    </article>
</section>
```

## apps/uconnect/src/Uconnect.Web/Pages/Index.cshtml.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Web/Pages/Index.cshtml.cs`.

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Uconnect.Application.Dashboard;
using Uconnect.Web.Api;

namespace Uconnect.Web.Pages;

public sealed class IndexModel : AccountPageModel
{
    public IndexModel(UconnectApiClient api) : base(api)
    {
    }

    public DashboardDto? Dashboard { get; private set; }

    public async Task OnGetAsync(CancellationToken ct) =>
        Dashboard = await Api.GetAsync<DashboardDto>(AccountPath("dashboard"), ct);
}

/// <summary>Remembers the account chosen in the header switcher.</summary>
public sealed class SwitchAccountModel : AccountPageModel
{
    public SwitchAccountModel(UconnectApiClient api) : base(api)
    {
    }

    public IActionResult OnPost(string accountNumber)
    {
        if (Accounts.Any(a => a.AccountNumber == accountNumber))
        {
            Response.Cookies.Append(AccountCookie, accountNumber, new CookieOptions { HttpOnly = true, Secure = true, SameSite = SameSiteMode.Lax, IsEssential = true });
        }

        return RedirectToPage("/Index");
    }
}

public sealed class NoAccountModel : PageModel
{
}
```

## apps/uconnect/src/Uconnect.Web/Pages/Invoices/Details.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Invoices/Details.cshtml`.

```cshtml
@page "{invoiceNumber}"
@model Uconnect.Web.Pages.Invoices.DetailsModel
@{
    var inv = Model.Invoice!;
    ViewData["Title"] = $"Bill {inv.Summary.InvoiceNumber}";
}
<p>
    <partial name="_StatusBadge" model="inv.Summary.Status" />
    Issued @Display.Date(inv.Summary.IssuedOn), due @Display.Date(inv.Summary.DueOn).
    <a asp-page-handler="Pdf" asp-route-invoiceNumber="@inv.Summary.InvoiceNumber">Download PDF</a>
    @if (inv.Summary.BalanceDue.AmountMinor > 0 && Model.CanManage)
    {
        <a class="button" asp-page="Pay" asp-route-invoiceNumber="@inv.Summary.InvoiceNumber">Pay @Display.Money(inv.Summary.BalanceDue)</a>
    }
</p>
<table class="grid">
    <thead><tr><th>Description</th><th>Service</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
    <tbody>
    @foreach (var l in inv.Lines)
    {
        <tr>
            <td>@l.Description@(l.Taxable ? null : " *")</td>
            <td>@l.ServiceReference</td>
            <td class="num">@l.Quantity</td>
            <td class="num">@Display.Money(l.Amount)</td>
        </tr>
    }
    </tbody>
    <tfoot>
        <tr><td colspan="3">Subtotal</td><td class="num">@Display.Money(inv.Subtotal)</td></tr>
        <tr><td colspan="3">VAT at @(inv.TaxRateBasisPoints / 100m)%</td><td class="num">@Display.Money(inv.TaxTotal)</td></tr>
        <tr><th colspan="3">Total</th><th class="num">@Display.Money(inv.Summary.Total)</th></tr>
        <tr><td colspan="3">Paid</td><td class="num">@Display.Money(inv.AmountPaid)</td></tr>
        @if (inv.CreditCarriedForward.AmountMinor > 0)
        {
            <tr><td colspan="3">Credit carried to your next bill</td><td class="num">@Display.Money(inv.CreditCarriedForward)</td></tr>
        }
    </tfoot>
</table>
<p class="hint">* not subject to VAT</p>
```

## apps/uconnect/src/Uconnect.Web/Pages/Invoices/Index.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Invoices/Index.cshtml`.

```cshtml
@page
@model Uconnect.Web.Pages.Invoices.IndexModel
@{
    ViewData["Title"] = "Bills & payments";
    var b = Model.Balance!;
}
<section class="tiles">
    <article class="tile"><h2>To pay</h2><p class="figure">@Display.Money(b.Outstanding)</p>
        @if (b.Overdue.AmountMinor > 0) { <p class="bad">@Display.Money(b.Overdue) is overdue</p> }
        @if (b.NextDueOn is { } due) { <p>Next due @Display.Date(due)</p> }
    </article>
</section>

<table class="grid">
    <thead><tr><th>Bill</th><th>Period</th><th>Due</th><th>Total</th><th>Left to pay</th><th>Status</th><th></th></tr></thead>
    <tbody>
    @foreach (var i in Model.Invoices!.Items)
    {
        <tr>
            <td><a asp-page="Details" asp-route-invoiceNumber="@i.InvoiceNumber">@i.InvoiceNumber</a></td>
            <td>@Display.Date(i.PeriodStart) – @Display.Date(i.PeriodEnd.AddDays(-1))</td>
            <td>@Display.Date(i.DueOn)@(i.DaysOverdue > 0 ? $" ({i.DaysOverdue} days late)" : null)</td>
            <td>@Display.Money(i.Total)</td>
            <td>@Display.Money(i.BalanceDue)</td>
            <td><partial name="_StatusBadge" model="i.Status" /></td>
            <td>@if (i.BalanceDue.AmountMinor > 0 && Model.CanManage) { <a asp-page="Pay" asp-route-invoiceNumber="@i.InvoiceNumber">Pay</a> }</td>
        </tr>
    }
    </tbody>
</table>
<partial name="_Pager" model="(Model.Invoices.Page, Model.Invoices.TotalPages)" />

<h2>Recent payments</h2>
<table class="grid">
    <thead><tr><th>Date</th><th>Bill</th><th>Amount</th><th>How</th><th>Status</th></tr></thead>
    <tbody>
    @foreach (var p in Model.Payments!.Items)
    {
        <tr>
            <td>@Display.When(p.CompletedAt ?? p.CreatedAt)</td>
            <td>@p.InvoiceNumber</td>
            <td>@Display.Money(p.Amount)@(p.RefundedAmount.AmountMinor > 0 ? $" (refunded {Display.Money(p.RefundedAmount)})" : null)</td>
            <td>@p.Channel</td>
            <td><partial name="_StatusBadge" model="p.Status" /> @p.FailureMessage</td>
        </tr>
    }
    </tbody>
</table>
```

## apps/uconnect/src/Uconnect.Web/Pages/Invoices/Invoices.cshtml.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Web/Pages/Invoices/Invoices.cshtml.cs`.

```csharp
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Web.Api;

namespace Uconnect.Web.Pages.Invoices;

public sealed class IndexModel : AccountPageModel
{
    public IndexModel(UconnectApiClient api) : base(api)
    {
    }

    public AccountBalanceDto? Balance { get; private set; }

    public PagedResult<InvoiceSummaryDto>? Invoices { get; private set; }

    public PagedResult<PaymentDto>? Payments { get; private set; }

    public async Task OnGetAsync(int? page, CancellationToken ct)
    {
        var paging = PageOf(page);
        Balance = await Api.GetAsync<AccountBalanceDto>(AccountPath("balance"), ct);
        Invoices = await Api.GetAsync<PagedResult<InvoiceSummaryDto>>(AccountPath($"invoices?page={paging.Page}&pageSize={paging.PageSize}"), ct);
        Payments = await Api.GetAsync<PagedResult<PaymentDto>>(AccountPath("payments?page=1&pageSize=5"), ct);
    }
}

public sealed class DetailsModel : AccountPageModel
{
    public DetailsModel(UconnectApiClient api) : base(api)
    {
    }

    public InvoiceDetailDto? Invoice { get; private set; }

    public async Task OnGetAsync(string invoiceNumber, CancellationToken ct) =>
        Invoice = await Api.GetAsync<InvoiceDetailDto>(AccountPath($"invoices/{Uri.EscapeDataString(invoiceNumber)}"), ct);

    public async Task<IActionResult> OnGetPdfAsync(string invoiceNumber, CancellationToken ct)
    {
        var (content, contentType, fileName) = await Api.DownloadAsync(AccountPath($"invoices/{Uri.EscapeDataString(invoiceNumber)}/pdf"), ct);
        return File(content, contentType, fileName);
    }
}

/// <summary>
/// Pays an invoice with a saved method. The idempotency key is minted when the form is rendered and
/// posted back, so a double-click or a retried submit can never charge twice.
/// </summary>
public sealed class PayModel : AccountPageModel
{
    public PayModel(UconnectApiClient api) : base(api)
    {
    }

    [BindProperty(SupportsGet = true)]
    public string InvoiceNumber { get; set; } = string.Empty;

    [BindProperty]
    public PayInput Input { get; set; } = new();

    public InvoiceDetailDto? Invoice { get; private set; }

    public IReadOnlyList<PaymentMethodDto> Methods { get; private set; } = Array.Empty<PaymentMethodDto>();

    public async Task OnGetAsync(CancellationToken ct)
    {
        await LoadAsync(ct);
        Input = new PayInput
        {
            PaymentMethodId = Methods.FirstOrDefault(m => m.IsDefault && !m.IsExpired)?.Id ?? Guid.Empty,
            Amount = Invoice!.Summary.BalanceDue.AmountMinor / 100m,
            IdempotencyKey = Guid.NewGuid().ToString("N"),
        };
    }

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
    {
        await LoadAsync(ct);
        var amountMinor = decimal.Round(Input.Amount * 100m);
        if (amountMinor != Input.Amount * 100m)
        {
            ModelState.AddModelError("Input.Amount", "Enter an amount in pounds and pence.");
        }

        if (!ModelState.IsValid)
        {
            return Page();
        }

        try
        {
            await Api.SendAsync<PaymentDto>(
                HttpMethod.Post,
                AccountPath($"invoices/{Uri.EscapeDataString(InvoiceNumber)}/payments"),
                new PayInvoiceRequest(Input.PaymentMethodId, new MoneyDto((long)amountMinor, Invoice!.Summary.Total.Currency)),
                ct,
                Input.IdempotencyKey);
        }
        catch (ApiProblemException problem) when (problem.Code == "payment.declined")
        {
            // A declined attempt is final for this key; a fresh key lets the customer try another card.
            ModelState.AddModelError(string.Empty, problem.Message);
            Input.IdempotencyKey = Guid.NewGuid().ToString("N");
            ModelState.Remove("Input.IdempotencyKey");
            return Page();
        }

        TempData["Notice"] = $"Thank you — your payment for {InvoiceNumber} has been received.";
        return RedirectToPage("Details", new { invoiceNumber = InvoiceNumber });
    }

    private async Task LoadAsync(CancellationToken ct)
    {
        Invoice = await Api.GetAsync<InvoiceDetailDto>(AccountPath($"invoices/{Uri.EscapeDataString(InvoiceNumber)}"), ct);
        Methods = (await Api.GetAsync<IReadOnlyList<PaymentMethodDto>>(AccountPath("payment-methods"), ct)).Where(m => !m.IsExpired).ToList();
    }

    public sealed class PayInput
    {
        [Required(ErrorMessage = "Choose how to pay.")]
        public Guid PaymentMethodId { get; set; }

        [Range(0.01, 100_000, ErrorMessage = "Enter an amount greater than zero.")]
        public decimal Amount { get; set; }

        [Required]
        [StringLength(80)]
        public string IdempotencyKey { get; set; } = string.Empty;
    }
}
```

## apps/uconnect/src/Uconnect.Web/Pages/Invoices/Pay.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Invoices/Pay.cshtml`.

```cshtml
@page "{invoiceNumber}"
@model Uconnect.Web.Pages.Invoices.PayModel
@{
    ViewData["Title"] = $"Pay {Model.InvoiceNumber}";
}
@if (Model.Methods.Count == 0)
{
    <p>You don't have a saved payment method. Please add a card or Direct Debit first.</p>
}
else
{
    <p>Balance due: <strong>@Display.Money(Model.Invoice!.Summary.BalanceDue)</strong></p>
    <form method="post" class="form">
        <input type="hidden" asp-for="Input.IdempotencyKey" />
        <fieldset>
            <legend>Pay with</legend>
            @foreach (var m in Model.Methods)
            {
                <label>
                    <input type="radio" asp-for="Input.PaymentMethodId" value="@m.Id" />
                    @m.Masked @(m.ExpiresSoon ? "(expires soon)" : null)
                </label>
            }
            <span asp-validation-for="Input.PaymentMethodId" class="bad"></span>
        </fieldset>
        <label asp-for="Input.Amount">Amount (£)</label>
        <input asp-for="Input.Amount" type="number" step="0.01" min="0.01" />
        <span asp-validation-for="Input.Amount" class="bad"></span>
        <button type="submit" class="button">Pay now</button>
    </form>
}
```

## apps/uconnect/src/Uconnect.Web/Pages/NoAccount.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/NoAccount.cshtml`.

```cshtml
@page
@model NoAccountModel
@{
    ViewData["Title"] = "No account linked";
}
<p>Your sign-in is not linked to a Uconnect account yet. If your business administrator has invited you, use the link in the invitation e-mail; otherwise please contact support.</p>
```

## apps/uconnect/src/Uconnect.Web/Pages/Outages.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Outages.cshtml`.

```cshtml
@page
@model Uconnect.Web.Pages.Appointments.OutagesModel
@{
    ViewData["Title"] = "Service status";
}
@if (Model.Outages.Count == 0)
{
    <div class="alert alert--ok">There are no known problems affecting your services.</div>
}
@foreach (var item in Model.Outages)
{
    var o = item.Outage;
    <article class="card">
        <h2>@o.Title <partial name="_StatusBadge" model="o.Severity" /> <partial name="_StatusBadge" model="o.Status" /></h2>
        <p>
            Affecting @string.Join(", ", item.AffectedServiceReferences) · started @Display.When(o.StartedAt)
            @(o.ResolvedAt is { } fixedAt ? $"· fixed {Display.When(fixedAt)}" : o.EstimatedResolutionAt is { } eta ? $"· expected fix {Display.When(eta)}" : null)
        </p>
        <ol class="timeline">
            @foreach (var u in o.Updates)
            {
                <li><header>@Display.When(u.PostedAt) · @u.Status</header><p>@u.Message</p></li>
            }
        </ol>
    </article>
}
```

## apps/uconnect/src/Uconnect.Web/Pages/Services/ChangePlan.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Services/ChangePlan.cshtml`.

```cshtml
@page
@model Uconnect.Web.Pages.Services.ChangePlanModel
@{
    ViewData["Title"] = "Confirm plan change";
    var q = Model.Quote;
}
@if (q is not null)
{
    <dl class="facts">
        <dt>Change</dt><dd>@q.FromPlanCode → @q.ToPlanCode (@q.ChangeType.ToLowerInvariant())</dd>
        <dt>Takes effect</dt><dd>@Display.Date(q.EffectiveOn)</dd>
        <dt>New monthly price</dt><dd>@Display.Money(q.NewMonthlyPrice) (@Display.Money(q.MonthlyDifference) a month)</dd>
        @if (q.Proration is { } p)
        {
            <dt>This period</dt><dd>Credit @Display.Money(p.Credit), charge @Display.Money(p.Charge) for @p.DaysRemaining of @p.DaysInPeriod days</dd>
        }
        @if (q.EarlyTerminationFee.AmountMinor > 0)
        {
            <dt>Early change fee</dt><dd>@Display.Money(q.EarlyTerminationFee)</dd>
        }
        <dt>On your next bill</dt><dd><strong>@Display.Money(q.OneOffTotal)</strong></dd>
        @if (q.ResetsContract)
        {
            <dt>Contract</dt><dd>A new minimum term starts, ending @Display.Date(q.ContractEndsOn)</dd>
        }
    </dl>
    <form method="post">
        <input type="hidden" asp-for="ServiceId" />
        <input type="hidden" asp-for="Plan" />
        <input type="hidden" asp-for="EffectiveOn" />
        <input type="hidden" name="AcceptedNetAmountMinor" value="@q.OneOffTotal.AmountMinor" />
        <label><input type="checkbox" asp-for="AcceptTerms" /> I accept the charges and plan change terms above.</label>
        <span asp-validation-for="AcceptTerms" class="bad"></span>
        <button type="submit" class="button">Confirm change</button>
    </form>
}
```

## apps/uconnect/src/Uconnect.Web/Pages/Services/Details.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Services/Details.cshtml`.

```cshtml
@page "{id:guid}"
@model Uconnect.Web.Pages.Services.DetailsModel
@{
    var s = Model.Detail!.Service;
    ViewData["Title"] = $"{s.Plan.Name} · {s.ServiceReference}";
}
@if (Model.Detail.AffectedByOutage)
{
    <div class="alert alert--bad">This service is affected by a network incident. <a asp-page="/Outages">See service status</a>.</div>
}
<dl class="facts">
    <dt>Status</dt><dd><partial name="_StatusBadge" model="s.Status" /></dd>
    <dt>Speed</dt><dd>@s.Plan.DownloadMbps / @s.Plan.UploadMbps Mbps</dd>
    <dt>You pay</dt><dd>@Display.Money(s.MonthlyPrice) a month</dd>
    <dt>Address</dt><dd>@s.ServiceAddress.Line1, @s.ServiceAddress.Town @s.ServiceAddress.Postcode</dd>
    <dt>Contract</dt><dd>@(s.ContractEndsOn is { } end ? $"Ends {Display.Date(end)} ({Model.Detail.RemainingContractMonths} months left)" : "No minimum term")</dd>
    <dt>Open tickets</dt><dd>@Model.Detail.OpenTicketCount</dd>
</dl>

@if (Model.Usage is { } u)
{
    <h2>Usage this period</h2>
    <p>
        @Display.Bytes(u.TotalBytes) used between @Display.Date(u.PeriodStart) and @Display.Date(u.PeriodEnd.AddDays(-1))
        @if (u.AllowanceGb is { } allowance)
        {
            <text>— @u.PercentOfAllowance% of your @allowance GB allowance (<partial name="_StatusBadge" model="u.FairUseState" />)</text>
        }
    </p>
    @if (u.ProjectedTotalBytes is { } projected)
    {
        <p>At this rate you'll use about @Display.Bytes(projected) by the end of the period.</p>
    }
    @if (u.EstimatedOverageCharge is { } overage)
    {
        <p class="bad">Estimated usage charge so far: @Display.Money(overage)</p>
    }
}

@if (Model.Detail.PlanOptions.Count > 0 && !s.HasPendingPlanChange && Model.CanManage)
{
    <h2>Change plan</h2>
    <table class="grid">
        <thead><tr><th>Plan</th><th>Speed</th><th>Monthly</th><th>Difference</th><th></th></tr></thead>
        <tbody>
        @foreach (var o in Model.Detail.PlanOptions)
        {
            <tr>
                <td>@o.Plan.Name</td>
                <td>@o.Plan.DownloadMbps Mbps</td>
                <td>@Display.Money(o.Plan.MonthlyPrice)</td>
                <td>@Display.Money(o.MonthlyDifference)</td>
                <td><a asp-page="ChangePlan" asp-route-serviceId="@s.Id" asp-route-plan="@o.Plan.Code">@o.ChangeType</a></td>
            </tr>
        }
        </tbody>
    </table>
}
```

## apps/uconnect/src/Uconnect.Web/Pages/Services/Index.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Services/Index.cshtml`.

```cshtml
@page
@model Uconnect.Web.Pages.Services.IndexModel
@{
    ViewData["Title"] = "Your services";
}
<table class="grid">
    <thead><tr><th>Service</th><th>Plan</th><th>Address</th><th>Monthly</th><th>Status</th></tr></thead>
    <tbody>
    @foreach (var s in Model.Services)
    {
        <tr>
            <td><a asp-page="Details" asp-route-id="@s.Id">@s.ServiceReference</a></td>
            <td>@s.Plan.Name @(s.HasPendingPlanChange ? "(change pending)" : null)</td>
            <td>@s.ServiceAddress.Line1, @s.ServiceAddress.Postcode</td>
            <td>@Display.Money(s.MonthlyPrice)</td>
            <td><partial name="_StatusBadge" model="s.Status" /></td>
        </tr>
    }
    </tbody>
</table>

@if (Model.PlanChanges.Count > 0)
{
    <h2>Plan changes</h2>
    <table class="grid">
        <thead><tr><th>Change</th><th>Effective</th><th>New price</th><th>Status</th><th></th></tr></thead>
        <tbody>
        @foreach (var c in Model.PlanChanges)
        {
            <tr>
                <td>@c.FromPlanCode → @c.ToPlanCode (@c.ChangeType.ToLowerInvariant())</td>
                <td>@Display.Date(c.EffectiveOn)</td>
                <td>@Display.Money(c.NewMonthlyPrice)</td>
                <td><partial name="_StatusBadge" model="c.Status" /> @c.FailureReason</td>
                <td>
                    @if (c.CanCancel && Model.CanManage)
                    {
                        <form method="post" asp-page-handler="CancelChange" asp-route-planChangeId="@c.Id">
                            <button type="submit" class="link">Cancel</button>
                        </form>
                    }
                </td>
            </tr>
        }
        </tbody>
    </table>
}
```

## apps/uconnect/src/Uconnect.Web/Pages/Services/Services.cshtml.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Web/Pages/Services/Services.cshtml.cs`.

```csharp
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Application.PlanChanges;
using Uconnect.Application.Services;
using Uconnect.Application.Usage;
using Uconnect.Web.Api;

namespace Uconnect.Web.Pages.Services;

public sealed class IndexModel : AccountPageModel
{
    public IndexModel(UconnectApiClient api) : base(api)
    {
    }

    public IReadOnlyList<ServiceSummaryDto> Services { get; private set; } = Array.Empty<ServiceSummaryDto>();

    public IReadOnlyList<PlanChangeDto> PlanChanges { get; private set; } = Array.Empty<PlanChangeDto>();

    public async Task OnGetAsync(CancellationToken ct)
    {
        Services = await Api.GetAsync<IReadOnlyList<ServiceSummaryDto>>(AccountPath("services"), ct);
        PlanChanges = await Api.GetAsync<IReadOnlyList<PlanChangeDto>>(AccountPath("plan-changes"), ct);
    }

    public async Task<IActionResult> OnPostCancelChangeAsync(Guid planChangeId, CancellationToken ct)
    {
        await Api.SendAsync<PlanChangeDto>(HttpMethod.Post, AccountPath($"plan-changes/{planChangeId}/cancel"), null, ct);
        TempData["Notice"] = "Your plan change has been cancelled.";
        return RedirectToPage();
    }
}

public sealed class DetailsModel : AccountPageModel
{
    public DetailsModel(UconnectApiClient api) : base(api)
    {
    }

    public ServiceDetailDto? Detail { get; private set; }

    public UsageSummaryDto? Usage { get; private set; }

    public async Task OnGetAsync(Guid id, CancellationToken ct)
    {
        Detail = await Api.GetAsync<ServiceDetailDto>(AccountPath($"services/{id}"), ct);
        if (Detail.Service.ProductType == "Broadband" && Detail.Service.Status != "PendingActivation")
        {
            Usage = await Api.GetAsync<UsageSummaryDto>(AccountPath($"services/{id}/usage"), ct);
        }
    }
}

/// <summary>Two-step plan change: show the server-computed quote, then accept exactly that amount.</summary>
public sealed class ChangePlanModel : AccountPageModel
{
    public ChangePlanModel(UconnectApiClient api) : base(api)
    {
    }

    [BindProperty(SupportsGet = true)]
    public Guid ServiceId { get; set; }

    [BindProperty(SupportsGet = true)]
    [Required]
    public string Plan { get; set; } = string.Empty;

    [BindProperty(SupportsGet = true)]
    public DateOnly? EffectiveOn { get; set; }

    [BindProperty]
    public long AcceptedNetAmountMinor { get; set; }

    [BindProperty]
    [Range(typeof(bool), "true", "true", ErrorMessage = "Please accept the plan change terms.")]
    public bool AcceptTerms { get; set; }

    public PlanChangeQuoteDto? Quote { get; private set; }

    public async Task OnGetAsync(CancellationToken ct) => await LoadQuoteAsync(ct);

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            await LoadQuoteAsync(ct);
            return Page();
        }

        try
        {
            await Api.SendAsync<PlanChangeDto>(
                HttpMethod.Post,
                AccountPath("plan-changes"),
                new RequestPlanChangeRequest(ServiceId, Plan, EffectiveOn, AcceptedNetAmountMinor, AcceptTerms),
                ct);
        }
        catch (ApiProblemException problem) when (problem.Code == "plan_change.quote_changed")
        {
            ModelState.AddModelError(string.Empty, problem.Message);
            await LoadQuoteAsync(ct);
            return Page();
        }

        TempData["Notice"] = "Your plan change has been requested. We'll e-mail you when it is complete.";
        return RedirectToPage("Index");
    }

    private async Task LoadQuoteAsync(CancellationToken ct) =>
        Quote = await Api.SendAsync<PlanChangeQuoteDto>(
            HttpMethod.Post, AccountPath("plan-changes/quote"), new PlanChangeQuoteRequest(ServiceId, Plan, EffectiveOn), ct);
}
```

## apps/uconnect/src/Uconnect.Web/Pages/Shared/_Layout.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Shared/_Layout.cshtml`.

```cshtml
@using Uconnect.Application.Accounts
@{
    var accounts = ViewData["Accounts"] as IReadOnlyList<AccountSummaryDto> ?? Array.Empty<AccountSummaryDto>();
    var current = ViewData["AccountNumber"] as string;
    var section = ViewContext.RouteData.Values["page"] as string ?? "/Index";
}
<!DOCTYPE html>
<html lang="en-GB">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>@ViewData["Title"] · Uconnect</title>
    <link rel="stylesheet" href="~/css/site.css" asp-append-version="true" />
</head>
<body>
    <header class="topbar">
        <a class="brand" asp-page="/Index">Uconnect</a>
        @if (accounts.Count > 1)
        {
            <form method="post" asp-page="/SwitchAccount" class="switcher">
                <label for="accountNumber" class="visually-hidden">Account</label>
                <select id="accountNumber" name="accountNumber" onchange="this.form.submit()">
                    @foreach (var account in accounts)
                    {
                        <option value="@account.AccountNumber" selected="@(account.AccountNumber == current)">@account.Name (@account.AccountNumber)</option>
                    }
                </select>
                <noscript><button type="submit">Switch</button></noscript>
            </form>
        }
        else if (current is not null)
        {
            <span class="switcher">@current</span>
        }
        <span class="user">@User.Identity?.Name</span>
    </header>
    <nav class="sidenav" aria-label="Main">
        @foreach (var (page, label) in new[] { ("/Index", "Dashboard"), ("/Services/Index", "Services"), ("/Invoices/Index", "Bills & payments"), ("/Tickets/Index", "Support"), ("/Appointments/Index", "Engineer visits"), ("/Outages", "Service status") })
        {
            <a asp-page="@page" class="@(section.StartsWith(page.Replace("/Index", string.Empty), StringComparison.Ordinal) && (page != "/Index" || section == "/Index") ? "active" : null)">@label</a>
        }
    </nav>
    <main class="content">
        <h1>@ViewData["Title"]</h1>
        <div asp-validation-summary="ModelOnly" class="alert alert--bad" role="alert"></div>
        @if (TempData["Notice"] is string notice)
        {
            <div class="alert alert--ok" role="status">@notice</div>
        }
        @RenderBody()
    </main>
</body>
</html>
```

## apps/uconnect/src/Uconnect.Web/Pages/Shared/_Pager.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Shared/_Pager.cshtml`.

```cshtml
@model (int Page, int TotalPages)
@if (Model.TotalPages > 1)
{
    <nav class="pager" aria-label="Pages">
        @if (Model.Page > 1)
        {
            <a asp-route-page="@(Model.Page - 1)">Previous</a>
        }
        <span>Page @Model.Page of @Model.TotalPages</span>
        @if (Model.Page < Model.TotalPages)
        {
            <a asp-route-page="@(Model.Page + 1)">Next</a>
        }
    </nav>
}
```

## apps/uconnect/src/Uconnect.Web/Pages/Shared/_StatusBadge.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Shared/_StatusBadge.cshtml`.

```cshtml
@model string
<span class="badge badge--@Display.Tone(Model)">@Model</span>
```

## apps/uconnect/src/Uconnect.Web/Pages/SwitchAccount.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/SwitchAccount.cshtml`.

```cshtml
@page
@model SwitchAccountModel
```

## apps/uconnect/src/Uconnect.Web/Pages/Tickets/Details.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Tickets/Details.cshtml`.

```cshtml
@page "{reference}"
@model Uconnect.Web.Pages.Tickets.DetailsModel
@{
    var t = Model.Ticket!;
    ViewData["Title"] = $"{t.Summary.Reference}: {t.Summary.Subject}";
}
<p>
    <partial name="_StatusBadge" model="t.Summary.Status" /> Priority @t.Summary.Priority ·
    raised @Display.When(t.Summary.CreatedAt) ·
    @(t.FirstRespondedAt is null ? $"first response due {Display.When(t.FirstResponseDueAt)}" : $"target resolution {Display.When(t.Summary.ResolutionDueAt)}")
</p>
<blockquote>@t.Description</blockquote>
@if (t.ResolutionSummary is not null)
{
    <div class="alert alert--ok"><strong>Resolution:</strong> @t.ResolutionSummary</div>
}
<ol class="timeline">
    @foreach (var c in t.Comments)
    {
        <li class="@(c.IsAgent ? "agent" : "customer")">
            <header>@c.AuthorName · @Display.When(c.CreatedAt)</header>
            <p>@c.Body</p>
        </li>
    }
</ol>
@if (t.Summary.Status != "Closed")
{
    <form method="post" class="form">
        <label asp-for="Message">@(t.CanReopen ? "Still having the problem? Tell us why" : "Add a message")</label>
        <textarea asp-for="Message" rows="4" maxlength="4000"></textarea>
        <span class="bad">@string.Join(" ", ViewData.ModelState.Where(kv => kv.Key is "Body" or "Reason").SelectMany(kv => kv.Value!.Errors).Select(e => e.ErrorMessage))</span>
        @if (t.Summary.Status != "Resolved")
        {
            <button type="submit" asp-page-handler="Comment" class="button">Send message</button>
        }
        @if (t.CanReopen)
        {
            <button type="submit" asp-page-handler="Reopen" class="button">Reopen ticket</button>
        }
        @if (t.CanClose)
        {
            <button type="submit" asp-page-handler="Close" class="link">@(t.Summary.Status == "Resolved" ? "Confirm it's fixed" : "Withdraw ticket")</button>
        }
    </form>
}
```

## apps/uconnect/src/Uconnect.Web/Pages/Tickets/Index.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Tickets/Index.cshtml`.

```cshtml
@page
@model Uconnect.Web.Pages.Tickets.IndexModel
@{
    ViewData["Title"] = "Support";
}
<p>
    <a class="button" asp-page="New">Report a problem</a>
    @if (Model.OpenOnly) { <a asp-route-openOnly="false">Show all tickets</a> } else { <a asp-route-openOnly="true">Show open tickets only</a> }
</p>
<table class="grid">
    <thead><tr><th>Ticket</th><th>Subject</th><th>Priority</th><th>Last update</th><th>Status</th></tr></thead>
    <tbody>
    @foreach (var t in Model.Tickets!.Items)
    {
        <tr>
            <td><a asp-page="Details" asp-route-reference="@t.Reference">@t.Reference</a></td>
            <td>@t.Subject</td>
            <td>@t.Priority</td>
            <td>@Display.When(t.LastActivityAt)</td>
            <td><partial name="_StatusBadge" model="t.Status" /></td>
        </tr>
    }
    </tbody>
</table>
<partial name="_Pager" model="(Model.Tickets.Page, Model.Tickets.TotalPages)" />
```

## apps/uconnect/src/Uconnect.Web/Pages/Tickets/New.cshtml

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: cshtml. Path: `apps/uconnect/src/Uconnect.Web/Pages/Tickets/New.cshtml`.

```cshtml
@page
@model Uconnect.Web.Pages.Tickets.NewModel
@{
    ViewData["Title"] = "Report a problem";
}
<form method="post" class="form">
    <label asp-for="Input.Category">What is it about?</label>
    <select asp-for="Input.Category" asp-items="NewModel.Categories"></select>
    <span asp-validation-for="Input.Category" class="bad"></span>

    <label asp-for="Input.ServiceId">Which service?</label>
    <select asp-for="Input.ServiceId" asp-items="Model.ServiceOptions"><option value="">Not about a specific service</option></select>
    <span asp-validation-for="Input.ServiceId" class="bad"></span>

    <label><input type="checkbox" asp-for="Input.ServiceDown" /> The service is not working at all</label>

    <label asp-for="Input.Subject">Summary</label>
    <input asp-for="Input.Subject" maxlength="150" />
    <span asp-validation-for="Input.Subject" class="bad"></span>

    <label asp-for="Input.Description">Tell us what's happening</label>
    <textarea asp-for="Input.Description" rows="6" maxlength="4000"></textarea>
    <span asp-validation-for="Input.Description" class="bad"></span>

    <button type="submit" class="button">Send</button>
</form>
```
