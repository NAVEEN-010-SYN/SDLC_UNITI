using System.Security.Claims;
using System.Text.Encodings.Web;
using IConnect.Wholesale.Application.ApiKeys;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace IConnect.Wholesale.Api.Security;

/// <summary>
/// Authenticates partner system-to-system calls presenting <c>X-Api-Key: icw_{prefix}_{secret}</c>.
/// Verification (hash comparison, expiry, revocation, partner status) is delegated to
/// <see cref="ApiKeyService"/>; the principal carries the key's scopes for policy evaluation.
/// </summary>
public sealed class ApiKeyAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "ApiKey";
    public const string HeaderName = "X-Api-Key";

    private readonly ApiKeyService _apiKeys;

    public ApiKeyAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder,
        ApiKeyService apiKeys)
        : base(options, logger, encoder)
    {
        _apiKeys = apiKeys;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(HeaderName, out var values))
        {
            return AuthenticateResult.NoResult();
        }

        if (values.Count != 1 || string.IsNullOrWhiteSpace(values[0]))
        {
            return AuthenticateResult.Fail("Exactly one API key must be supplied.");
        }

        var principal = await _apiKeys.VerifyAsync(values[0], Context.RequestAborted);
        if (principal is null)
        {
            Logger.LogWarning("Rejected API key presented from {RemoteIp}", Context.Connection.RemoteIpAddress);
            return AuthenticateResult.Fail("Invalid, expired or revoked API key.");
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, $"apikey:{principal.KeyId}"),
            new(WholesaleClaims.ApiKeyId, principal.KeyId.ToString()),
            new(WholesaleClaims.PartnerId, principal.PartnerId.ToString()),
            new(WholesaleClaims.AuthMethod, WholesaleClaims.AuthMethodApiKey),
        };
        claims.AddRange(principal.Scopes.Select(s => new Claim(WholesaleClaims.Scope, s)));

        var identity = new ClaimsIdentity(claims, SchemeName, ClaimTypes.NameIdentifier, WholesaleClaims.Roles);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.Headers.WWWAuthenticate = $"{SchemeName} header=\"{HeaderName}\"";
        return base.HandleChallengeAsync(properties);
    }
}
