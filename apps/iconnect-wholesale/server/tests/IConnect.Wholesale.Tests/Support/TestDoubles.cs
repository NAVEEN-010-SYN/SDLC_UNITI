using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Partners;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Tests.Support;

internal static class Calendars
{
    /// <summary>Mon-Fri 08:00-18:00 UTC; deterministic regardless of the host time zone.</summary>
    public static WorkingCalendar Business(params DateOnly[] holidays) => WorkingCalendar.StandardBusinessHours(TimeZoneInfo.Utc, holidays);

    public static WorkingCalendar AlwaysOn() => WorkingCalendar.AlwaysOn(TimeZoneInfo.Utc);

    public static DateTimeOffset Utc(int year, int month, int day, int hour = 0, int minute = 0) =>
        new(year, month, day, hour, minute, 0, TimeSpan.Zero);
}

internal sealed class FixedClock : IClock
{
    public FixedClock(DateTimeOffset now)
    {
        UtcNow = now;
    }

    public DateTimeOffset UtcNow { get; set; }

    public void Advance(TimeSpan by) => UtcNow += by;
}

internal sealed class FakeCaller : ICurrentCaller
{
    public Guid PartnerId { get; set; }

    public string ActorId { get; set; } = "user-1";

    public bool IsSupportAgent { get; set; }

    public bool IsApiKey { get; set; }
}

internal sealed class CountingUnitOfWork : IUnitOfWork
{
    public int Saves { get; private set; }

    public Task SaveChangesAsync(CancellationToken ct)
    {
        Saves++;
        return Task.CompletedTask;
    }
}

internal sealed class InMemoryPartnerRepository : IPartnerRepository
{
    private readonly List<Partner> _partners = new();

    public Partner Add(Partner partner)
    {
        _partners.Add(partner);
        return partner;
    }

    public Task<Partner?> GetAsync(Guid id, CancellationToken ct) => Task.FromResult(_partners.FirstOrDefault(p => p.Id == id));

    public Task<IReadOnlyList<Partner>> ListActiveAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<Partner>>(_partners.Where(p => p.CanTrade).ToList());
}

internal sealed class InMemoryApiKeyRepository : IApiKeyRepository
{
    public List<ApiKey> Keys { get; } = new();

    public Task<ApiKey?> GetAsync(Guid id, CancellationToken ct) => Task.FromResult(Keys.FirstOrDefault(k => k.Id == id));

    public Task<ApiKey?> GetByPrefixAsync(string prefix, CancellationToken ct) => Task.FromResult(Keys.FirstOrDefault(k => k.Prefix == prefix));

    public Task<IReadOnlyList<ApiKey>> ListForPartnerAsync(Guid partnerId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<ApiKey>>(Keys.Where(k => k.PartnerId == partnerId).ToList());

    public Task AddAsync(ApiKey key, CancellationToken ct)
    {
        Keys.Add(key);
        return Task.CompletedTask;
    }
}

/// <summary>Builds orders in a given lifecycle state through the real aggregate API.</summary>
internal static class Orders
{
    public static readonly DateTimeOffset PlacedAt = Calendars.Utc(2024, 1, 8, 9);

    public static Order Draft(OrderType type = OrderType.Provide, DateOnly? requested = null, CareLevel care = CareLevel.Standard)
    {
        var needsService = type is OrderType.Cease or OrderType.Modify;
        return Order.CreateDraft(
            "ORD-00000001",
            Guid.NewGuid(),
            "PARTNER-REF-1",
            type,
            "100012345678",
            type == OrderType.Cease ? null : "FTTP500",
            care,
            needsService ? Guid.NewGuid() : null,
            type == OrderType.Migrate ? "ABC123456" : null,
            requested ?? new DateOnly(2024, 1, 10),
            PlacedAt);
    }

    public static Order Validated(OrderType type = OrderType.Provide, DateOnly? requested = null, long oneOffMinor = 6_000)
    {
        var order = Draft(type, requested);
        if (type != OrderType.Cease)
        {
            order.Price(Domain.Common.Money.Gbp(2_500), Domain.Common.Money.Gbp(oneOffMinor));
        }

        order.Submit(PlacedAt, "partner");
        order.Validate(PlacedAt, Calendars.Business(), SlaPolicy.Default().OrderLeadTimeWorkingDays(type), "system");
        return order;
    }
}
