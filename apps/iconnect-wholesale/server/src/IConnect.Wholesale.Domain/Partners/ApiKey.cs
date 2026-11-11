using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Partners;

/// <summary>Scopes a partner integration key can be granted. Mirrors the API's authorisation policies.</summary>
public static class ApiScopes
{
    public const string AvailabilityRead = "availability:read";
    public const string CatalogueRead = "catalogue:read";
    public const string OrdersRead = "orders:read";
    public const string OrdersWrite = "orders:write";
    public const string FaultsRead = "faults:read";
    public const string FaultsWrite = "faults:write";
    public const string BillingRead = "billing:read";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        AvailabilityRead, CatalogueRead, OrdersRead, OrdersWrite, FaultsRead, FaultsWrite, BillingRead,
    };
}

/// <summary>
/// A machine credential for partner system-to-system integration. Only a SHA-256 hash of the
/// secret is stored; the plaintext is shown once at creation. The public prefix lets the
/// authentication handler find the candidate key without scanning all hashes.
/// </summary>
public sealed class ApiKey : Entity
{
    public const int MaxActiveKeysPerPartner = 5;
    public static readonly TimeSpan MaxLifetime = TimeSpan.FromDays(365);

    private ApiKey()
    {
    }

    public ApiKey(Guid partnerId, string name, string prefix, string secretHash, IEnumerable<string> scopes,
        DateTimeOffset now, DateTimeOffset expiresAt, string createdBy)
    {
        var scopeList = scopes.Distinct(StringComparer.Ordinal).ToList();
        var unknown = scopeList.Where(s => !ApiScopes.All.Contains(s)).ToList();
        if (unknown.Count > 0)
        {
            throw new DomainException("apikey.unknown_scope", $"Unknown scope(s): {string.Join(", ", unknown)}.");
        }

        if (scopeList.Count == 0)
        {
            throw new DomainException("apikey.no_scopes", "An API key needs at least one scope.");
        }

        if (expiresAt <= now || expiresAt - now > MaxLifetime)
        {
            throw new DomainException("apikey.invalid_expiry", $"Expiry must be in the future and within {MaxLifetime.TotalDays} days.");
        }

        if (string.IsNullOrWhiteSpace(name) || name.Length > 60)
        {
            throw new DomainException("apikey.invalid_name", "Key name is required and must be at most 60 characters.");
        }

        PartnerId = partnerId;
        Name = name.Trim();
        Prefix = prefix;
        SecretHash = secretHash;
        Scopes = scopeList;
        ExpiresAt = expiresAt;
        CreatedBy = createdBy;
        Touch(now);
    }

    public Guid PartnerId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public string Prefix { get; private set; } = string.Empty;

    public string SecretHash { get; private set; } = string.Empty;

    public List<string> Scopes { get; private set; } = new();

    public DateTimeOffset ExpiresAt { get; private set; }

    public DateTimeOffset? RevokedAt { get; private set; }

    public DateTimeOffset? LastUsedAt { get; private set; }

    public string CreatedBy { get; private set; } = string.Empty;

    public bool IsUsable(DateTimeOffset now) => RevokedAt is null && now < ExpiresAt;

    public void Revoke(DateTimeOffset now)
    {
        if (RevokedAt is not null)
        {
            return;
        }

        RevokedAt = now;
        Touch(now);
    }

    /// <summary>Records usage, throttled to one write per minute to avoid a DB write on every request.</summary>
    public bool RecordUse(DateTimeOffset now)
    {
        if (LastUsedAt is { } last && now - last < TimeSpan.FromMinutes(1))
        {
            return false;
        }

        LastUsedAt = now;
        return true;
    }
}
