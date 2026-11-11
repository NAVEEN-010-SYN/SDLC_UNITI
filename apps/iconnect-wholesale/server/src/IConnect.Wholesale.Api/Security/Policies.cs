using System.Security.Claims;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.AspNetCore.Authorization;

namespace IConnect.Wholesale.Api.Security;

/// <summary>
/// Authorisation policies. Every partner-data policy is named after an <see cref="ApiScopes"/> value
/// so the same policy serves both callers: portal users need the WHOLESALE_BUYER or SUPPORT_AGENT
/// role, integrations need the scope on their API key.
/// </summary>
public static class Policies
{
    public const string SupportOnly = "support-only";

    /// <summary>Interactive portal users only; API keys are refused (e.g. key management).</summary>
    public const string PortalUser = "portal-user";

    public static void Register(AuthorizationOptions options)
    {
        foreach (var scope in ApiScopes.All)
        {
            options.AddPolicy(scope, p => p.RequireAuthenticatedUser().AddRequirements(new PartnerAccessRequirement(scope)));
        }

        options.AddPolicy(SupportOnly, p => p.RequireAuthenticatedUser()
            .RequireAssertion(ctx => !IsApiKey(ctx.User) && ctx.User.IsInRole(WholesaleRoles.SupportAgent)));

        options.AddPolicy(PortalUser, p => p.RequireAuthenticatedUser()
            .RequireAssertion(ctx => !IsApiKey(ctx.User) && HasPortalRole(ctx.User)));

        options.FallbackPolicy = options.DefaultPolicy;
    }

    public static bool IsApiKey(ClaimsPrincipal user) =>
        user.HasClaim(WholesaleClaims.AuthMethod, WholesaleClaims.AuthMethodApiKey);

    public static bool HasPortalRole(ClaimsPrincipal user) =>
        user.IsInRole(WholesaleRoles.WholesaleBuyer) || user.IsInRole(WholesaleRoles.SupportAgent);
}

public sealed record PartnerAccessRequirement(string Scope) : IAuthorizationRequirement;

public sealed class PartnerAccessHandler : AuthorizationHandler<PartnerAccessRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PartnerAccessRequirement requirement)
    {
        var user = context.User;
        var allowed = Policies.IsApiKey(user)
            ? user.HasClaim(WholesaleClaims.Scope, requirement.Scope)
            : Policies.HasPortalRole(user);

        if (allowed)
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
