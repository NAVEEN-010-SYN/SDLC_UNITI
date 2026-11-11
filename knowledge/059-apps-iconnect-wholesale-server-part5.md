# iConnect Wholesale ordering: apps/iconnect-wholesale/server (part 5 of 7)

- **Application:** iConnect Wholesale ordering
- **Tech stack:** .NET 8 Web API + Angular
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 17

## Files

- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Repositories/FaultAndBillingRepositories.cs` (122 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Repositories/OrderRepository.cs` (135 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Repositories/ReferenceDataRepositories.cs` (87 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/SequenceReferenceGenerator.cs` (40 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/WholesaleDbContext.cs` (91 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Time/CalendarProvider.cs` (64 lines)
- `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Time/SystemClock.cs` (16 lines)
- `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Api/ApiBoundaryTests.cs` (154 lines)
- `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Application/ApiKeyAndSlaTests.cs` (139 lines)
- `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Application/BulkOrderCsvTests.cs` (149 lines)
- `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Application/OrderPricingAndBillingTests.cs` (221 lines)
- `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/CommercialTests.cs` (156 lines)
- `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/FaultTests.cs` (91 lines)
- `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/MoneyAndCalendarTests.cs` (109 lines)
- `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/OrderTests.cs` (139 lines)
- `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/SlaTests.cs` (145 lines)
- `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/IConnect.Wholesale.Tests.csproj` (27 lines)

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Repositories/FaultAndBillingRepositories.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Repositories/FaultAndBillingRepositories.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Appointments;
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Faults;
using Microsoft.EntityFrameworkCore;

namespace IConnect.Wholesale.Infrastructure.Persistence.Repositories;

internal sealed class FaultRepository : IFaultRepository
{
    private static readonly FaultStatus[] Open = { FaultStatus.Open, FaultStatus.InProgress, FaultStatus.PendingCustomer };
    private static readonly FaultStatus[] ClockRunning = { FaultStatus.Open, FaultStatus.InProgress };

    private readonly WholesaleDbContext _db;

    public FaultRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<Fault?> GetAsync(Guid id, CancellationToken ct) => _db.Faults.FirstOrDefaultAsync(f => f.Id == id, ct);

    public async Task<PagedResult<Fault>> QueryAsync(FaultQuery query, CancellationToken ct)
    {
        var q = _db.Faults.AsNoTracking().Where(f => f.PartnerId == query.PartnerId);
        if (query.Status is { } status)
        {
            q = q.Where(f => f.Status == status);
        }

        if (query.Priority is { } priority)
        {
            q = q.Where(f => f.Priority == priority);
        }

        var total = await q.CountAsync(ct);
        var items = await q.OrderBy(f => f.Priority).ThenByDescending(f => f.CreatedAt)
            .Skip(query.Page.Skip).Take(query.Page.PageSize).ToListAsync(ct);
        return new PagedResult<Fault>(items, query.Page.Page, query.Page.PageSize, total);
    }

    public Task<bool> HasOpenFaultForServiceAsync(Guid serviceId, CancellationToken ct) =>
        _db.Faults.AnyAsync(f => f.ServiceId == serviceId && Open.Contains(f.Status), ct);

    public async Task<IReadOnlyList<Fault>> ListWithRunningClocksAsync(CancellationToken ct) =>
        await _db.Faults.Where(f => ClockRunning.Contains(f.Status)).ToListAsync(ct);

    public async Task<IReadOnlyList<Fault>> ListResolvedWithCreditBetweenAsync(Guid partnerId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct) =>
        await _db.Faults.AsNoTracking()
            .Where(f => f.PartnerId == partnerId && f.ServiceCredit != null && f.ResolvedAt >= from && f.ResolvedAt < to
                        && (f.Status == FaultStatus.Resolved || f.Status == FaultStatus.Closed))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Fault>> ListAutoCloseCandidatesAsync(DateTimeOffset resolvedBefore, CancellationToken ct) =>
        await _db.Faults.Where(f => f.Status == FaultStatus.Resolved && f.ResolvedAt < resolvedBefore).Take(500).ToListAsync(ct);

    public async Task AddAsync(Fault fault, CancellationToken ct) => await _db.Faults.AddAsync(fault, ct);
}

internal sealed class AppointmentSlotRepository : IAppointmentSlotRepository
{
    private readonly WholesaleDbContext _db;

    public AppointmentSlotRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<AppointmentSlot?> GetAsync(Guid id, CancellationToken ct) => _db.AppointmentSlots.FirstOrDefaultAsync(s => s.Id == id, ct);

    public async Task<IReadOnlyList<AppointmentSlot>> ListAsync(string exchangeCode, DateOnly from, DateOnly to, CancellationToken ct) =>
        await _db.AppointmentSlots.AsNoTracking()
            .Where(s => s.ExchangeCode == exchangeCode && s.Date >= from && s.Date <= to)
            .ToListAsync(ct);
}

internal sealed class StatementRepository : IStatementRepository
{
    private readonly WholesaleDbContext _db;

    public StatementRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<BillingStatement?> GetAsync(Guid id, CancellationToken ct) => _db.Statements.FirstOrDefaultAsync(s => s.Id == id, ct);

    public Task<BillingStatement?> GetForPeriodAsync(Guid partnerId, DateOnly periodStart, CancellationToken ct) =>
        _db.Statements.FirstOrDefaultAsync(s => s.PartnerId == partnerId && s.PeriodStart == periodStart, ct);

    public async Task<PagedResult<BillingStatement>> ListForPartnerAsync(Guid partnerId, PageRequest page, CancellationToken ct)
    {
        var q = _db.Statements.AsNoTracking().Where(s => s.PartnerId == partnerId && s.Status != StatementStatus.Draft);
        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(s => s.PeriodStart).Skip(page.Skip).Take(page.PageSize).ToListAsync(ct);
        return new PagedResult<BillingStatement>(items, page.Page, page.PageSize, total);
    }

    public async Task AddAsync(BillingStatement statement, CancellationToken ct) => await _db.Statements.AddAsync(statement, ct);
}

internal sealed class DisputeRepository : IDisputeRepository
{
    private readonly WholesaleDbContext _db;

    public DisputeRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<Dispute?> GetAsync(Guid id, CancellationToken ct) => _db.Disputes.FirstOrDefaultAsync(d => d.Id == id, ct);

    public async Task<IReadOnlyList<Dispute>> ListForStatementAsync(Guid statementId, CancellationToken ct) =>
        await _db.Disputes.Where(d => d.StatementId == statementId).ToListAsync(ct);

    public async Task<IReadOnlyList<Dispute>> ListForPartnerAsync(Guid partnerId, CancellationToken ct) =>
        await _db.Disputes.AsNoTracking().Where(d => d.PartnerId == partnerId).ToListAsync(ct);

    public async Task AddAsync(Dispute dispute, CancellationToken ct) => await _db.Disputes.AddAsync(dispute, ct);
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Repositories/OrderRepository.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Repositories/OrderRepository.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Services;
using Microsoft.EntityFrameworkCore;

namespace IConnect.Wholesale.Infrastructure.Persistence.Repositories;

internal sealed class OrderRepository : IOrderRepository
{
    private static readonly OrderStatus[] OpenStatuses = { OrderStatus.Draft, OrderStatus.Submitted, OrderStatus.Validated, OrderStatus.Provisioning };
    private static readonly OrderStatus[] ClockRunningStatuses = { OrderStatus.Validated, OrderStatus.Provisioning };

    private readonly WholesaleDbContext _db;

    public OrderRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<Order?> GetAsync(Guid id, CancellationToken ct) => _db.Orders.FirstOrDefaultAsync(o => o.Id == id, ct);

    public Task<Order?> GetByPartnerReferenceAsync(Guid partnerId, string partnerReference, CancellationToken ct) =>
        _db.Orders.FirstOrDefaultAsync(o => o.PartnerId == partnerId && o.PartnerReference == partnerReference, ct);

    public async Task<PagedResult<Order>> QueryAsync(OrderQuery query, CancellationToken ct)
    {
        var q = _db.Orders.AsNoTracking().Where(o => o.PartnerId == query.PartnerId);

        if (query.Status is { } status)
        {
            q = q.Where(o => o.Status == status);
        }

        if (query.Type is { } type)
        {
            q = q.Where(o => o.Type == type);
        }

        if (!string.IsNullOrEmpty(query.Search))
        {
            var term = query.Search;
            q = q.Where(o => o.Reference == term || o.PartnerReference.StartsWith(term) || o.Uprn == term);
        }

        if (query.CreatedFrom is { } from)
        {
            var fromInstant = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            q = q.Where(o => o.CreatedAt >= fromInstant);
        }

        if (query.CreatedTo is { } to)
        {
            var toInstant = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            q = q.Where(o => o.CreatedAt < toInstant);
        }

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(o => o.CreatedAt).Skip(query.Page.Skip).Take(query.Page.PageSize).ToListAsync(ct);
        return new PagedResult<Order>(items, query.Page.Page, query.Page.PageSize, total);
    }

    public Task<int> CountOpenAsync(Guid partnerId, CancellationToken ct) =>
        _db.Orders.CountAsync(o => o.PartnerId == partnerId && OpenStatuses.Contains(o.Status), ct);

    public Task<bool> HasOpenOrderForUprnAsync(string uprn, CancellationToken ct) =>
        _db.Orders.AnyAsync(o => o.Uprn == uprn && OpenStatuses.Contains(o.Status), ct);

    public async Task<IReadOnlyList<Order>> ListWithRunningClocksAsync(CancellationToken ct) =>
        await _db.Orders.Where(o => ClockRunningStatuses.Contains(o.Status) && o.HoldReason == null).ToListAsync(ct);

    public async Task<IReadOnlyList<Order>> ListCompletedBetweenAsync(Guid partnerId, DateOnly from, DateOnly to, CancellationToken ct) =>
        await _db.Orders.AsNoTracking()
            .Where(o => o.PartnerId == partnerId && o.Status == OrderStatus.Active && o.CompletedDate >= from && o.CompletedDate <= to)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Order>> ListCancelledWithChargeBetweenAsync(Guid partnerId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var fromInstant = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toInstant = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        return await _db.Orders.AsNoTracking()
            .Where(o => o.PartnerId == partnerId && o.Status == OrderStatus.Cancelled && o.CancellationCharge != null
                        && o.UpdatedAt >= fromInstant && o.UpdatedAt < toInstant)
            .ToListAsync(ct);
    }

    public async Task AddAsync(Order order, CancellationToken ct) => await _db.Orders.AddAsync(order, ct);

    public async Task AddRangeAsync(IEnumerable<Order> orders, CancellationToken ct) => await _db.Orders.AddRangeAsync(orders, ct);
}

internal sealed class ServiceRepository : IServiceRepository
{
    private readonly WholesaleDbContext _db;

    public ServiceRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<WholesaleService?> GetAsync(Guid id, CancellationToken ct) => _db.Services.FirstOrDefaultAsync(s => s.Id == id, ct);

    public Task<WholesaleService?> GetActiveByUprnAsync(string uprn, CancellationToken ct) =>
        _db.Services.FirstOrDefaultAsync(s => s.Uprn == uprn && s.CeasedOn == null, ct);

    public Task<int> CountActiveAsync(Guid partnerId, CancellationToken ct) =>
        _db.Services.CountAsync(s => s.PartnerId == partnerId && s.CeasedOn == null, ct);

    public async Task<IReadOnlyList<WholesaleService>> ListBillableAsync(Guid partnerId, DateOnly from, DateOnly to, CancellationToken ct) =>
        await _db.Services.AsNoTracking()
            .Where(s => s.PartnerId == partnerId && s.ActivatedOn <= to && (s.CeasedOn == null || s.CeasedOn >= from))
            .ToListAsync(ct);

    public async Task AddAsync(WholesaleService service, CancellationToken ct) => await _db.Services.AddAsync(service, ct);
}

internal sealed class BulkUploadRepository : IBulkUploadRepository
{
    private readonly WholesaleDbContext _db;

    public BulkUploadRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<Domain.Orders.BulkUpload?> GetAsync(Guid id, CancellationToken ct) => _db.BulkUploads.FirstOrDefaultAsync(b => b.Id == id, ct);

    public Task<Domain.Orders.BulkUpload?> GetByHashAsync(Guid partnerId, string contentSha256, CancellationToken ct) =>
        _db.BulkUploads.Where(b => b.PartnerId == partnerId && b.ContentSha256 == contentSha256)
            .OrderByDescending(b => b.Status == BulkUploadStatus.Submitted)
            .FirstOrDefaultAsync(ct);

    public async Task AddAsync(Domain.Orders.BulkUpload upload, CancellationToken ct) => await _db.BulkUploads.AddAsync(upload, ct);
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Repositories/ReferenceDataRepositories.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/Repositories/ReferenceDataRepositories.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.EntityFrameworkCore;

namespace IConnect.Wholesale.Infrastructure.Persistence.Repositories;

internal sealed class PremiseRepository : IPremiseRepository
{
    private readonly WholesaleDbContext _db;

    public PremiseRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<Premise?> GetByUprnAsync(string uprn, CancellationToken ct) => _db.Premises.FirstOrDefaultAsync(p => p.Uprn == uprn, ct);

    public async Task<IReadOnlyList<Premise>> SearchByPostcodeAsync(string postcode, CancellationToken ct) =>
        await _db.Premises.AsNoTracking().Where(p => p.Postcode == postcode).Take(500).ToListAsync(ct);
}

internal sealed class CatalogueRepository : ICatalogueRepository
{
    private readonly WholesaleDbContext _db;

    public CatalogueRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<WholesaleProduct>> ListProductsAsync(bool includeWithdrawn, CancellationToken ct) =>
        await _db.Products.AsNoTracking().Where(p => includeWithdrawn || p.IsActive).ToListAsync(ct);

    public Task<WholesaleProduct?> GetProductAsync(string code, CancellationToken ct)
    {
        var normalised = code.ToUpperInvariant();
        return _db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Code == normalised, ct);
    }

    public Task<PriceBook?> GetEffectivePriceBookAsync(DateOnly onDate, CancellationToken ct) =>
        _db.PriceBooks.AsNoTracking()
            .Where(b => b.EffectiveFrom <= onDate && (b.EffectiveTo == null || b.EffectiveTo >= onDate))
            .OrderByDescending(b => b.EffectiveFrom)
            .FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<PriceBook>> ListPriceBooksAsync(CancellationToken ct) =>
        await _db.PriceBooks.OrderBy(b => b.EffectiveFrom).ToListAsync(ct);

    public async Task AddPriceBookAsync(PriceBook priceBook, CancellationToken ct) => await _db.PriceBooks.AddAsync(priceBook, ct);
}

internal sealed class PartnerRepository : IPartnerRepository
{
    private readonly WholesaleDbContext _db;

    public PartnerRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<Partner?> GetAsync(Guid id, CancellationToken ct) => _db.Partners.FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<IReadOnlyList<Partner>> ListActiveAsync(CancellationToken ct) =>
        await _db.Partners.AsNoTracking().Where(p => p.Status == PartnerStatus.Active).ToListAsync(ct);
}

internal sealed class ApiKeyRepository : IApiKeyRepository
{
    private readonly WholesaleDbContext _db;

    public ApiKeyRepository(WholesaleDbContext db)
    {
        _db = db;
    }

    public Task<ApiKey?> GetAsync(Guid id, CancellationToken ct) => _db.ApiKeys.FirstOrDefaultAsync(k => k.Id == id, ct);

    public Task<ApiKey?> GetByPrefixAsync(string prefix, CancellationToken ct) => _db.ApiKeys.FirstOrDefaultAsync(k => k.Prefix == prefix, ct);

    public async Task<IReadOnlyList<ApiKey>> ListForPartnerAsync(Guid partnerId, CancellationToken ct) =>
        await _db.ApiKeys.Where(k => k.PartnerId == partnerId).ToListAsync(ct);

    public async Task AddAsync(ApiKey key, CancellationToken ct) => await _db.ApiKeys.AddAsync(key, ct);
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/SequenceReferenceGenerator.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/SequenceReferenceGenerator.cs`.

```csharp
using System.Globalization;
using IConnect.Wholesale.Application.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace IConnect.Wholesale.Infrastructure.Persistence;

/// <summary>
/// Issues references such as ORD-00001234 from PostgreSQL sequences. Sequences are gap-tolerant
/// and never reused, so a rolled-back transaction cannot cause two orders to share a reference.
/// Only whitelisted prefixes are accepted because the sequence name is interpolated into SQL.
/// </summary>
internal sealed class SequenceReferenceGenerator : IReferenceGenerator
{
    private readonly WholesaleDbContext _db;

    public SequenceReferenceGenerator(WholesaleDbContext db)
    {
        _db = db;
    }

    public async Task<string> NextAsync(string prefix, CancellationToken ct)
    {
        if (!ReferenceSequences.All.TryGetValue(prefix, out var sequence))
        {
            throw new ArgumentOutOfRangeException(nameof(prefix), prefix, "Unknown reference prefix.");
        }

#pragma warning disable EF1002 // Sequence name comes from a fixed whitelist, never from user input.
        var value = await _db.Database
            .SqlQueryRaw<long>($"SELECT nextval('wholesale.{sequence}') AS \"Value\"")
            .SingleAsync(ct);
#pragma warning restore EF1002

        return Format(prefix, value);
    }

    internal static string Format(string prefix, long value) =>
        prefix + "-" + value.ToString("D8", CultureInfo.InvariantCulture);
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/WholesaleDbContext.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Persistence/WholesaleDbContext.cs`.

```csharp
using IConnect.Wholesale.Domain.Appointments;
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Partners;
using IConnect.Wholesale.Domain.Services;
using IConnect.Wholesale.Domain.Sla;
using IConnect.Wholesale.Infrastructure.Persistence.Converters;
using Microsoft.EntityFrameworkCore;

namespace IConnect.Wholesale.Infrastructure.Persistence;

public sealed class WholesaleDbContext : DbContext
{
    public WholesaleDbContext(DbContextOptions<WholesaleDbContext> options)
        : base(options)
    {
    }

    public DbSet<Partner> Partners => Set<Partner>();

    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();

    public DbSet<Premise> Premises => Set<Premise>();

    public DbSet<WholesaleProduct> Products => Set<WholesaleProduct>();

    public DbSet<PriceBook> PriceBooks => Set<PriceBook>();

    public DbSet<Order> Orders => Set<Order>();

    public DbSet<BulkUpload> BulkUploads => Set<BulkUpload>();

    public DbSet<WholesaleService> Services => Set<WholesaleService>();

    public DbSet<AppointmentSlot> AppointmentSlots => Set<AppointmentSlot>();

    public DbSet<Fault> Faults => Set<Fault>();

    public DbSet<BillingStatement> Statements => Set<BillingStatement>();

    public DbSet<Dispute> Disputes => Set<Dispute>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<Money>().HaveConversion<MoneyConverter>().HaveMaxLength(32);
        configurationBuilder.Properties<DateOnly>().HaveColumnType("date");

        configurationBuilder.Properties<OrderType>().HaveConversion<string>().HaveMaxLength(16);
        configurationBuilder.Properties<OrderStatus>().HaveConversion<string>().HaveMaxLength(16);
        configurationBuilder.Properties<CareLevel>().HaveConversion<string>().HaveMaxLength(16);
        configurationBuilder.Properties<FaultPriority>().HaveConversion<string>().HaveMaxLength(4);
        configurationBuilder.Properties<FaultStatus>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<FaultCategory>().HaveConversion<string>().HaveMaxLength(24);
        configurationBuilder.Properties<PremiseBuildStatus>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<PartnerStatus>().HaveConversion<string>().HaveMaxLength(16);
        configurationBuilder.Properties<SlotBand>().HaveConversion<string>().HaveMaxLength(8);
        configurationBuilder.Properties<StatementStatus>().HaveConversion<string>().HaveMaxLength(16);
        configurationBuilder.Properties<ChargeType>().HaveConversion<string>().HaveMaxLength(24);
        configurationBuilder.Properties<DisputeStatus>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<BulkUploadStatus>().HaveConversion<string>().HaveMaxLength(16);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("wholesale");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(WholesaleDbContext).Assembly);

        foreach (var sequence in ReferenceSequences.All)
        {
            modelBuilder.HasSequence<long>(sequence.Value).StartsAt(1).IncrementsBy(1);
        }
    }
}

/// <summary>Whitelisted reference prefixes and their database sequences.</summary>
public static class ReferenceSequences
{
    public static readonly IReadOnlyDictionary<string, string> All = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["ORD"] = "seq_order_ref",
        ["SVC"] = "seq_service_ref",
        ["FLT"] = "seq_fault_ref",
        ["STM"] = "seq_statement_ref",
        ["DSP"] = "seq_dispute_ref",
    };
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Time/CalendarProvider.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Time/CalendarProvider.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Domain.Sla;
using Microsoft.Extensions.Options;

namespace IConnect.Wholesale.Infrastructure.Time;

public sealed class CalendarOptions
{
    public const string Section = "Calendars";

    /// <summary>IANA time zone in which working windows are defined.</summary>
    public string TimeZoneId { get; set; } = "Europe/London";

    /// <summary>Public holidays excluded from business and extended-hours calendars.</summary>
    public List<DateOnly> BankHolidays { get; set; } = new();
}

/// <summary>
/// Builds the three contractual calendars once from configuration. Clocks persist the calendar
/// name, so <see cref="GetByName"/> must keep resolving every name that has ever been issued.
/// </summary>
internal sealed class CalendarProvider : ICalendarProvider
{
    private readonly IReadOnlyDictionary<CalendarKind, WorkingCalendar> _byKind;
    private readonly IReadOnlyDictionary<string, WorkingCalendar> _byName;

    public CalendarProvider(IOptions<CalendarOptions> options)
    {
        var settings = options.Value;
        var zone = ResolveTimeZone(settings.TimeZoneId);
        var holidays = settings.BankHolidays.Distinct().ToList();

        _byKind = new Dictionary<CalendarKind, WorkingCalendar>
        {
            [CalendarKind.BusinessHours] = WorkingCalendar.StandardBusinessHours(zone, holidays),
            [CalendarKind.ExtendedHours] = WorkingCalendar.ExtendedHours(zone, holidays),
            [CalendarKind.AlwaysOn] = WorkingCalendar.AlwaysOn(zone),
        };
        _byName = _byKind.Values.ToDictionary(c => c.Name, StringComparer.OrdinalIgnoreCase);
    }

    public WorkingCalendar Get(CalendarKind kind) => _byKind[kind];

    public WorkingCalendar GetByName(string name) =>
        _byName.TryGetValue(name, out var calendar)
            ? calendar
            : throw new InvalidOperationException($"No working calendar is registered under the name '{name}'.");

    internal static TimeZoneInfo ResolveTimeZone(string id)
    {
        if (TimeZoneInfo.TryFindSystemTimeZoneById(id, out var zone))
        {
            return zone;
        }

        if (TimeZoneInfo.TryConvertIanaIdToWindowsId(id, out var windowsId) && TimeZoneInfo.TryFindSystemTimeZoneById(windowsId, out zone))
        {
            return zone;
        }

        throw new InvalidOperationException($"Time zone '{id}' is not available on this host.");
    }
}
```

## apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Time/SystemClock.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/src/IConnect.Wholesale.Infrastructure/Time/SystemClock.cs`.

```csharp
using IConnect.Wholesale.Application.Abstractions;

namespace IConnect.Wholesale.Infrastructure.Time;

internal sealed class SystemClock : IClock
{
    private readonly TimeProvider _time;

    public SystemClock(TimeProvider time)
    {
        _time = time;
    }

    public DateTimeOffset UtcNow => _time.GetUtcNow();
}
```

## apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Api/ApiBoundaryTests.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Api/ApiBoundaryTests.cs`.

```csharp
using System.Security.Claims;
using IConnect.Wholesale.Api.Errors;
using IConnect.Wholesale.Api.Http;
using IConnect.Wholesale.Api.Observability;
using IConnect.Wholesale.Api.Security;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Tests.Api;

public sealed class ProblemMapperTests
{
    public static TheoryData<Exception, int, string> Cases => new()
    {
        { new RequestValidationException("uprn", "bad"), 400, "validation.failed" },
        { new NotFoundException("AppointmentSlot", Guid.Empty), 404, "appointment_slot.not_found" },
        { new ConflictException("order.duplicate_reference", "dup"), 409, "order.duplicate_reference" },
        { new ForbiddenException("no"), 403, "forbidden" },
        { new InvalidTransitionException("order", "ACTIVE", "CANCELLED"), 409, "order.invalid_transition" },
        { new DomainException("slot.full", "full"), 422, "slot.full" },
        { new InvalidOperationException("secret connection string"), 500, "server.error" },
    };

    [Theory]
    [MemberData(nameof(Cases))]
    public void Exceptions_map_to_status_and_stable_code(Exception exception, int status, string code)
    {
        var problem = ProblemMapper.Map(exception);
        Assert.Equal(status, problem.Status);
        Assert.Equal(code, problem.Extensions["code"]);
    }

    [Fact]
    public void Server_errors_do_not_leak_exception_messages()
    {
        var problem = ProblemMapper.Map(new InvalidOperationException("Host=db;Password=hunter2"));
        Assert.DoesNotContain("hunter2", problem.Detail, StringComparison.Ordinal);
        Assert.Equal("about:blank", problem.Type);
    }

    [Fact]
    public void Validation_errors_use_camel_case_field_paths()
    {
        var problem = Assert.IsType<ValidationProblemDetails>(ProblemMapper.Map(new RequestValidationException(
            new Dictionary<string, string[]> { ["$.RequestedDate"] = new[] { "required" } })));
        Assert.True(problem.Errors.ContainsKey("requestedDate"));
    }
}

public sealed class QueryParsingTests
{
    [Theory]
    [InlineData("IN_PROGRESS", FaultStatus.InProgress)]
    [InlineData("pending-customer", FaultStatus.PendingCustomer)]
    [InlineData("open", FaultStatus.Open)]
    public void Wire_forms_parse(string input, FaultStatus expected) =>
        Assert.Equal(expected, QueryParsing.OptionalEnum<FaultStatus>(input, "status"));

    [Fact]
    public void Blank_means_no_filter() => Assert.Null(QueryParsing.OptionalEnum<FaultStatus>(" ", "status"));

    [Theory]
    [InlineData("2")]
    [InlineData("ESCALATED")]
    public void Numeric_and_unknown_values_are_rejected(string input)
    {
        var ex = Assert.Throws<RequestValidationException>(() => QueryParsing.OptionalEnum<FaultStatus>(input, "status"));
        Assert.Contains("PENDINGCUSTOMER", ex.Errors["status"][0], StringComparison.Ordinal);
    }

    [Fact]
    public void Reversed_date_range_is_rejected() =>
        Assert.Throws<RequestValidationException>(() => QueryParsing.EnsureRange(new DateOnly(2024, 2, 1), new DateOnly(2024, 1, 1)));
}

public sealed class CorrelationAndCallerTests
{
    [Fact]
    public void Well_formed_correlation_ids_are_kept() =>
        Assert.Equal("req-12345678", CorrelationIdMiddleware.Resolve("req-12345678"));

    [Theory]
    [InlineData(null)]
    [InlineData("short")]
    [InlineData("abc12345\nINFO forged log line")]
    public void Missing_or_unsafe_ids_are_replaced(string? inbound)
    {
        var resolved = CorrelationIdMiddleware.Resolve(inbound);
        Assert.NotEqual(inbound, resolved);
        Assert.Equal(32, resolved.Length);
    }

    private static ClaimsPrincipal User(string? partnerId, params string[] roles)
    {
        var claims = roles.Select(r => new Claim(WholesaleClaims.Roles, r)).ToList();
        if (partnerId is not null)
        {
            claims.Add(new Claim(WholesaleClaims.PartnerId, partnerId));
        }

        return new ClaimsPrincipal(new ClaimsIdentity(claims, "jwt", "sub", WholesaleClaims.Roles));
    }

    [Fact]
    public void Buyer_partner_comes_from_the_token()
    {
        var partner = Guid.NewGuid();
        Assert.Equal(partner, HttpCurrentCaller.ResolvePartnerId(User(partner.ToString(), WholesaleRoles.WholesaleBuyer), null));
    }

    [Fact]
    public void Support_agent_must_name_a_valid_partner()
    {
        var agent = User(null, WholesaleRoles.SupportAgent);
        var partner = Guid.NewGuid();

        Assert.Equal(partner, HttpCurrentCaller.ResolvePartnerId(agent, partner.ToString()));
        Assert.Throws<ForbiddenException>(() => HttpCurrentCaller.ResolvePartnerId(agent, null));
        Assert.Throws<RequestValidationException>(() => HttpCurrentCaller.ResolvePartnerId(agent, "not-a-guid"));
    }

    private static async Task<bool> Authorise(ClaimsPrincipal user, string scope)
    {
        var requirement = new PartnerAccessRequirement(scope);
        var context = new AuthorizationHandlerContext(new[] { requirement }, user, null);
        await new PartnerAccessHandler().HandleAsync(context);
        return context.HasSucceeded;
    }

    [Fact]
    public async Task Api_keys_are_limited_to_their_scopes()
    {
        var key = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(WholesaleClaims.AuthMethod, WholesaleClaims.AuthMethodApiKey),
            new Claim(WholesaleClaims.Scope, ApiScopes.OrdersRead),
        }, ApiKeyAuthenticationHandler.SchemeName));

        Assert.True(await Authorise(key, ApiScopes.OrdersRead));
        Assert.False(await Authorise(key, ApiScopes.OrdersWrite));
    }

    [Fact]
    public async Task Portal_users_need_a_wholesale_role()
    {
        Assert.True(await Authorise(User(Guid.NewGuid().ToString(), WholesaleRoles.WholesaleBuyer), ApiScopes.OrdersWrite));
        Assert.False(await Authorise(User(Guid.NewGuid().ToString(), "CONSUMER"), ApiScopes.OrdersRead));
    }
}
```

## apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Application/ApiKeyAndSlaTests.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Application/ApiKeyAndSlaTests.cs`.

```csharp
using IConnect.Wholesale.Application.ApiKeys;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Application.Sla;
using IConnect.Wholesale.Domain.Partners;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Application;

public sealed class ApiKeyServiceTests
{
    private readonly InMemoryApiKeyRepository _keys = new();
    private readonly InMemoryPartnerRepository _partners = new();
    private readonly FixedClock _clock = new(Calendars.Utc(2024, 1, 8, 9));
    private readonly CountingUnitOfWork _uow = new();
    private readonly FakeCaller _caller = new();
    private readonly Partner _partner;
    private readonly ApiKeyService _service;

    public ApiKeyServiceTests()
    {
        _partner = _partners.Add(new Partner("Acme Fibre", "ACC-12345678", "GBP", 500));
        _caller.PartnerId = _partner.Id;
        _service = new ApiKeyService(_keys, _partners, _caller, _clock, _uow);
    }

    private Task<CreatedApiKeyDto> Create(string name = "billing-sync", int? days = 30) =>
        _service.CreateAsync(new CreateApiKeyRequest(name, new[] { ApiScopes.OrdersRead, ApiScopes.BillingRead }, days), CancellationToken.None);

    [Fact]
    public async Task Created_secret_verifies_with_its_scopes()
    {
        var created = await Create();

        var principal = await _service.VerifyAsync(created.Secret, CancellationToken.None);

        Assert.NotNull(principal);
        Assert.Equal(_partner.Id, principal!.PartnerId);
        Assert.Contains(ApiScopes.BillingRead, principal.Scopes);
        Assert.StartsWith(ApiKeyService.TokenPrefix, created.Key.Prefix, StringComparison.Ordinal);
        Assert.DoesNotContain(created.Secret, _keys.Keys.Single().SecretHash, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Tampered_revoked_and_expired_keys_are_refused()
    {
        var created = await Create(days: 1);
        var tampered = created.Secret[..^1] + (created.Secret[^1] == 'a' ? 'b' : 'a');
        Assert.Null(await _service.VerifyAsync(tampered, CancellationToken.None));

        _clock.Advance(TimeSpan.FromDays(2));
        Assert.Null(await _service.VerifyAsync(created.Secret, CancellationToken.None));

        var second = await Create("second");
        await _service.RevokeAsync(second.Key.Id, CancellationToken.None);
        Assert.Null(await _service.VerifyAsync(second.Secret, CancellationToken.None));
    }

    [Fact]
    public async Task Suspended_partner_keys_stop_working()
    {
        var created = await Create();
        _partner.Suspend();
        Assert.Null(await _service.VerifyAsync(created.Secret, CancellationToken.None));
    }

    [Fact]
    public async Task Api_key_callers_cannot_mint_keys()
    {
        _caller.IsApiKey = true;
        await Assert.ThrowsAsync<ForbiddenException>(() => Create());
    }

    [Fact]
    public async Task Active_key_limit_and_unique_names_are_enforced()
    {
        for (var i = 0; i < ApiKey.MaxActiveKeysPerPartner; i++)
        {
            await Create($"key-{i}");
        }

        var limit = await Assert.ThrowsAsync<ConflictException>(() => Create("one-too-many"));
        Assert.Equal("apikey.limit", limit.Code);

        await _service.RevokeAsync(_keys.Keys[0].Id, CancellationToken.None);
        var duplicate = await Assert.ThrowsAsync<ConflictException>(() => Create("KEY-1"));
        Assert.Equal("apikey.duplicate_name", duplicate.Code);
    }

    [Fact]
    public async Task Other_partners_keys_are_invisible()
    {
        var created = await Create();
        _caller.PartnerId = Guid.NewGuid();
        await Assert.ThrowsAsync<NotFoundException>(() => _service.RevokeAsync(created.Key.Id, CancellationToken.None));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("icw_short_secret")]
    [InlineData("xyz_abcdefghijkm_abcdefghijkmnopqrstuvwxyz23456789ab")]
    public void Malformed_tokens_do_not_parse(string? token) => Assert.False(ApiKeyService.TryParse(token, out _));
}

public sealed class SlaDashboardRankingTests
{
    private static SlaItemDto Item(string reference, string status, int dueInHours) =>
        new(Guid.NewGuid(), "ORDER", reference, "VALIDATED", status, Calendars.Utc(2024, 1, 8).AddHours(dueInHours), 1);

    [Fact]
    public void Breaches_come_first_then_soonest_at_risk()
    {
        var ranked = SlaDashboardService.RankForAttention(new[]
        {
            Item("A", "AtRisk", 5),
            Item("B", "OnTrack", 1),
            Item("C", "Breached", 50),
            Item("D", "AtRisk", 2),
            Item("E", "Paused", 0),
        });

        Assert.Equal(new[] { "C", "D", "A" }, ranked.Select(i => i.Reference));
    }

    [Fact]
    public void Attention_list_is_bounded()
    {
        var many = Enumerable.Range(0, 50).Select(i => Item($"R{i:D2}", "Breached", i));
        Assert.Equal(SlaDashboardService.AttentionListSize, SlaDashboardService.RankForAttention(many).Count);
    }

    [Theory]
    [InlineData("PendingCustomer", "PENDING_CUSTOMER")]
    [InlineData("InProgress", "IN_PROGRESS")]
    [InlineData("Validated", "VALIDATED")]
    public void Statuses_use_the_wire_format(string input, string expected) =>
        Assert.Equal(expected, SlaDashboardService.ToScreamingSnake(input));
}
```

## apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Application/BulkOrderCsvTests.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Application/BulkOrderCsvTests.cs`.

```csharp
using IConnect.Wholesale.Application.BulkOrders;
using IConnect.Wholesale.Domain.Orders;

namespace IConnect.Wholesale.Tests.Application;

public sealed class CsvReaderTests
{
    [Fact]
    public void Quoted_fields_may_contain_commas_quotes_and_newlines()
    {
        var records = CsvReader.Parse("a,b\n\"x, y\",\"say \"\"hi\"\"\nthere\"\nlast,row\n");

        Assert.Equal(3, records.Count);
        Assert.Equal(new[] { "x, y", "say \"hi\"\nthere" }, records[1].Fields);
        Assert.Equal(2, records[1].LineNumber);
        Assert.Equal(4, records[2].LineNumber);
    }

    [Fact]
    public void Byte_order_mark_crlf_and_blank_lines_are_tolerated()
    {
        var records = CsvReader.Parse("﻿a,b\r\n\r\n1,2\r\n");
        Assert.Equal(2, records.Count);
        Assert.Equal("a", records[0].Fields[0]);
        Assert.Equal(3, records[1].LineNumber);
    }

    [Fact]
    public void Unterminated_quote_reports_the_starting_line()
    {
        var ex = Assert.Throws<CsvReader.CsvFormatException>(() => CsvReader.Parse("a,b\n1,\"open\n2,3\n"));
        Assert.Equal(2, ex.LineNumber);
    }

    [Fact]
    public void Text_after_a_closing_quote_is_malformed() =>
        Assert.Throws<CsvReader.CsvFormatException>(() => CsvReader.Parse("\"a\"b,c\n"));
}

public sealed class BulkOrderCsvParserTests
{
    private static readonly DateOnly Today = new(2024, 1, 8);
    private const string Header = "partner_reference,order_type,uprn,product_code,care_level,requested_date,existing_service_id,migration_auth_code";

    private static BulkParseResult Parse(params string[] rows) =>
        BulkOrderCsvParser.Parse(string.Join("\n", new[] { Header }.Concat(rows)) + "\n", Today);

    [Fact]
    public void Valid_rows_become_validated_requests()
    {
        var serviceId = Guid.NewGuid();
        var result = Parse(
            "REF-1,provide,0012345678,fttp500,enhanced,2024-02-01,,",
            $"REF-2,CEASE,200012345678,,,2024-02-02,{serviceId},");

        Assert.True(result.IsValid);
        Assert.Equal(2, result.DataRowCount);
        var provide = result.Rows[0].Request;
        Assert.Equal(OrderType.Provide, provide.Type);
        Assert.Equal("12345678", provide.Uprn);
        Assert.Equal("FTTP500", provide.ProductCode);
        Assert.Equal(serviceId, result.Rows[1].Request.ExistingServiceId);
    }

    [Fact]
    public void Header_is_case_insensitive_and_order_independent()
    {
        var result = BulkOrderCsvParser.Parse("Requested Date,UPRN,Order_Type,Partner_Reference,Product_Code\n2024-02-01,12345,PROVIDE,R1,FTTP100\n", Today);
        Assert.True(result.IsValid);
    }

    [Fact]
    public void Unknown_and_missing_columns_are_reported_against_the_header()
    {
        var result = BulkOrderCsvParser.Parse("partner_reference,order_type,uprn,requsted_date\nR1,PROVIDE,1,2024-02-01\n", Today);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Code == "unknown_column" && e.Row == 1);
        Assert.Contains(result.Errors, e => e.Code == "missing_column" && e.Column == "requested_date");
        Assert.Empty(result.Rows);
    }

    [Fact]
    public void Field_errors_are_mapped_to_csv_columns_and_lines()
    {
        var result = Parse("REF-1,PROVIDE,abc,,STANDARD,2024-02-01,,");

        Assert.Contains(result.Errors, e => e.Row == 2 && e.Column == "uprn" && e.Code == "format");
        Assert.Contains(result.Errors, e => e.Row == 2 && e.Column == "product_code" && e.Code == "required");
    }

    [Fact]
    public void Unparseable_date_is_reported_once()
    {
        var result = Parse("REF-1,PROVIDE,12345,FTTP500,,01/02/2024,,");
        var dateErrors = result.Errors.Where(e => e.Column == "requested_date").ToList();

        Assert.Single(dateErrors);
        Assert.Equal("format", dateErrors[0].Code);
    }

    [Fact]
    public void Duplicate_references_and_premises_within_a_file_are_rejected()
    {
        var result = Parse(
            "REF-1,PROVIDE,12345,FTTP500,,2024-02-01,,",
            "ref-1,PROVIDE,67890,FTTP500,,2024-02-01,,",
            "REF-3,PROVIDE,12345,FTTP500,,2024-02-01,,");

        Assert.Contains(result.Errors, e => e.Row == 3 && e.Column == "partner_reference" && e.Code == "duplicate_in_file");
        Assert.Contains(result.Errors, e => e.Row == 4 && e.Column == "uprn" && e.Code == "duplicate_in_file");
        Assert.Single(result.Rows);
    }

    [Fact]
    public void Ragged_rows_are_rejected() =>
        Assert.Contains(Parse("REF-1,PROVIDE,12345").Errors, e => e.Code == "column_count" && e.Row == 2);

    [Fact]
    public void Header_only_file_has_no_rows() =>
        Assert.Contains(Parse().Errors, e => e.Code == "no_rows");

    [Fact]
    public void Oversized_files_are_rejected_without_row_validation()
    {
        var rows = Enumerable.Range(1, BulkUpload.MaxRows + 1).Select(i => $"R{i},PROVIDE,{i},FTTP500,,2024-02-01,,").ToArray();
        var result = Parse(rows);

        var error = Assert.Single(result.Errors);
        Assert.Equal("too_many_rows", error.Code);
        Assert.Equal(BulkUpload.MaxRows + 2, error.Row);
    }

    [Fact]
    public void Malformed_csv_is_a_single_file_level_error()
    {
        var result = BulkOrderCsvParser.Parse(Header + "\n\"REF-1,PROVIDE\n", Today);
        Assert.Equal("csv_format", Assert.Single(result.Errors).Code);
    }

    [Fact]
    public void Template_header_parses_cleanly()
    {
        var header = CsvReader.Parse(BulkOrderCsvParser.Template()).Single();
        var expected = BulkOrderCsvParser.RequiredColumns.Concat(BulkOrderCsvParser.OptionalColumns).Order(StringComparer.Ordinal);
        Assert.Equal(expected, header.Fields.Order(StringComparer.Ordinal));
    }
}
```

## apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Application/OrderPricingAndBillingTests.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Application/OrderPricingAndBillingTests.cs`.

```csharp
using IConnect.Wholesale.Application.Billing;
using IConnect.Wholesale.Application.Catalogue;
using IConnect.Wholesale.Application.Orders;
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Services;
using IConnect.Wholesale.Domain.Sla;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Application;

public sealed class OrderRequestValidatorTests
{
    private static readonly DateOnly Today = new(2024, 1, 8);

    private static PlaceOrderRequest Request(string type = "PROVIDE", string? product = "FTTP500", Guid? service = null,
        string? authCode = null, DateOnly? requested = null, string uprn = "100012345678", string? care = null) =>
        new("REF-1", type, uprn, product, care, service, authCode, requested ?? Today.AddDays(14));

    private static IReadOnlyList<FieldError> Errors(PlaceOrderRequest request) => OrderRequestValidator.Validate(request, Today).Errors;

    [Fact]
    public void Valid_request_is_normalised()
    {
        var (validated, errors) = OrderRequestValidator.Validate(Request(type: "migrate", product: "fttp900", authCode: "abc123456", uprn: "0042"), Today);

        Assert.Empty(errors);
        Assert.Equal(OrderType.Migrate, validated!.Type);
        Assert.Equal("42", validated.Uprn);
        Assert.Equal("FTTP900", validated.ProductCode);
        Assert.Equal("ABC123456", validated.MigrationAuthCode);
        Assert.Equal(CareLevel.Standard, validated.CareLevel);
    }

    [Fact]
    public void Migrate_needs_a_well_formed_switching_code()
    {
        Assert.Contains(Errors(Request(type: "MIGRATE")), e => e.Field == "migrationAuthCode" && e.Code == "required");
        Assert.Contains(Errors(Request(type: "MIGRATE", authCode: "AB12345")), e => e.Field == "migrationAuthCode" && e.Code == "format");
    }

    [Fact]
    public void Cease_must_reference_a_service_and_no_product()
    {
        var errors = Errors(Request(type: "CEASE"));
        Assert.Contains(errors, e => e.Field == "productCode" && e.Code == "not_allowed");
        Assert.Contains(errors, e => e.Field == "existingServiceId" && e.Code == "required");
    }

    [Fact]
    public void Provide_must_not_reference_a_service() =>
        Assert.Contains(Errors(Request(service: Guid.NewGuid())), e => e.Field == "existingServiceId" && e.Code == "not_allowed");

    [Theory]
    [InlineData(0, "past")]
    [InlineData(-3, "past")]
    [InlineData(OrderRequestValidator.MaxRequestedDateHorizonDays + 1, "too_far")]
    public void Requested_date_must_be_in_the_booking_horizon(int offsetDays, string code) =>
        Assert.Contains(Errors(Request(requested: Today.AddDays(offsetDays))), e => e.Field == "requestedDate" && e.Code == code);

    [Fact]
    public void Unknown_enums_are_reported_without_cascading()
    {
        var errors = Errors(Request(type: "UPGRADE", care: "GOLD"));
        Assert.Contains(errors, e => e.Field == "orderType");
        Assert.Contains(errors, e => e.Field == "careLevel");
        Assert.DoesNotContain(errors, e => e.Field == "productCode");
    }
}

public sealed class PricingCalculationTests
{
    private static (PriceBook Book, PriceBookEntry Entry) Book()
    {
        var book = new PriceBook("2024.1", new DateOnly(2024, 1, 1), "GBP");
        book.AddEntry("FTTP500", CareLevel.Standard, 2_500, 6_000, 3_000, 1_500);
        book.AddTier(100, 500);
        book.AddTier(1_000, 1_000);
        return (book, book.Find("fttp500", CareLevel.Standard)!);
    }

    [Theory]
    [InlineData(10, 0, 2_500)]
    [InlineData(150, 500, 2_375)]
    [InlineData(5_000, 1_000, 2_250)]
    public void Volume_tier_discounts_rental(int activeLines, int expectedBps, long expectedRental)
    {
        var (book, entry) = Book();
        var quote = PricingService.Calculate(book, entry, OrderType.Provide, activeLines);

        Assert.Equal(expectedBps, quote.VolumeDiscountBps);
        Assert.Equal(expectedRental, quote.MonthlyRental.MinorUnits);
        Assert.Equal(2_500, quote.ListMonthlyRental.MinorUnits);
    }

    [Theory]
    [InlineData(OrderType.Provide, 6_000, "connection")]
    [InlineData(OrderType.Migrate, 3_000, "migration")]
    [InlineData(OrderType.Modify, 1_500, "modify")]
    public void One_off_charge_follows_order_type_at_list_price(OrderType type, long expected, string label)
    {
        var (book, entry) = Book();
        var quote = PricingService.Calculate(book, entry, type, 5_000);
        Assert.Equal(expected, quote.OneOffCharge.MinorUnits);
        Assert.Equal(label, quote.OneOffChargeType);
    }

    [Fact]
    public void Cease_is_free()
    {
        var (book, entry) = Book();
        var quote = PricingService.Calculate(book, entry, OrderType.Cease, 10);
        Assert.True(quote.MonthlyRental.IsZero);
        Assert.True(quote.OneOffCharge.IsZero);
    }

    [Fact]
    public void Duplicate_price_entries_are_rejected()
    {
        var (book, _) = Book();
        Assert.Equal("pricebook.duplicate_entry",
            Assert.Throws<DomainException>(() => book.AddEntry("fttp500", CareLevel.Standard, 1, 1, 1, 1)).Code);
    }
}

public sealed class StatementGeneratorTests
{
    private static readonly WorkingCalendar Calendar = Calendars.Business();
    private readonly StatementGenerator _generator = new(ServiceCreditCalculator.Default());

    private static BillingStatement January() =>
        new("STM-00000001", Guid.NewGuid(), new DateOnly(2024, 1, 1), new DateOnly(2024, 1, 31), "GBP");

    private static StatementInputs Inputs(IReadOnlyList<WholesaleService>? services = null, IReadOnlyList<Order>? completed = null,
        IReadOnlyList<Order>? cancelled = null, IReadOnlyList<Fault>? faults = null) =>
        new(services ?? Array.Empty<WholesaleService>(), completed ?? Array.Empty<Order>(), cancelled ?? Array.Empty<Order>(),
            faults ?? Array.Empty<Fault>());

    [Fact]
    public void Mid_month_activation_is_pro_rated()
    {
        var service = new WholesaleService("SVC-1", Guid.NewGuid(), "12345", "FTTP500", CareLevel.Standard, Money.Gbp(3_100), new DateOnly(2024, 1, 11));
        var statement = January();

        _generator.Populate(statement, Inputs(services: new[] { service }), Calendar);

        var line = Assert.Single(statement.Lines);
        Assert.Equal(ChargeType.Rental, line.Type);
        Assert.Equal(2_100, line.Amount.MinorUnits);
        Assert.Equal(21, line.Quantity);
        Assert.Contains("(21/31 days)", line.Description, StringComparison.Ordinal);
    }

    [Fact]
    public void Product_change_bills_each_rate_for_its_days()
    {
        var service = new WholesaleService("SVC-1", Guid.NewGuid(), "12345", "FTTP500", CareLevel.Standard, Money.Gbp(3_100), new DateOnly(2023, 6, 1));
        service.ChangeProduct("FTTP900", CareLevel.Standard, Money.Gbp(6_200), new DateOnly(2024, 1, 21));
        var statement = January();

        _generator.Populate(statement, Inputs(services: new[] { service }), Calendar);

        Assert.Equal(new long[] { 2_000, 2_200 }, statement.Lines.Select(l => l.Amount.MinorUnits));
        Assert.Equal(4_200, statement.Total.MinorUnits);
    }

    [Fact]
    public void Full_month_rental_is_not_pro_rated()
    {
        var service = new WholesaleService("SVC-1", Guid.NewGuid(), "12345", "FTTP500", CareLevel.Standard, Money.Gbp(2_999), new DateOnly(2023, 6, 1));
        var statement = January();

        _generator.Populate(statement, Inputs(services: new[] { service }), Calendar);

        Assert.Equal(2_999, Assert.Single(statement.Lines).Amount.MinorUnits);
    }

    [Fact]
    public void Late_completion_adds_connection_charge_and_credit()
    {
        var order = Orders.Validated(requested: new DateOnly(2024, 1, 10), oneOffMinor: 6_000);
        order.BookAppointment(Guid.NewGuid(), new DateOnly(2024, 1, 22));
        order.StartProvisioning(Orders.PlacedAt.AddDays(1), "agent");
        order.Complete(Orders.PlacedAt.AddDays(16), new DateOnly(2024, 1, 24), Guid.NewGuid(), "agent");
        var statement = January();

        _generator.Populate(statement, Inputs(completed: new[] { order }), Calendar);

        Assert.Collection(statement.Lines,
            l => Assert.Equal((ChargeType.Connection, 6_000L), (l.Type, l.Amount.MinorUnits)),
            l => Assert.Equal((ChargeType.LateDeliveryCredit, -500L), (l.Type, l.Amount.MinorUnits)));
    }

    [Fact]
    public void Cancellation_after_dispatch_is_charged()
    {
        var order = Orders.Validated(oneOffMinor: 4_500);
        order.BookAppointment(Guid.NewGuid(), new DateOnly(2024, 1, 15));
        order.StartProvisioning(Orders.PlacedAt.AddDays(1), "agent");
        order.Cancel(Orders.PlacedAt.AddDays(2), "end customer moved", "partner");
        var statement = January();

        _generator.Populate(statement, Inputs(cancelled: new[] { order }), Calendar);

        var line = Assert.Single(statement.Lines);
        Assert.Equal(ChargeType.CancellationCharge, line.Type);
        Assert.Equal(4_500, line.Amount.MinorUnits);
    }

    [Fact]
    public void Csv_export_neutralises_formula_injection()
    {
        Assert.Equal("'=HYPERLINK(1)", BillingService.Escape("=HYPERLINK(1)"));
        Assert.Equal("\"a, \"\"b\"\"\"", BillingService.Escape("a, \"b\""));
        Assert.Equal("plain", BillingService.Escape("plain"));
    }
}
```

## apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/CommercialTests.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/CommercialTests.cs`.

```csharp
using IConnect.Wholesale.Domain.Appointments;
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Partners;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Domain;

public sealed class DisputeTests
{
    private static readonly DateTimeOffset IssuedAt = Calendars.Utc(2024, 5, 3, 9);

    private static (BillingStatement Statement, StatementLine Charge) IssuedStatement()
    {
        var statement = new BillingStatement("STM-00000001", Guid.NewGuid(), new DateOnly(2024, 4, 1), new DateOnly(2024, 4, 30), "GBP");
        var charge = statement.AddLine(ChargeType.Connection, "Provide 1 completed", Money.Gbp(6_000), "ORD-1");
        statement.AddLine(ChargeType.LateDeliveryCredit, "Late delivery", Money.Gbp(500), "ORD-1");
        statement.Issue(IssuedAt);
        return (statement, charge);
    }

    [Fact]
    public void Credits_are_stored_as_negative_lines()
    {
        var (statement, _) = IssuedStatement();
        Assert.Equal(6_000, statement.Charges.MinorUnits);
        Assert.Equal(-500, statement.Credits.MinorUnits);
        Assert.Equal(5_500, statement.Total.MinorUnits);
        Assert.Equal(new DateOnly(2024, 6, 2), statement.DueDate);
    }

    [Fact]
    public void Raising_a_dispute_marks_the_statement_disputed()
    {
        var (statement, charge) = IssuedStatement();
        var dispute = Dispute.Raise("DSP-1", statement, new[] { charge.Id }, "Connection was never completed at this premise.",
            Money.Gbp(6_000), IssuedAt.AddDays(5));

        Assert.True(dispute.IsOpen);
        Assert.Equal(StatementStatus.Disputed, statement.Status);
        Assert.Throws<DomainException>(() => statement.MarkSettled(IssuedAt.AddDays(6)));
    }

    [Fact]
    public void Claim_cannot_exceed_the_disputed_lines()
    {
        var (statement, charge) = IssuedStatement();
        var ex = Assert.Throws<DomainException>(() => Dispute.Raise("DSP-1", statement, new[] { charge.Id },
            "Connection was never completed at this premise.", Money.Gbp(6_001), IssuedAt.AddDays(5)));
        Assert.Equal("dispute.invalid_claim", ex.Code);
    }

    [Fact]
    public void Disputes_must_be_raised_within_the_window()
    {
        var (statement, charge) = IssuedStatement();
        var ex = Assert.Throws<DomainException>(() => Dispute.Raise("DSP-1", statement, new[] { charge.Id },
            "Connection was never completed at this premise.", Money.Gbp(100), IssuedAt.AddDays(Dispute.DisputeWindowDays + 1)));
        Assert.Equal("dispute.window_closed", ex.Code);
    }

    [Theory]
    [InlineData(0, DisputeStatus.Rejected)]
    [InlineData(2_000, DisputeStatus.PartiallyUpheld)]
    [InlineData(6_000, DisputeStatus.Upheld)]
    public void Decision_status_follows_the_award(long awarded, DisputeStatus expected)
    {
        var (statement, charge) = IssuedStatement();
        var dispute = Dispute.Raise("DSP-1", statement, new[] { charge.Id }, "Connection was never completed at this premise.",
            Money.Gbp(6_000), IssuedAt.AddDays(1));
        dispute.Decide(Money.Gbp(awarded), "Reviewed engineer job notes.", IssuedAt.AddDays(10));
        Assert.Equal(expected, dispute.Status);
    }
}

public sealed class AppointmentSlotTests
{
    private static readonly DateTimeOffset Now = Calendars.Utc(2024, 1, 8, 10);

    [Fact]
    public void Reserve_is_idempotent_per_order()
    {
        var slot = new AppointmentSlot("LDN01", new DateOnly(2024, 1, 15), SlotBand.Am, 1);
        var order = Guid.NewGuid();

        var first = slot.Reserve(order, Now);
        var second = slot.Reserve(order, Now.AddMinutes(1));

        Assert.Same(first, second);
        Assert.Equal(0, slot.Remaining(Now));
    }

    [Fact]
    public void Full_slot_refuses_further_reservations()
    {
        var slot = new AppointmentSlot("LDN01", new DateOnly(2024, 1, 15), SlotBand.Pm, 1);
        slot.Reserve(Guid.NewGuid(), Now);
        Assert.Equal("slot.full", Assert.Throws<DomainException>(() => slot.Reserve(Guid.NewGuid(), Now)).Code);
    }

    [Fact]
    public void Lapsed_holds_release_capacity_but_confirmed_ones_do_not()
    {
        var slot = new AppointmentSlot("LDN01", new DateOnly(2024, 1, 15), SlotBand.AllDay, 2);
        var confirmed = Guid.NewGuid();
        slot.Reserve(confirmed, Now);
        slot.Confirm(confirmed, Now.AddMinutes(5));
        slot.Reserve(Guid.NewGuid(), Now);

        var later = Now + AppointmentSlot.ReservationHold + TimeSpan.FromMinutes(1);
        Assert.Equal(1, slot.Remaining(later));
    }

    [Fact]
    public void Confirming_an_expired_hold_fails()
    {
        var slot = new AppointmentSlot("LDN01", new DateOnly(2024, 1, 15), SlotBand.Am, 1);
        var order = Guid.NewGuid();
        slot.Reserve(order, Now);
        var ex = Assert.Throws<DomainException>(() => slot.Confirm(order, Now + AppointmentSlot.ReservationHold));
        Assert.Equal("slot.reservation_expired", ex.Code);
    }
}

public sealed class IdentifierTests
{
    [Theory]
    [InlineData("sw1a1aa", "SW1A 1AA")]
    [InlineData(" m1 1ae ", "M1 1AE")]
    [InlineData("EC1A 1BB", "EC1A 1BB")]
    public void Postcodes_are_normalised(string input, string expected) => Assert.Equal(expected, Postcodes.Normalise(input));

    [Theory]
    [InlineData("12345")]
    [InlineData("SW1")]
    [InlineData("")]
    public void Invalid_postcodes_are_rejected(string input) => Assert.False(Postcodes.IsValid(input));

    [Fact]
    public void Uprn_leading_zeros_are_insignificant() => Assert.Equal("12345", Uprns.Normalise("0012345"));

    [Theory]
    [InlineData("0000")]
    [InlineData("1234567890123")]
    [InlineData("12a")]
    public void Invalid_uprns_are_rejected(string input) => Assert.False(Uprns.IsValid(input));

    [Fact]
    public void Partner_account_numbers_follow_the_platform_format()
    {
        Assert.Equal("partner.invalid_account", Assert.Throws<DomainException>(() => new Partner("Acme", "ACC-123", "GBP", 10)).Code);
        Assert.True(new Partner("Acme", "ACC-12345678", "GBP", 10).CanTrade);
    }
}
```

## apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/FaultTests.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/FaultTests.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Sla;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Domain;

public sealed class FaultTests
{
    private static readonly DateTimeOffset Raised = Calendars.Utc(2024, 3, 4);
    private static readonly FaultRepairTarget FourHours = new(CareLevel.Standard, FaultPriority.P2, CalendarKind.AlwaysOn, TimeSpan.FromHours(4));
    private readonly WorkingCalendar _calendar = Calendars.AlwaysOn();
    private readonly ServiceCreditCalculator _credits = ServiceCreditCalculator.Default();

    private static Fault Raise(FaultPriority priority = FaultPriority.P2, FaultCategory category = FaultCategory.IntermittentService) =>
        Fault.Raise("FLT-00000001", Guid.NewGuid(), Guid.NewGuid(), "100012345678", priority, category, CareLevel.Standard,
            "Line drops every evening around 8pm", Money.Gbp(3_000), FourHours, "24x7", Raised);

    [Fact]
    public void Total_loss_of_service_is_at_least_p2() =>
        Assert.Equal(FaultPriority.P2, Raise(FaultPriority.P4, FaultCategory.TotalLossOfService).Priority);

    [Fact]
    public void Short_descriptions_are_rejected()
    {
        var ex = Assert.Throws<DomainException>(() => Fault.Raise("FLT-1", Guid.NewGuid(), Guid.NewGuid(), "1", FaultPriority.P3,
            FaultCategory.Other, CareLevel.Standard, "broken", Money.Gbp(1), FourHours, "24x7", Raised));
        Assert.Equal("fault.description_too_short", ex.Code);
    }

    [Fact]
    public void Late_resolution_assesses_a_credit_and_raises_an_event()
    {
        var fault = Raise();
        fault.StartWork(Raised.AddHours(1), "engineer");
        fault.Resolve(Raised.AddHours(30), "engineer", "ONT_REPLACED", _calendar, _credits);

        // 26h overrun on a 24h nominal day = 2 started breach days x 5% of 30.00 GBP.
        Assert.Equal(300, fault.ServiceCredit!.Value.MinorUnits);
        var assessed = Assert.Single(fault.DomainEvents.OfType<FaultCreditAssessed>());
        Assert.Equal(fault.Reference, assessed.Reference);
    }

    [Fact]
    public void Time_awaiting_the_customer_does_not_count()
    {
        var fault = Raise();
        fault.AwaitCustomer(Raised.AddHours(1), "engineer", "need access");
        fault.CustomerResponded(Raised.AddHours(5), "partner", "access granted");
        fault.Resolve(Raised.AddHours(6), "engineer", "FIXED", _calendar, _credits);

        Assert.Equal(TimeSpan.FromHours(2), fault.RepairClock.Elapsed(_calendar, Raised.AddHours(6)));
        Assert.Null(fault.ServiceCredit);
    }

    [Fact]
    public void Reopen_within_window_clears_resolution()
    {
        var fault = Raise();
        fault.Resolve(Raised.AddHours(2), "engineer", "FIXED", _calendar, _credits);
        fault.Reopen(Raised.AddDays(2), "partner", "still dropping");

        Assert.Equal(FaultStatus.InProgress, fault.Status);
        Assert.Null(fault.ResolvedAt);
        Assert.False(fault.RepairClock.IsStopped);
    }

    [Fact]
    public void Reopen_after_window_is_refused()
    {
        var fault = Raise();
        fault.Resolve(Raised.AddHours(2), "engineer", "FIXED", _calendar, _credits);
        Assert.Equal("fault.reopen_window_closed",
            Assert.Throws<DomainException>(() => fault.Reopen(Raised.AddDays(9), "partner", "again")).Code);
        Assert.True(fault.CanAutoClose(Raised.AddDays(9)));
    }

    [Fact]
    public void Closed_faults_cannot_take_notes()
    {
        var fault = Raise();
        fault.Resolve(Raised.AddHours(2), "engineer", "FIXED", _calendar, _credits);
        fault.Close(Raised.AddHours(3), "partner");
        Assert.Equal("fault.closed", Assert.Throws<DomainException>(() => fault.AddNote(Raised.AddHours(4), "p", "hello", false)).Code);
    }

    [Fact]
    public void Open_fault_cannot_close_directly() =>
        Assert.Throws<InvalidTransitionException>(() => Raise().Close(Raised.AddHours(1), "partner"));
}
```

## apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/MoneyAndCalendarTests.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/MoneyAndCalendarTests.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Domain;

public sealed class MoneyTests
{
    [Theory]
    [InlineData(5, 1_000, 1)]
    [InlineData(-5, 1_000, -1)]
    [InlineData(2_499, 1_250, 312)]
    [InlineData(10_000, 0, 0)]
    public void PercentageOf_rounds_half_away_from_zero(long minor, int bps, long expected) =>
        Assert.Equal(expected, Money.Gbp(minor).PercentageOf(bps).MinorUnits);

    [Fact]
    public void ProRate_clamps_days_to_the_period() =>
        Assert.Equal(3_000, Money.Gbp(3_000).ProRate(31, 30).MinorUnits);

    [Fact]
    public void ProRate_splits_by_days() =>
        Assert.Equal(1_000, Money.Gbp(3_000).ProRate(10, 30).MinorUnits);

    [Fact]
    public void Combining_currencies_is_rejected()
    {
        var ex = Assert.Throws<DomainException>(() => Money.Gbp(100).Add(new Money(100, "EUR")));
        Assert.Equal("money.currency_mismatch", ex.Code);
    }

    [Theory]
    [InlineData("gbp")]
    [InlineData("GB")]
    [InlineData("")]
    public void Currency_must_be_iso_4217(string currency) =>
        Assert.Equal("money.invalid_currency", Assert.Throws<DomainException>(() => new Money(1, currency)).Code);

    [Fact]
    public void Sum_of_nothing_is_zero_in_the_given_currency()
    {
        var total = Money.Sum(Array.Empty<Money>(), "EUR");
        Assert.True(total.IsZero);
        Assert.Equal("EUR", total.Currency);
    }

    [Fact]
    public void ToString_formats_major_units() => Assert.Equal("19.99 GBP", Money.Gbp(1_999).ToString());
}

public sealed class WorkingCalendarTests
{
    // 2024-01-05 is a Friday.
    [Fact]
    public void AddWorkingTime_rolls_over_the_weekend()
    {
        var due = Calendars.Business().AddWorkingTime(Calendars.Utc(2024, 1, 5, 17), TimeSpan.FromHours(2));
        Assert.Equal(Calendars.Utc(2024, 1, 8, 9), due);
    }

    [Fact]
    public void AddWorkingTime_starting_out_of_hours_begins_at_next_window()
    {
        var due = Calendars.Business().AddWorkingTime(Calendars.Utc(2024, 1, 8, 6), TimeSpan.FromHours(1));
        Assert.Equal(Calendars.Utc(2024, 1, 8, 9), due);
    }

    [Fact]
    public void WorkingTimeBetween_counts_only_windows()
    {
        var elapsed = Calendars.Business().WorkingTimeBetween(Calendars.Utc(2024, 1, 5, 16), Calendars.Utc(2024, 1, 8, 10));
        Assert.Equal(TimeSpan.FromHours(4), elapsed);
    }

    [Fact]
    public void WorkingTimeBetween_is_zero_when_reversed() =>
        Assert.Equal(TimeSpan.Zero, Calendars.Business().WorkingTimeBetween(Calendars.Utc(2024, 1, 9), Calendars.Utc(2024, 1, 8)));

    [Fact]
    public void AddWorkingDays_skips_weekends_and_holidays()
    {
        var friday = new DateOnly(2024, 1, 5);
        Assert.Equal(new DateOnly(2024, 1, 8), Calendars.Business().AddWorkingDays(friday, 1));
        Assert.Equal(new DateOnly(2024, 1, 9), Calendars.Business(new DateOnly(2024, 1, 8)).AddWorkingDays(friday, 1));
    }

    [Fact]
    public void WorkingDaysBetween_excludes_start_and_includes_end() =>
        Assert.Equal(4, Calendars.Business().WorkingDaysBetween(new DateOnly(2024, 1, 8), new DateOnly(2024, 1, 12)));

    [Fact]
    public void Holidays_are_not_working_days()
    {
        var christmas = new DateOnly(2024, 12, 25);
        Assert.False(Calendars.Business(christmas).IsWorkingDay(christmas));
        Assert.True(Calendars.AlwaysOn().IsWorkingDay(christmas));
    }

    [Fact]
    public void Nominal_day_length_reflects_the_widest_window()
    {
        Assert.Equal(TimeSpan.FromHours(10), Calendars.Business().NominalDayLength);
        Assert.Equal(TimeSpan.FromHours(24), Calendars.AlwaysOn().NominalDayLength);
    }

    [Fact]
    public void Negative_durations_are_rejected() =>
        Assert.Throws<DomainException>(() => Calendars.Business().AddWorkingTime(Calendars.Utc(2024, 1, 8), TimeSpan.FromHours(-1)));
}
```

## apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/OrderTests.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/OrderTests.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Domain;

public sealed class OrderTests
{
    [Fact]
    public void Provide_without_product_is_rejected()
    {
        var ex = Assert.Throws<DomainException>(() => Order.CreateDraft("ORD-1", Guid.NewGuid(), "R1", OrderType.Provide, "1", null,
            default, null, null, new DateOnly(2024, 2, 1), Orders.PlacedAt));
        Assert.Equal("order.product_required", ex.Code);
    }

    [Fact]
    public void Unpriced_provide_cannot_be_submitted()
    {
        var order = Orders.Draft();
        Assert.Equal("order.not_priced", Assert.Throws<DomainException>(() => order.Submit(Orders.PlacedAt, "p")).Code);
    }

    [Fact]
    public void Validation_commits_to_lead_time_when_requested_date_is_sooner()
    {
        var order = Orders.Validated(requested: new DateOnly(2024, 1, 10));

        Assert.Equal(OrderStatus.Validated, order.Status);
        Assert.Equal(new DateOnly(2024, 1, 22), order.CommittedDate);
        Assert.Equal(TimeSpan.FromHours(100), order.DeliveryClock!.Target);
    }

    [Fact]
    public void Validation_honours_a_later_requested_date()
    {
        var order = Orders.Validated(requested: new DateOnly(2024, 2, 1));
        Assert.Equal(new DateOnly(2024, 2, 1), order.CommittedDate);
    }

    [Fact]
    public void Status_changes_raise_domain_events_and_history()
    {
        var order = Orders.Validated();

        var events = order.DomainEvents.OfType<OrderStatusChanged>().Select(e => e.To).ToList();
        Assert.Equal(new[] { OrderStatus.Submitted, OrderStatus.Validated }, events);
        Assert.Equal(3, order.History.Count);
    }

    [Fact]
    public void Provide_needs_an_appointment_before_provisioning()
    {
        var order = Orders.Validated();
        Assert.Equal("order.appointment_required",
            Assert.Throws<DomainException>(() => order.StartProvisioning(Orders.PlacedAt, "agent")).Code);
    }

    [Fact]
    public void Cancelling_after_dispatch_incurs_the_one_off_charge()
    {
        var order = Orders.Validated(oneOffMinor: 6_000);
        order.BookAppointment(Guid.NewGuid(), new DateOnly(2024, 1, 15));
        order.StartProvisioning(Orders.PlacedAt.AddDays(1), "agent");

        order.Cancel(Orders.PlacedAt.AddDays(2), "customer changed mind", "partner");

        Assert.Equal(OrderStatus.Cancelled, order.Status);
        Assert.Equal(6_000, order.CancellationCharge!.Value.MinorUnits);
        Assert.True(order.DeliveryClock!.IsStopped);
    }

    [Fact]
    public void Cancelling_before_dispatch_is_free()
    {
        var order = Orders.Validated();
        order.Cancel(Orders.PlacedAt.AddHours(1), "duplicate order", "partner");
        Assert.Null(order.CancellationCharge);
    }

    [Fact]
    public void Appointment_after_committed_date_moves_the_commitment()
    {
        var order = Orders.Validated(requested: new DateOnly(2024, 1, 10));
        order.BookAppointment(Guid.NewGuid(), new DateOnly(2024, 1, 29));
        Assert.Equal(new DateOnly(2024, 1, 29), order.CommittedDate);
    }

    [Fact]
    public void Hold_pauses_delivery_clock_and_blocks_completion()
    {
        var order = Orders.Validated();
        order.BookAppointment(Guid.NewGuid(), new DateOnly(2024, 1, 15));
        order.StartProvisioning(Orders.PlacedAt.AddHours(1), "agent");
        order.PlaceOnHold(Orders.PlacedAt.AddHours(2), "no access to premise", "agent");

        Assert.True(order.DeliveryClock!.IsPaused);
        Assert.Equal("order.on_hold", Assert.Throws<DomainException>(() =>
            order.Complete(Orders.PlacedAt.AddDays(3), new DateOnly(2024, 1, 11), null, "agent")).Code);

        order.ReleaseHold(Orders.PlacedAt.AddHours(5), "agent");
        order.Complete(Orders.PlacedAt.AddDays(3), new DateOnly(2024, 1, 11), Guid.NewGuid(), "agent");
        Assert.Equal(OrderStatus.Active, order.Status);
    }

    [Fact]
    public void Working_days_late_is_measured_from_committed_date()
    {
        var order = Orders.Validated(requested: new DateOnly(2024, 1, 10));
        order.BookAppointment(Guid.NewGuid(), new DateOnly(2024, 1, 22));
        order.StartProvisioning(Orders.PlacedAt.AddDays(1), "agent");
        order.Complete(Orders.PlacedAt.AddDays(16), new DateOnly(2024, 1, 24), Guid.NewGuid(), "agent");

        Assert.Equal(2, order.WorkingDaysLate(Calendars.Business()));
    }

    [Fact]
    public void Completing_a_validated_order_skips_provisioning_and_is_refused()
    {
        var order = Orders.Validated();
        Assert.Throws<InvalidTransitionException>(() => order.Complete(Orders.PlacedAt, new DateOnly(2024, 1, 9), null, "agent"));
    }

    [Theory]
    [InlineData(OrderStatus.Active, true)]
    [InlineData(OrderStatus.Cancelled, true)]
    [InlineData(OrderStatus.Failed, true)]
    [InlineData(OrderStatus.Provisioning, false)]
    public void Terminal_statuses_have_no_exits(OrderStatus status, bool terminal) =>
        Assert.Equal(terminal, OrderStateMachine.IsTerminal(status));

    [Fact]
    public void Provisioning_orders_are_not_amendable()
    {
        Assert.True(OrderStateMachine.IsAmendable(OrderStatus.Validated));
        Assert.False(OrderStateMachine.IsAmendable(OrderStatus.Provisioning));
    }
}
```

## apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/SlaTests.cs

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: csharp. Path: `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/Domain/SlaTests.cs`.

```csharp
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Sla;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Domain;

public sealed class SlaClockTests
{
    private static readonly DateTimeOffset Start = Calendars.Utc(2024, 1, 8);
    private readonly WorkingCalendar _calendar = Calendars.AlwaysOn();

    private static DateTimeOffset At(double hours) => Start.AddHours(hours);

    [Fact]
    public void Paused_time_is_excluded_from_elapsed()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(10), "24x7");
        clock.Pause(At(2), "awaiting access");
        clock.Resume(At(5));

        Assert.Equal(TimeSpan.FromHours(5), clock.Elapsed(_calendar, At(8)));
        Assert.Equal(TimeSpan.FromHours(5), clock.Remaining(_calendar, At(8)));
        Assert.Equal(SlaStatus.OnTrack, clock.Status(_calendar, At(8)));
    }

    [Fact]
    public void Status_progresses_from_at_risk_to_breached()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(10), "24x7");

        Assert.Equal(SlaStatus.AtRisk, clock.Status(_calendar, At(8)));
        Assert.Equal(SlaStatus.Breached, clock.Status(_calendar, At(11)));
        Assert.Equal(TimeSpan.FromHours(1), clock.Overrun(_calendar, At(11)));
    }

    [Fact]
    public void Stopped_clock_is_met_and_frozen()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(10), "24x7");
        clock.Stop(At(6));

        Assert.Equal(SlaStatus.Met, clock.Status(_calendar, At(30)));
        Assert.Equal(TimeSpan.FromHours(6), clock.Elapsed(_calendar, At(30)));
        Assert.Null(clock.DueAt(_calendar, At(30)));
    }

    [Fact]
    public void Paused_clock_has_no_due_time()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(10), "24x7");
        clock.Pause(At(1), "customer");

        Assert.Equal(SlaStatus.Paused, clock.Status(_calendar, At(2)));
        Assert.Null(clock.DueAt(_calendar, At(2)));
    }

    [Fact]
    public void DueAt_projects_remaining_working_time()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(10), "24x7");
        Assert.Equal(At(10), clock.DueAt(_calendar, At(3)));
    }

    [Fact]
    public void Reopen_excludes_the_stopped_interval()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(10), "24x7");
        clock.Stop(At(6));
        clock.Reopen(At(10));

        Assert.False(clock.IsStopped);
        Assert.Equal(TimeSpan.FromHours(8), clock.Elapsed(_calendar, At(12)));
    }

    [Fact]
    public void Breach_is_recorded_once()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(1), "24x7");
        Assert.True(clock.MarkBreachRecorded(At(2)));
        Assert.False(clock.MarkBreachRecorded(At(3)));
    }

    [Fact]
    public void Pausing_a_stopped_clock_is_rejected()
    {
        var clock = new SlaClock(Start, TimeSpan.FromHours(1), "24x7");
        clock.Stop(At(1));
        Assert.Equal("sla.stopped", Assert.Throws<DomainException>(() => clock.Pause(At(2), "late")).Code);
    }
}

