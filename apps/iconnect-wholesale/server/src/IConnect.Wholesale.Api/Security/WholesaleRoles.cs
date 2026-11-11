namespace IConnect.Wholesale.Api.Security;

/// <summary>Platform roles (see CONVENTIONS.md) that are meaningful to the wholesale API.</summary>
public static class WholesaleRoles
{
    public const string WholesaleBuyer = "WHOLESALE_BUYER";
    public const string SupportAgent = "SUPPORT_AGENT";
}

/// <summary>Claim types issued by the identity provider and by the API-key handler.</summary>
public static class WholesaleClaims
{
    public const string PartnerId = "partner_id";
    public const string Roles = "roles";
    public const string Scope = "scope";
    public const string AuthMethod = "auth_method";
    public const string ApiKeyId = "api_key_id";

    public const string AuthMethodApiKey = "api_key";
}
