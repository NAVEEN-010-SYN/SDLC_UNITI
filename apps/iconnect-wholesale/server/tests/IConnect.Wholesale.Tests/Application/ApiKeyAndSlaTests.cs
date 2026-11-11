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
