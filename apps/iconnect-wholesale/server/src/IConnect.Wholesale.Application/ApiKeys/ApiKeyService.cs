using System.Security.Cryptography;
using System.Text;
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Partners;

namespace IConnect.Wholesale.Application.ApiKeys;

public sealed record CreateApiKeyRequest(string Name, IReadOnlyList<string> Scopes, int? ValidForDays);

public sealed record ApiKeyDto(Guid Id, string Name, string Prefix, IReadOnlyList<string> Scopes, DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt, DateTimeOffset? RevokedAt, DateTimeOffset? LastUsedAt, string Status);

/// <summary>Returned once at creation; <see cref="Secret"/> is never retrievable again.</summary>
public sealed record CreatedApiKeyDto(ApiKeyDto Key, string Secret);

public sealed record ApiKeyPrincipal(Guid KeyId, Guid PartnerId, IReadOnlyList<string> Scopes);

/// <summary>
/// Partner API key management and verification. Key format: <c>icw_{prefix}_{secret}</c> where the
/// 12-char prefix is stored in clear for lookup and the full token is hashed with SHA-256.
/// Verification uses a constant-time comparison.
/// </summary>
public sealed class ApiKeyService
{
    public const string TokenPrefix = "icw_";
    public const int DefaultValidityDays = 180;
    private const int PrefixLength = 12;
    private const int SecretBytes = 32;
    private const string Alphabet = "abcdefghijkmnopqrstuvwxyz23456789";

    private readonly IApiKeyRepository _keys;
    private readonly IPartnerRepository _partners;
    private readonly ICurrentCaller _caller;
    private readonly IClock _clock;
    private readonly IUnitOfWork _uow;

    public ApiKeyService(IApiKeyRepository keys, IPartnerRepository partners, ICurrentCaller caller, IClock clock, IUnitOfWork uow)
    {
        _keys = keys;
        _partners = partners;
        _caller = caller;
        _clock = clock;
        _uow = uow;
    }

    public async Task<IReadOnlyList<ApiKeyDto>> ListAsync(CancellationToken ct)
    {
        var keys = await _keys.ListForPartnerAsync(_caller.PartnerId, ct);
        var now = _clock.UtcNow;
        return keys.OrderByDescending(k => k.CreatedAt).Select(k => ToDto(k, now)).ToList();
    }

    public async Task<CreatedApiKeyDto> CreateAsync(CreateApiKeyRequest request, CancellationToken ct)
    {
        if (_caller.IsApiKey)
        {
            throw new ForbiddenException("API keys cannot be used to create other API keys.");
        }

        var days = request.ValidForDays ?? DefaultValidityDays;
        var v = new ValidationBuilder();
        v.Require(days >= 1 && days <= 365, "validForDays", "Validity must be between 1 and 365 days.");
        v.Require(request.Scopes is not null && request.Scopes.Count > 0, "scopes", "Select at least one scope.");
        v.ThrowIfInvalid();

        var now = _clock.UtcNow;
        var existing = await _keys.ListForPartnerAsync(_caller.PartnerId, ct);
        var usable = existing.Where(k => k.IsUsable(now)).ToList();
        if (usable.Count >= ApiKey.MaxActiveKeysPerPartner)
        {
            throw new ConflictException("apikey.limit", $"A partner can hold at most {ApiKey.MaxActiveKeysPerPartner} active keys; revoke one first.");
        }

        var requestedName = request.Name?.Trim();
        if (usable.Any(k => string.Equals(k.Name, requestedName, StringComparison.OrdinalIgnoreCase)))
        {
            throw new ConflictException("apikey.duplicate_name", "An active key with this name already exists.");
        }

        var partner = await _partners.GetAsync(_caller.PartnerId, ct) ?? throw new NotFoundException("Partner", _caller.PartnerId);
        if (!partner.CanTrade)
        {
            throw new ForbiddenException("Suspended partners cannot create API keys.");
        }

        var prefix = RandomString(PrefixLength);
        var secret = RandomString(SecretBytes);
        var token = $"{TokenPrefix}{prefix}_{secret}";
        var key = new ApiKey(_caller.PartnerId, request.Name ?? string.Empty, prefix, Hash(token), request.Scopes,
            now, now.AddDays(days), _caller.ActorId);

        await _keys.AddAsync(key, ct);
        await _uow.SaveChangesAsync(ct);
        return new CreatedApiKeyDto(ToDto(key, now), token);
    }

    public async Task RevokeAsync(Guid id, CancellationToken ct)
    {
        var key = await _keys.GetAsync(id, ct);
        if (key is null || key.PartnerId != _caller.PartnerId)
        {
            throw new NotFoundException("ApiKey", id);
        }

        key.Revoke(_clock.UtcNow);
        await _uow.SaveChangesAsync(ct);
    }

    /// <summary>Verifies a presented token. Returns null for any failure without revealing which check failed.</summary>
    public async Task<ApiKeyPrincipal?> VerifyAsync(string? token, CancellationToken ct)
    {
        if (!TryParse(token, out var prefix))
        {
            return null;
        }

        var key = await _keys.GetByPrefixAsync(prefix, ct);
        if (key is null)
        {
            return null;
        }

        var presented = Convert.FromHexString(Hash(token!));
        var stored = Convert.FromHexString(key.SecretHash);
        if (!CryptographicOperations.FixedTimeEquals(presented, stored))
        {
            return null;
        }

        var now = _clock.UtcNow;
        if (!key.IsUsable(now))
        {
            return null;
        }

        var partner = await _partners.GetAsync(key.PartnerId, ct);
        if (partner is null || !partner.CanTrade)
        {
            return null;
        }

        if (key.RecordUse(now))
        {
            await _uow.SaveChangesAsync(ct);
        }

        return new ApiKeyPrincipal(key.Id, key.PartnerId, key.Scopes);
    }

    internal static bool TryParse(string? token, out string prefix)
    {
        prefix = string.Empty;
        if (string.IsNullOrEmpty(token) || !token.StartsWith(TokenPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var body = token.AsSpan(TokenPrefix.Length);
        var separator = body.IndexOf('_');
        if (separator != PrefixLength || body.Length != PrefixLength + 1 + SecretBytes)
        {
            return false;
        }

        prefix = body[..PrefixLength].ToString();
        return true;
    }

    internal static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static string RandomString(int length)
    {
        var chars = new char[length];
        for (var i = 0; i < length; i++)
        {
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }

        return new string(chars);
    }

    private static ApiKeyDto ToDto(ApiKey k, DateTimeOffset now)
    {
        return new ApiKeyDto(k.Id, k.Name, TokenPrefix + k.Prefix, k.Scopes, k.CreatedAt, k.ExpiresAt, k.RevokedAt, k.LastUsedAt,
            DisplayStatus(k, now));
    }

    private static string DisplayStatus(ApiKey k, DateTimeOffset now)
    {
        if (k.RevokedAt is not null)
        {
            return "REVOKED";
        }

        if (k.ExpiresAt <= now)
        {
            return "EXPIRED";
        }

        if (k.ExpiresAt - now < TimeSpan.FromDays(14))
        {
            return "EXPIRING";
        }

        return "ACTIVE";
    }
}
