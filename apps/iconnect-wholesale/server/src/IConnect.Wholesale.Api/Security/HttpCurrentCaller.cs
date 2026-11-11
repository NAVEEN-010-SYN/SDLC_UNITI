using System.Security.Claims;
using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;

namespace IConnect.Wholesale.Api.Security;

/// <summary>
/// Resolves the caller from the authenticated principal. Buyers and API keys are bound to the
/// partner in their token; support agents act on behalf of a partner named in the
/// <c>X-On-Behalf-Of-Partner</c> header, which is ignored for every other caller.
/// Values are read lazily because the API-key handler resolves this service before authentication completes.
/// </summary>
public sealed class HttpCurrentCaller : ICurrentCaller
{
    public const string OnBehalfOfHeader = "X-On-Behalf-Of-Partner";

    private readonly IHttpContextAccessor _http;

    public HttpCurrentCaller(IHttpContextAccessor http)
    {
        _http = http;
    }

    private HttpContext Context => _http.HttpContext ?? throw new InvalidOperationException("No active HTTP request.");

    private ClaimsPrincipal User => Context.User;

    public bool IsApiKey => Policies.IsApiKey(User);

    public bool IsSupportAgent => !IsApiKey && User.IsInRole(WholesaleRoles.SupportAgent);

    public string ActorId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")
        ?? throw new ForbiddenException("The access token does not identify the caller.");

    public Guid PartnerId => ResolvePartnerId(User, IsSupportAgent ? Context.Request.Headers[OnBehalfOfHeader].ToString() : null);

    internal static Guid ResolvePartnerId(ClaimsPrincipal user, string? onBehalfOf)
    {
        if (!string.IsNullOrEmpty(onBehalfOf))
        {
            return Guid.TryParse(onBehalfOf, out var delegated) && delegated != Guid.Empty
                ? delegated
                : throw new RequestValidationException(OnBehalfOfHeader, "Must be a partner id (GUID).");
        }

        var claim = user.FindFirstValue(WholesaleClaims.PartnerId);
        if (Guid.TryParse(claim, out var partnerId) && partnerId != Guid.Empty)
        {
            return partnerId;
        }

        throw new ForbiddenException(user.IsInRole(WholesaleRoles.SupportAgent)
            ? $"Support agents must name the partner in the {OnBehalfOfHeader} header."
            : "The access token is not bound to a wholesale partner.");
    }
}