public sealed class ServiceCreditCalculatorTests
{
    private readonly ServiceCreditCalculator _calculator = ServiceCreditCalculator.Default();

    [Fact]
    public void Fault_credit_counts_started_breach_days()
    {
        var credit = _calculator.ForFaultRepair(CareLevel.Standard, Money.Gbp(2_000), TimeSpan.FromHours(11), TimeSpan.FromHours(10));

        Assert.Equal(2, credit.Units);
        Assert.Equal(200, credit.Amount.MinorUnits);
        Assert.DoesNotContain("capped", credit.Basis, StringComparison.Ordinal);
    }

    [Fact]
    public void Fault_credit_is_capped()
    {
        var credit = _calculator.ForFaultRepair(CareLevel.Standard, Money.Gbp(2_000), TimeSpan.FromHours(200), TimeSpan.FromHours(10));

        Assert.Equal(1_000, credit.Amount.MinorUnits);
        Assert.Contains("capped at 50%", credit.Basis, StringComparison.Ordinal);
    }

    [Fact]
    public void No_overrun_means_no_credit() =>
        Assert.True(_calculator.ForFaultRepair(CareLevel.Premium, Money.Gbp(5_000), TimeSpan.Zero, TimeSpan.FromHours(24)).Amount.IsZero);

    [Fact]
    public void Late_delivery_credit_is_per_working_day_and_capped()
    {
        Assert.Equal(750, _calculator.ForLateDelivery(CareLevel.Standard, 3, "GBP").Amount.MinorUnits);

        var capped = _calculator.ForLateDelivery(CareLevel.Standard, 70, "GBP");
        Assert.Equal(60, capped.Units);
        Assert.Equal(15_000, capped.Amount.MinorUnits);
    }

