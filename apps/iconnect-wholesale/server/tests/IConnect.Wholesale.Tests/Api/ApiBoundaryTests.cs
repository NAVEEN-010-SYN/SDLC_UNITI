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
