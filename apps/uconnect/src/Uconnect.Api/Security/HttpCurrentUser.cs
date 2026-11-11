using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;

namespace Uconnect.Api.Security;

/// <summary>The caller as described by the validated bearer token.</summary>
internal sealed class HttpCurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _accessor;

    public HttpCurrentUser(IHttpContextAccessor accessor) => _accessor = accessor;

    private ClaimsPrincipal Principal => _accessor.HttpContext?.User ?? new ClaimsPrincipal();

    public bool IsAuthenticated => Principal.Identity?.IsAuthenticated == true;

    /// <summary>Deterministic id derived from the subject, so audit columns are stable without a user table.</summary>
    public Guid UserId => SubjectToUserId(SubjectId);

    public string SubjectId => Principal.FindFirstValue("sub") ?? Principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;

    public string DisplayName => Principal.FindFirstValue("name") ?? Email ?? "Customer";

    public string? Email => Principal.FindFirstValue("email");

    public IReadOnlyCollection<string> Roles => Principal.FindAll(Policies.RoleClaimType).Select(c => c.Value).ToList();

    public bool IsInRole(string role) => Principal.IsInRole(role);

    internal static Guid SubjectToUserId(string subjectId)
    {
        if (string.IsNullOrEmpty(subjectId))
        {
            return Guid.Empty;
        }

        Span<byte> hash = stackalloc byte[32];
        SHA256.HashData(Encoding.UTF8.GetBytes(subjectId), hash);
        return new Guid(hash[..16]);
    }
}

/// <summary>Authorization policies. Roles come from the identity provider's <c>roles</c> claim.</summary>
public static class Policies
{
    public const string RoleClaimType = "roles";

    /// <summary>Any customer role or a support agent; per-account rights are then checked by <c>AccountAccessGuard</c>.</summary>
    public const string Customer = "customer";

    public const string SupportAgent = "support-agent";

    /// <summary>Machine-to-machine: the network mediation feed (client-credentials token with scope <c>uconnect.usage.write</c>).</summary>
    public const string UsageIngest = "usage-ingest";

    public static void Configure(AuthorizationOptions options)
    {
        options.AddPolicy(Customer, p => p.RequireAuthenticatedUser().RequireRole(
            UserRoles.Consumer, UserRoles.BusinessAdmin, UserRoles.BusinessUser, UserRoles.SupportAgent));
        options.AddPolicy(SupportAgent, p => p.RequireAuthenticatedUser().RequireRole(UserRoles.SupportAgent));
        options.AddPolicy(UsageIngest, p => p.RequireAuthenticatedUser().RequireAssertion(ctx =>
            ctx.User.FindAll("scope").SelectMany(c => c.Value.Split(' ')).Contains("uconnect.usage.write")));
        options.FallbackPolicy = options.GetPolicy(Customer);
    }
}