    [Fact]
    public void Terms_must_cover_every_care_level()
    {
        var partial = new[] { new ServiceCreditTerms(CareLevel.Standard, 1, 1, 1, 1, 1) };
        Assert.Equal("credit.terms_incomplete", Assert.Throws<DomainException>(() => new ServiceCreditCalculator(partial)).Code);
    }

    [Fact]
    public void Default_policy_targets_tighten_with_care_level()
    {
        var policy = SlaPolicy.Default();
        Assert.True(policy.RepairTarget(CareLevel.Premium, FaultPriority.P1).Target < policy.RepairTarget(CareLevel.Standard, FaultPriority.P1).Target);
        Assert.Equal(CalendarKind.AlwaysOn, policy.RepairTarget(CareLevel.Premium, FaultPriority.P3).Calendar);
    }
}
```

## apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/IConnect.Wholesale.Tests.csproj

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: xml. Path: `apps/iconnect-wholesale/server/tests/IConnect.Wholesale.Tests/IConnect.Wholesale.Tests.csproj`.

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <RootNamespace>IConnect.Wholesale.Tests</RootNamespace>
    <IsPackable>false</IsPackable>
    <IsTestProject>true</IsTestProject>
    <!-- Test names use underscores for readability; awaits in tests need no ConfigureAwait. -->
    <NoWarn>$(NoWarn);CA1707;CA2007;CA1515</NoWarn>
  </PropertyGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageReference Include="xunit" Version="2.9.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
    <PackageReference Include="coverlet.collector" Version="6.0.2" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\..\src\IConnect.Wholesale.Domain\IConnect.Wholesale.Domain.csproj" />
    <ProjectReference Include="..\..\src\IConnect.Wholesale.Application\IConnect.Wholesale.Application.csproj" />
    <ProjectReference Include="..\..\src\IConnect.Wholesale.Api\IConnect.Wholesale.Api.csproj" />
  </ItemGroup>
  <ItemGroup>
    <Using Include="Xunit" />
  </ItemGroup>
</Project>
```
